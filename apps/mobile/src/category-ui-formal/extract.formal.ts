import * as React from "react";
import { createElement, useImperativeHandle, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PendingPosting } from "../../src/features/posting/pendingPostingSchema";
import type { PostingFormProps } from "../../src/features/posting/PostingForm";
import type { CategorySheetProps } from "../../src/features/categories/CategorySheet";
import type { usePostingEditor } from "../../src/features/posting/usePostingEditor";
import type { AccountSetupForm } from "../../src/features/posting/AccountSetupForm";

type Editor = ReturnType<typeof usePostingEditor>;
type SetupProps = ComponentProps<typeof AccountSetupForm>;
type Receipt = { description: string; amount: { currency: string; minorUnits: number }; financialAccountProfileId?: string };
type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void };
function deferred<T>(): Deferred<T> {
  let resolveValue: ((value: T) => void) | undefined;
  let rejectValue: ((error: Error) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => { resolveValue = resolve; rejectValue = reject; });
  return { promise, resolve: (value) => { if (!resolveValue) throw new Error("No resolver"); resolveValue(value); },
    reject: (error) => { if (!rejectValue) throw new Error("No rejecter"); rejectValue(error); } };
}
vi.hoisted(() => { Object.defineProperty(globalThis, "__DEV__", { value: false, writable: true, configurable: true }); });
const runtime = vi.hoisted(() => ({
  sign: "+",
  form: undefined as PostingFormProps | undefined,
  category: undefined as CategorySheetProps | undefined,
  editor: undefined as Editor | undefined,
  setup: undefined as SetupProps | undefined,
  place: undefined as { onSelect: (id: string) => void } | undefined,
  commands: [] as PendingPosting[],
  dispatched: [] as PendingPosting[],
  stage: "idle",
  save: undefined as Deferred<{ id: string; command: PendingPosting }> | undefined,
  post: undefined as Deferred<Receipt> | undefined,
  clear: undefined as Deferred<void> | undefined,
  key: 0,
  sheetVisible: false,
  sheetClosing: false,
  presents: 0,
  dismisses: 0,
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "formal-local-subject" }) }));
vi.mock("expo-router", () => ({ router: { back() {}, replace() {} }, Redirect: "redirect", useLocalSearchParams: () => ({}) }));
vi.mock("convex/react", () => ({
  useAction: () => () => { throw new Error("Unexpected provider action in UI-only formal extraction"); },
  useConvex: () => ({ query: () => { throw new Error("Unexpected provider query"); } }),
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name.endsWith(":listFinancialAccountProfiles")) return [
      { id: "daily", name: "Daily" }, { id: "existing", name: "Existing" },
      { id: "other", name: "Other" }, { id: "created", name: "Reserve" },
    ];
    if (name.endsWith(":listUserCategories")) return [{
      id: "prior-category", name: "Prior category", nature: runtime.sign === "+" ? "Income" : "Expense",
      style: { emoji: "C", tone: "primary", color: "h270" }, resolvedPostingAccountCode: runtime.sign === "+" ? "42959595" : "51959595",
    }];
    if (name.endsWith(":suggestCategoryNature")) return { suggested: null };
    if (name.endsWith(":evaluate")) return { jars: [] };
    return [];
  },
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "picker" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModalProvider: ({ children }: React.PropsWithChildren) => children,
  BottomSheetModal: React.forwardRef(function Modal(props: React.PropsWithChildren<{ onDismiss?: () => void }>, ref) {
    useImperativeHandle(ref, () => ({ present() {
      if (ref === runtime.setup?.sheetRef) { runtime.sheetVisible = true; runtime.presents++; }
    }, dismiss() {
      if (ref === runtime.setup?.sheetRef) { runtime.sheetClosing = true; runtime.dismisses++; }
    } }));
    return createElement("native-modal", { ...props, account: ref === runtime.setup?.sheetRef }, props.children);
  }),
  BottomSheetView: "sheet-view", BottomSheetScrollView: "scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
}));
vi.mock("../../src/features/activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace", functionalCurrency: "COP", timeZone: "America/Bogota" },
  financialAccountProfile: { id: "daily", name: "Daily" },
}) }));
vi.mock("../../src/local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
vi.mock("../../src/local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => () => false }));
vi.mock("../../src/features/useLocalEntryDrafts", () => ({ useLocalEntryDrafts: () => ({ port: null, items: [], count: 0, error: "" }) }));
vi.mock("../../src/features/useIntakeCandidates", () => ({ useIntakeCandidates: () => ({}) }));
vi.mock("../../src/features/posting/usePostingTransport", () => {
  const transport = {
    load: async () => ({ kind: "none" }),
    save: (command: PendingPosting) => {
      runtime.commands.push(structuredClone(command)); runtime.stage = "saving";
      runtime.save = deferred(); return runtime.save.promise;
    },
    post: (command: PendingPosting) => {
      runtime.dispatched.push(structuredClone(command)); runtime.stage = "posting";
      runtime.post = deferred(); return runtime.post.promise;
    },
    clear: () => { runtime.stage = "clearing"; runtime.clear = deferred(); return runtime.clear.promise; },
    abort: async () => { throw new Error("Accounting rejection is outside this scope"); },
    newKey: () => `formal-key-${++runtime.key}`,
  };
  return { usePostingTransport: () => transport };
});
vi.mock("../../src/features/posting/postingBatchStorage", () => {
  const storage = { load: async () => ({ queue: [], receipts: { count: 0, net: 0 } }), update() { throw new Error("Batch outside scope"); } };
  return { usePostingBatchStorage: () => storage };
});
vi.mock("../../src/features/posting/PostingForm", () => ({ PostingForm: (props: PostingFormProps) => {
  runtime.form = props; return createElement("posting-form", props);
} }));
vi.mock("../../src/features/categories/CategorySheet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/features/categories/CategorySheet")>();
  return { CategorySheet: (props: CategorySheetProps) => { runtime.category = props; return createElement(actual.CategorySheet, props); } };
});
vi.mock("../../src/features/posting/AccountSetupForm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/features/posting/AccountSetupForm")>();
  return { AccountSetupForm: (props: SetupProps) => { runtime.setup = props; return createElement(actual.AccountSetupForm, props); } };
});
vi.mock("../../src/features/posting/usePostingEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/features/posting/usePostingEditor")>();
  return { ...actual, usePostingEditor: (...args: Parameters<typeof usePostingEditor>) => {
    const editor = actual.usePostingEditor(...args); runtime.editor = editor; return editor;
  } };
});
vi.mock("../../src/features/posting/PlaceSheet", () => ({ PlaceSheet: (props: { onSelect: (id: string) => void }) => {
  runtime.place = props; return createElement("place-sheet", props);
} }));
vi.mock("../../src/features/categories/appearance", async (original) => {
  const actual = await original<typeof import("../../src/features/categories/appearance")>();
  return { ...actual, quickEmojis: actual.quickEmojis.filter(emoji => emoji === "✨"), categoryPalette: actual.categoryPalette.filter(entry => entry.id === "h270") };
});
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native-screens", () => ({ ScreenStack: "stack", ScreenStackItem: "screen", ScreenStackHeaderLeftView: "left", ScreenStackHeaderRightView: "right" }));
vi.mock("react-native-gesture-handler", () => ({ ScrollView: "scroll" }));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  BackHandler: { addEventListener: () => ({ remove() {} }) }, Keyboard: { dismiss() {} },
  Platform: { OS: "ios", select: (values: { ios?: unknown }) => values.ios },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
import PostRoute from "../../app/post";

type Seed = { answer: "stillMine" | "payDebt"; sign: "+" | "-"; lane: "cancel" | "save" | "review" };
type Event = "DoorConfirm" | "NativeDismiss" | "OpenCategory" | "CreateCustom" | "NameCustom" | "AnswerAccount"
  | "ChooseSetupKind" | "SubmitSetup" | "SaveOK" | "ReplyLost" | "ReplyOK" | "ClearOK"
  | "OpenTo" | "OpenFrom" | "ChooseExistingTo" | "ChangeTo" | "ChangeFrom" | "Swap" | "ConfirmPair" | "PostOriginal" | "FrozenCallbacks";
type Monitor = { doors: number; canceled: number; reopened: number; created: number; named: number; answered: number;
  placeOpen: boolean; placeTarget: "source" | "destination"; selected: number; changed: number; swaps: number; confirms: number; attempts: number; lost: number;
  reviewed: string | null; original: { amount: string; description: string; date: string }; source: string;
  composer: boolean; independent: boolean; frozen: boolean; review: boolean; native: boolean; violations: string[] };
type Node = { seed: Seed; trace: Event[]; monitor: Monitor; observation: ReturnType<typeof observe> };
let root: ReactTestRenderer | undefined;
function editor() { if (!runtime.editor) throw new Error("No editor"); return runtime.editor; }
function form() { if (!runtime.form) throw new Error("No form"); return runtime.form; }
function category() { if (!runtime.category) throw new Error("No category"); return runtime.category; }
function setup() { if (!runtime.setup) throw new Error("No setup"); return runtime.setup; }
function control(label: string) {
  const found = root?.root.findAll((node) => typeof node.type === "string" && node.props.accessibilityLabel === label)[0];
  if (!found) throw new Error(`Missing control ${label}`);
  return found;
}
function pair() { return `${editor().profileId}->${editor().destinationId}`; }
function observe() {
  const e = editor();
  return structuredClone({
    amount: e.amount, description: e.description, date: e.date, entryType: e.entryType,
    profileId: e.profileId, destinationId: e.destinationId, categories: e.categories,
    reviewRequired: e.transferReviewRequired, setup: e.setup, pending: e.pending, busy: e.busy,
    editable: e.editable, canSubmit: e.canSubmit, formCanSubmit: form().canSubmit,
    categoryEditor: category().editor, categoryCanConfirm: category().canConfirm,
    stage: runtime.stage, commands: runtime.commands, dispatched: runtime.dispatched,
    sheetVisible: runtime.sheetVisible, sheetClosing: runtime.sheetClosing,
    presents: runtime.presents, dismisses: runtime.dismisses,
  });
}
async function mount(seed: Seed) {
  await act(async () => root?.unmount());
  runtime.sign = seed.sign;
  runtime.form = undefined; runtime.category = undefined; runtime.editor = undefined; runtime.setup = undefined;
  runtime.commands = []; runtime.dispatched = []; runtime.key = 0; runtime.stage = "idle";
  runtime.save = undefined; runtime.post = undefined; runtime.clear = undefined;
  runtime.sheetVisible = false; runtime.sheetClosing = false; runtime.presents = 0; runtime.dismisses = 0;
  await act(async () => { root = create(createElement(PostRoute)); });
  await act(async () => { form().onAmountChange(`${seed.sign}10,00`); form().onDescriptionChange("Original composer"); editor().setDate("2026-10-20"); editor().setCategories({ ids: ["prior-category"], primaryId: null }); });
  await act(async () => form().onCategory());
  await act(async () => control("Add your own").props.onPress());
  await act(async () => control("Category name").props.onChangeText("Reserve"));
  await act(async () => control(seed.answer === "payDebt" ? "I pay a debt" : "It is still mine").props.onPress());
  expect(category().canConfirm).toBe(true);
  const e = editor();
  return { doors: 0, canceled: 0, reopened: 0, created: 0, named: 0, answered: 0,
    placeOpen: false, placeTarget: "destination", selected: 0, changed: 0, swaps: 0, confirms: 0, attempts: 0, lost: 0, reviewed: null,
    original: { amount: e.amount, description: e.description, date: e.date }, source: e.profileId,
    composer: true, independent: true, frozen: true, review: true, native: true, violations: [] } satisfies Monitor;
}
function fail(m: Monitor, key: "composer" | "independent" | "frozen" | "review" | "native", reason: string) {
  m[key] = false; if (!m.violations.includes(reason)) m.violations.push(reason);
}
async function step(seed: Seed, m: Monitor, event: Event) {
  const before = observe();
  const commandCount = runtime.commands.length;
  const pairAtEvent = pair();
  const pendingBefore = editor().pending || editor().busy;
  await act(async () => {
    switch (event) {
      case "DoorConfirm": control("Add category").props.onPress(); m.doors++; m.reviewed = null; break;
      case "NativeDismiss": {
        const modal = root?.root.findAll((node) => String(node.type) === "native-modal" && node.props.account)[0];
        if (!modal) throw new Error("No account native modal");
        runtime.sheetVisible = false; runtime.sheetClosing = false;
        modal.props.onDismiss();
        if (before.setup && !pendingBefore) m.canceled++;
        break;
      }
      case "OpenCategory": form().onCategory(); m.reopened++; break;
      case "CreateCustom": control("Add your own").props.onPress(); m.created++; break;
      case "NameCustom": control("Category name").props.onChangeText("Reserve"); m.named++; break;
      case "AnswerAccount": control(seed.answer === "payDebt" ? "I pay a debt" : "It is still mine").props.onPress(); m.answered++; break;
      case "ChooseSetupKind": {
        control(seed.answer === "payDebt" ? "Loan" : "Savings").props.onPress(); break;
      }
      case "SubmitSetup": {
        const callback = control(editor().pending ? "Retry setup" : "Add this place").props.onPress;
        callback(); callback(); m.attempts++; break;
      }
      case "SaveOK": {
        const command = runtime.commands.at(-1); if (!command || !runtime.save) throw new Error("No saving command");
        runtime.save.resolve({ id: "draft", command: structuredClone(command) }); break;
      }
      case "ReplyLost": runtime.stage = "retry"; runtime.post?.reject(new Error("Controlled lost response")); m.lost++; break;
      case "ReplyOK": {
        const command = runtime.dispatched.at(-1); if (!command || !runtime.post) throw new Error("No dispatch");
        runtime.post.resolve({ financialAccountProfileId: "created", description: "Reserve", amount: command.payload.amount }); break;
      }
      case "ClearOK": runtime.stage = "done"; runtime.clear?.resolve(); break;
      case "OpenTo": form().onDestination?.(); m.placeOpen = true; m.placeTarget = "destination"; break;
      case "OpenFrom": form().onPlace(); m.placeOpen = true; m.placeTarget = "source"; break;
      case "ChooseExistingTo":
      case "ChangeTo":
      case "ChangeFrom": {
        if (!runtime.place) throw new Error("No place picker");
        runtime.place.onSelect(event !== "ChooseExistingTo" ? "other" : "existing");
        m.placeOpen = false;
        if (event !== "ChooseExistingTo") m.changed++; else m.selected++;
        break;
      }
      case "Swap": control("Swap From and To").props.onPress(); m.swaps++; m.reviewed = null; break;
      case "ConfirmPair": control("Confirm From and To").props.onPress(); m.confirms++; m.reviewed = pairAtEvent; break;
      case "PostOriginal": form().onPost(); break;
      case "FrozenCallbacks": {
        const value = editor().setup;
        if (!value) throw new Error("No frozen setup");
        setup().onChange({ ...value, name: "Changed", amount: "999", productKind: "cash" });
        editor().setSetup(null);
        editor().beginAccountSetup({ name: "Replacement", answer: "stillMine", style: { emoji: "X", tone: "primary", color: "h270" } });
        form().onAmountChange("+999,00"); form().onDescriptionChange("Changed");
        editor().setDate("2020-01-01"); editor().setProfileId("other"); editor().setDestinationId("other");
        editor().swapTransferPlaces(); editor().confirmTransferReview();
        break;
      }
    }
  });
  const after = observe();
  if (after.amount !== m.original.amount || after.description !== m.original.description || after.date !== m.original.date)
    fail(m, "composer", "Account setup/cancel/review changed the original signed amount, description or date");
  if (event === "DoorConfirm") {
    if (after.profileId !== before.profileId || after.destinationId !== null || after.entryType !== "transfer" || after.categories.ids.length)
      fail(m, "independent", "Account door changed source, retained categories, or skipped incomplete Transfer");
    if (after.setup?.amount !== "0" || after.setup?.target?.kind !== "destination" || after.setup.target.sourceProfileId !== before.profileId)
      fail(m, "independent", "Account setup inherited transaction amount or lost its original source target");
    if (seed.answer === "payDebt" && after.setup?.productKind !== null)
      fail(m, "independent", "Debt account was chosen without explicit Credit card/Loan choice");
    if (runtime.commands.length !== commandCount) fail(m, "independent", "Category account answer dispatched a durable command");
  }
  if (event === "ChooseSetupKind" && after.setup?.productKind !== (seed.answer === "payDebt" ? "loan" : "savingsAccount"))
    fail(m, "independent", "Rendered account-type choice did not update the independent setup answer");
  for (const command of runtime.commands) {
    if (command.kind === "setup") {
      if (command.payload.amount.minorUnits !== 0 || command.payload.name !== "Reserve" || command.target?.kind !== "destination" || command.target.sourceProfileId !== m.source)
        fail(m, "independent", "Saved setup is not the independent zero-balance request with captured source");
    }
  }
  const setupCommands = runtime.commands.filter((command) => command.kind === "setup");
  if (setupCommands.length > 1 && setupCommands.some((command) => JSON.stringify(command) !== JSON.stringify(setupCommands[0])))
    fail(m, "frozen", "Retry changed saved setup answers or idempotency key");
  if (event === "FrozenCallbacks" && JSON.stringify(before) !== JSON.stringify(after))
    fail(m, "frozen", "Stale callbacks changed composer/setup while command was saving or pending");
  if (after.entryType === "transfer" && !after.setup && !after.pending && !after.busy && after.formCanSubmit && m.reviewed !== pair())
    fail(m, "review", "Post enabled for a From/To pair that has not been separately confirmed");
  if (runtime.commands.length > commandCount && event !== "SubmitSetup" && event !== "PostOriginal")
    fail(m, "independent", "Durable command crossed save without an explicit setup or original Post callback");
  for (const command of runtime.commands.slice(commandCount)) {
    if (command.kind === "transfer" && (command.payload.sourceFinancialAccountProfileId !== before.profileId ||
      command.payload.destinationFinancialAccountProfileId !== before.destinationId || command.payload.amount.minorUnits !== 1000 ||
      command.payload.accountingDate !== m.original.date || command.payload.description !== m.original.description ||
      command.payload.userCategoryIds?.length))
      fail(m, "review", "Saved transfer differs from the reviewed pair or original transaction facts");
    if (command.kind === "transfer" && (m.reviewed !== pairAtEvent || before.setup))
      fail(m, "review", "Original transfer crossed save boundary without confirmation of its exact From/To pair");
    if (command.kind !== "setup" && command.kind !== "transfer") fail(m, "independent", "Account door posted a normal Income/Expense command");
  }
  if (event === "NativeDismiss" && !pendingBefore) {
    if (after.dismisses !== before.dismisses) fail(m, "native", "Native onDismiss triggered redundant programmatic dismiss before reentry");
    if (before.setup && after.setup) fail(m, "native", "Native account dismissal did not close editor setup");
  }
  if (event === "DoorConfirm" && (!after.sheetVisible || after.sheetClosing || after.presents !== before.presents + 1))
    fail(m, "native", "Account door did not present a usable setup sheet on entry or reentry");
}

function enabled(seed: Seed, m: Monitor): Event[] {
  const e = editor();
  const events: Event[] = [];
  if (runtime.commands.some((c) => c.kind !== "setup")) return events;
  if (e.busy || e.pending) {
    events.push("FrozenCallbacks");
    if (runtime.stage === "saving") events.push("SaveOK");
    if (runtime.stage === "posting") { events.push("ReplyOK"); if (m.lost === 0) events.push("ReplyLost"); }
    if (runtime.stage === "clearing") events.push("ClearOK");
    if (runtime.stage === "retry" && m.attempts < 2) events.push("SubmitSetup");
    return events;
  }
  if (e.setup) {
    if (seed.lane === "cancel" && m.canceled === 0) events.push("NativeDismiss");
    if (seed.lane === "save" || seed.lane === "cancel" && m.doors === 2) {
      const desired = seed.answer === "payDebt" ? "loan" : "savingsAccount";
      if (e.setup.productKind !== desired) events.push("ChooseSetupKind");
      if (e.canSubmit && m.attempts < 2) events.push("SubmitSetup");
    }
    if (seed.lane === "review" && m.canceled === 0) events.push("NativeDismiss");
    return events;
  }
  if (runtime.sheetClosing) events.push("NativeDismiss");
  if (m.doors === 0 || seed.lane === "cancel" && m.doors === 1 && m.answered === 1) events.push("DoorConfirm");
  if (seed.lane === "cancel" && m.canceled === 1 && m.doors === 1) {
    if (!m.reopened) events.push("OpenCategory");
    else if (!m.created) events.push("CreateCustom");
    else if (!m.named) events.push("NameCustom");
    else if (!m.answered) events.push("AnswerAccount");
  }
  if (seed.lane !== "cancel" && m.doors > 0 && !m.selected && runtime.stage !== "done") events.push(m.placeOpen ? "ChooseExistingTo" : "OpenTo");
  if (e.entryType === "transfer" && e.destinationId && e.destinationId !== e.profileId) {
    if (e.transferReviewRequired) {
      if (!m.swaps) events.push("Swap");
      if (m.confirms < 2) events.push("ConfirmPair");
    }
    if (m.confirms && !m.changed) {
      if (m.placeOpen) events.push(m.placeTarget === "source" ? "ChangeFrom" : "ChangeTo");
      else events.push("OpenTo", "OpenFrom");
    }
  }
  // Probe the actual public route callback even when its button is disabled.
  if (m.doors > 0) events.push("PostOriginal");
  return events;
}
function key(seed: Seed, m: Monitor) { return JSON.stringify({ seed, monitor: m, observation: observe() }); }
function tlaString(s: string) { return JSON.stringify(s); }
function tla(value: unknown): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string") return tlaString(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `<<${value.map(tla).join(",")}>>`;
  if (value && typeof value === "object") return `[${Object.entries(value).map(([key, item]) => `${key} |-> ${tla(item)}`).join(",")}]`;
  throw new Error("Unsupported TLA observation");
}
function rawObservation(node: Node) {
  const o = node.observation; const m = node.monitor;
  return {
    facts: [o.amount, o.description, o.date], original: [m.original.amount, m.original.description, m.original.date],
    entryType: o.entryType, source: o.profileId, destination: o.destinationId ?? "", initialSource: m.source,
    pair: [o.profileId, o.destinationId ?? ""], reviewed: m.reviewed?.split("->") ?? [],
    hasSetup: o.setup !== null, setupAmount: o.setup?.amount ?? "", setupKind: o.setup?.productKind ?? "",
    setupSource: o.setup?.target?.kind === "destination" ? o.setup.target.sourceProfileId : "",
    categories: o.categories.ids, answer: node.seed.answer,
    sheetVisible: o.sheetVisible, sheetClosing: o.sheetClosing, presents: o.presents,
    pending: o.pending, busy: o.busy, canPost: o.formCanSubmit, dismisses: o.dismisses,
    lockFacts: Buffer.from(JSON.stringify(o)).toString("base64"),
    commands: o.commands.map((c) => ({ kind: c.kind, exact: Buffer.from(JSON.stringify(c)).toString("base64"),
      amount: c.payload.amount.minorUnits,
      source: c.kind === "transfer" ? c.payload.sourceFinancialAccountProfileId : "",
      destination: c.kind === "transfer" ? c.payload.destinationFinancialAccountProfileId : "",
      date: c.payload.accountingDate, description: "description" in c.payload ? c.payload.description : "",
      categories: "userCategoryIds" in c.payload ? c.payload.userCategoryIds ?? [] : [],
      name: "name" in c.payload ? c.payload.name : "",
      target: c.kind === "setup" && c.target?.kind === "destination" ? c.target.sourceProfileId : "",
    })),
  };
}

test("extract finite committed-callback graph from production category/account-door route", async () => {
  vi.stubGlobal("React", React); vi.stubGlobal("__DEV__", false); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("react-test-renderer is deprecated")) return;
    throw new Error(args.map(String).join(" "));
  });
  const nodes: Node[] = []; const indices = new Map<string, number>();
  const edges: Array<{ from: number; to: number; event: Event }> = []; const initial: number[] = [];
  for (const answer of ["stillMine", "payDebt"] satisfies Seed["answer"][]) {
    for (const sign of ["+", "-"] satisfies Seed["sign"][]) {
      for (const lane of ["cancel", "save", "review"] satisfies Seed["lane"][]) {
        const seed = { answer, sign, lane }; const m = await mount(seed);
        const id = nodes.push({ seed, trace: [], monitor: structuredClone(m), observation: observe() });
        indices.set(key(seed, m), id); initial.push(id);
      }
    }
  }
  const maxDepth = 28;
  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const node = nodes[cursor]; if (!node) throw new Error("Missing node");
    let replay = await mount(node.seed);
    for (const event of node.trace) await step(node.seed, replay, event);
    expect(observe()).toEqual(node.observation);
    if (node.trace.length >= maxDepth) continue;
    const events = enabled(node.seed, replay);
    for (const event of events) {
      replay = await mount(node.seed);
      for (const old of node.trace) await step(node.seed, replay, old);
      await step(node.seed, replay, event);
      const stateKey = key(node.seed, replay);
      let id = indices.get(stateKey);
      if (id === undefined) {
        id = nodes.push({ seed: node.seed, trace: [...node.trace, event], monitor: structuredClone(replay), observation: observe() });
        indices.set(stateKey, id);
      }
      edges.push({ from: cursor + 1, to: id, event });
    }
    if (nodes.length > 10_000) throw new Error("Extraction exceeded declared state cap");
  }
  await act(async () => root?.unmount()); root = undefined;
  const out = resolve(process.env.CATEGORY_UI_FORMAL_OUT ?? ".orchestrator/runs/2026-10-20-category-ui-crud-formal/latest");
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "graph.json"), JSON.stringify({ maxDepth, nodes, edges, initial }, null, 2));
  const observations = nodes.map((node) => tla(rawObservation(node)));
  writeFileSync(resolve(out, "RealUI.tla"), `---- MODULE RealUI ----\nInitialStates == {${initial.join(",")}}\nObservations == <<${observations.join(",\n")}>>\nEdges == {${edges.map((e) => `[from |-> ${e.from}, to |-> ${e.to}, event |-> ${tlaString(e.event)}]`).join(",\n")}}\n====\n`);
  const failures = ["composer", "independent", "frozen", "review", "native"].flatMap((flag) => {
    const index = nodes.findIndex((node) => !Reflect.get(node.monitor, flag));
    const node = nodes[index]; return node ? [{ invariant: flag, state: index + 1, ...node }] : [];
  });
  writeFileSync(resolve(out, "counterexamples.json"), JSON.stringify(failures, null, 2));
  writeFileSync(resolve(out, "extraction-summary.json"), JSON.stringify({ states: nodes.length, edges: edges.length, initial: initial.length,
    maxDepth, maxObservedDepth: Math.max(...nodes.map(n => n.trace.length)), depthFrontier: nodes.filter(n => n.trace.length === maxDepth).length,
    failingInvariants: failures.map(f => f.invariant) }, null, 2));
  console.log(`UI_GRAPH states=${nodes.length} edges=${edges.length} findings=${failures.map(f => f.invariant).join(",") || "none"}`);
});
