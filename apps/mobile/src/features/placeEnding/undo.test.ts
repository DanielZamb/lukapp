vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
import * as React from "react";
import { createElement } from "react";
import { act, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyState } from "../intake/durableState";
import { mountStack, screenHelpers, settle } from "./flow.testSupport";
import { UNDO_PREVIEW_PAGE_LIMIT } from "./useUndoPreview";

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
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => () => false }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
const intake = vi.hoisted(() => ({
  snapshot: { state: null as unknown, status: null, error: "", loaded: true, wipePending: false, drain: null },
  service: { listSources: async () => [] },
}));
vi.mock("../intake/IntakeProvider", () => ({ useIntakeService: () => intake.service, useIntakeSnapshot: () => intake.snapshot }));
type Money = { currency: string; minorUnits: number };
type Page = {
  entriesToReverse: number; alreadyReversed: number; lockedMonthEntries: number;
  otherPlaces: Array<{ financialAccountProfileId: string; name: string; balanceChange: Money }>;
  currentMonthExpenseChange: Money; currentMonthIncomeChange: Money; scannedLines: number; isDone: boolean; continueCursor: string;
};
const remote = vi.hoisted(() => ({
  places: [] as unknown[], closure: null as unknown, blockers: [] as unknown[],
  page: (_cursor: string | null): Page | Error => { throw new Error("no page"); },
  close: vi.fn(), undo: vi.fn(),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const preview = (cursor: string | null) => {
    const page = remote.page(cursor);
    if (page instanceof Error) throw page;
    return { closure: remote.closure, canUndo: remote.blockers.length === 0, blockers: remote.blockers, operation: null, page };
  };
  const client = { query: async (_ref: unknown, args: { cursor: string | null }) => preview(args.cursor) };
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(ref);
      if (name === "accounting:listFinancialAccountProfiles") return remote.places;
      if (name === "accounting:placeClosure") return remote.closure;
      if (name === "accounting:previewUndoPlace") return preview(null);
      if (name === "accounting:listUserCategories") return [];
      return undefined;
    },
    useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "accounting:closePlace" ? remote.close : remote.undo,
    useConvex: () => client,
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

const profile = (id: string, name: string, status = "open") =>
  ({ id, workspaceId: "ws", name, productKind: "bankAccount", ledgerAccountId: `ledger-${id}`, status });
const cop = (minorUnits: number) => ({ currency: "COP", minorUnits });
function closure(extra: Record<string, unknown> = {}) {
  return { financialAccountProfileId: "wallet", status: "open", canClose: true, blockers: [], isDefault: false,
    requiresReplacementDefault: false, openPlaceCount: 3, balance: cop(5_000_000), nature: "Asset", accountingDate: "2026-11-10", ...extra };
}
function page(values: Partial<Page>): Page {
  return { entriesToReverse: 0, alreadyReversed: 0, lockedMonthEntries: 0, otherPlaces: [], currentMonthExpenseChange: cop(0),
    currentMonthIncomeChange: cop(0), scannedLines: 10, isDone: true, continueCursor: "end", ...values };
}
const realistic: Record<string, Page> = {
  start: page({ entriesToReverse: 4, alreadyReversed: 1, lockedMonthEntries: 1, isDone: false, continueCursor: "c1",
    otherPlaces: [{ financialAccountProfileId: "savings", name: "Savings", balanceChange: cop(2_000_000) }],
    currentMonthExpenseChange: cop(-1_500_000) }),
  c1: page({ entriesToReverse: 3, lockedMonthEntries: 2, isDone: true,
    otherPlaces: [{ financialAccountProfileId: "savings", name: "Savings", balanceChange: cop(500_000) },
      { financialAccountProfileId: "visa", name: "Visa", balanceChange: cop(-250_000) }],
    currentMonthExpenseChange: cop(-500_000), currentMonthIncomeChange: cop(-4_000_000) }),
};

let mounted: Awaited<ReturnType<typeof mountStack>> | undefined;
const ui = screenHelpers(() => mounted!.root as ReactTestRenderer);
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  keys.next = 0;
  intake.snapshot = { ...intake.snapshot, state: emptyState(), loaded: true, error: "" };
  remote.places = [profile("wallet", "Wallet"), profile("daily", "Daily"), profile("savings", "Savings")];
  remote.closure = closure();
  remote.blockers = [];
  remote.page = (cursor) => realistic[cursor ?? "start"]!;
  remote.close.mockReset();
  remote.undo.mockReset();
});
afterEach(async () => {
  await act(async () => mounted?.root.unmount());
  mounted = undefined;
  vi.unstubAllGlobals();
});
async function openUndo(language?: "es") {
  mounted = await mountStack(router, () => createElement(PlaceEndingRoute), language);
  await ui.press(language === "es" ? "Deshacer Wallet" : "Undo Wallet");
  await settle();
}
const operation = (state: unknown) => ({ operation: { id: "op", state, reversedCount: 0 }, replay: false });

test("the confirmation states every preview page's totals: movements, closed months, other places and this month", async () => {
  await openUndo();
  expect(ui.texts()).toEqual([
    "CLOSE OR UNDO", "Undo Wallet",
    "This erases its movements from your reports by reversing each one. The originals stay in History, marked as reversed. Movements from months you already closed are reversed in this month, and transfers with other places are reversed too, so their balances change.",
    "This reverses 7 movements.",
    "Of these, 3 are from closed months; they're reversed in this month.",
    "Other places' balances change:", "Savings", "+COP 25.000", "Visa", "−COP 2.500",
    "This month: spending −COP 20.000, income −COP 40.000.",
    "So this month's Budget spending can go negative.",
    "Wallet goes to COP 0 and ends for good; it can't be reopened.",
    "It starts right away and keeps going on its own, in batches. Meanwhile nothing new can be recorded in Wallet.",
    "To confirm, type Wallet",
    "Undo Wallet",
  ]);
});

test("a preview that never finishes within the page limit is stated as a lower bound", async () => {
  remote.page = (cursor) => {
    const index = cursor === null ? 0 : Number(cursor.slice(1));
    return page({ entriesToReverse: 1, isDone: false, continueCursor: `c${index + 1}`,
      otherPlaces: [{ financialAccountProfileId: "savings", name: "Savings", balanceChange: cop(100) }] });
  };
  await openUndo();
  await settle();
  expect(ui.texts()).toEqual(expect.arrayContaining([`This reverses at least ${UNDO_PREVIEW_PAGE_LIMIT} movements.`,
    "More places may change.", "Savings", `+COP ${UNDO_PREVIEW_PAGE_LIMIT}`]));
  expect(ui.texts()).not.toContain("No other place's balance changes.");
  await ui.type("Place name to confirm", "Wallet");
  expect(ui.disabled("Undo Wallet")).toBe(false);
});

test("a preview page that fails to load blocks the confirmation until it is read again", async () => {
  let fail = true;
  remote.page = (cursor) => cursor === "c1" && fail ? new Error("offline") : realistic[cursor ?? "start"]!;
  await openUndo();
  expect(ui.alerts()).toEqual(["We couldn't work out everything that changes."]);
  expect(ui.texts()).toContain("This reverses at least 4 movements.");
  await ui.type("Place name to confirm", "Wallet");
  expect(ui.disabled("Undo Wallet")).toBe(true);
  fail = false;
  await ui.press("Try again");
  await settle();
  expect(ui.alerts()).toEqual([]);
  expect(ui.texts()).toContain("This reverses 7 movements.");
  expect(ui.disabled("Undo Wallet")).toBe(false);
});

test("Undo starts only after the Place's name is typed, sends the localized prefix and returns to the Place's page", async () => {
  remote.undo.mockResolvedValue(operation({ kind: "pending" }));
  await openUndo();
  expect(ui.disabled("Undo Wallet")).toBe(true);
  await ui.type("Place name to confirm", "Wal");
  expect(ui.disabled("Undo Wallet")).toBe(true);
  await ui.type("Place name to confirm", "Daily");
  expect(ui.disabled("Undo Wallet")).toBe(true);
  await ui.type("Place name to confirm", "  wallet ");
  expect(ui.disabled("Undo Wallet")).toBe(false);
  await ui.press("Undo Wallet");
  expect(remote.undo.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", reversalDescriptionPrefix: "Reversal:",
  }]]);
  expect(mounted!.routes()).toEqual(["index", "places", "account"]);
});

test("undoing the Default Place asks for its replacement and sends it with the start", async () => {
  remote.closure = closure({ isDefault: true, requiresReplacementDefault: true });
  remote.undo.mockResolvedValue(operation({ kind: "pending" }));
  await openUndo();
  expect(ui.texts().slice(1, 3)).toEqual(["Choose your new default place",
    "Wallet is your default place. Before undoing it, choose another open place for new movements."]);
  await ui.press("Daily");
  await ui.press("Continue");
  await settle();
  expect(ui.texts()).toContain("Daily becomes your default place.");
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  expect(remote.undo.mock.calls[0]![0]).toEqual({ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1",
    reversalDescriptionPrefix: "Reversal:", replacementDefaultFinancialAccountProfileId: "daily" });
});

test("an unknown start locks the flow and retries the identical request", async () => {
  remote.undo.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(operation({ kind: "running" }));
  await openUndo();
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  expect(ui.alerts()).toEqual(["We couldn't confirm whether the undo started. Retry: we send exactly the same request and nothing happens twice."]);
  expect(ui.input("Place name to confirm").props.editable).toBe(false);
  await act(async () => { mounted!.stack.goBack(); });
  expect(mounted!.routes()).toEqual(["index", "places", "account", "place-ending"]);
  await ui.press("Retry");
  expect(remote.undo.mock.calls[1]).toEqual(remote.undo.mock.calls[0]);
  expect(mounted!.routes()).toEqual(["index", "places", "account"]);
});

test("a refused start explains the blocker from its context", async () => {
  remote.undo.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_recovery_contributed_destination", message: "x",
    context: { code: "place_recovery_contributed_destination", plans: [{ id: "p", title: "Dental" }] } }));
  await openUndo();
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  expect(ui.alerts()).toEqual(["A plan already saved money here “Dental” already made contributions into this place, so it can't be undone, even if the plan finished or was cancelled. Close it instead."]);
  expect(mounted!.routes()).toEqual(["index", "places", "account", "place-ending"]);
});

test.each([
  { blocker: { code: "place_recovery_contributed_destination", plans: [{ id: "p", title: "Dental" }] }, closeInstead: true,
    title: "A plan already saved money here",
    detail: "“Dental” already made contributions into this place, so it can't be undone, even if the plan finished or was cancelled. Close it instead." },
  { blocker: { code: "place_recovery_covered_expenses", plans: [{ id: "p", title: "Laptop" }] }, closeInstead: true,
    title: "A plan recovers an expense from this place",
    detail: "“Laptop” already has contributions for an expense paid from this place. Reversing it would break that plan, so close this place instead." },
  { blocker: { code: "place_recovery_destination", plans: [{ id: "p", title: "Emergency" }] }, closeInstead: false,
    title: "A Savings recovery plan uses it",
    detail: "“Emergency” save money into this place. Finish or cancel them in Savings recovery before undoing it." },
  { blocker: { code: "place_undo_ended_counterparty", places: [{ id: "old", name: "Old card" }] }, closeInstead: true,
    title: "A movement touches a closed place",
    detail: "Some movements also touch Old card, which is already closed, so they can't be reversed. Close this place instead." },
  { blocker: { code: "place_future_entries", latestAccountingDate: "2027-01-15" }, closeInstead: false,
    title: "It has a movement dated in the future",
    detail: "The latest is dated January 15, 2027. Wait until that day, or reverse that movement first." },
  { blocker: { code: "place_undo_invalid_entry", journalEntryId: "j42", reason: "category_nature_required" }, closeInstead: true,
    title: "A movement can't be reversed",
    detail: "It uses an old category that can no longer be reversed (movement j42). Close this place instead." },
  { blocker: { code: "place_ending_scan_limit" }, closeInstead: true, title: "It has too much history",
    detail: "It's more than we can check at once to undo it. Close it instead." },
  { blocker: { code: "place_undo_current_period_locked" }, closeInstead: false, title: "This month is closed",
    detail: "Undo reverses movements into the current month, so the month must be open." },
  { blocker: { code: "place_last_open" }, closeInstead: false, title: "It's your only open place",
    detail: "You always need at least one open place. Add another place first." },
])("Undo explains $blocker.code", async ({ blocker, closeInstead, title, detail }) => {
  remote.blockers = [blocker];
  await openUndo();
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "You can't undo Wallet yet", title, detail,
    ...(closeInstead ? ["Close it instead"] : []), "Go back"]);
  expect(ui.has("Place name to confirm")).toBe(false);
  if (closeInstead) {
    await ui.press("Close it instead");
    expect(ui.texts().slice(1, 2)).toEqual(["Where did the money go?"]);
  }
  expect(remote.undo).not.toHaveBeenCalled();
});

test("the Undo confirmation reads in Spanish and sends the Spanish prefix", async () => {
  remote.undo.mockResolvedValue(operation({ kind: "pending" }));
  await openUndo("es");
  expect(ui.texts()).toEqual([
    "CERRAR O DESHACER", "Deshacer Wallet",
    "Esto borra sus movimientos de tus reportes reversando cada uno. Los originales se quedan en el Historial, marcados como reversados. Los movimientos de meses que ya cerraste se reversan en este mes, y las transferencias con otros lugares también se reversan, así que sus saldos cambian.",
    "Esto reversa 7 movimientos.",
    "De esos, 3 son de meses cerrados y se reversan en este mes.",
    "Cambia el saldo de otros lugares:", "Savings", "+COP 25.000", "Visa", "−COP 2.500",
    "Este mes: gastos −COP 20.000, ingresos −COP 40.000.",
    "Por eso el gasto de este mes en tu Presupuesto puede quedar en negativo.",
    "Wallet queda en COP 0 y termina para siempre; no se puede volver a abrir.",
    "Empieza de una vez y sigue solo, por partes. Mientras tanto no puedes registrar nada nuevo en Wallet.",
    "Para confirmar, escribe Wallet",
    "Deshacer Wallet",
  ]);
  await ui.type("Nombre del lugar para confirmar", "wallet");
  await ui.press("Deshacer Wallet");
  expect(remote.undo.mock.calls[0]![0].reversalDescriptionPrefix).toBe("Reversión:");
});

test("backing out of Undo twice sends nothing and returns to the account page", async () => {
  mounted = await mountStack(router, () => createElement(PlaceEndingRoute));
  for (const _round of [1, 2]) {
    await ui.press("Undo Wallet");
    await settle();
    expect(ui.texts()[1]).toBe("Undo Wallet");
    await act(async () => { mounted!.stack.goBack(); });
    expect(ui.texts()[1]).toBe("What happened to Wallet?");
  }
  await act(async () => { mounted!.stack.goBack(); });
  expect(mounted!.routes()).toEqual(["index", "places", "account"]);
  expect(remote.undo).not.toHaveBeenCalled();
});
