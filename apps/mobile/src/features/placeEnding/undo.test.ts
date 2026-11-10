vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
import * as React from "react";
import { createElement } from "react";
import { act, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { emptyState } from "../intake/durableState";
import { mountStack, screenHelpers, settle } from "./flow.testSupport";

const phone = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => phone.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { phone.set(key, value); },
  deleteItemAsync: async (key: string) => { phone.delete(key); },
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
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => () => false }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
const intake = vi.hoisted(() => ({
  snapshot: { state: null as unknown, status: null, error: "", loaded: true, wipePending: false, drain: null },
  service: { listSources: async () => [] },
}));
vi.mock("../intake/IntakeProvider", () => ({ useIntakeService: () => intake.service, useIntakeSnapshot: () => intake.snapshot }));
type Money = { currency: string; minorUnits: number };
type Snapshot = {
  fingerprint: string; entriesToReverse: number; lockedMonthEntries: number; earlierOpenMonthEntries: number;
  otherPlaces: Array<{ financialAccountProfileId: string; name: string; balanceChange: Money }>;
  currentMonthExpenseChange: Money; currentMonthIncomeChange: Money;
};
const remote = vi.hoisted(() => ({
  places: [] as unknown[], closure: null as unknown, blockers: [] as unknown[], snapshot: null as unknown,
  close: vi.fn(), undo: vi.fn(), pages: vi.fn(), version: 0, listeners: new Set<() => void>(),
}));
function serverChange(change: () => void) {
  change();
  remote.version++;
  for (const listener of remote.listeners) listener();
}
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ date: "2026-11-10", month: "2026-11", now: new Date() }) }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => { remote.listeners.add(listener); return () => { remote.listeners.delete(listener); }; };
  const preview = () => {
    const current = remote.snapshot as Snapshot | null;
    return { fingerprint: current?.fingerprint ?? "", snapshot: current, closure: remote.closure, canUndo: remote.blockers.length === 0,
      blockers: remote.blockers, operation: null,
      // A single page of a larger ledger: the confirmation must not mistake it for the whole preview.
      page: { entriesToReverse: 1, alreadyReversed: 0, lockedMonthEntries: 0, earlierOpenMonthEntries: 0, otherPlaces: [],
        currentMonthExpenseChange: { currency: "COP", minorUnits: 0 }, currentMonthIncomeChange: { currency: "COP", minorUnits: 0 },
        scannedLines: 10, isDone: false, continueCursor: "c1" } };
  };
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      useSyncExternalStore(subscribe, () => remote.version);
      if (args === "skip") return undefined;
      const name = getFunctionName(ref);
      if (name === "accounting:listFinancialAccountProfiles") return remote.places;
      if (name === "accounting:placeClosure") return remote.closure;
      if (name === "accounting:previewUndoPlace") return preview();
      if (name === "accounting:listUserCategories") return [];
      return undefined;
    },
    useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "accounting:closePlace" ? remote.close : remote.undo,
    useConvex: () => ({ query: remote.pages }),
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
function snapshot(values: Partial<Snapshot> = {}): Snapshot {
  return { fingerprint: "reviewed-snapshot", entriesToReverse: 7, lockedMonthEntries: 2, earlierOpenMonthEntries: 1,
    otherPlaces: [{ financialAccountProfileId: "savings", name: "Savings", balanceChange: cop(2_500_000) },
      { financialAccountProfileId: "visa", name: "Visa", balanceChange: cop(-250_000) }],
    currentMonthExpenseChange: cop(-2_000_000), currentMonthIncomeChange: cop(-4_000_000), ...values };
}

let mounted: Awaited<ReturnType<typeof mountStack>> | undefined;
const ui = screenHelpers(() => mounted!.root as ReactTestRenderer);
beforeEach(() => {
  phone.clear();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  keys.next = 0;
  intake.snapshot = { ...intake.snapshot, state: emptyState(), loaded: true, error: "" };
  remote.places = [profile("wallet", "Wallet"), profile("daily", "Daily"), profile("savings", "Savings")];
  remote.closure = closure();
  remote.blockers = [];
  remote.snapshot = snapshot();
  remote.close.mockReset();
  remote.undo.mockReset();
  remote.pages.mockReset();
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
const warning = "Nothing is erased: the originals stay in History, marked as reversed, and earlier months keep the results they had. Each reversal is a new movement in this month, so this month's spending and income can change and its Budget spending can go negative. Transfers with other places are reversed too, which changes their balances.";
const changedNotice = "This place's movements changed, so the numbers were refreshed. Check them and type the name again.";

test("the confirmation states the whole preview of one read: movements, closed and still-open earlier months, other places and this month", async () => {
  await openUndo();
  expect(ui.texts()).toEqual([
    "CLOSE OR UNDO", "Undo Wallet", warning,
    "This reverses 7 movements.",
    "Of these, 2 are from months you already closed.",
    "Of these, 1 is from an earlier month that's still open.",
    "Those months keep the results they had; their reversals are recorded in this month.",
    "Other places' balances change by:", "Savings", "+COP 25.000", "Visa", "−COP 2.500",
    "This month: spending −COP 20.000, income −COP 40.000.",
    "So this month's Budget spending can go negative.",
    "Wallet goes to COP 0 and ends for good; it can't be reopened.",
    "It starts right away and keeps going on its own, in batches. Meanwhile nothing new can be recorded in Wallet.",
    "To confirm, type Wallet",
    "Undo Wallet",
  ]);
  expect(remote.pages).not.toHaveBeenCalled();
});

test("only transfers and current-month movements leave out the earlier-month and Budget lines", async () => {
  remote.snapshot = snapshot({ entriesToReverse: 1, lockedMonthEntries: 0, earlierOpenMonthEntries: 0, otherPlaces: [],
    currentMonthExpenseChange: cop(0), currentMonthIncomeChange: cop(150_000) });
  await openUndo();
  expect(ui.texts().slice(3, 6)).toEqual(["This reverses 1 movement.", "No other place's balance changes.",
    "This month: spending COP 0, income +COP 1.500."]);
  expect(ui.texts()).not.toContain("So this month's Budget spending can go negative.");
});

test("a preview that changes while the confirmation is open refreshes its numbers, clears the typed name and says why", async () => {
  remote.undo.mockResolvedValue(operation({ kind: "pending" }));
  await openUndo();
  await ui.type("Place name to confirm", "Wallet");
  expect(ui.disabled("Undo Wallet")).toBe(false);
  await act(async () => serverChange(() => { remote.snapshot = snapshot({ fingerprint: "after-a-new-expense", entriesToReverse: 8 }); }));
  expect(ui.texts().slice(1, 5)).toEqual(["Undo Wallet", changedNotice, warning, "This reverses 8 movements."]);
  expect(ui.input("Place name to confirm").props.value).toBe("");
  expect(ui.disabled("Undo Wallet")).toBe(true);
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  expect(remote.undo.mock.calls.map(([request]) => request.previewFingerprint)).toEqual(["after-a-new-expense"]);
});

test("a preview that changes before the confirmation opens needs no notice", async () => {
  remote.closure = closure({ isDefault: true, requiresReplacementDefault: true });
  await openUndo();
  await act(async () => serverChange(() => { remote.snapshot = snapshot({ fingerprint: "changed-earlier", entriesToReverse: 9 }); }));
  await ui.press("Daily");
  await ui.press("Continue");
  expect(ui.texts().slice(2, 4)).toEqual([warning, "This reverses 9 movements."]);
});

test("a start refused as stale after the new preview arrived asks again with the new numbers and the typed name", async () => {
  remote.undo.mockImplementationOnce(async () => {
    serverChange(() => { remote.snapshot = snapshot({ fingerprint: "newer", entriesToReverse: 6 }); });
    throw new ConvexError({ kind: "accounting", code: "place_undo_preview_stale", message: "x" });
  }).mockResolvedValueOnce(operation({ kind: "pending" }));
  await openUndo();
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  expect(ui.texts().slice(1, 5)).toEqual(["Undo Wallet", changedNotice, warning, "This reverses 6 movements."]);
  expect(ui.alerts()).toEqual([changedNotice]);
  expect(ui.input("Place name to confirm").props.value).toBe("");
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  expect(remote.undo.mock.calls.map(([request]) => [request.idempotencyKey, request.previewFingerprint]))
    .toEqual([["key-1", "reviewed-snapshot"], ["key-2", "newer"]]);
  expect(mounted!.routes()).toEqual(["index", "places", "account"]);
});

test("a start refused as stale before the new preview arrives blocks starting until it does", async () => {
  remote.undo.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_undo_preview_stale", message: "x" }));
  await openUndo();
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  expect(ui.alerts()).toEqual(["This place's movements changed before the undo started, so nothing started. Getting the new numbers…"]);
  expect(ui.disabled("Undo Wallet")).toBe(true);
  await act(async () => serverChange(() => { remote.snapshot = snapshot({ fingerprint: "newer", entriesToReverse: 6 }); }));
  expect(ui.alerts()).toEqual([changedNotice]);
  expect(ui.texts()).toContain("This reverses 6 movements.");
  expect(remote.undo).toHaveBeenCalledTimes(1);
});

test("a new default place that closes before the start is marked, blocks it and is chosen again", async () => {
  remote.closure = closure({ isDefault: true, requiresReplacementDefault: true });
  remote.undo.mockResolvedValue(operation({ kind: "pending" }));
  await openUndo();
  await ui.press("Daily");
  await ui.press("Continue");
  await ui.type("Place name to confirm", "Wallet");
  await act(async () => serverChange(() => { remote.places = [profile("wallet", "Wallet"), profile("daily", "Daily", "closed"), profile("savings", "Savings")]; }));
  expect(ui.texts()).toContain("Daily (closed) can't become your default place anymore");
  expect(ui.disabled("Undo Wallet")).toBe(true);
  await ui.row("Daily (closed) can't become your default place anymore");
  expect(ui.has("Daily")).toBe(false);
  await ui.press("Savings");
  await ui.press("Continue");
  expect(ui.texts()).toContain("Savings becomes your default place.");
  await ui.press("Undo Wallet");
  expect(remote.undo.mock.calls[0]![0]).toMatchObject({ replacementDefaultFinancialAccountProfileId: "savings", previewFingerprint: "reviewed-snapshot" });
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
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", previewFingerprint: "reviewed-snapshot", reversalDescriptionPrefix: "Reversal:",
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
  expect(remote.undo.mock.calls[0]![0]).toEqual({ workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", previewFingerprint: "reviewed-snapshot",
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
    "No se borra nada: los originales se quedan en el Historial, marcados como reversados, y los meses anteriores conservan los resultados que tenían. Cada reversión es un movimiento nuevo de este mes, así que los gastos y los ingresos de este mes pueden cambiar y el gasto de tu Presupuesto de este mes puede quedar en negativo. Las transferencias con otros lugares también se reversan, y eso cambia sus saldos.",
    "Esto reversa 7 movimientos.",
    "De esos, 2 son de meses que ya cerraste.",
    "De esos, 1 es de un mes anterior que sigue abierto.",
    "Esos meses conservan los resultados que tenían; sus reversiones se registran en este mes.",
    "El saldo de otros lugares cambia en:", "Savings", "+COP 25.000", "Visa", "−COP 2.500",
    "Este mes: gastos −COP 20.000, ingresos −COP 40.000.",
    "Por eso el gasto de este mes en tu Presupuesto puede quedar en negativo.",
    "Wallet queda en COP 0 y termina para siempre; no se puede volver a abrir.",
    "Empieza de una vez y sigue solo, por partes. Mientras tanto no puedes registrar nada nuevo en Wallet.",
    "Para confirmar, escribe Wallet",
    "Deshacer Wallet",
  ]);
  await act(async () => serverChange(() => { remote.snapshot = snapshot({ fingerprint: "otra", entriesToReverse: 8 }); }));
  expect(ui.alerts()).toEqual(["Los movimientos de este lugar cambiaron, así que actualizamos las cifras. Revísalas y vuelve a escribir el nombre."]);
  await ui.type("Nombre del lugar para confirmar", "wallet");
  await ui.press("Deshacer Wallet");
  expect(remote.undo.mock.calls[0]![0]).toMatchObject({ reversalDescriptionPrefix: "Reversión:", previewFingerprint: "otra" });
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

const storedKey = "lukapp.placeEnding.unresolved.owner";
test("an unconfirmed start survives a restart and resends the identical request, then follows it on the Place's page", async () => {
  remote.closure = closure({ isDefault: true, requiresReplacementDefault: true });
  remote.undo.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(operation({ kind: "running" }));
  await openUndo();
  await ui.press("Daily");
  await ui.press("Continue");
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  await settle();
  const sent = { workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "key-1", previewFingerprint: "reviewed-snapshot",
    reversalDescriptionPrefix: "Reversal:", replacementDefaultFinancialAccountProfileId: "daily" };
  expect(JSON.parse(phone.get(storedKey)!)).toEqual({ v: 1, endings: [{ act: "undo", request: sent }] });
  await act(async () => mounted!.root.unmount());
  mounted = await mountStack(router, () => createElement(PlaceEndingRoute));
  await settle();
  expect(ui.texts()).toEqual(["CLOSE OR UNDO", "We couldn't confirm whether Wallet started undoing",
    "The undo was sent, but its answer never reached this phone, so it may already have started. Send it again exactly as it was: if it started, you'll follow it on this place's page; if not, it starts now.",
    "Daily becomes your default place.", "Send it again"]);
  await ui.press("Send it again");
  await settle();
  expect(remote.undo.mock.calls).toEqual([[sent], [sent]]);
  expect(phone.has(storedKey)).toBe(false);
  expect(mounted!.routes()).toEqual(["index", "places", "account"]);
});

test("a resent start refused as stale is forgotten and a fresh confirmation follows", async () => {
  phone.set(storedKey, JSON.stringify({ v: 1, endings: [{ act: "undo", request: { workspaceId: "ws", financialAccountProfileId: "wallet",
    idempotencyKey: "old", previewFingerprint: "old-snapshot", reversalDescriptionPrefix: "Reversal:" } }] }));
  remote.undo.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_undo_preview_stale", message: "x" }))
    .mockResolvedValueOnce(operation({ kind: "pending" }));
  mounted = await mountStack(router, () => createElement(PlaceEndingRoute));
  await settle();
  await ui.press("Send it again");
  await settle();
  expect(phone.has(storedKey)).toBe(false);
  expect(ui.texts().slice(1, 3)).toEqual(["What happened to Wallet?",
    "It didn't start undoing because this place's movements changed since. Start a new review."]);
  await ui.press("Undo Wallet");
  await settle();
  await ui.type("Place name to confirm", "Wallet");
  await ui.press("Undo Wallet");
  expect(remote.undo.mock.calls.map(([request]) => [request.idempotencyKey, request.previewFingerprint]))
    .toEqual([["old", "old-snapshot"], ["key-1", "reviewed-snapshot"]]);
});
