import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { expect, test } from "vitest";

const repository = resolve(__dirname, "../../../../..");
const roots = ["apps/mobile/app", "apps/mobile/src", "apps/mobile/modules", "src"].map((dir) => join(repository, dir));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "android" || name === "ios") return [];
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|testSupport|fixtures|formal)\.tsx?$/.test(name) ? [path] : [];
  });
}

const forbidden: ReadonlyArray<readonly [string, RegExp]> = [
  ["toLocaleString", /\.toLocaleString\(/],
  ["Intl.NumberFormat", /Intl\.NumberFormat/],
  ["a hard-coded es-CO locale", /["'`]es-CO["'`]/],
  ["a hard-coded en-US locale", /["'`]en-US["'`]/],
  ["the removed locale parser", /\bparseMoney\b/],
  ["the removed input sanitizer", /\bformatMoneyInput\b/],
  ["the language-only compact formatter", /\bformatCompactNumber\b/],
  ["an amount formatter without a currency", /\b(formatAmount|compactMoney|amountOfMinorUnits)\(\s*[^,()]+\)/],
  ["an amount session without a currency", /\b(openAmount|amountFormat)\(\s*\)/],
];

type Exemption = readonly [file: string, declaration: string, pattern: string, why: string];

/**
 * Each exemption names its file, the top-level declaration allowed one line with the pattern, and why that use is not
 * money grammar. A second such line, even in the same declaration, is a violation.
 */
const allowed: readonly Exemption[] = [
  ["apps/mobile/src/features/timeZones.ts", "calendarDate", "a hard-coded en-US locale", "date helper: reads calendar parts with Intl.DateTimeFormat"],
  ["apps/mobile/src/features/timeZones.ts", "zoneOffsetMs", "a hard-coded en-US locale", "date helper: reads calendar parts with Intl.DateTimeFormat"],
  ["apps/mobile/src/features/intake/prototype/NotificationFirst.tsx", "time", "toLocaleString", "date helper: the prototype's capture time"],
  ["apps/mobile/src/features/money.ts", "currencyDisplayPrefix", "Intl.NumberFormat", "currency symbol lookup on the number 0; separators never come from Intl"],
  ["apps/mobile/src/features/money.ts", "currencyDisplayPrefix", "a hard-coded es-CO locale", "currency symbol lookup on the number 0; separators never come from Intl"],
  ["src/accounting/timeZone.ts", "requireTimeZone", "a hard-coded en-US locale", "date helper: validates a time zone with Intl.DateTimeFormat"],
  ["src/accounting/timeZone.ts", "calendarDate", "a hard-coded en-US locale", "date helper: reads calendar parts with Intl.DateTimeFormat"],
  ["src/i18n/index.ts", "localeTags", "a hard-coded en-US locale", "language tags for dates and words, never for amounts"],
  ["src/i18n/index.ts", "localeTags", "a hard-coded es-CO locale", "language tags for dates and words, never for amounts"],
  ["src/i18n/format.ts", "formatCompactNumber", "Intl.NumberFormat", "counts that are not money; money code may not call it, by the rule above"],
  ["src/i18n/format.ts", "formatCompactNumber", "the language-only compact formatter", "its own definition"],
];

/**
 * The lines of a top-level declaration: from the line declaring `name` through the first later line that closes at
 * column zero, or that one line when the declaration ends on it.
 */
function declaration(source: string, name: string): readonly [number, number] | null {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^(export )?(async )?(function|const|let) ${name}\\b`).test(line));
  if (start < 0) return null;
  if (/;\s*$/.test(lines[start])) return [start, start];
  const end = lines.findIndex((line, index) => index > start && /^[})\]]/.test(line));
  return end < 0 ? null : [start, end];
}

/** The forbidden uses in one file, after blanking the one exempt line in each exempt declaration. */
function violations(file: string, source: string): string[] {
  return forbidden.flatMap(([name, pattern]) => {
    const lines = source.split("\n");
    for (const [exemptFile, exemptDeclaration, exemptPattern] of allowed) {
      if (exemptFile !== file || exemptPattern !== name) continue;
      const range = declaration(source, exemptDeclaration);
      if (!range) continue;
      const line = lines.findIndex((text, index) => index >= range[0] && index <= range[1] && pattern.test(text));
      if (line >= 0) lines[line] = "";
    }
    return pattern.test(lines.join("\n")) ? [`${file}: ${name}`] : [];
  });
}

test("no production file in the app or the shared code formats or parses money without the workspace currency", () => {
  const found = roots.flatMap(files).flatMap((path) => violations(relative(repository, path), readFileSync(path, "utf8")));
  expect(found).toEqual([]);
});

test("every exemption still names a declaration that uses its pattern, so none outlives its reason", () => {
  for (const [file, name, pattern] of allowed) {
    const source = readFileSync(join(repository, file), "utf8");
    const range = declaration(source, name);
    expect(range, `${file}: ${name}`).not.toBeNull();
    const body = source.split("\n").slice(range![0], range![1] + 1).join("\n");
    expect(forbidden.find(([rule]) => rule === pattern)?.[1].test(body), `${file}: ${name}: ${pattern}`).toBe(true);
  }
});

test("a violation planted beside an exempt declaration, in the same file, is still caught", () => {
  const file = "apps/mobile/src/features/money.ts";
  const source = readFileSync(join(repository, file), "utf8");
  expect(violations(file, source)).toEqual([]);
  const planted = `${source}\nexport function plantedDisplay(minorUnits: number) {\n  return new Intl.NumberFormat("en-US").format(minorUnits / 100);\n}\n`;
  expect(violations(file, planted)).toEqual([`${file}: Intl.NumberFormat`, `${file}: a hard-coded en-US locale`]);
  const inside = source.replace("  const [before", "  const grouped = new Intl.NumberFormat(\"es-CO\").format(1234);\n  const [before");
  expect(inside).not.toBe(source);
  expect(violations(file, inside)).toEqual([`${file}: Intl.NumberFormat`, `${file}: a hard-coded es-CO locale`]);
  const shared = "src/i18n/format.ts";
  const plantedShared = `${readFileSync(join(repository, shared), "utf8")}\nexport const amountLabel = (value: number) => value.toLocaleString("es-CO");\n`;
  expect(violations(shared, plantedShared)).toEqual([`${shared}: toLocaleString`, `${shared}: a hard-coded es-CO locale`]);
});

const amountFolder = "apps/mobile/src/features/amount/";
const sessionConstructors = ["openAmount", "openAmountIn", "amountOfMinorUnits", "openSavedAmount"];
const renderEffects = new Set(["useEffect", "useLayoutEffect", "useInsertionEffect", "useMemo"]);
/** The hooks whose state a handler reads with `read()`; `useFormState` is `useAmountState` for a whole form. */
const pressStates = new Set(["useAmountState", "useFormState"]);

function parse(file: string, source: string) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function lineOf(file: ts.SourceFile, node: ts.Node) {
  return file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
}

function isFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
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

function boundNames(name: ts.BindingName): string[] {
  return ts.isIdentifier(name) ? [name.text] : name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : boundNames(element.name));
}

/** Names a function declares itself: its parameters and anything declared in its body outside further functions. */
function ownNames(fn: ts.FunctionLikeDeclaration): Set<string> {
  const names = new Set(fn.parameters.flatMap((parameter) => boundNames(parameter.name)));
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) boundNames(node.name).forEach((name) => names.add(name));
    if (ts.isFunctionDeclaration(node) && node.name) names.add(node.name.text);
    if (!isFunction(node)) ts.forEachChild(node, visit);
  };
  if (fn.body) ts.forEachChild(fn.body, visit);
  return names;
}

function isRenderEffect(fn: ts.Node) {
  const call = fn.parent;
  return ts.isCallExpression(call) && call.arguments[0] === fn && ts.isIdentifier(call.expression) && renderEffects.has(call.expression.text);
}

/**
 * Handlers that read an amount another way than its state's `read()`. In the function that calls useAmountState, the
 * state's value and every value the render derives from it are render values; a function nested in it, other than an
 * effect or memo of that render, is a handler that may have come from an earlier render, so it reads none of them.
 */
function capturedAmounts(file: string, source: string): string[] {
  const parsed = parse(file, source);
  const found: string[] = [];
  const owners: Array<{ owner: ts.FunctionLikeDeclaration; value: string }> = [];
  const findOwners = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)
      && ts.isIdentifier(node.initializer.expression) && pressStates.has(node.initializer.expression.text)
      && ts.isArrayBindingPattern(node.name)) {
      const [first] = node.name.elements;
      let owner: ts.Node = node.parent;
      while (owner && !isFunction(owner)) owner = owner.parent;
      if (first && !ts.isOmittedExpression(first) && ts.isIdentifier(first.name) && owner) owners.push({ owner: owner as ts.FunctionLikeDeclaration, value: first.name.text });
    }
    ts.forEachChild(node, findOwners);
  };
  findOwners(parsed);
  for (const { owner, value } of owners) {
    const rendered = new Set([value]);
    const renderScope = (visit: (node: ts.Node) => void) => {
      const walk = (node: ts.Node) => { visit(node); if (!isFunction(node)) ts.forEachChild(node, walk); };
      if (owner.body) ts.forEachChild(owner.body, walk);
    };
    const reads = (node: ts.Node, names: Set<string>) => {
      let hit = false;
      const walk = (at: ts.Node) => { if (ts.isIdentifier(at) && names.has(at.text) && isRead(at)) hit = true; else ts.forEachChild(at, walk); };
      walk(node);
      return hit;
    };
    for (let grew = true; grew;) {
      grew = false;
      renderScope((node) => {
        if (ts.isVariableDeclaration(node) && node.initializer && reads(node.initializer, rendered))
          for (const name of boundNames(node.name)) if (!rendered.has(name)) { rendered.add(name); grew = true; }
      });
    }
    const inHandler = (node: ts.Node, hidden: ReadonlySet<string>) => {
      if (isFunction(node)) {
        if (isRenderEffect(node)) return;
        const own = ownNames(node);
        const visible = new Set([...hidden].filter((name) => !own.has(name)));
        const walk = (at: ts.Node) => {
          if (ts.isIdentifier(at) && visible.has(at.text) && isRead(at)) found.push(`${file}:${lineOf(parsed, at)}: a handler reads ${at.text}, which the render derived from the amount state`);
          if (isFunction(at)) { inHandler(at, visible); return; }
          ts.forEachChild(at, walk);
        };
        if (node.body) ts.forEachChild(node.body, walk);
        return;
      }
      ts.forEachChild(node, (child) => inHandler(child, hidden));
    };
    if (owner.body) ts.forEachChild(owner.body, (node) => inHandler(node, rendered));
  }
  return found;
}

/** Amounts an owner holds outside useAmountState: React state or a ref holding a session, or a value carrying one. */
function heldAmounts(file: string, source: string, carriers: ReadonlySet<string>): string[] {
  const parsed = parse(file, source);
  const makers = new Set(sessionConstructors);
  /** Whether an expression evaluates to a session a maker returns, directly or through a conditional. */
  const yields = (node: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(node)) return yields(node.expression);
    if (ts.isConditionalExpression(node)) return yields(node.whenTrue) || yields(node.whenFalse);
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(node.operatorToken.kind))
      return yields(node.left) || yields(node.right);
    if (isFunction(node)) return returns(node);
    return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && makers.has(node.expression.text);
  };
  const returns = (fn: ts.FunctionLikeDeclaration): boolean => {
    if (!fn.body) return false;
    if (!ts.isBlock(fn.body)) return yields(fn.body);
    let hit = false;
    const walk = (at: ts.Node) => { if (ts.isReturnStatement(at) && at.expression && yields(at.expression)) hit = true; else if (!isFunction(at)) ts.forEachChild(at, walk); };
    ts.forEachChild(fn.body, walk);
    return hit;
  };
  for (let grew = true; grew;) {
    grew = false;
    const declare = (node: ts.Node) => {
      const name = ts.isFunctionDeclaration(node) && node.name ? node.name.text
        : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isFunction(node.initializer) ? node.name.text : null;
      const fn = ts.isFunctionDeclaration(node) ? node : ts.isVariableDeclaration(node) && node.initializer && isFunction(node.initializer) ? node.initializer : null;
      if (name && fn && !makers.has(name) && returns(fn)) { makers.add(name); grew = true; }
      ts.forEachChild(node, declare);
    };
    declare(parsed);
  }
  /** Whether a type names a carrier, other than through an Omit that removes its `amount`. */
  const carries = (type: ts.TypeNode): boolean => {
    if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
      const [of, without] = type.typeArguments ?? [];
      if (type.typeName.text === "Omit" && of && without && /["']amount["']/.test(without.getText(parsed))) return false;
      if (carriers.has(type.typeName.text)) return true;
    }
    let hit = false;
    ts.forEachChild(type, (child) => { if (!hit && ts.isTypeNode(child) && carries(child)) hit = true; });
    return hit;
  };
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = ts.isIdentifier(node.expression) ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : "";
      if (["useState", "useReducer", "useRef"].includes(callee)
        && ((node.typeArguments ?? []).some(carries) || node.arguments.some(yields)))
        found.push(`${file}:${lineOf(parsed, node)}: an amount held in ${callee}, not useAmountState`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/** Production types that carry an amount session, directly or through another such type. */
function amountCarriers(sources: ReadonlyMap<string, string>): Set<string> {
  const declared = new Map<string, string>();
  for (const [file, source] of sources) {
    const parsed = parse(file, source);
    const visit = (node: ts.Node) => {
      if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) declared.set(node.name.text, node.getText(parsed));
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  }
  const carriers = new Set(["AmountSession"]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, text] of declared)
      if (!carriers.has(name) && [...carriers].some((carrier) => new RegExp(`\\b${carrier}\\b`).test(text))) { carriers.add(name); grew = true; }
  }
  return carriers;
}

/** Every way a production file reads an amount to send other than `sendableMinorUnits` of its state's `read()`. */
function amountReadsOutsidePress(file: string, source: string, carriers: ReadonlySet<string>): string[] {
  const found: string[] = [];
  if (file !== `${amountFolder}useAmountState.ts` && /\bas\s+(unknown\s+as\s+)?(AmountAtPress|AtPress)\b/.test(source))
    found.push(`${file}: an amount cast to one read at the moment of a press`);
  if (file.startsWith("apps/mobile/") && !file.startsWith(amountFolder)) {
    if (/\.editor\.(kind|minorUnits|issue)\b|\b(parseAmount|literalEditor|createAmountEditor)\(/.test(source))
      found.push(`${file}: an amount read from the session's editor instead of its readers`);
    found.push(...heldAmounts(file, source, carriers));
  }
  found.push(...capturedAmounts(file, source));
  return found;
}

test("every amount a production handler sends is read from its owner's state at the moment of the press", () => {
  const sources = new Map(roots.flatMap(files).map((path) => [relative(repository, path), readFileSync(path, "utf8")] as const));
  const carriers = amountCarriers(sources);
  expect([...carriers]).toEqual(expect.arrayContaining(["AmountSession", "LineDraft", "PlaceDraft"]));
  const found = [...sources].flatMap(([file, source]) => amountReadsOutsidePress(file, source, carriers));
  expect(found).toEqual([]);
  const owners = [...sources].filter(([file, source]) => !file.startsWith(amountFolder) && /\buse(Amount|Form)State\s*[<(]/.test(source))
    .map(([file]) => file).sort();
  expect(owners).toEqual([
    "apps/mobile/src/features/Setup.tsx",
    "apps/mobile/src/features/budget/useBudgetEditor.ts",
    "apps/mobile/src/features/intake/prototype/NotificationFirst.tsx",
    "apps/mobile/src/features/placeEnding/PlaceEndingFlow.tsx",
    "apps/mobile/src/features/posting/usePostingEditor.ts",
    "apps/mobile/src/features/recovery/useRecoveryEditor.ts",
    "apps/mobile/src/features/recovery/useRecoveryMove.ts",
  ]);
});

test("the press-time guard catches an amount held in useState, a handler that captured it, a derived capture and a cast", () => {
  const carriers = new Set(["AmountSession", "PlaceDraft"]);
  const file = "apps/mobile/src/features/planted/usePlanted.ts";
  const held = `export function usePlanted() {\n  const [amount, setAmount] = useState(() => openAmount("COP"));\n  return { amount, setAmount };\n}\n`;
  expect(amountReadsOutsidePress(file, held, carriers)).toEqual([`${file}:2: an amount held in useState, not useAmountState`]);
  const typed = `export function usePlanted() {\n  const [draft] = useState<PlaceDraft | null>(null);\n  return draft;\n}\n`;
  expect(amountReadsOutsidePress(file, typed, carriers)).toEqual([`${file}:2: an amount held in useState, not useAmountState`]);
  const without = `export function usePlanted() {\n  return useRef<Omit<PlaceDraft, "amount" | "date"> | null>(null);\n}\n`;
  expect(amountReadsOutsidePress(file, without, carriers)).toEqual([]);
  const keyed = `function blank() {\n  return key(openAmount("COP"));\n}\nexport function usePlanted() {\n  return useState(() => blank());\n}\n`;
  expect(amountReadsOutsidePress(file, keyed, carriers)).toEqual([]);
  const captured = [
    "export function usePlanted(send: (minorUnits: number) => void) {",
    "  const [amount, setAmount, readAmount] = useAmountState(() => openAmount(\"COP\"));",
    "  const shown = displayedMinorUnits(amount) ?? 0;",
    "  useEffect(() => { void shown; }, [shown]);",
    "  const fresh = () => send(sendableMinorUnits(readAmount()) ?? 0);",
    "  const shadowed = (amount: number) => send(amount);",
    "  return { amount, setAmount, fresh, shadowed, stale: () => send(shown), direct: () => send(displayedMinorUnits(amount) ?? 0) };",
    "}",
  ].join("\n");
  expect(amountReadsOutsidePress(file, captured, carriers)).toEqual([
    `${file}:7: a handler reads shown, which the render derived from the amount state`,
    `${file}:7: a handler reads amount, which the render derived from the amount state`,
  ]);
  expect(amountReadsOutsidePress(file, "const sent = sendableMinorUnits(session as AmountAtPress);\n", carriers))
    .toEqual([`${file}: an amount cast to one read at the moment of a press`]);
  expect(amountReadsOutsidePress(file, "const sent = line.amount.editor.minorUnits;\n", carriers))
    .toEqual([`${file}: an amount read from the session's editor instead of its readers`]);
});
