import * as React from "react";
import { createElement, useImperativeHandle, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Category, AccountSetupRequest } from "../../src/features/categories/model";
import type { CategorySheetProps } from "../../src/features/categories/CategorySheet";
import type { TransactionCategories } from "../../src/features/categories/transactionSelection";

type Method = "create" | "update" | "delete";
type Request = { method: Method | "unexpected"; functionName: string; exact: string };
type Reply = { resolve: (value: unknown) => void; reject: (error: Error) => void };
vi.hoisted(() => { Object.defineProperty(globalThis, "__DEV__", { value: false, writable: true, configurable: true }); });
const runtime = vi.hoisted(() => ({
  rows: [] as Category[], manager: undefined as CategorySheetProps | undefined,
  picker: undefined as CategorySheetProps | undefined,
  selection: { ids: ["original"], primaryId: null } as TransactionCategories,
  requests: [] as Request[], reply: undefined as Reply | undefined,
  native: { presented: false, dismissRequested: false, dismissRequests: 0 },
  handoff: undefined as AccountSetupRequest | undefined, initialId: undefined as string | undefined,
}));
function canonical(value: unknown): string {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, ordered(val)]));
    return item;
  }
  return JSON.stringify(ordered(value));
}
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name === "accounting:listUserCategories") return runtime.rows;
    if (name === "accounting:suggestCategoryNature") return { suggested: null };
    if (name === "accounting:listCategoryPresets") return [];
    throw new Error(`Unexpected query ${name}`);
  },
  useAction: (reference: Parameters<typeof getFunctionName>[0]) => (payload: unknown) => {
    const name = getFunctionName(reference);
    const method = name === "accounting:createUserCategory" ? "create" : name === "accounting:updateUserCategory" ? "update" : name === "accounting:deleteUserCategory" ? "delete" : "unexpected";
    runtime.requests.push({ method, functionName: name, exact: canonical(payload) });
    return new Promise<unknown>((resolveReply, reject) => { runtime.reply = { resolve: resolveReply, reject }; });
  },
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "formal-local-subject" }) }));
vi.mock("expo-router", () => ({ router: { back() {} }, Redirect: "redirect", useLocalSearchParams: () => ({ categoryId: runtime.initialId }) }));
vi.mock("../../src/features/activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace", functionalCurrency: "COP", timeZone: "America/Bogota" }, financialAccountProfile: { id: "daily" },
}) }));
vi.mock("../../src/local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
vi.mock("../../src/local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => () => false }));
vi.mock("../../src/features/setup/DeferredAccountSetup", () => ({ DeferredAccountSetup: ({ request }: { request: AccountSetupRequest }) => {
  runtime.handoff = request; return createElement("account-handoff", { request });
} }));
vi.mock("../../src/features/categories/CategorySheet", async (original) => {
  const actual = await original<typeof import("../../src/features/categories/CategorySheet")>();
  return { CategorySheet: (props: CategorySheetProps) => {
    if (props.selectionCount === undefined) runtime.manager = props; else runtime.picker = props;
    return createElement(actual.CategorySheet, props);
  } };
});
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: React.forwardRef(function Modal(props: React.PropsWithChildren<{ onDismiss?: () => void }>, ref) {
    const manager = ref === runtime.manager?.sheetRef;
    useImperativeHandle(ref, () => ({
      present() { if (manager) runtime.native.presented = true; },
      dismiss() { if (manager) { runtime.native.dismissRequested = true; runtime.native.dismissRequests++; } },
    }));
    return createElement("native-modal", { ...props, manager: ref === runtime.manager?.sheetRef }, props.children);
  }),
  BottomSheetScrollView: "scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
}));
vi.mock("../../src/features/categories/appearance", async (original) => {
  const actual = await original<typeof import("../../src/features/categories/appearance")>();
  return { ...actual, quickEmojis: actual.quickEmojis.filter(emoji => emoji === "✨"), categoryPalette: actual.categoryPalette.filter(entry => entry.id === "h30") };
});
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native-gesture-handler", () => ({ ScrollView: "scroll" }));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport", Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  BackHandler: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: "ios" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
import CategoriesRoute from "../../app/categories";
import { CategoryPicker } from "../../src/features/categories/CategoryPicker";
import { canPostCategories } from "../../src/features/categories/transactionSelection";

const original: Category = {
  id: "original", workspaceId: "workspace", name: "Café", normalizedName: "cafe", nature: "Expense", natureSource: "answered",
  defaultPostingAccountCode: "519560", resolvedPostingAccountCode: "519560",
  classification: { kind: "lexicon", concept: "dining", version: "category-es-en@1" }, style: { emoji: "☕", tone: "primary", color: "h270" },
};
const changedStyle = { emoji: "✨", tone: "primary", color: "h270" } satisfies Category["style"];
type Seed = { operation: "create" | "update" | "delete"; answer: "spend" | "receive" | "stillMine" | "payDebt"; lane: "save" | "cancel" };
type Event = "NameFinal" | "AnswerFinal" | "Style" | "Color" | "GuardedSave" | "Save" | "DeleteArm" | "Keep" | "DeleteConfirm" | "ReplyOK" | "ReplyFailed" | "FrozenCallbacks" | "NativeDismiss" | "Reopen" | "CatalogRecreate" | "DeselectUnavailable";
type Monitor = { named: boolean; answered: boolean; styled: boolean; colored: boolean; guarded: boolean; canceled: boolean; reopened: boolean; kept: boolean;
  attempts: number; failures: number; succeeded: boolean; recreated: boolean; deselected: boolean; dismissedAfterAccount: boolean;
  expectedName: string; expectedAnswer: Seed["answer"] | null; expectedStyle: Category["style"];
  expectedMethod: string; expectedPayload: string; accountExpected: string;
  request: boolean; deletion: boolean; frozen: boolean; retry: boolean; dismiss: boolean; handoff: boolean; recovery: boolean; input: boolean; violations: string[] };
let root: ReactTestRenderer | undefined;
function manager() { if (!runtime.manager) throw new Error("Manager sheet missing"); return runtime.manager; }
function picker() { if (!runtime.picker) throw new Error("Picker sheet missing"); return runtime.picker; }
function host(label: string, surface: "manager" | "picker" | "any" = "manager") {
  if (surface === "manager" && !runtime.native.presented) throw new Error(`Manager control is not presented: ${label}`);
  const subtree = surface === "any" ? root?.root : root?.root.findAll(node => String(node.type) === "native-modal" && (surface === "manager" ? node.props.manager : !node.props.manager))[0];
  const node = subtree?.findAll(node => typeof node.type === "string" && node.props.accessibilityLabel === label)[0];
  if (!node) throw new Error(`Missing ${surface} control ${label}`);
  return node;
}
function categoryRow(name: string) {
  const node = root?.root.findAll(node => node.type === "button" && node.findAllByType("text").some(text => text.children.join("") === name))[0];
  if (!node) throw new Error(`Missing category row ${name}`);
  return node;
}
function Harness() {
  const [selection, setSelection] = useState<TransactionCategories>({ ids: ["original"], primaryId: null });
  runtime.selection = selection;
  return createElement(React.Fragment, null, createElement(CategoriesRoute), createElement(CategoryPicker, {
    visible: true, workspaceId: "workspace", direction: "out", value: selection, onChange: setSelection, onClose() {},
  }));
}
function observation() {
  const props = manager(); const editor = props.editor;
  return structuredClone({ editor, name: editor?.kind === "custom" || editor?.kind === "edit" ? editor.name : "", answer: props.answer,
    busy: props.busy, confirmingDelete: props.confirmingDelete ?? false, error: props.error, canConfirm: props.canConfirm,
    requests: runtime.requests, native: runtime.native, handoff: runtime.handoff ?? null, rows: runtime.rows,
    selected: runtime.selection, options: picker().options ?? [], canClassify: canPostCategories(runtime.selection, runtime.rows),
  });
}
function editorFacts(o: ReturnType<typeof observation>) { return canonical({ editor: o.editor, answer: o.answer }); }
async function mount(seed: Seed): Promise<Monitor> {
  await act(async () => root?.unmount());
  runtime.rows = [structuredClone(original)]; runtime.manager = undefined; runtime.picker = undefined;
  runtime.requests = []; runtime.reply = undefined; runtime.handoff = undefined;
  runtime.native = { presented: false, dismissRequested: false, dismissRequests: 0 };
  runtime.initialId = seed.operation === "create" ? undefined : "original";
  await act(async () => { root = create(createElement(Harness)); });
  if (seed.operation === "create") {
    await act(async () => host("Add category", "any").props.onPress());
    if (runtime.native.presented) {
      await act(async () => host("Category name").props.onChangeText("Draft"));
      const label = { spend: "I spend it", receive: "I receive it", stillMine: "It is still mine", payDebt: "I pay a debt" }[seed.answer];
      await act(async () => host(label).props.onPress());
    }
  }
  expect(manager().editor?.kind).toBe(seed.operation === "create" ? "custom" : "edit");
  return { named: false, answered: false, styled: false, colored: false, guarded: false, canceled: false, reopened: false, kept: false,
    attempts: 0, failures: 0, succeeded: false, recreated: false, deselected: false, dismissedAfterAccount: false,
    expectedName: seed.operation === "create" ? "Draft" : "Café", expectedAnswer: seed.operation === "create" ? seed.answer : null,
    expectedStyle: seed.operation === "create" ? changedStyle : original.style,
    expectedMethod: "", expectedPayload: "", accountExpected: "",
    request: true, deletion: true, frozen: true, retry: true, dismiss: runtime.native.presented, handoff: true, recovery: true, input: true,
    violations: runtime.native.presented ? [] : ["Category editor opened without a native presentation request"] };
}
function expected(seed: Seed, m: Monitor) {
  if (seed.operation === "delete") return { method: "delete", payload: { workspaceId: "workspace", categoryId: "original" } };
  if (seed.operation === "update") return { method: "update", payload: { workspaceId: "workspace", categoryId: "original", name: m.expectedName, style: m.expectedStyle } };
  if (m.expectedAnswer === "spend" || m.expectedAnswer === "receive") return { method: "create", payload: { workspaceId: "workspace", selection: { kind: "custom", name: m.expectedName, answer: m.expectedAnswer, style: m.expectedStyle } } };
  return { method: "", payload: null };
}
function fail(m: Monitor, key: "request" | "deletion" | "frozen" | "retry" | "dismiss" | "handoff" | "recovery" | "input", reason: string) { m[key] = false; if (!m.violations.includes(reason)) m.violations.push(reason); }
async function step(seed: Seed, m: Monitor, event: Event) {
  const before = observation(); m.expectedMethod = ""; m.expectedPayload = "";
  if (event === "Save" || event === "DeleteConfirm") { const intent = expected(seed, m); m.expectedMethod = intent.method; m.expectedPayload = canonical(intent.payload); }
  await act(async () => {
    switch (event) {
      case "NameFinal": host("Category name").props.onChangeText("Weekend"); m.expectedName = "Weekend"; m.expectedAnswer = seed.operation === "create" ? null : m.expectedAnswer; m.named = true; break;
      case "AnswerFinal": host({ spend: "I spend it", receive: "I receive it", stillMine: "It is still mine", payDebt: "I pay a debt" }[seed.answer]).props.onPress(); m.expectedAnswer = seed.answer; m.answered = true; break;
      case "Style": host("Emoji ✨").props.onPress(); m.expectedStyle = { ...m.expectedStyle, emoji: "✨" }; m.styled = true; break;
      case "Color": host("Color h30").props.onPress(); m.expectedStyle = { ...m.expectedStyle, color: "h30" }; m.colored = true; break;
      case "GuardedSave": manager().onConfirm(); m.guarded = true; break;
      case "Save": {
        const callback = host(seed.operation === "update" ? "Save changes" : "Add category").props.onPress;
        callback(); callback(); m.attempts++;
        if (!m.expectedMethod) m.accountExpected = canonical({ name: m.expectedName, style: m.expectedStyle, answer: m.expectedAnswer });
        break;
      }
      case "DeleteArm": host("Delete category").props.onPress(); break;
      case "Keep": host("Keep category").props.onPress(); m.kept = true; break;
      case "DeleteConfirm": { const callback = host("Confirm delete").props.onPress; callback(); callback(); m.attempts++; break; }
      case "FrozenCallbacks": {
        const props = manager(); props.onName("Changed while pending"); props.onStyle({ ...changedStyle, emoji: "X" }); props.onAnswer("receive"); props.onDismiss(); props.onConfirm(); props.onDelete?.(); break;
      }
      case "ReplyFailed": runtime.reply?.reject(new Error("Controlled category failure")); m.failures++; break;
      case "ReplyOK": {
        const next = { ...original, id: seed.operation === "create" ? "fresh" : "original", name: m.expectedName, normalizedName: m.expectedName.toLowerCase(), style: m.expectedStyle,
          nature: seed.operation === "create" && seed.answer === "receive" ? "Income" : "Expense" } satisfies Category;
        runtime.rows = seed.operation === "delete" ? [] : seed.operation === "create" ? [original, next] : [next];
        runtime.reply?.resolve(seed.operation === "create" ? { kind: "category", category: next } : seed.operation === "update" ? next : null); m.succeeded = true;
        break;
      }
      case "NativeDismiss": {
        const modal = root?.root.findAll(node => String(node.type) === "native-modal" && node.props.manager)[0];
        if (!modal || !runtime.native.presented) throw new Error("Missing presented category modal");
        runtime.native.presented = false; runtime.native.dismissRequested = false; modal.props.onDismiss();
        if (m.accountExpected) m.dismissedAfterAccount = true; else if (before.editor) m.canceled = true;
        break;
      }
      case "Reopen": {
        if (seed.operation === "create") host("Add category", "any").props.onPress();
        else categoryRow("Café").props.onPress();
        m.reopened = true; m.named = false; m.answered = false; m.styled = false; m.colored = false; m.guarded = false;
        m.expectedName = seed.operation === "create" ? "" : "Café"; m.expectedAnswer = null; m.expectedStyle = seed.operation === "create" ? changedStyle : original.style;
        break;
      }
      case "CatalogRecreate": runtime.rows = [{ ...original, id: "fresh" }]; m.recreated = true; break;
      case "DeselectUnavailable": host("Unavailable category", "picker").props.onPress(); m.deselected = true; break;
    }
  });
  if (event === "ReplyOK" || event === "CatalogRecreate") await act(async () => root?.update(createElement(Harness)));
  const after = observation();
  if ((event === "Save" || event === "DeleteConfirm") && m.expectedMethod && after.requests.length !== before.requests.length + 1)
    fail(m, "request", "Eligible management Save/Confirm delete did not dispatch exactly one request");
  if (event === "DeleteArm" && !after.confirmingDelete || event === "Keep" && (after.confirmingDelete || !after.editor || after.requests.length !== before.requests.length))
    fail(m, "deletion", "Rendered Delete/Keep control did not apply its intended confirmation state");
  for (const request of after.requests.slice(before.requests.length)) {
    if (!m.expectedMethod || request.method !== m.expectedMethod || request.functionName !== ({ create: "accounting:createUserCategory", update: "accounting:updateUserCategory", delete: "accounting:deleteUserCategory" } as Record<string, string>)[m.expectedMethod] || request.exact !== m.expectedPayload || after.requests.length - before.requests.length > 1)
      fail(m, "request", "Category request differs from explicit user intent or duplicate request escaped the in-flight lock");
    if (request.method === "delete" && (event !== "DeleteConfirm" || !before.confirmingDelete)) fail(m, "deletion", "Delete dispatched before explicit second confirmation");
  }
  if (event === "NameFinal" && (after.name !== m.expectedName || seed.operation === "create" && after.answer !== null)) fail(m, "input", "Name edit did not apply or retained an answer for the old name");
  if (event === "AnswerFinal" && after.answer !== seed.answer) fail(m, "input", "Rendered nature choice did not apply");
  if (event === "Style" && after.editor?.style.emoji !== "✨") fail(m, "input", "Rendered appearance choice did not apply");
  if (event === "Color" && after.editor?.style.color !== "h30") fail(m, "input", "Rendered color choice did not apply");
  if (m.accountExpected && !after.handoff && !after.native.dismissRequested) fail(m, "handoff", "Account handoff did not request native category dismissal");
  if (event === "FrozenCallbacks" && (editorFacts(before) !== editorFacts(after) || canonical(before.requests) !== canonical(after.requests))) fail(m, "frozen", "Stale callbacks changed pending category answers or dispatched again");
  if (event === "ReplyFailed" && (after.busy || !after.error || editorFacts(before) !== editorFacts(after))) fail(m, "retry", "Failed category request discarded the editor answers needed for retry");
  if (after.editor && !after.native.presented) fail(m, "dismiss", "Category editor is open without a native presentation request");
  if (event === "NativeDismiss" && !before.busy && (after.editor !== null || after.confirmingDelete || after.requests.length !== before.requests.length)) fail(m, "dismiss", "Category cancellation did not clear editor/confirmation or sent a request");
  if (after.handoff && (!m.dismissedAfterAccount || canonical(after.handoff) !== m.accountExpected || after.requests.length)) fail(m, "handoff", "Account answer was delivered before native dismissal or made a category request");
  if (event === "NativeDismiss" && m.accountExpected && canonical(after.handoff) !== m.accountExpected) fail(m, "handoff", "Native category dismissal dropped the queued account request");
  const missing = after.selected.ids.filter(id => !after.rows.some(row => row.id === id));
  if (missing.length && (after.canClassify || !missing.every(id => after.options.some(option => option.key === id && option.name === "Unavailable category" && option.selected)))) fail(m, "recovery", "Deleted selection is admissible or lacks its removable unavailable row");
  if (event === "CatalogRecreate" && canonical(before.selected) !== canonical(after.selected)) fail(m, "recovery", "Recreated name silently replaced the selected deleted identity");
  if (event === "DeselectUnavailable" && after.selected.ids.includes("original")) fail(m, "recovery", "Unavailable category control did not remove the deleted selection");
}
function enabled(seed: Seed, m: Monitor): Event[] {
  const props = manager(); const events: Event[] = [];
  if (props.editor && !runtime.native.presented) return events;
  if (props.busy) {
    events.push("FrozenCallbacks", "ReplyOK"); if (!m.failures) events.push("ReplyFailed"); return events;
  }
  if (m.succeeded) {
    if (seed.operation === "delete") {
      if (!m.recreated) events.push("CatalogRecreate");
      if (!m.deselected && runtime.selection.ids.includes("original") && picker().options?.some(option => option.key === "original" && option.name === "Unavailable category")) events.push("DeselectUnavailable");
    }
    return events;
  }
  if (m.accountExpected) return m.dismissedAfterAccount || !runtime.native.presented || !runtime.native.dismissRequested ? events : ["NativeDismiss"];
  if (m.canceled && !m.reopened) return ["Reopen"];
  if (!props.editor) return events;
  const cancelPhase = seed.lane === "cancel" && !m.canceled;
  if (seed.operation === "delete") {
    if (!props.confirmingDelete) events.push("DeleteArm");
    else { if (!m.kept) events.push("Keep"); if (!cancelPhase && m.attempts < 2) events.push("DeleteConfirm"); }
    if (cancelPhase && runtime.native.presented) events.push("NativeDismiss");
    return events;
  }
  if (!m.named) events.push("NameFinal");
  else {
    if (seed.operation === "create" && !m.answered) { events.push("AnswerFinal"); if (!m.guarded) events.push("GuardedSave"); }
    if (!m.styled) events.push("Style");
    if (!m.colored) events.push("Color");
    if (cancelPhase && runtime.native.presented) events.push("NativeDismiss");
    else if (props.canConfirm && m.attempts < 2) events.push("Save");
  }
  return events;
}
function raw(node: Node) {
  const o = node.observation, m = node.monitor;
  return { userAnswer: node.seed.answer, requests: o.requests, expectedMethod: m.expectedMethod, expectedPayload: m.expectedPayload,
    expectedFunction: ({ create: "accounting:createUserCategory", update: "accounting:updateUserCategory", delete: "accounting:deleteUserCategory" } as Record<string, string>)[m.expectedMethod] ?? "",
    editor: editorFacts(o), editorOpen: o.editor !== null, editorKind: o.editor?.kind ?? "", name: o.name, answer: o.answer ?? "", emoji: o.editor?.style.emoji ?? "", color: o.editor?.style.color ?? "",
    busy: o.busy, error: o.error, confirmingDelete: o.confirmingDelete, presented: o.native.presented, dismissRequested: o.native.dismissRequested,
    accountExpected: m.accountExpected, dismissedAfterAccount: m.dismissedAfterAccount, handoff: o.handoff ? canonical(o.handoff) : "",
    selected: o.selected.ids, rowIds: o.rows.map(row => row.id), canClassify: o.canClassify,
    options: o.options.map(option => ({ id: option.key, label: option.name, selected: option.selected })),
  };
}
type Node = { seed: Seed; trace: Event[]; monitor: Monitor; observation: ReturnType<typeof observation> };
function tla(value: unknown): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(Buffer.from(value).toString("base64"));
  if (Array.isArray(value)) return `<<${value.map(tla).join(",")}>>`;
  if (value && typeof value === "object") return `[${Object.entries(value).map(([key, item]) => `${key} |-> ${tla(item)}`).join(",")}]`;
  throw new Error("Invalid TLA observation");
}

test("extract management CRUD and retained-selection event graph", async () => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { if (!String(args[0]).includes("react-test-renderer is deprecated")) throw new Error(args.map(String).join(" ")); });
  const seeds: Seed[] = [];
  for (const lane of ["save", "cancel"] satisfies Seed["lane"][]) {
    for (const answer of ["spend", "receive", "stillMine", "payDebt"] satisfies Seed["answer"][]) seeds.push({ operation: "create", answer, lane });
    seeds.push({ operation: "update", answer: "spend", lane }, { operation: "delete", answer: "spend", lane });
  }
  const nodes: Node[] = [], edges: Array<{ from: number; to: number; event: Event }> = [], initial: number[] = [];
  const index = new Map<string, number>(); const key = (seed: Seed, m: Monitor) => canonical({ seed, monitor: m, observation: observation() });
  for (const seed of seeds) { const m = await mount(seed); const id = nodes.push({ seed, trace: [], monitor: structuredClone(m), observation: observation() }); index.set(key(seed, m), id); initial.push(id); }
  const maxDepth = 24;
  const mutationFlag = process.env.CATEGORY_UI_MUTATION_FLAG;
  let stoppedOnMutation = false;
  const matchesMutation = (node: Node) => !!mutationFlag && !Reflect.get(node.monitor, mutationFlag);
  exploration: for (let cursor = 0; cursor < nodes.length; cursor++) {
    const node = nodes[cursor]; if (!node) throw new Error("Missing node");
    if (matchesMutation(node)) { stoppedOnMutation = true; break; }
    let m = await mount(node.seed); for (const event of node.trace) await step(node.seed, m, event);
    expect(observation()).toEqual(node.observation);
    if (node.trace.length >= maxDepth) continue;
    for (const event of enabled(node.seed, m)) {
      m = await mount(node.seed); for (const prior of node.trace) await step(node.seed, m, prior);
      await step(node.seed, m, event); const stateKey = key(node.seed, m); let id = index.get(stateKey);
      if (id === undefined) { id = nodes.push({ seed: node.seed, trace: [...node.trace, event], monitor: structuredClone(m), observation: observation() }); index.set(stateKey, id); }
      edges.push({ from: cursor + 1, to: id, event });
      const reached = nodes[id - 1];
      if (reached && matchesMutation(reached)) { stoppedOnMutation = true; break exploration; }
    }
    if (cursor % 100 === 0) console.log(`CRUD_PROGRESS processed=${cursor} states=${nodes.length}`);
    if (nodes.length > 10_000) throw new Error("CRUD state cap exceeded");
  }
  await act(async () => root?.unmount()); root = undefined;
  const out = resolve(process.env.CATEGORY_UI_FORMAL_OUT ?? ".orchestrator/runs/2026-10-20-category-ui-crud-formal/latest"); mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "crud-graph.json"), JSON.stringify({ maxDepth, nodes, edges, initial }, null, 2));
  writeFileSync(resolve(out, "RealCRUD.tla"), `---- MODULE RealCRUD ----\nInitialStates == {${initial.join(",")}}\nObservations == <<${nodes.map(node => tla(raw(node))).join(",\n")}>>\nEdges == {${edges.map(edge => `[from |-> ${edge.from}, to |-> ${edge.to}, event |-> ${JSON.stringify(edge.event)}]`).join(",\n")}}\n====\n`);
  const flags = ["request", "deletion", "frozen", "retry", "dismiss", "handoff", "recovery", "input"];
  const failures = flags.flatMap(flag => { const i = nodes.findIndex(node => !Reflect.get(node.monitor, flag)); return i < 0 ? [] : [{ invariant: flag, state: i + 1, ...nodes[i] }]; });
  writeFileSync(resolve(out, "crud-counterexamples.json"), JSON.stringify(failures, null, 2));
  writeFileSync(resolve(out, "crud-summary.json"), JSON.stringify({ states: nodes.length, edges: edges.length, initial: initial.length, maxDepth,
    maxObservedDepth: Math.max(...nodes.map(node => node.trace.length)), depthFrontier: nodes.filter(node => node.trace.length === maxDepth).length,
    failingInvariants: failures.map(f => f.invariant),
    exploration: mutationFlag ? { mode: "MUTATION_WITNESS_ONLY", target: mutationFlag, stoppedOnMutation } : { mode: "COMPLETE_BOUNDED" } }, null, 2));
  console.log(`CRUD_GRAPH states=${nodes.length} edges=${edges.length} findings=${failures.map(f => f.invariant).join(",") || "none"}`);
});
