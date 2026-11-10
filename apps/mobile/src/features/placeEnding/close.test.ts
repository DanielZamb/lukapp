vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
import * as React from "react";
import { createElement } from "react";
import { act, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyState } from "../intake/durableState";
import { mountStack, screenHelpers } from "./flow.testSupport";

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
const intake = vi.hoisted(() => ({
  snapshot: { state: null as unknown, status: null, error: "", loaded: true, wipePending: false, drain: null },
  listeners: new Set<() => void>(),
  service: { listSources: async () => [{ packageName: "com.todo1.mobile", label: "Bancolombia" }, { packageName: "com.nequi.MobileApp", label: "Nequi" }] },
}));
vi.mock("../intake/IntakeProvider", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => { intake.listeners.add(listener); return () => { intake.listeners.delete(listener); }; };
  return { useIntakeService: () => intake.service, useIntakeSnapshot: () => useSyncExternalStore(subscribe, () => intake.snapshot) };
});
type Profile = { id: string; workspaceId: string; name: string; productKind: string; ledgerAccountId: string; status: string };
const remote = vi.hoisted(() => ({
  places: [] as unknown[], closure: null as unknown, categories: [] as unknown[],
  close: vi.fn(), undo: vi.fn(),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
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

test("the choice explains both acts and an Undo's effect on reports before either starts", async () => {
  await open();
  expect(ui.texts()).toEqual([
    "CLOSE OR UNDO", "What happened to Wallet?",
    "Pick what really happened. Both are permanent: a place that ends can't be reopened.",
    "Close place",
    "The account existed and has ended, like a bank account you cancelled or a loan you finished paying. Every movement stays in your History and your reports. If it still has money, you'll say where it went, and each answer is recorded as a movement dated today.",
    "Close Wallet",
    "Undo place",
    "It was a mistake and should never have been here. Every movement in it is reversed, and its balance goes to zero.",
    "This erases its movements from your reports by reversing each one. The originals stay in History, marked as reversed. Movements from months you already closed are reversed in this month, and transfers with other places are reversed too, so their balances change.",
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
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1",
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
  await ui.type("Amount for I moved it to another place", "30.000");
  expect(ui.texts()).toContain("Still to explain: COP 20.000");
  expect(ui.disabled("Review")).toBe(true);
  await ui.type("Amount for I spent it", "25.000");
  expect(ui.texts()).toContain("Still to explain: COP 20.000");
  expect(ui.disabled("Review")).toBe(true);
  await ui.press("Confirm COP 25.000,00");
  expect(ui.texts()).toContain("You explained COP 5.000 too much");
  expect(ui.disabled("Review")).toBe(true);
  await ui.type("Amount for I spent it", "20.000");
  expect(ui.texts()).toContain("Still to explain: COP 0");
  await ui.press("Review");
  expect(ui.texts()).toEqual(expect.arrayContaining(["Transfer to Savings", "COP 30.000", "Expense in Groceries", "COP 20.000"]));
  await ui.press("Close Wallet");
  expect(remote.close.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1",
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
  expect(remote.close.mock.calls).toEqual([[{ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", lines: [] }]]);
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
  expect(remote.close.mock.calls).toEqual([[{ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1",
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
  expect(ui.alerts()).toEqual(["The balance changed meanwhile. Check that the amounts add up to the whole balance."]);
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
  await ui.press("Cerrar Wallet");
  expect(ui.texts().slice(0, 3)).toEqual(["CERRAR O DESHACER", "¿A dónde se fue la plata?",
    "Wallet tiene COP 50.000. Explica todo el saldo para poder cerrarlo."]);
  expect(["La pasé a otro lugar", "La gasté", "No sé / ajuste"].every(ui.has)).toBe(true);
  await ui.press("No sé / ajuste");
  expect(ui.texts()).toEqual(expect.arrayContaining(["Se registra hoy, 10 de noviembre de 2026:", "Ajuste de cierre (gasto)",
    "Wallet queda cerrado para siempre y no se puede volver a abrir. Su historial no cambia y lo encuentras en Lugares cerrados."]));
  await ui.press("Cerrar Wallet");
  expect(remote.close.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1",
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
  expect(ui.alerts()).toEqual(["The balance changed meanwhile. Check that the amounts add up to the whole balance."]);
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
