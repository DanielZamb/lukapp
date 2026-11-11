import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

const repository = resolve(__dirname, "../../../..");
const roots = ["apps/mobile/app", "apps/mobile/src"].map((dir) => join(repository, dir));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "android" || name === "ios") return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|testSupport|fixtures|formal)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** React state: the first binding is the value a render sees. */
const stateHooks = new Set(["useState", "useReducer", "useAmountState", "useFormState"]);
/** Calls that make a function the owner of a write: it sends, or holds what a send is built from. */
const writeHooks = new Set(["useFrozenCommand", "useAction", "useMutation", "useAmountState", "useFormState"]);
/** Callbacks that run during the render that created them, not later. */
const renderCallbacks = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect", "useMemo"]);
const lazyInitializers = new Set([...stateHooks, "useRef"]);
/** Hooks whose result is computed from what their callback reads, as a value derived in the render is. */
const derivingHooks = new Set(["useMemo", "useCallback"]);
const arrayMethods = new Set(["map", "filter", "find", "findIndex", "findLast", "some", "every", "reduce", "flatMap", "forEach", "sort", "toSorted"]);

type Source = { file: string; parsed: ts.SourceFile };
type Fn = ts.FunctionLikeDeclaration;

function parse(file: string, source: string): Source {
  return { file, parsed: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) };
}
function isFunction(node: ts.Node): node is Fn {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
}
function calleeName(call: ts.CallExpression) {
  return ts.isIdentifier(call.expression) ? call.expression.text : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : "";
}
function functionName(fn: Fn) {
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  return ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : "";
}
function boundNames(name: ts.BindingName): string[] {
  return ts.isIdentifier(name) ? [name.text] : name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : boundNames(element.name));
}
/** An identifier that reads a value, not a property name, a declared name, a JSX attribute or a type. */
function isRead(node: ts.Identifier) {
  const parent = node.parent;
  if ((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent) || ts.isJsxAttribute(parent)) && parent.name === node) return false;
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) || ts.isBindingElement(parent))
    && (parent.name === node || (ts.isBindingElement(parent) && parent.propertyName === node))) return false;
  for (let at: ts.Node = parent; at; at = at.parent) if (ts.isTypeNode(at) || ts.isImportDeclaration(at)) return false;
  return true;
}
/**
 * Whether a read of a hook's result only calls it, one of its methods, or an `on…` handler it hands out further down,
 * as `submit()`, `editor.read().amount` or `picker.sheet.onDismiss()` do; `editor.description.trim()` reads a field.
 */
function onlyCalls(node: ts.Identifier) {
  let at: ts.Node = node;
  while (ts.isPropertyAccessExpression(at.parent) && at.parent.expression === at) at = at.parent;
  if (!ts.isCallExpression(at.parent) || at.parent.expression !== at) return false;
  return at === node || (ts.isPropertyAccessExpression(at) && (at.expression === node || /^on[A-Z]/.test(at.name.text)));
}
/** Names a function declares itself: its parameters and anything declared in its body outside further functions. */
function ownNames(fn: Fn): Set<string> {
  const names = new Set(fn.parameters.flatMap((parameter) => boundNames(parameter.name)));
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) boundNames(node.name).forEach((name) => names.add(name));
    if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
    if (!isFunction(node)) ts.forEachChild(node, visit);
  };
  if (fn.body) ts.forEachChild(fn.body, visit);
  return names;
}
/**
 * How a function created during a render runs: an effect, memo or lazy initializer is that render's own code and is
 * skipped, as the amount scan does; an array callback, or a component passed as a `…Component` prop, renders, so its
 * body is render code that can create handlers; anything else is a handler.
 */
function renderRole(fn: Fn): "skip" | "render" | "handler" {
  const attribute = ts.isJsxExpression(fn.parent) && ts.isJsxAttribute(fn.parent.parent) ? fn.parent.parent.name.getText() : "";
  if (/Component$/.test(attribute)) return "render";
  const call = fn.parent;
  if (!ts.isCallExpression(call) || !call.arguments.includes(fn as ts.Expression)) return "handler";
  const name = calleeName(call);
  if (ts.isIdentifier(call.expression) && call.arguments[0] === fn && (renderCallbacks.has(name) || lazyInitializers.has(name))) return "skip";
  return ts.isPropertyAccessExpression(call.expression) && arrayMethods.has(name) ? "render" : "handler";
}
/** Visits the code a render runs in `owner`, and each handler it creates with the names render callbacks around it declare. */
function walkRender(owner: Fn, render: (node: ts.Node) => void, handler: (fn: Fn, hidden: ReadonlySet<string>) => void) {
  const walk = (node: ts.Node, hidden: ReadonlySet<string>) => {
    if (isFunction(node)) {
      const role = renderRole(node);
      if (role === "render" && node.body) walk(node.body, new Set([...hidden, ...ownNames(node)]));
      if (role === "handler") handler(node, hidden);
      return;
    }
    render(node);
    ts.forEachChild(node, (child) => walk(child, hidden));
  };
  if (owner.body) ts.forEachChild(owner.body, (child) => walk(child, new Set()));
}

/** Hooks, by name across the app, that own a write, and hooks that hold state a caller sees through their result. */
function discoverHooks(sources: readonly Source[]) {
  const owners = new Set<string>();
  const holders = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const { parsed } of sources) {
      const visit = (node: ts.Node) => {
        if (isFunction(node)) {
          const name = functionName(node);
          if (/^use[A-Z]/.test(name) && !stateHooks.has(name)) {
            let writes = false;
            let holds = false;
            walkRender(node, (at) => {
              if (!ts.isCallExpression(at)) return;
              const callee = calleeName(at);
              if (writeHooks.has(callee) || owners.has(callee)) writes = true;
              if (stateHooks.has(callee) || holders.has(callee) || owners.has(callee)) holds = true;
            }, () => {});
            if (writes && !owners.has(name)) { owners.add(name); grew = true; }
            if (holds && !holders.has(name)) { holders.add(name); grew = true; }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed);
    }
  }
  return { owners, holders };
}

/**
 * Handlers in an owner of a write that read state a render captured. In such an owner, the values a render reads
 * from React state, from a hook that holds state, or computes from either are render values. A handler, any function
 * the owner creates that does not run within that render, may have come from an earlier render, so it reads none of
 * them: it reads `read()` of a form state, or calls a method of a hook's result.
 */
function capturedReads({ file, parsed }: Source, hooks: ReturnType<typeof discoverHooks>): string[] {
  const found: string[] = [];
  const functions: Fn[] = [];
  const collect = (node: ts.Node) => { if (isFunction(node)) functions.push(node); ts.forEachChild(node, collect); };
  collect(parsed);
  for (const owner of functions) {
    let writes = owner.parameters.some((parameter) => !!parameter.type && /Transport\b/.test(parameter.type.getText(parsed)));
    const values = new Set<string>();
    const results = new Set<string>();
    const declarations: ts.VariableDeclaration[] = [];
    const hookCalls: ts.VariableDeclaration[] = [];
    walkRender(owner, (node) => {
      if (ts.isCallExpression(node) && (writeHooks.has(calleeName(node)) || hooks.owners.has(calleeName(node)))) writes = true;
      if (!ts.isVariableDeclaration(node) || !node.initializer) return;
      const hook = ts.isCallExpression(node.initializer) ? calleeName(node.initializer) : "";
      if (stateHooks.has(hook) && ts.isArrayBindingPattern(node.name)) {
        const [first] = node.name.elements;
        if (first && !ts.isOmittedExpression(first)) boundNames(first.name).forEach((name) => values.add(name));
      } else if (hooks.holders.has(hook)) boundNames(node.name).forEach((name) => results.add(name));
      else if (!/^use[A-Z]/.test(hook) || derivingHooks.has(hook)) declarations.push(node);
      else if (hook !== "useRef") hookCalls.push(node);
    }, () => {});
    if (!writes || values.size + results.size === 0) continue;
    const readsRender = (node: ts.Node) => {
      let hit = false;
      const walk = (at: ts.Node, hidden: ReadonlySet<string>) => {
        if (hit) return;
        const own = isFunction(at) ? ownNames(at) : null;
        if (ts.isIdentifier(at) && !hidden.has(at.text) && isRead(at)
          && (values.has(at.text) || (results.has(at.text) && !onlyCalls(at)))) { hit = true; return; }
        ts.forEachChild(at, (child) => walk(child, own ? new Set([...hidden, ...own]) : hidden));
      };
      walk(node, new Set());
      return hit;
    };
    for (let grew = true; grew;) {
      grew = false;
      for (const declaration of declarations)
        if (readsRender(declaration.initializer!))
          for (const name of boundNames(declaration.name)) if (!values.has(name)) { values.add(name); grew = true; }
      // A hook given render values returns what they produced in that render, as a hook that holds state does.
      for (const declaration of hookCalls)
        if (readsRender(declaration.initializer!))
          for (const name of boundNames(declaration.name)) if (!results.has(name)) { results.add(name); grew = true; }
    }
    const report = (fn: Fn, hidden: ReadonlySet<string>) => {
      const own = ownNames(fn);
      const shadowed = new Set([...hidden, ...own]);
      const walk = (at: ts.Node) => {
        if (ts.isIdentifier(at) && !shadowed.has(at.text) && isRead(at) && (values.has(at.text) || (results.has(at.text) && !onlyCalls(at))))
          found.push(`${file}:${parsed.getLineAndCharacterOfPosition(at.getStart(parsed)).line + 1}: ${functionName(owner) || "a component"} reads ${at.text} in a handler`);
        if (isFunction(at)) { report(at, shadowed); return; }
        ts.forEachChild(at, walk);
      };
      if (fn.body) ts.forEachChild(fn.body, walk);
    };
    walkRender(owner, () => {}, report);
  }
  return found;
}

type Exemption = readonly [file: string, name: string, why: string];

/**
 * Render values a handler may read, each with why it never reaches a command differently from what the screen shows.
 * A name here is exempt in its file only; any other render value read by a handler there is still a violation.
 */
const allowed: readonly Exemption[] = [
  ["apps/mobile/app/account.tsx", "account", "Change look opens the sheet on the emoji the page shows; nothing is sent until Use, which reads the pick at the press"],
  ["apps/mobile/app/drafts.tsx", "drafts", "Discard calls the local Drafts store's port, which reads the stored Draft itself"],
  ["apps/mobile/app/post.tsx", "binding",
    "the Candidate this route opened, set once per Candidate; Use amount reads only its original suggested direction, which never changes"],
  ["apps/mobile/src/features/placeEnding/PlaceEndingFlow.tsx", "live",
    "choosing Close records the balance and day the server reported as the basis to review; a later change is withdrawn by the stale check and refused by the server"],
  ["apps/mobile/src/features/placeEnding/PlaceEndingFlow.tsx", "pending", "the request stored on the phone before its first send; Retry resends it exactly as stored"],
  ["apps/mobile/src/features/intake/prototype/NotificationFirst.tsx", "drafts", "Start a Draft calls the local Drafts store's port with the facts read at the press"],
];

function violations(sources: readonly Source[]) {
  const hooks = discoverHooks(sources);
  return sources.flatMap((source) => capturedReads(source, hooks));
}

function exempt(finding: string) {
  return allowed.some(([file, name]) => finding.startsWith(`${file}:`) && finding.endsWith(` reads ${name} in a handler`));
}

const production = () => roots.flatMap(files).map((path) => parse(relative(repository, path), readFileSync(path, "utf8")));

test("no handler in an owner of a write reads form state its render captured", () => {
  expect(violations(production()).filter((finding) => !exempt(finding))).toEqual([]);
});

test("every exemption still names a value a handler reads in its file, so none outlives its reason", () => {
  const found = violations(production());
  for (const [file, name] of allowed)
    expect(found.some((finding) => finding.startsWith(`${file}:`) && finding.endsWith(` reads ${name} in a handler`)), `${file}: ${name}`).toBe(true);
});

const planted = (source: string, file = "apps/mobile/src/features/planted/usePlanted.ts") => violations([parse(file, source)]);

test("the guard names a field a kept Submit reads from its render, as the Recovery months did", () => {
  expect(planted([
    "export function usePlanted(transport: PlantedTransport) {",
    "  const [months, setMonths] = useState(4);",
    "  const [form, setForm, readForm] = useFormState({ amount: 0 });",
    "  const command = useFrozenCommand({ send: transport.save });",
    "  return { months, onMonths: setMonths, submit: () => command.submit(() => ({ months, amount: readForm().amount })) };",
    "}",
  ].join("\n"))).toEqual(["apps/mobile/src/features/planted/usePlanted.ts:5: usePlanted reads months in a handler"]);
});

test("the guard names a value derived from state and a hook result read as a value, but not a call or a press-time read", () => {
  expect(planted([
    "export function usePlanted(transport: PlantedTransport) {",
    "  const [form, setForm, readForm] = useFormState({ description: \"\", placeId: \"bank\" });",
    "  const place = useChosenThing();",
    "  const trimmed = form.description.trim();",
    "  const fresh = () => transport.post({ description: readForm().description.trim(), place: place.choose() });",
    "  const stale = () => transport.post({ description: trimmed, place: place.id });",
    "  const shadowed = (trimmed: string) => transport.post({ description: trimmed });",
    "  return { fresh, stale, shadowed };",
    "}",
    "function useChosenThing() {",
    "  const [id, setId] = useState(\"bank\");",
    "  return { id, choose: () => id };",
    "}",
  ].join("\n"))).toEqual([
    "apps/mobile/src/features/planted/usePlanted.ts:6: usePlanted reads trimmed in a handler",
    "apps/mobile/src/features/planted/usePlanted.ts:6: usePlanted reads place in a handler",
  ]);
});

test("the guard follows a memo, a callback and a hook given render values into the handlers that read them", () => {
  expect(planted([
    "export function usePlanted(transport: PlantedTransport) {",
    "  const [form, setForm, readForm] = useFormState({ name: \"\", amounts: [1, 2] });",
    "  const total = useMemo(() => form.amounts.reduce((sum, item) => sum + item, 0), [form.amounts]);",
    "  const send = useCallback(() => transport.post({ name: form.name }), [form.name]);",
    "  const suggestion = useSuggestion(form.name);",
    "  return { total: () => transport.post({ total }), send: () => send(), nature: () => transport.post({ nature: suggestion.value }) };",
    "}",
  ].join("\n"))).toEqual([
    "apps/mobile/src/features/planted/usePlanted.ts:4: usePlanted reads form in a handler",
    "apps/mobile/src/features/planted/usePlanted.ts:6: usePlanted reads total in a handler",
    "apps/mobile/src/features/planted/usePlanted.ts:6: usePlanted reads send in a handler",
    "apps/mobile/src/features/planted/usePlanted.ts:6: usePlanted reads suggestion in a handler",
  ]);
});

test("render-time callbacks are render code, but a handler nested in one is still a handler", () => {
  expect(planted([
    "export function Planted({ rows }: { rows: string[] }) {",
    "  const save = useAction(api.save);",
    "  const [chosen, setChosen] = useState<string | null>(null);",
    "  const [draft] = useState(() => chosen);",
    "  useEffect(() => { if (chosen) setChosen(chosen); }, [chosen]);",
    "  const shown = rows.filter((row) => row !== chosen);",
    "  return shown.map((row) => <Row key={row} onPress={() => save({ row, chosen })} />);",
    "}",
  ].join("\n"), "apps/mobile/src/features/planted/Planted.tsx")).toEqual([
    "apps/mobile/src/features/planted/Planted.tsx:7: Planted reads chosen in a handler",
  ]);
});

test("a screen that renders another owner's hook may call its handlers but not read its fields from the render", () => {
  const owner = [
    "export function useEditor(transport: EditorTransport) {",
    "  const [form, setForm, readForm] = useFormState({ description: \"\" });",
    "  return { description: form.description, read: readForm, submit: () => transport.post(readForm()) };",
    "}",
  ].join("\n");
  const screen = [
    "export function Screen({ transport }: { transport: EditorTransport }) {",
    "  const editor = useEditor(transport);",
    "  const onPost = () => { if (editor.read().description.trim()) void editor.submit(); };",
    "  const onStale = () => { if (editor.description.trim()) void editor.submit(); };",
    "  return <Form onPost={onPost} onStale={onStale} />;",
    "}",
  ].join("\n");
  expect(violations([parse("apps/mobile/src/features/planted/useEditor.ts", owner), parse("apps/mobile/src/features/planted/Screen.tsx", screen)]))
    .toEqual(["apps/mobile/src/features/planted/Screen.tsx:4: Screen reads editor in a handler"]);
});
