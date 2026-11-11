vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
import * as React from "react";
import { createElement } from "react";
import { act, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyState } from "../intake/durableState";
import { mountStack, screenHelpers, settle } from "./flow.testSupport";

const phone = vi.hoisted(() => new Map<string, string>());
/** How many of the next writes or deletes the phone's secure store fails, as a full or locked keychain does. */
const failing = vi.hoisted(() => ({ writes: 0, deletes: 0 }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => phone.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (failing.writes > 0) { failing.writes--; throw new Error("keychain write failed"); }
    phone.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (failing.deletes > 0) { failing.deletes--; throw new Error("keychain delete failed"); }
    phone.delete(key);
  },
}));
vi.mock("../../local-auth/localInput", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../local-auth/localInput")>();
  const lease = new actual.LocalInputLease("owner", "session");
  return { ...actual, useLocalInputLease: () => lease };
});
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "KeyboardAvoidingView",
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput",
  View: "View", ScrollView: "ScrollView", StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@react-navigation/native", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  return import(require.resolve("@react-navigation/core", { paths: [require.resolve("@react-navigation/native")] }));
});
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
const keys = vi.hoisted(() => ({ next: 0 }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `key-${++keys.next}` }));
const access = vi.hoisted(() => ({ report: (_error: unknown): boolean => false }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => access.report }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
const intake = vi.hoisted(() => {
  const value = {
    snapshot: { state: null as unknown, status: null, error: "", loaded: true, wipePending: false, drain: null },
    listeners: new Set<() => void>(),
    service: {
      listSources: async () => [{ packageName: "com.todo1.mobile", label: "Bancolombia" }, { packageName: "com.nequi.MobileApp", label: "Nequi" }],
      getSnapshot: () => value.snapshot,
    },
  };
  return value;
});
vi.mock("../intake/IntakeProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => { intake.listeners.add(listener); return () => { intake.listeners.delete(listener); }; };
  return { useIntakeService: () => intake.service, useIntakeSnapshot: () => useSyncExternalStore(subscribe, () => intake.snapshot) };
});
type Profile = { id: string; workspaceId: string; name: string; productKind: string; ledgerAccountId: string; status: string };
const remote = vi.hoisted(() => ({
  places: [] as unknown[], closure: null as unknown, categories: [] as unknown[],
  close: vi.fn(), undo: vi.fn(), phoneDay: "2026-11-10", version: 0, listeners: new Set<() => void>(),
}));
/** The server and the phone's calendar move under the open screen; every live read sees the change on its next render. */
function serverChange(change: () => void) {
  change();
  remote.version++;
  for (const listener of remote.listeners) listener();
}
vi.mock("../useWorkspaceCalendar", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => { remote.listeners.add(listener); return () => { remote.listeners.delete(listener); }; };
  return { useWorkspaceCalendar: () => {
    useSyncExternalStore(subscribe, () => remote.version);
    return { date: remote.phoneDay, month: remote.phoneDay.slice(0, 7), now: new Date() };
  } };
});
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => { remote.listeners.add(listener); return () => { remote.listeners.delete(listener); }; };
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      useSyncExternalStore(subscribe, () => remote.version);
      if (args === "skip") return undefined;
      const name = getFunctionName(ref);
      if (name === "accounting:listFinancialAccountProfiles") return remote.places;
      if (name === "accounting:placeClosure") return remote.closure;
      if (name === "accounting:listUserCategories") return remote.categories;
      return undefined;
    },
    useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "accounting:closePlace" ? remote.close : remote.undo,
    useConvex: () => ({ query: vi.fn() }),
  };
});
const router = vi.hoisted(() => ({ back: vi.fn(), dismissTo: vi.fn(), push: vi.fn(), replace: vi.fn(), canGoBack: vi.fn(() => true) }));
vi.mock("expo-router", async () => {
  const { useNavigation } = await import("@react-navigation/native");
  return { router, useNavigation, Redirect: "Redirect", useLocalSearchParams: () => ({ profileId: "wallet" }) };
});
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", timeZone: "America/Bogota", functionalCurrency: "COP" }, financialAccountProfile: { id: "daily" } }),
}));
import PlaceEndingRoute from "../../../app/place-ending";

const profile = (id: string, name: string, status = "open"): Profile =>
  ({ id, workspaceId: "ws", name, productKind: "bankAccount", ledgerAccountId: `ledger-${id}`, status });
const wallet = profile("wallet", "Wallet");
const daily = profile("daily", "Daily");
const savings = profile("savings", "Savings");
function closure(nature: "Asset" | "Liability", minorUnits: number, extra: Record<string, unknown> = {}) {
  return { financialAccountProfileId: "wallet", status: "open", canClose: true, blockers: [], isDefault: false,
    requiresReplacementDefault: false, openPlaceCount: 3, balance: { currency: "COP", minorUnits }, nature, accountingDate: "2026-11-10", ...extra };
}
const categories = [
  { id: "groceries", name: "Groceries", nature: "Expense", style: { emoji: "🛒" } },
  { id: "salary", name: "Salary", nature: "Income", style: { emoji: "💼" } },
];
const receipt = (entries: unknown[] = []) => ({ ending: { id: "ending", act: "close", entries }, replay: false });

let mounted: Awaited<ReturnType<typeof mountStack>> | undefined;
const ui = screenHelpers(() => mounted!.root as ReactTestRenderer);
beforeEach(() => {
  phone.clear();
  failing.writes = 0;
  failing.deletes = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  keys.next = 0;
  access.report = () => false;
  intake.snapshot = { ...intake.snapshot, state: emptyState(), loaded: true, error: "" };
  remote.places = [wallet, daily, savings];
  remote.closure = closure("Asset", 5_000_000);
  remote.categories = categories;
  remote.close.mockReset();
  remote.undo.mockReset();
  remote.phoneDay = "2026-11-10";
});
afterEach(async () => {
  await act(async () => mounted?.root.unmount());
  mounted = undefined;
  vi.unstubAllGlobals();
});
async function open(language?: "es") {
  mounted = await mountStack(router, () => createElement(PlaceEndingRoute), language);
}
async function systemBack() { await act(async () => { mounted!.stack.goBack(); }); }

test("the choice explains both acts and what an Undo changes in reports before either starts", async () => {
  await open();
  expect(ui.texts()).toEqual([
    "CLOSE OR UNDO", "What happened to Wallet?",
    "Pick what really happened. Both are permanent: a place that ends can't be reopened.",
    "Close place",
    "The account existed and has ended, like a bank account you cancelled or a loan you finished paying. Every movement stays in your History and your reports. If it still has money, you'll say where it went, and each answer is recorded as a movement dated today.",
    "Close Wallet",
    "Undo place",
    "It was a mistake and should never have been here. Each of its movements is reversed with an opposite movement, so its balance goes to zero.",
    "Nothing is erased: the originals stay in History, marked as reversed, and earlier months keep the results they had. Each reversal is a new movement in this month, so this month's spending and income can change and its Budget spending can go negative. Transfers with other places are reversed too, which changes their balances.",
    "Undo Wallet",
  ]);
  expect(remote.close).not.toHaveBeenCalled();
  expect(remote.undo).not.toHaveBeenCalled();
});

const closing = (minorUnits: number) => ({ currency: "COP", minorUnits });
test.each([
  { case: "money in an asset", nature: "Asset" as const, balance: 5_000_000, answer: "I moved it to another place", pick: "Savings",
    review: "Transfer to Savings", line: { kind: "transfer", otherFinancialAccountProfileId: "savings", amount: closing(5_000_000), description: "Closing Wallet" } },
  { case: "money in an asset", nature: "Asset" as const, balance: 5_000_000, answer: "I spent it", pick: "🛒 Groceries",
    review: "Expense in Groceries", line: { kind: "expense", userCategoryId: "groceries", amount: closing(5_000_000), description: "Closing Wallet" } },
  { case: "money in an asset", nature: "Asset" as const, balance: 5_000_000, answer: "I don't know / adjustment", pick: null,
    review: "Closing Adjustment (expense)", line: { kind: "adjustment", amount: closing(5_000_000), description: "Closing adjustment for Wallet" } },
  { case: "an overdrawn asset", nature: "Asset" as const, balance: -1_250_000, answer: "I covered it from another place", pick: "Daily",
    review: "Transfer from Daily", line: { kind: "transfer", otherFinancialAccountProfileId: "daily", amount: closing(1_250_000), description: "Closing Wallet" } },
  { case: "an overdrawn asset", nature: "Asset" as const, balance: -1_250_000, answer: "It was waived or no longer exists", pick: null,
    review: "Closing Adjustment (income)", line: { kind: "adjustment", amount: closing(1_250_000), description: "Closing adjustment for Wallet" } },
  { case: "a debt still owed", nature: "Liability" as const, balance: 80_000_000, answer: "I paid it from another place", pick: "Savings",
    review: "Transfer from Savings", line: { kind: "transfer", otherFinancialAccountProfileId: "savings", amount: closing(80_000_000), description: "Closing Wallet" } },
  { case: "a debt still owed", nature: "Liability" as const, balance: 80_000_000, answer: "It was forgiven or no longer exists", pick: null,
    review: "Closing Adjustment (income)", line: { kind: "adjustment", amount: closing(80_000_000), description: "Closing adjustment for Wallet" } },
  { case: "an overpaid debt", nature: "Liability" as const, balance: -300_000, answer: "It was returned to another place", pick: "Daily",
    review: "Transfer to Daily", line: { kind: "transfer", otherFinancialAccountProfileId: "daily", amount: closing(300_000), description: "Closing Wallet" } },
  { case: "an overpaid debt", nature: "Liability" as const, balance: -300_000, answer: "I don't know / adjustment", pick: null,
    review: "Closing Adjustment (expense)", line: { kind: "adjustment", amount: closing(300_000), description: "Closing adjustment for Wallet" } },
])("$case closes with '$answer' as the exact command", async ({ nature, balance, answer, pick, review, line }) => {
  remote.closure = closure(nature, balance);
  remote.close.mockResolvedValue(receipt());
  await open();
  await ui.press("Close Wallet");
  await ui.press(answer);
  if (pick) await ui.press(pick);
  expect(ui.texts()).toContain("Recorded today, November 10, 2026:");
  expect(ui.texts()).toContain(review);
  expect(ui.texts()).toContain("Wallet closes for good and can't be reopened. Its history stays as it is, under Closed places.");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(balance), reviewedAccountingDate: "2026-11-10",
    ...(line.kind === "adjustment" ? { closingAdjustmentExpenseName: "Closing adjustment (expense)",
      closingAdjustmentIncomeName: "Closing adjustment (income)" } : {}),
    lines: [line],
  }]]);
});

test.each([
  { nature: "Asset" as const, balance: 5_000_000, title: "Where did the money go?", intro: "Wallet has COP 50.000. Account for all of it to close it.",
    offered: ["I moved it to another place", "I spent it", "I don't know / adjustment"] },
  { nature: "Asset" as const, balance: -1_250_000, title: "How was the overdraft settled?", intro: "Wallet is overdrawn by COP 12.500. Account for all of it to close it.",
    offered: ["I covered it from another place", "It was waived or no longer exists"] },
  { nature: "Liability" as const, balance: 80_000_000, title: "What happened to the debt?", intro: "Wallet still owes COP 800.000. Account for all of it to close it.",
    offered: ["I paid it from another place", "It was forgiven or no longer exists"] },
  { nature: "Liability" as const, balance: -300_000, title: "What happened to what you overpaid?", intro: "You paid COP 3.000 too much into Wallet. Account for all of it to close it.",
    offered: ["It was returned to another place", "I don't know / adjustment"] },
])("a $nature balance of $balance offers only the answers its sign allows", async ({ nature, balance, title, intro, offered }) => {
  remote.closure = closure(nature, balance);
  await open();
  await ui.press("Close Wallet");
  expect(ui.texts().slice(0, 3)).toEqual(["CLOSE OR UNDO", title, intro]);
  const every = ["I moved it to another place", "I spent it", "I don't know / adjustment", "I covered it from another place",
    "It was waived or no longer exists", "I paid it from another place", "It was forgiven or no longer exists", "It was returned to another place"];
  expect(every.filter((label) => ui.has(label)).sort()).toEqual([...offered].sort());
});

test("with one other open place, moving the money is one tap away from the confirmation", async () => {
  remote.places = [wallet, daily];
  remote.close.mockResolvedValue(receipt());
  await open();
  await ui.press("Close Wallet");
  await ui.press("I moved it to another place");
  expect(ui.texts()).toContain("Transfer to Daily");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls[0]![0].lines).toEqual([
    { kind: "transfer", otherFinancialAccountProfileId: "daily", amount: closing(5_000_000), description: "Closing Wallet" }]);
});

test("a split must explain exactly the whole balance, and amounts follow the shared field's confirmation", async () => {
  remote.close.mockResolvedValue(receipt());
  await open();
  await ui.press("Close Wallet");
  await ui.press("I moved it to another place");
  await ui.press("Savings");
  await systemBack();
  expect(ui.texts()).toContain("Still to explain: COP 0");
  await ui.press("Split into another answer");
  expect(ui.texts()).toContain("Where did the rest go?");
  await ui.press("I spent it");
  await ui.press("🛒 Groceries");
  expect(ui.texts()).toContain("Still to explain: COP 0");
  expect(ui.disabled("Review")).toBe(true);
  await ui.type("Amount for I moved it to another place", "30000");
  expect(ui.texts()).toContain("Still to explain: COP 20.000");
  expect(ui.disabled("Review")).toBe(true);
  await ui.type("Amount for I spent it", "25.000");
  expect(ui.texts()).toContain("Still to explain: COP 20.000");
  expect(ui.disabled("Review")).toBe(true);
  await ui.press("Confirm COP 25.000,00");
  expect(ui.texts()).toContain("You explained COP 5.000 too much");
  expect(ui.disabled("Review")).toBe(true);
  await ui.type("Amount for I spent it", "20000");
  expect(ui.texts()).toContain("Still to explain: COP 0");
  await ui.press("Review");
  expect(ui.texts()).toEqual(expect.arrayContaining(["Transfer to Savings", "COP 30.000", "Expense in Groceries", "COP 20.000"]));
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(5_000_000), reviewedAccountingDate: "2026-11-10",
    lines: [
      { kind: "transfer", otherFinancialAccountProfileId: "savings", amount: closing(3_000_000), description: "Closing Wallet" },
      { kind: "expense", userCategoryId: "groceries", amount: closing(2_000_000), description: "Closing Wallet" },
    ],
  }]]);
});

test("removing a line returns its amount to what is still unexplained", async () => {
  await open();
  await ui.press("Close Wallet");
  await ui.press("I spent it");
  await systemBack();
  expect(ui.texts()).toContain("Choose");
  expect(ui.disabled("Review")).toBe(true);
  await ui.press("Remove I spent it");
  expect(ui.texts()).toContain("Still to explain: COP 50.000");
  expect(ui.has("I moved it to another place")).toBe(true);
  expect(remote.close).not.toHaveBeenCalled();
});

test("a zero balance closes after one confirmation, then shows a receipt and returns to Places", async () => {
  remote.closure = closure("Asset", 0);
  remote.close.mockResolvedValue(receipt());
  await open();
  await ui.press("Close Wallet");
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "Review before closing Wallet", "Wallet is at COP 0, so nothing is recorded.",
    "Wallet closes for good and can't be reopened. Its history stays as it is, under Closed places.", "Close Wallet"]);
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(0), reviewedAccountingDate: "2026-11-10", lines: [] }]]);
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "Wallet is closed", "Nothing was recorded.", "You'll find it under Closed places.", "Done"]);
  await ui.press("Done");
  expect(mounted!.routes()).toEqual(["index", "places"]);
});

test("the receipt lists what was recorded and system back also returns to Places", async () => {
  remote.close.mockResolvedValue(receipt([{ id: "entry-1", description: "Closing adjustment for Wallet", accountingDate: "2026-11-10",
    amount: closing(-5_000_000) }]));
  await open();
  await ui.press("Close Wallet");
  await ui.press("I don't know / adjustment");
  await ui.press("Close Wallet");
  expect(ui.texts()).toEqual(expect.arrayContaining(["Wallet is closed", "Recorded:", "Closing adjustment for Wallet", "2026-11-10", "−COP 50.000"]));
  await systemBack();
  expect(mounted!.routes()).toEqual(["index", "places"]);
});

test("closing the Default Place asks for its replacement and sends it", async () => {
  remote.closure = closure("Asset", 0, { isDefault: true, requiresReplacementDefault: true });
  remote.close.mockResolvedValue(receipt());
  await open();
  await ui.press("Close Wallet");
  expect(ui.texts().slice(0, 3)).toEqual(["CLOSE OR UNDO", "Choose your new default place",
    "Wallet is your default place. Before closing it, choose another open place for new movements."]);
  expect(ui.has("Wallet")).toBe(false);
  expect(ui.disabled("Continue")).toBe(true);
  await ui.press("Savings");
  await ui.press("Continue");
  expect(ui.texts()).toContain("Savings becomes your default place.");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(0), reviewedAccountingDate: "2026-11-10",
    replacementDefaultFinancialAccountProfileId: "savings", lines: [] }]]);
});

test.each([
  { blocker: { code: "place_last_open" }, title: "It's your only open place",
    detail: "You always need at least one open place. Add another place first." },
  { blocker: { code: "place_recovery_destination", plans: [{ id: "p1", title: "Dental" }, { id: "p2", title: "Car repair" }] },
    title: "A Savings recovery plan uses it",
    detail: "“Dental”, “Car repair” save money into this place. Finish or cancel them in Savings recovery before closing it." },
  { blocker: { code: "place_future_entries", latestAccountingDate: "2026-12-24" }, title: "It has a movement dated in the future",
    detail: "The latest is dated December 24, 2026. Wait until that day, or reverse that movement first." },
  { blocker: { code: "place_undo_dependency", places: [{ id: "old", name: "Old card" }] },
    title: "It shares movements with a place being undone",
    detail: "Old card is being undone and still shares movements with this place. Wait for it to finish." },
  { blocker: { code: "place_ending_scan_limit" }, title: "It has too much history",
    detail: "It's more than we can check at once. Tell us through Report a problem." },
])("Close explains $blocker.code and cannot continue", async ({ blocker, title, detail }) => {
  remote.closure = closure("Asset", 5_000_000, { canClose: false, blockers: [blocker] });
  await open();
  await ui.press("Close Wallet");
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "You can't close Wallet yet", title, detail, "Go back"]);
  expect(ui.has("I moved it to another place")).toBe(false);
  await ui.press("Go back");
  expect(ui.texts()[1]).toBe("What happened to Wallet?");
  expect(remote.close).not.toHaveBeenCalled();
});

function mapping(id: string, packageName: string, profileId = "wallet", workspaceId = "ws") {
  return { sourceSelectionId: id, packageName, workspaceId, financialAccountProfileId: profileId, currency: "COP", timeZone: "America/Bogota" };
}
function phoneWith(mappings: ReturnType<typeof mapping>[], active: string[], pending: string[] = []) {
  intake.snapshot = { ...intake.snapshot, state: { ...emptyState(), mappings, activeSelectionIds: active,
    pendingConfigure: pending.length ? { expectedEpoch: 1, mutationId: "m", consentVersion: "v", sources: pending.map((id) => ({ sourceSelectionId: id, packageName: "x.y" })) } : null } };
  for (const listener of intake.listeners) listener();
}

test("notification sources mapped to the Place on this phone block it until they point elsewhere, and the detour returns to the same step twice", async () => {
  phoneWith([mapping("s1", "com.todo1.mobile"), mapping("s2", "com.nequi.MobileApp"), mapping("s3", "com.other.app", "daily"),
    mapping("s4", "com.inactive.app"), mapping("s5", "com.foreign.app", "wallet", "other-ws")], ["s1", "s2", "s3", "s5"]);
  await open();
  await ui.press("Close Wallet");
  await act(async () => {});
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "You can't close Wallet yet", "Apps send their notifications here",
    "Notifications from Bancolombia, Nequi land in this place. Point them at another place or stop reading them.",
    "Go to notification sources", "Go back"]);
  for (const round of [1, 2]) {
    await ui.press("Go to notification sources");
    expect(mounted!.routes()).toEqual(["index", "places", "account", "place-ending", "intake"]);
    if (round === 2) await act(async () => phoneWith([mapping("s1", "com.todo1.mobile", "daily")], ["s1"]));
    await systemBack();
    expect(mounted!.routes()).toEqual(["index", "places", "account", "place-ending"]);
    if (round === 1) expect(ui.texts()[2]).toBe("Apps send their notifications here");
  }
  expect(ui.texts().slice(0, 2)).toEqual(["CLOSE OR UNDO", "Where did the money go?"]);
});

test("a source configuration still waiting to apply also blocks, and an unreadable phone blocks with a way to check", async () => {
  phoneWith([mapping("s9", "com.todo1.mobile")], [], ["s9"]);
  await open();
  await ui.press("Close Wallet");
  await act(async () => {});
  expect(ui.texts()[3]).toBe("Notifications from Bancolombia land in this place. Point them at another place or stop reading them.");
  await act(async () => mounted!.root.unmount());
  intake.snapshot = { ...intake.snapshot, state: emptyState(), loaded: false, error: "storage" };
  await open();
  await ui.press("Close Wallet");
  expect(ui.texts().slice(2, 4)).toEqual(["We couldn't check this phone's notification sources",
    "Open notification sources and check that none of them lands in this place."]);
});

test("an unknown outcome locks the flow and the retry sends the identical command under the same key", async () => {
  remote.close.mockRejectedValueOnce(new Error("network lost")).mockResolvedValueOnce(receipt());
  await open();
  await ui.press("Close Wallet");
  await ui.press("I don't know / adjustment");
  await ui.press("Close Wallet");
  expect(ui.alerts()).toEqual(["We couldn't confirm whether the place closed. Retry: we send exactly the same closing and nothing is recorded twice."]);
  expect(ui.has("Back")).toBe(false);
  await systemBack();
  await systemBack();
  expect(mounted!.routes()).toEqual(["index", "places", "account", "place-ending"]);
  expect(ui.texts()).toContain("Closing Adjustment (expense)");
  await ui.press("Retry closing");
  expect(remote.close.mock.calls).toHaveLength(2);
  expect(remote.close.mock.calls[1]).toEqual(remote.close.mock.calls[0]);
  expect(remote.close.mock.calls[1]![0].idempotencyKey).toBe("key-1");
  expect(ui.texts()).toContain("Wallet is closed");
});

test("a refusal names the blocker from its context and a later attempt is a new request", async () => {
  remote.close.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_future_entries", message: "x",
    context: { code: "place_future_entries", latestAccountingDate: "2026-11-30" } }))
    .mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_close_balance_mismatch", message: "x" }));
  await open();
  await ui.press("Close Wallet");
  await ui.press("I don't know / adjustment");
  await ui.press("Close Wallet");
  expect(ui.alerts()).toEqual(["It has a movement dated in the future The latest is dated November 30, 2026. Wait until that day, or reverse that movement first."]);
  expect(ui.has("Back")).toBe(true);
  await ui.press("Close Wallet");
  expect(ui.alerts()).toEqual(["The amounts don't add up to the whole balance. Check them and try again."]);
  expect(remote.close.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["key-1", "key-2"]);
});

test("an access failure goes to the device handler and keeps the request frozen", async () => {
  const reported: unknown[] = [];
  access.report = (error) => { reported.push(error); return true; };
  const revoked = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  remote.close.mockRejectedValueOnce(revoked);
  await open();
  await ui.press("Close Wallet");
  await ui.press("I don't know / adjustment");
  await ui.press("Close Wallet");
  expect(reported).toEqual([revoked]);
  expect(ui.has("Retry closing")).toBe(true);
});

test("cancel paths send nothing and each step returns to the one before it, twice, with system back", async () => {
  await open();
  for (const round of [1, 2]) {
    await ui.press("Close Wallet");
    await ui.press("I moved it to another place");
    expect(ui.texts()[1]).toBe("Which place did it go to?");
    await systemBack();
    expect(ui.texts()[1]).toBe("Where did the money go?");
    await ui.press("Remove I moved it to another place");
    await systemBack();
    expect(ui.texts()[1]).toBe("What happened to Wallet?");
    expect(mounted!.routes()).toEqual(["index", "places", "account", "place-ending"]);
    if (round === 2) {
      await systemBack();
      expect(mounted!.routes()).toEqual(["index", "places", "account"]);
    }
  }
  expect(remote.close).not.toHaveBeenCalled();
  expect(remote.undo).not.toHaveBeenCalled();
});

test("the header back on the choice returns to the account page that opened the flow", async () => {
  await open();
  await ui.press("Back");
  expect(mounted!.routes()).toEqual(["index", "places", "account"]);
});

test("a Place that already ended offers neither act", async () => {
  remote.places = [{ ...wallet, status: "closed" }, daily, savings];
  await open();
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "This place has already ended", "Its history stays under Closed places."]);
  expect(ui.has("Close Wallet")).toBe(false);
  expect(ui.has("Undo Wallet")).toBe(false);
});

test("in Spanish the stored descriptions and adjustment names are written in Spanish", async () => {
  remote.close.mockResolvedValue(receipt());
  await open("es");
  expect(ui.texts().slice(0, 3)).toEqual(["CERRAR O DESHACER", "¿Qué pasó con Wallet?",
    "Elige lo que de verdad pasó. Las dos opciones son definitivas: un lugar que termina no se puede volver a abrir."]);
  expect(ui.texts().slice(7, 9)).toEqual([
    "Fue un error y nunca debió estar aquí. Cada uno de sus movimientos se reversa con un movimiento contrario, así que su saldo queda en cero.",
    "No se borra nada: los originales se quedan en el Historial, marcados como reversados, y los meses anteriores conservan los resultados que tenían. Cada reversión es un movimiento nuevo de este mes, así que los gastos y los ingresos de este mes pueden cambiar y el gasto de tu Presupuesto de este mes puede quedar en negativo. Las transferencias con otros lugares también se reversan, y eso cambia sus saldos.",
  ]);
  await ui.press("Cerrar Wallet");
  expect(ui.texts().slice(0, 3)).toEqual(["CERRAR O DESHACER", "¿A dónde se fue la plata?",
    "Wallet tiene COP 50.000. Explica todo el saldo para poder cerrarlo."]);
  expect(["La pasé a otro lugar", "La gasté", "No sé / ajuste"].every(ui.has)).toBe(true);
  await ui.press("No sé / ajuste");
  expect(ui.texts()).toEqual(expect.arrayContaining(["Se registra hoy, 10 de noviembre de 2026:", "Ajuste de cierre (gasto)",
    "Wallet queda cerrado para siempre y no se puede volver a abrir. Su historial no cambia y lo encuentras en Lugares cerrados."]));
  await ui.press("Cerrar Wallet");
  expect(remote.close.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(5_000_000), reviewedAccountingDate: "2026-11-10",
    closingAdjustmentExpenseName: "Ajuste de cierre (gasto)", closingAdjustmentIncomeName: "Ajuste de cierre (ingreso)",
    lines: [{ kind: "adjustment", amount: closing(5_000_000), description: "Ajuste de cierre de Wallet" }],
  }]]);
  expect(ui.texts()).toEqual(expect.arrayContaining(["Cerraste Wallet", "No se registró ningún movimiento.", "Listo"]));
});

test("a refusal clears once the person goes back to change their answer", async () => {
  remote.close.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_close_balance_mismatch", message: "x" }));
  await open();
  await ui.press("Close Wallet");
  await ui.press("I don't know / adjustment");
  await ui.press("Close Wallet");
  expect(ui.alerts()).toEqual(["The amounts don't add up to the whole balance. Check them and try again."]);
  await systemBack();
  await ui.press("Review");
  expect(ui.alerts()).toEqual([]);
});

test("a Place that ends elsewhere mid-flow leaves with one Back", async () => {
  await open();
  await ui.press("Close Wallet");
  await ui.press("I spent it");
  remote.places = [{ ...wallet, status: "closed" }, daily, savings];
  await ui.press("🛒 Groceries");
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "This place has already ended", "Its history stays under Closed places."]);
  await ui.press("Back");
  expect(mounted!.routes()).toEqual(["index", "places", "account"]);
});

const everyAnswer = ["I moved it to another place", "I spent it", "I don't know / adjustment", "I covered it from another place",
  "It was waived or no longer exists", "I paid it from another place", "It was forgiven or no longer exists", "It was returned to another place"];
async function reviewTransferToSavings() {
  await open();
  await ui.press("Close Wallet");
  await ui.press("I moved it to another place");
  await ui.press("Savings");
  expect(ui.texts()).toContain("Transfer to Savings");
}

test("a balance that changes under the summary withdraws it and returns to the answers, stating both amounts", async () => {
  remote.close.mockResolvedValue(receipt());
  await reviewTransferToSavings();
  await act(async () => serverChange(() => { remote.closure = closure("Asset", 3_000_000); }));
  expect(ui.texts().slice(0, 4)).toEqual(["CLOSE OR UNDO", "Where did the money go?",
    "The balance of Wallet changed from COP 50.000 to COP 30.000. Check your answers against the new balance, then review again.",
    "Wallet has COP 30.000. Account for all of it to close it."]);
  expect(ui.texts()).toEqual(expect.arrayContaining(["I moved it to another place", "Savings", "You explained COP 20.000 too much"]));
  expect(ui.disabled("Review")).toBe(true);
  await ui.type("Amount for I moved it to another place", "30000");
  await ui.press("Review");
  expect(ui.texts().join(" ")).not.toContain("changed from");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(3_000_000), reviewedAccountingDate: "2026-11-10",
    lines: [{ kind: "transfer", otherFinancialAccountProfileId: "savings", amount: closing(3_000_000), description: "Closing Wallet" }],
  }]]);
});

test("a balance whose sign flips drops the answers the new balance doesn't allow and offers its own", async () => {
  remote.close.mockResolvedValue(receipt());
  await reviewTransferToSavings();
  await act(async () => serverChange(() => { remote.closure = closure("Asset", -1_250_000); }));
  expect(ui.texts().slice(0, 4)).toEqual(["CLOSE OR UNDO", "How was the overdraft settled?",
    "The balance of Wallet changed from COP 50.000 to −COP 12.500. Check your answers against the new balance, then review again.",
    "Wallet is overdrawn by COP 12.500. Account for all of it to close it."]);
  expect(everyAnswer.filter((label) => ui.has(label))).toEqual(["I covered it from another place", "It was waived or no longer exists"]);
  expect(ui.has("Remove I moved it to another place")).toBe(false);
  await ui.press("It was waived or no longer exists");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(-1_250_000), reviewedAccountingDate: "2026-11-10",
    closingAdjustmentExpenseName: "Closing adjustment (expense)", closingAdjustmentIncomeName: "Closing adjustment (income)",
    lines: [{ kind: "adjustment", amount: closing(1_250_000), description: "Closing adjustment for Wallet" }],
  }]]);
});

test("a balance that reaches zero under the summary leaves nothing to record and asks for a new review", async () => {
  remote.close.mockResolvedValue(receipt());
  await reviewTransferToSavings();
  await act(async () => serverChange(() => { remote.closure = closure("Asset", 0); }));
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "Review before closing Wallet",
    "The balance of Wallet changed from COP 50.000 to COP 0, so nothing needs to be recorded now. Review again before closing.",
    "Wallet is at COP 0, so nothing is recorded.",
    "Wallet closes for good and can't be reopened. Its history stays as it is, under Closed places.", "Close Wallet"]);
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1",
    reviewedBalance: closing(0), reviewedAccountingDate: "2026-11-10", lines: [] }]]);
});

test.each([
  { source: "the phone's calendar", change: () => { remote.phoneDay = "2026-11-11"; } },
  { source: "the server's reading", change: () => { remote.closure = closure("Asset", 5_000_000, { accountingDate: "2026-11-11" }); } },
])("a new day seen through $source re-dates the summary, says so and binds the new day", async ({ change }) => {
  remote.close.mockResolvedValue(receipt());
  await reviewTransferToSavings();
  await act(async () => serverChange(change));
  expect(ui.texts().slice(1, 4)).toEqual(["Review before closing Wallet",
    "It's a new day: this closing is now recorded on November 11, 2026. Review it again before closing.",
    "Recorded today, November 11, 2026:"]);
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls[0]![0]).toMatchObject({ reviewedBalance: closing(5_000_000), reviewedAccountingDate: "2026-11-11" });
});

test("a balance refused as stale after the new balance arrived returns to the answers with both amounts and a new key", async () => {
  remote.close.mockImplementationOnce(async () => {
    serverChange(() => { remote.closure = closure("Asset", 4_000_000); });
    throw new ConvexError({ kind: "accounting", code: "place_close_balance_stale", message: "x" });
  }).mockResolvedValueOnce(receipt());
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  expect(ui.texts().slice(1, 3)).toEqual(["Where did the money go?",
    "The balance of Wallet changed from COP 50.000 to COP 40.000. Check your answers against the new balance, then review again."]);
  expect(ui.alerts()).not.toContain("The balance changed before the place closed, so nothing was recorded. Getting the new balance…");
  await ui.type("Amount for I moved it to another place", "40000");
  await ui.press("Review");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls.map(([request]) => [request.idempotencyKey, request.reviewedBalance, request.lines[0].amount]))
    .toEqual([["key-1", closing(5_000_000), closing(5_000_000)], ["key-2", closing(4_000_000), closing(4_000_000)]]);
});

test("a balance refused as stale before the new balance arrives blocks closing until it does", async () => {
  remote.close.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_close_balance_stale", message: "x" }));
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  expect(ui.alerts()).toEqual(["The balance changed before the place closed, so nothing was recorded. Getting the new balance…"]);
  expect(ui.disabled("Close Wallet")).toBe(true);
  await act(async () => serverChange(() => { remote.closure = closure("Asset", 4_000_000); }));
  expect(ui.texts()[2]).toBe("The balance of Wallet changed from COP 50.000 to COP 40.000. Check your answers against the new balance, then review again.");
  expect(remote.close).toHaveBeenCalledTimes(1);
});

test("a day refused as stale re-dates the summary from the phone's calendar and the next attempt binds it under a new key", async () => {
  remote.close.mockImplementationOnce(async () => {
    serverChange(() => { remote.phoneDay = "2026-11-11"; });
    throw new ConvexError({ kind: "accounting", code: "place_close_date_stale", message: "x" });
  }).mockResolvedValueOnce(receipt());
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  expect(ui.texts().slice(1, 4)).toEqual(["Review before closing Wallet",
    "It's a new day: this closing is now recorded on November 11, 2026. Review it again before closing.",
    "Recorded today, November 11, 2026:"]);
  expect(ui.alerts()).toEqual(["It's a new day: this closing is now recorded on November 11, 2026. Review it again before closing."]);
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls.map(([request]) => [request.idempotencyKey, request.reviewedAccountingDate]))
    .toEqual([["key-1", "2026-11-10"], ["key-2", "2026-11-11"]]);
});

test("a day refused as stale while this phone still shows the reviewed day says to check the phone's clock", async () => {
  remote.close.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_close_date_stale", message: "x" }));
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  expect(ui.alerts()).toEqual(["The day changed before the place closed, so nothing was recorded. This phone still shows November 10, 2026: check its date and time, then try again."]);
  expect(ui.disabled("Close Wallet")).toBe(false);
});

test("a category deleted while the closing is open shows as deleted, blocks closing and is chosen again from the summary", async () => {
  remote.close.mockResolvedValue(receipt());
  await open();
  await ui.press("Close Wallet");
  await ui.press("I spent it");
  await ui.press("🛒 Groceries");
  await act(async () => serverChange(() => {
    remote.categories = [categories[1], { id: "rent", name: "Rent", nature: "Expense", style: { emoji: "🏠" } }];
  }));
  expect(ui.texts()).toEqual(expect.arrayContaining(["Expense in Groceries (deleted)", "No longer available. Tap to choose another."]));
  expect(ui.alerts()).toEqual(["Something you chose is no longer available. Tap it to choose again."]);
  expect(ui.disabled("Close Wallet")).toBe(true);
  await ui.row("Expense in Groceries (deleted)");
  expect(ui.texts()[1]).toBe("What did you spend it on?");
  await ui.press("🏠 Rent");
  expect(ui.texts()[1]).toBe("Review before closing Wallet");
  expect(ui.texts()).toContain("Expense in Rent");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls[0]![0].lines).toEqual([{ kind: "expense", userCategoryId: "rent", amount: closing(5_000_000), description: "Closing Wallet" }]);
});

test.each([
  { status: "closed", label: "Transfer to Savings (closed)" },
  { status: "undoing", label: "Transfer to Savings (being undone)" },
])("a destination place that becomes $status shows so on the summary, blocks closing and is chosen again", async ({ status, label }) => {
  remote.close.mockResolvedValue(receipt());
  await reviewTransferToSavings();
  await act(async () => serverChange(() => { remote.places = [wallet, daily, { ...savings, status }]; }));
  expect(ui.texts()).toContain(label);
  expect(ui.disabled("Close Wallet")).toBe(true);
  await ui.press("Close Wallet").catch(() => {});
  expect(remote.close).not.toHaveBeenCalled();
  await ui.row(label);
  expect(ui.has("Savings")).toBe(false);
  await ui.press("Daily");
  expect(ui.texts()).toContain("Transfer to Daily");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls[0]![0].lines[0].otherFinancialAccountProfileId).toBe("daily");
});

test("a new default place that closes meanwhile is marked, blocks closing and is chosen again, returning to the summary twice", async () => {
  remote.closure = closure("Asset", 0, { isDefault: true, requiresReplacementDefault: true });
  remote.close.mockResolvedValue(receipt());
  await open();
  await ui.press("Close Wallet");
  await ui.press("Savings");
  await ui.press("Continue");
  expect(ui.texts()).toContain("Savings becomes your default place.");
  await act(async () => serverChange(() => { remote.places = [wallet, daily, { ...savings, status: "closed" }]; }));
  expect(ui.texts()).toEqual(expect.arrayContaining(["Savings (closed) can't become your default place anymore", "Tap to choose another default place."]));
  expect(ui.disabled("Close Wallet")).toBe(true);
  for (const round of [1, 2]) {
    await ui.row("Savings (closed) can't become your default place anymore");
    expect(ui.texts()[1]).toBe("Choose your new default place");
    if (round === 1) { await systemBack(); expect(ui.texts()[1]).toBe("Review before closing Wallet"); }
  }
  await ui.press("Daily");
  await ui.press("Continue");
  expect(ui.texts()).toContain("Daily becomes your default place.");
  await systemBack();
  expect(ui.texts()[1]).toBe("Choose your new default place");
  await ui.press("Continue");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(0),
    reviewedAccountingDate: "2026-11-10", replacementDefaultFinancialAccountProfileId: "daily", lines: [] }]]);
});

test("in Spanish a deleted category and a closed place read as such", async () => {
  remote.places = [wallet, daily, { ...savings, name: "Ahorros" }];
  remote.categories = [{ id: "groceries", name: "Mercado", nature: "Expense", style: { emoji: "🛒" } }];
  await open("es");
  await ui.press("Cerrar Wallet");
  await ui.press("La gasté");
  await ui.press("🛒 Mercado");
  await systemBack();
  await ui.press("Dividir en otra respuesta");
  await ui.press("La pasé a otro lugar");
  await ui.press("Ahorros");
  await act(async () => serverChange(() => { remote.categories = []; remote.places = [wallet, daily, { ...savings, name: "Ahorros", status: "closed" }]; }));
  expect(ui.texts()).toEqual(expect.arrayContaining(["Mercado (eliminada)", "Ahorros (cerrado)", "Ya no está disponible. Toca para elegir otra opción."]));
  expect(ui.disabled("Revisar")).toBe(true);
  await act(async () => serverChange(() => { remote.closure = closure("Asset", 4_000_000); }));
  expect(ui.texts()).toContain("El saldo de Wallet cambió de COP 50.000 a COP 40.000. Revisa tus respuestas con el saldo nuevo y vuelve a revisar el cierre.");
});

const storedKey = "lukapp.placeEnding.unresolved.owner";
const closeUncertain = "We couldn't confirm whether the place closed. Retry: we send exactly the same closing and nothing is recorded twice.";
const unresolvedBody = "The closing was sent, but its answer never reached this phone, so it may already be recorded. Send it again exactly as it was: if it was recorded, you'll see what was recorded; if not, it's recorded now.";
const sentTransfer = {
  workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(5_000_000), reviewedAccountingDate: "2026-11-10",
  lines: [{ kind: "transfer", otherFinancialAccountProfileId: "savings", amount: closing(5_000_000), description: "Closing Wallet" }],
};
const storeOnPhone = (request: unknown, act = "close") => phone.set(storedKey, JSON.stringify({ v: 1, endings: [{ act, request }] }));
async function restart() {
  await act(async () => mounted!.root.unmount());
  await open();
  await settle();
}

test("an unconfirmed closing survives a restart, shows what it contained and resends the identical request under its key", async () => {
  remote.close.mockRejectedValueOnce(new Error("network lost")).mockResolvedValueOnce(receipt());
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  await settle();
  expect(ui.alerts()).toEqual([closeUncertain]);
  expect(remote.close.mock.calls[0]![0]).toEqual(sentTransfer);
  expect(JSON.parse(phone.get(storedKey)!)).toEqual({ v: 1, endings: [{ act: "close", request: sentTransfer }] });
  await restart();
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "We couldn't confirm whether Wallet closed", unresolvedBody,
    "Recorded on November 10, 2026:", "Transfer to Savings", "COP 50.000", "Send it again"]);
  expect(ui.has("Close Wallet")).toBe(false);
  expect(ui.has("Undo Wallet")).toBe(false);
  await ui.press("Send it again");
  await settle();
  expect(remote.close.mock.calls).toEqual([[sentTransfer], [sentTransfer]]);
  expect(ui.texts()).toContain("Wallet is closed");
  expect(phone.has(storedKey)).toBe(false);
});

test("a resend whose outcome is unknown again stays stored and locked, and the next try sends the same request", async () => {
  storeOnPhone(sentTransfer);
  remote.close.mockRejectedValueOnce(new Error("still offline")).mockResolvedValueOnce(receipt());
  await open();
  await settle();
  await ui.press("Send it again");
  await settle();
  expect(ui.alerts()).toEqual([closeUncertain]);
  expect(ui.has("Back")).toBe(false);
  await systemBack();
  expect(mounted!.routes()).toEqual(["index", "places", "account", "place-ending"]);
  expect(JSON.parse(phone.get(storedKey)!).endings[0].request).toEqual(sentTransfer);
  await ui.press("Send it again");
  await settle();
  expect(remote.close.mock.calls).toEqual([[sentTransfer], [sentTransfer]]);
  expect(phone.has(storedKey)).toBe(false);
});

const turnedAway = [
  { code: "provider_unavailable", reason: "We couldn't verify your session. Try again." },
  { code: "session_verification_required", reason: "Your session needs confirming. Sign in again and retry." },
  { code: "device_registration_required", reason: "This phone no longer has access." },
  { code: "workspace_membership_required", reason: "You don't have permission to do this in this workspace." },
  { code: "idempotency_key_conflict", reason: "We couldn't do it (idempotency_key_conflict)." },
  { code: "a_future_code", reason: "We couldn't do it (a_future_code)." },
];
const refusedWith = (code: string) => code.startsWith("place_") || code.startsWith("idempotency") || code.startsWith("workspace_") || code === "a_future_code"
  ? new ConvexError({ kind: "accounting", code, message: "x" }) : new ConvexError({ code });

test.each(turnedAway)("a retry refused with $code says nothing about the first closing, so it stays locked and on the phone across a restart", async ({ code, reason }) => {
  remote.close.mockRejectedValueOnce(new Error("network lost")).mockRejectedValueOnce(refusedWith(code))
    .mockResolvedValueOnce({ ...receipt(), replay: true });
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  await settle();
  await ui.press("Retry closing");
  await settle();
  expect(ui.alerts()).toEqual([`${closeUncertain} ${reason}`]);
  expect(ui.has("Back")).toBe(false);
  expect(JSON.parse(phone.get(storedKey)!)).toEqual({ v: 1, endings: [{ act: "close", request: sentTransfer }] });
  await restart();
  expect(ui.texts()[1]).toBe("We couldn't confirm whether Wallet closed");
  await ui.press("Send it again");
  await settle();
  expect(remote.close.mock.calls).toEqual([[sentTransfer], [sentTransfer], [sentTransfer]]);
  expect(ui.texts()).toContain("Wallet is closed");
  expect(phone.has(storedKey)).toBe(false);
});

test("a resent closing turned away before the server looked for it stays stored and locked until an answer arrives", async () => {
  storeOnPhone(sentTransfer);
  remote.close.mockRejectedValueOnce(new ConvexError({ code: "provider_unavailable" })).mockResolvedValueOnce(receipt());
  await open();
  await settle();
  await ui.press("Send it again");
  await settle();
  expect(ui.texts()[1]).toBe("We couldn't confirm whether Wallet closed");
  expect(ui.alerts()).toEqual([`${closeUncertain} We couldn't verify your session. Try again.`]);
  expect(JSON.parse(phone.get(storedKey)!).endings[0].request).toEqual(sentTransfer);
  await restart();
  await ui.press("Send it again");
  await settle();
  expect(remote.close.mock.calls).toEqual([[sentTransfer], [sentTransfer]]);
  expect(ui.texts()).toContain("Wallet is closed");
  expect(phone.has(storedKey)).toBe(false);
});

test.each([
  { error: () => new ConvexError({ kind: "accounting", code: "place_close_balance_stale", message: "x" }),
    alert: "The balance changed before the place closed, so nothing was recorded. Getting the new balance…" },
  { error: () => new ConvexError({ kind: "accounting", code: "place_new_rule", message: "x", context: { code: "place_new_rule" } }),
    alert: "We couldn't do it (place_new_rule)." },
])("a retry refused after the server found no earlier closing settles it: forgotten, and the next attempt is new", async ({ error, alert }) => {
  remote.close.mockRejectedValueOnce(new Error("network lost")).mockRejectedValueOnce(error()).mockResolvedValueOnce(receipt());
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  await settle();
  await ui.press("Retry closing");
  await settle();
  expect(ui.alerts()).toEqual([alert]);
  expect(phone.has(storedKey)).toBe(false);
  expect(ui.has("Back")).toBe(true);
});

test("a first attempt turned away before the server looked for anything is refused: editable, forgotten, and the next attempt is new", async () => {
  remote.close.mockRejectedValueOnce(new ConvexError({ code: "provider_unavailable" })).mockResolvedValueOnce(receipt());
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  await settle();
  expect(ui.alerts()).toEqual(["We couldn't verify your session. Try again."]);
  expect(phone.has(storedKey)).toBe(false);
  await ui.press("Close Wallet");
  await settle();
  expect(remote.close.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["key-1", "key-2"]);
  expect(ui.texts()).toContain("Wallet is closed");
});

test.each([
  { code: "place_close_balance_stale", notice: "It wasn't closed because its balance changed since. Start a new review." },
  { code: "place_close_date_stale", notice: "It wasn't closed because the day changed since. Start a new review." },
  { code: "locked_period", notice: "The earlier request wasn't recorded. This month is closed, so the closing can't be recorded today." },
])("a resent closing refused with $code is forgotten and the person starts a fresh review under a new key", async ({ code, notice }) => {
  storeOnPhone({ ...sentTransfer, idempotencyKey: "from-before" });
  remote.close.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code, message: "x" })).mockResolvedValueOnce(receipt());
  await open();
  await settle();
  await ui.press("Send it again");
  await settle();
  expect(phone.has(storedKey)).toBe(false);
  expect(ui.texts().slice(1, 3)).toEqual(["What happened to Wallet?", notice]);
  await ui.press("Close Wallet");
  expect(ui.alerts()).toEqual([]);
  await ui.press("I don't know / adjustment");
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["from-before", "key-1"]);
});

test("a request is on the phone while it is sent and forgotten after a receipt or a refusal", async () => {
  const seen: Array<string | undefined> = [];
  remote.close.mockImplementationOnce(async () => { seen.push(phone.get(storedKey)); throw new ConvexError({ kind: "accounting", code: "locked_period", message: "x" }); })
    .mockImplementationOnce(async () => { seen.push(phone.get(storedKey)); return receipt(); });
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  await settle();
  expect(phone.has(storedKey)).toBe(false);
  await ui.press("Close Wallet");
  await settle();
  expect(seen.map((raw) => JSON.parse(raw!).endings[0].request.idempotencyKey)).toEqual(["key-1", "key-2"]);
  expect(phone.has(storedKey)).toBe(false);
  expect(ui.texts()).toContain("Wallet is closed");
});

const notSaved = "This phone couldn't save the request before sending it, so nothing was sent. Try again.";
test("a closing the phone can't save first is never sent: nothing is locked, and trying again sends a new request", async () => {
  remote.close.mockResolvedValue(receipt());
  await reviewTransferToSavings();
  failing.writes = 1;
  await ui.press("Close Wallet");
  await settle();
  expect(remote.close).not.toHaveBeenCalled();
  expect(phone.has(storedKey)).toBe(false);
  expect(ui.alerts()).toEqual([notSaved]);
  expect(ui.has("Back")).toBe(true);
  await restart();
  expect(ui.texts()[1]).toBe("What happened to Wallet?");
  await ui.press("Close Wallet");
  await ui.press("I moved it to another place");
  await ui.press("Savings");
  await ui.press("Close Wallet");
  await settle();
  expect(remote.close.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["key-2"]);
  expect(ui.texts()).toContain("Wallet is closed");
});

test("a closing whose receipt arrives while the phone can't forget it shows the receipt, and the Place reading closed clears the leftover", async () => {
  remote.close.mockResolvedValueOnce(receipt());
  await reviewTransferToSavings();
  failing.deletes = 1;
  await ui.press("Close Wallet");
  await settle();
  expect(ui.texts()).toContain("Wallet is closed");
  remote.places = [{ ...wallet, status: "closed" }, daily, savings];
  await restart();
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "This place has already ended", "Its history stays under Closed places."]);
  expect(phone.has(storedKey)).toBe(false);
  expect(remote.close).toHaveBeenCalledTimes(1);
});

test("a resent closing refused while the phone can't forget it lets the person start again, and doesn't come back on the next open", async () => {
  storeOnPhone({ ...sentTransfer, idempotencyKey: "from-before" });
  remote.close.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_close_balance_stale", message: "x" }));
  await open();
  await settle();
  failing.deletes = 1;
  await ui.press("Send it again");
  await settle();
  expect(ui.texts().slice(1, 3)).toEqual(["What happened to Wallet?", "It wasn't closed because its balance changed since. Start a new review."]);
  await restart();
  expect(ui.texts()[1]).toBe("What happened to Wallet?");
  expect(phone.has(storedKey)).toBe(false);
  expect(remote.close).toHaveBeenCalledTimes(1);
});

test("a stored request is forgotten once the backend reports the Place as ended, and another Place's request is kept", async () => {
  const otherPlace = { ...sentTransfer, financialAccountProfileId: "daily", idempotencyKey: "daily-key" };
  phone.set(storedKey, JSON.stringify({ v: 1, endings: [{ act: "close", request: sentTransfer }, { act: "close", request: otherPlace }] }));
  remote.places = [{ ...wallet, status: "closed" }, daily, savings];
  await open();
  await settle();
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "This place has already ended", "Its history stays under Closed places."]);
  expect(JSON.parse(phone.get(storedKey)!)).toEqual({ v: 1, endings: [{ act: "close", request: otherPlace }] });
  expect(remote.close).not.toHaveBeenCalled();
});

test("an unreadable saved request blocks a new attempt until it is read", async () => {
  phone.set(storedKey, "{not json");
  await open();
  await settle();
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "We couldn't read this phone's saved request",
    "An earlier closing or undo of this place may be waiting on this phone. Try reading it again before starting anything new.", "Try again"]);
  storeOnPhone(sentTransfer);
  await ui.press("Try again");
  await settle();
  expect(ui.texts()[1]).toBe("We couldn't confirm whether Wallet closed");
});

test("in Spanish an unconfirmed closing reads as such", async () => {
  storeOnPhone({ ...sentTransfer, lines: [{ kind: "expense", userCategoryId: "groceries", amount: closing(5_000_000), description: "Cierre de Wallet" }] });
  remote.categories = [{ id: "groceries", name: "Mercado", nature: "Expense", style: { emoji: "🛒" } }];
  await open("es");
  await settle();
  expect(ui.texts()).toEqual(["CERRAR O DESHACER", "No pudimos confirmar si Wallet quedó cerrado",
    "El cierre se envió, pero la respuesta nunca llegó a este celular, así que puede que ya esté registrado. Envíalo otra vez tal como estaba: si ya se registró, verás lo que quedó registrado; si no, se registra ahora.",
    "Se registra el 10 de noviembre de 2026:", "Gasto en Mercado", "COP 50.000", "Enviar otra vez"]);
});

test("a source mapped to the Place after the summary was drawn stops the closing at the moment of sending, with the same message", async () => {
  remote.close.mockResolvedValue(receipt());
  await reviewTransferToSavings();
  intake.snapshot = { ...intake.snapshot, state: { ...emptyState(), mappings: [mapping("s1", "com.todo1.mobile")], activeSelectionIds: ["s1"] } };
  await ui.press("Close Wallet");
  await settle();
  expect(remote.close).not.toHaveBeenCalled();
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "You can't close Wallet yet", "Apps send their notifications here",
    "Notifications from Bancolombia land in this place. Point them at another place or stop reading them.",
    "Go to notification sources", "Go back"]);
  await ui.press("Go to notification sources");
  await act(async () => phoneWith([mapping("s1", "com.todo1.mobile", "daily")], ["s1"]));
  await systemBack();
  expect(ui.texts()[1]).toBe("Review before closing Wallet");
  expect(ui.alerts()).toEqual([]);
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[sentTransfer]]);
});

test("a phone whose sources can't be read at the moment of sending stops the closing", async () => {
  await reviewTransferToSavings();
  intake.snapshot = { ...intake.snapshot, loaded: false, error: "storage" };
  await ui.press("Close Wallet");
  expect(remote.close).not.toHaveBeenCalled();
  expect(ui.texts().slice(2, 4)).toEqual(["We couldn't check this phone's notification sources",
    "Open notification sources and check that none of them lands in this place."]);
});

test("retrying a closing whose outcome is unknown resends it even if a source now points at the Place", async () => {
  remote.close.mockRejectedValueOnce(new Error("network lost")).mockResolvedValueOnce(receipt());
  await reviewTransferToSavings();
  await ui.press("Close Wallet");
  await settle();
  intake.snapshot = { ...intake.snapshot, state: { ...emptyState(), mappings: [mapping("s1", "com.todo1.mobile")], activeSelectionIds: ["s1"] } };
  await ui.press("Retry closing");
  await settle();
  expect(remote.close.mock.calls).toEqual([[sentTransfer], [sentTransfer]]);
});

test("choosing an unavailable answer again returns to the summary, and backing out of the picker does too, twice", async () => {
  await reviewTransferToSavings();
  await act(async () => serverChange(() => { remote.places = [wallet, daily, { ...savings, status: "closed" }]; }));
  for (const _round of [1, 2]) {
    await ui.row("Transfer to Savings (closed)");
    expect(ui.texts()[1]).toBe("Which place did it go to?");
    await systemBack();
    expect(ui.texts()[1]).toBe("Review before closing Wallet");
    expect(mounted!.routes()).toEqual(["index", "places", "account", "place-ending"]);
  }
  await systemBack();
  expect(ui.texts()[1]).toBe("Where did the money go?");
  await systemBack();
  expect(ui.texts()[1]).toBe("What happened to Wallet?");
  await systemBack();
  expect(mounted!.routes()).toEqual(["index", "places", "account"]);
});

test("an unconfirmed closing's screen goes back to the Place's page with one Back and keeps the request, twice", async () => {
  storeOnPhone(sentTransfer);
  for (const _round of [1, 2]) {
    await open();
    await settle();
    expect(ui.texts()[1]).toBe("We couldn't confirm whether Wallet closed");
    await systemBack();
    expect(mounted!.routes()).toEqual(["index", "places", "account"]);
    await act(async () => mounted!.root.unmount());
  }
  mounted = undefined;
  expect(JSON.parse(phone.get(storedKey)!).endings[0].request).toEqual(sentTransfer);
  expect(remote.close).not.toHaveBeenCalled();
});

test("in Spanish the new day and a stale refusal read as such", async () => {
  remote.close.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_close_date_stale", message: "x" }))
    .mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_close_balance_stale", message: "x" }));
  remote.places = [wallet, daily, { ...savings, name: "Ahorros" }];
  await open("es");
  await ui.press("Cerrar Wallet");
  await ui.press("La pasé a otro lugar");
  await ui.press("Ahorros");
  await ui.press("Cerrar Wallet");
  expect(ui.alerts()).toEqual(["Cambió el día antes de cerrar el lugar, así que no se registró nada. Este celular todavía muestra 10 de noviembre de 2026: revisa su fecha y hora, y vuelve a intentarlo."]);
  await act(async () => serverChange(() => { remote.phoneDay = "2026-11-11"; }));
  expect(ui.texts().slice(2, 4)).toEqual(["Cambió el día: este cierre ahora se registra el 11 de noviembre de 2026. Revísalo otra vez antes de cerrar.",
    "Se registra hoy, 11 de noviembre de 2026:"]);
  await ui.press("Cerrar Wallet");
  expect(ui.alerts()).toEqual(["Cambió el día: este cierre ahora se registra el 11 de noviembre de 2026. Revísalo otra vez antes de cerrar.",
    "El saldo cambió antes de cerrar el lugar, así que no se registró nada. Estamos trayendo el saldo nuevo…"]);
});

test("a Close handler kept before the default place was chosen again sends the default the summary shows", async () => {
  remote.closure = closure("Asset", 0, { isDefault: true, requiresReplacementDefault: true });
  remote.close.mockResolvedValue(receipt());
  await open();
  await ui.press("Close Wallet");
  await ui.press("Savings");
  await ui.press("Continue");
  const kept = ui.pressable("Close Wallet").props.onPress as () => void;
  await act(async () => serverChange(() => { remote.places = [wallet, daily, { ...savings, status: "closed" }]; }));
  await ui.row("Savings (closed) can't become your default place anymore");
  await ui.press("Daily");
  await ui.press("Continue");
  expect(ui.texts()).toContain("Daily becomes your default place.");
  await act(async () => kept());
  expect(remote.close.mock.calls).toEqual([[{ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reviewedBalance: closing(0),
    reviewedAccountingDate: "2026-11-10", replacementDefaultFinancialAccountProfileId: "daily", lines: [] }]]);
});
