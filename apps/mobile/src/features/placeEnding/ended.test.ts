import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Place } from "../places/model";

type Status = "open" | "undoing" | "closed" | "undone";
const state = vi.hoisted(() => ({
  push: vi.fn(), back: vi.fn(), profileId: "wallet", abort: vi.fn(),
  accounts: [] as Place[], statuses: {} as Record<string, Status>, endedAt: {} as Record<string, number>, undo: {} as Record<string, unknown>,
}));
vi.mock("expo-router", () => ({
  router: { push: state.push, back: state.back }, Redirect: "Redirect", useLocalSearchParams: () => ({ profileId: state.profileId }),
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useAction: (ref: Parameters<typeof getFunctionName>[0]) => getFunctionName(ref) === "accounting:abortUndoPlace" ? state.abort : vi.fn(),
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(ref);
      if (name === "accounting:listFinancialAccountProfiles") return state.accounts.map((account) => ({
        id: account.financialAccountProfileId, workspaceId: "ws", name: account.name, productKind: account.productKind,
        ledgerAccountId: "ledger", status: state.statuses[account.financialAccountProfileId] ?? "open",
        ...(state.endedAt[account.financialAccountProfileId] ? { endedAt: state.endedAt[account.financialAccountProfileId] } : {}) }));
      if (name === "accounting:placeUndoStatus") return state.undo[(args as { financialAccountProfileId: string }).financialAccountProfileId] ?? null;
      return { jars: [], removedLimits: [] };
    },
  };
});
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ month: "2026-11" }) }));
vi.mock("../HomePlaceSetup", () => ({ HomePlaceSetup: "AddPlace" }));
vi.mock("../places/EmojiSheet", () => ({ EmojiSheet: "EmojiSheet" }));
vi.mock("../places/RenameSheet", () => ({ RenameSheet: "RenameSheet" }));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", functionalCurrency: "COP", timeZone: "America/Bogota" },
    financialAccountProfile: { id: "daily" } }),
  usePostedActivity: (_workspaceId: string, _timeZone: string, status?: string) => ({
    accounts: status === "all" ? state.accounts : state.accounts.filter((account) => (state.statuses[account.financialAccountProfileId] ?? "open") === "open"),
  }),
  useRecentActivity: () => ({ page: [] }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
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
  Text: "Text", View: "View", Pressable: "Pressable", ScrollView: "ScrollView", ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
import AccountRoute from "../../../app/account";
import PlacesRoute from "../../../app/places";
import { LanguageProvider } from "../../i18n";
import { ListRow } from "../../ui/core";

const place = (id: string, name: string, minorUnits = 0, extra: Partial<Place> = {}): Place => ({
  status: "open", financialAccountProfileId: id, name, nature: "Asset", productKind: "bankAccount", trackingFrom: "2026-09-24",
  balance: { currency: "COP", minorUnits }, ...extra });
const cop = (minorUnits: number) => ({ currency: "COP", minorUnits });
const started = {
  fingerprint: "f", entriesToReverse: 7, lockedMonthEntries: 2, earlierOpenMonthEntries: 1,
  otherPlaces: [{ financialAccountProfileId: "daily", name: "Daily", balanceChange: cop(2_500_000) }],
  currentMonthExpenseChange: cop(-2_000_000), currentMonthIncomeChange: cop(0),
};
const nov8 = Date.UTC(2026, 10, 8, 15, 0);
const operation = (status: unknown, reversedCount = 0, extra: Record<string, unknown> = {}) =>
  ({ id: "op", state: status, reversedCount, hasReversedEntries: reversedCount > 0, alreadyReversedCount: 0,
    startedAt: nov8, totalEntriesToReverse: 7, startedPreview: started, ...extra });
const nov9 = Date.UTC(2026, 10, 9, 17, 0);
const retryAt = Date.UTC(2026, 10, 10, 20, 30);

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  phone.clear();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.profileId = "wallet";
  state.accounts = [place("daily", "Daily", 10_000), place("wallet", "Wallet")];
  state.statuses = {};
  state.endedAt = {};
  state.undo = {};
  state.abort.mockReset();
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(screen: typeof AccountRoute, language?: "es") {
  await act(async () => {
    root = create(language ? createElement(LanguageProvider, { initialPreference: language }, createElement(screen)) : createElement(screen));
  });
}
const texts = () => root!.root.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
const buttons = () => root!.root.findAll((node) => String(node.type) === "Pressable").map((node) => node.props.accessibilityLabel);
const nameRow = () => root!.root.find((node) => node.type === ListRow && node.props.title === "Name");

test("an open Place offers a quiet way to end it, opened above its own page", async () => {
  await render(AccountRoute);
  expect(texts().at(-1)).toBe("Close or undo this place");
  await act(async () => root!.root.find((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel === "Close or undo this place").props.onPress());
  expect(state.push.mock.calls).toEqual([[{ pathname: "/place-ending", params: { profileId: "wallet" } }]]);
});

test("a closed Place keeps its history but offers no rename, look, default or ending", async () => {
  state.statuses = { wallet: "closed" };
  state.profileId = "wallet";
  await render(AccountRoute);
  expect(texts()).toContain("This place is closed. Its history stays here, but nothing new can be recorded in it.");
  expect(buttons()).not.toContain("Change look");
  expect(buttons()).not.toContain("Close or undo this place");
  expect(buttons()).toContain("See in history");
  expect(nameRow().props.onPress).toBeUndefined();
});

test("the closed Default badge and the sole-place name follow open Places only", async () => {
  state.accounts = [place("daily", "My money", 10_000), place("wallet", "Wallet")];
  state.statuses = { wallet: "closed" };
  state.profileId = "daily";
  await render(AccountRoute, "es");
  expect(texts().slice(0, 2)).toEqual(["LUGAR", "Mi plata"]);
  expect(texts()).not.toContain("Por defecto");
});

const startedLines = ["Started on November 8, 2026 to reverse 7 movements.", "This month: spending −COP 20.000, income COP 0.",
  "Other places' balances change by:", "Daily", "+COP 25.000"];
test.each([
  { name: "running", status: "undoing" as const, operation: operation({ kind: "running" }, 3),
    shown: ["Undoing this place", "3 of 7 movements reversed", "It keeps going even if you close the app. Meanwhile nothing new can be recorded here.",
      ...startedLines] },
  { name: "paused", status: "undoing" as const, operation: operation({ kind: "paused", code: "locked_period", detail: "Period 2026-11 is locked", retryAt }, 1),
    shown: ["Paused", "This month is closed, and undoing needs it open.", "It tries again on its own at Nov 10, 2026, 3:30 PM.", "1 of 7 movements reversed",
      ...startedLines, "For support: locked_period. Period 2026-11 is locked"] },
  { name: "needs attention with nothing reversed", status: "undoing" as const,
    operation: operation({ kind: "needs_attention", code: "category_not_found", detail: "Category missing", journalEntryId: "j7" }),
    shown: ["Needs attention", "A movement uses a category that can't be reversed.", "No movement has been reversed yet.",
      "Your movements are as they were, but the place stays locked until the problem is fixed or you cancel the undo.", ...startedLines,
      "For support: category_not_found. Category missing", "Movement: j7",
      "Nothing has been reversed, so you can cancel this undo. Wallet becomes an open place again, with its movements as they were."] },
  { name: "needs attention after reversing some", status: "undoing" as const,
    operation: operation({ kind: "needs_attention", code: "place_undo_stalled", detail: "No progress" }, 4),
    shown: ["Needs attention", "It stopped making progress and didn't recover on its own.", "4 of 7 movements reversed",
      "Part of it was already reversed, so the place stays in progress and can't be used. It didn't finish; it needs a review.",
      ...startedLines, "For support: place_undo_stalled. No progress", "Tell us through Report a problem and include this detail."] },
  { name: "done", status: "undone" as const, operation: operation({ kind: "done", endingId: "e", completedAt: nov9 }, 7),
    shown: ["Undone on November 9, 2026", "Undone", "Undone on November 9, 2026.", "7 of 7 movements reversed", ...startedLines] },
])("the account page shows an Undo that is $name from its own receipt, and the same after the app restarts", async ({ status, operation, shown }) => {
  state.statuses = { wallet: status };
  if (status === "undone") state.endedAt = { wallet: nov9 };
  state.undo = { wallet: operation };
  await render(AccountRoute);
  const before = texts();
  expect(before).toEqual(expect.arrayContaining(shown));
  expect(before).toContain(status === "undoing" ? "While it's being undone, nothing new can be recorded in this place."
    : "This place was undone: every movement in it was reversed. Its history stays here, but nothing new can be recorded in it.");
  expect(buttons()).not.toContain("Close or undo this place");
  await act(async () => root!.unmount());
  await render(AccountRoute);
  expect(texts()).toEqual(before);
});

test("an Undo started before receipts recorded their preview shows only what it knows", async () => {
  state.statuses = { wallet: "undoing" };
  state.undo = { wallet: operation({ kind: "running" }, 2, { totalEntriesToReverse: undefined, startedPreview: undefined }) };
  await render(AccountRoute);
  expect(texts()).toEqual(expect.arrayContaining(["2 movements reversed", "Started on November 8, 2026."]));
  expect(texts()).not.toContain("Other places' balances change by:");
});

test.each([
  ["place_undo_current_period_locked", "This month is closed, and undoing needs it open.", "Este mes está cerrado y para deshacer tiene que estar abierto."],
  ["locked_period", "This month is closed, and undoing needs it open.", "Este mes está cerrado y para deshacer tiene que estar abierto."],
  ["ledger_summary_not_ready", "Totals are still being prepared.", "Los totales todavía se están preparando."],
  ["reversal_date_before_original", "A movement has a date that can't be reversed yet.", "Un movimiento tiene una fecha que todavía no se puede reversar."],
  ["activity_before_opening", "A movement has a date that can't be reversed yet.", "Un movimiento tiene una fecha que todavía no se puede reversar."],
  ["place_undo_stalled", "It stopped making progress and didn't recover on its own.", "Dejó de avanzar y no se recuperó solo."],
  ["place_undo_unexpected_failure", "Something unexpected stopped it.", "Algo inesperado lo detuvo."],
  ["financial_account_profile_ended", "A movement touches a place that was closed meanwhile.", "Un movimiento toca un lugar que se cerró mientras tanto."],
  ["place_undo_in_progress", "A movement touches another place that's being undone.", "Un movimiento toca otro lugar que se está deshaciendo."],
  ["ledger_totals_out_of_range", "Reversing a movement would go past the totals the app can store.", "Reversar un movimiento pasaría los totales que la app puede guardar."],
  ["category_nature_required", "A movement uses a category that can't be reversed.", "Un movimiento usa una categoría que no se puede reversar."],
  ["posted_journal_entry_unbalanced", "Some of this place's records need a repair before they can be reversed.", "Algunos registros de este lugar necesitan una reparación antes de poder reversarse."],
  ["place_undo_balance_not_zero", "Some movements are still not reversed, so it couldn't finish.", "Todavía quedan movimientos sin reversar, así que no pudo terminar."],
  ["expense_not_recoverable", "A Savings recovery plan stopped a reversal.", "Un plan de Recuperar ahorros detuvo una reversión."],
  ["a_code_from_next_year", "Something stopped it.", "Algo lo detuvo."],
])("the reason %s reads in both languages, with the backend's detail kept for support", async (code, en, es) => {
  state.statuses = { wallet: "undoing" };
  state.undo = { wallet: operation({ kind: "needs_attention", code, detail: "raw detail" }, 1) };
  await render(AccountRoute);
  expect(texts()).toEqual(expect.arrayContaining([en, `For support: ${code}. raw detail`]));
  await act(async () => root!.unmount());
  await render(AccountRoute, "es");
  expect(texts()).toEqual(expect.arrayContaining([es, `Para soporte: ${code}. raw detail`]));
});

test.each([
  { name: "pending", operation: operation({ kind: "pending" }) },
  { name: "running", operation: operation({ kind: "running" }) },
  { name: "paused", operation: operation({ kind: "paused", code: "locked_period", detail: "x", retryAt }) },
  { name: "needs attention after a reversal", operation: operation({ kind: "needs_attention", code: "place_undo_stalled", detail: "x" }, 1) },
])("cancelling is not offered while an Undo is $name", async ({ operation }) => {
  state.statuses = { wallet: "undoing" };
  state.undo = { wallet: operation };
  await render(AccountRoute);
  expect(buttons()).not.toContain("Cancel the undo");
});

const abortButton = () => root!.root.find((node) => String(node.type) === "Pressable"
  && (node.props.accessibilityLabel === "Cancel the undo" || node.props.accessibilityLabel === "Retry cancelling"));
const attention = (extra: Record<string, unknown> = {}) => operation({ kind: "needs_attention", code: "place_undo_unexpected_failure", detail: "x" }, 0, extra);

test.each([
  { name: "restored", restored: true, replacement: "daily", lines: ["Wallet is your default place again."] },
  { name: "left as changed", restored: false, replacement: "daily", lines: ["Your default place stays as you changed it."] },
  { name: "never replaced", restored: false, replacement: undefined, lines: [] },
])("cancelling an Undo that reversed nothing reopens the place and says what happened to the default ($name)", async ({ restored, replacement, lines }) => {
  state.statuses = { wallet: "undoing" };
  state.undo = { wallet: attention(replacement ? { replacementDefaultFinancialAccountProfileId: replacement } : {}) };
  state.abort.mockImplementation(async () => {
    state.statuses = { wallet: "open" };
    return { operation: attention({ state: { kind: "aborted", abortedAt: nov9, abortedBy: "owner", defaultRestored: restored },
      ...(replacement ? { replacementDefaultFinancialAccountProfileId: replacement } : {}) }), replay: false };
  });
  await render(AccountRoute);
  expect(texts()).toEqual(expect.arrayContaining(["Nothing has been reversed, so you can cancel this undo. Wallet becomes an open place again, with its movements as they were.",
    ...(replacement ? ["Wallet also becomes your default place again, unless you changed your default since."] : [])]));
  await act(async () => abortButton().props.onPress());
  expect(state.abort.mock.calls).toEqual([[{ workspaceId: "ws", operationId: "op" }]]);
  expect(texts()).toEqual(expect.arrayContaining(["Cancelled before anything changed", "Cancelled on November 9, 2026. The place is open again.", ...lines]));
  expect(buttons()).toContain("Close or undo this place");
});

test("a cancel whose outcome is unknown retries the same request, and a refusal says why", async () => {
  state.statuses = { wallet: "undoing" };
  state.undo = { wallet: attention() };
  state.abort.mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "place_undo_abort_forbidden", message: "x" }));
  await render(AccountRoute);
  await act(async () => abortButton().props.onPress());
  expect(texts()).toContain("We couldn't confirm whether the undo was cancelled. Retry: we send the same request and nothing happens twice.");
  await act(async () => abortButton().props.onPress());
  expect(state.abort.mock.calls).toEqual([[{ workspaceId: "ws", operationId: "op" }], [{ workspaceId: "ws", operationId: "op" }]]);
  expect(texts()).toContain("It can't be cancelled. Only the person who started this undo can cancel it, and only while it's stopped before reversing anything.");
});

test("the Places list counts open Places, follows an Undo's progress and lists ended Places with the day they ended", async () => {
  state.accounts = [place("daily", "Daily", 10_000), place("card", "Card", 5_000), place("wallet", "Wallet"), place("old", "Old")];
  state.statuses = { card: "undoing", wallet: "closed", old: "undone" };
  state.endedAt = { wallet: nov8, old: nov9 };
  state.undo = { card: operation({ kind: "running" }, 2) };
  await render(PlacesRoute);
  expect(texts()).toEqual(["ONE POOL", "Daily", "What you have now", "COP 150",
    "Bank and pocket are still one pool. Add a place when money lives apart.",
    "💰", "Daily", "COP 100",
    "💰", "Card", "Undoing this place · 2 of 7 movements reversed", "COP 50",
    "Add another place",
    "Closed places", "💰", "Wallet", "Closed on November 8, 2026", "💰", "Old", "Undone on November 9, 2026"]);
  await act(async () => root!.root.find((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel === "Wallet, Closed on November 8, 2026").props.onPress());
  expect(state.push.mock.calls).toEqual([[{ pathname: "/account", params: { profileId: "wallet" } }]]);
});

test("a closed Place's page says when it closed, in both languages", async () => {
  state.statuses = { wallet: "closed" };
  state.endedAt = { wallet: nov8 };
  await render(AccountRoute);
  expect(texts()).toContain("Closed on November 8, 2026");
  await act(async () => root!.unmount());
  await render(AccountRoute, "es");
  expect(texts()).toContain("Cerrado el 8 de noviembre de 2026");
});

test("the closed section reads in Spanish", async () => {
  state.accounts = [place("daily", "Daily", 10_000), place("savings", "Ahorros"), place("wallet", "Billetera")];
  state.statuses = { wallet: "closed" };
  await render(PlacesRoute, "es");
  expect(texts().slice(0, 2)).toEqual(["TUS LUGARES", "Lugares"]);
  expect(texts().slice(-5)).toEqual(["Agregar otro lugar", "Lugares cerrados", "💰", "Billetera", "Cerrado"]);
  state.endedAt = { wallet: nov9 };
  state.statuses = { wallet: "undone" };
  await act(async () => root!.unmount());
  await render(PlacesRoute, "es");
  expect(texts().slice(-2)).toEqual(["Billetera", "Deshecho el 9 de noviembre de 2026"]);
});

const storedKey = "lukapp.placeEnding.unresolved.owner";
const storedClose = { workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "k1", reviewedBalance: cop(5_000_000),
  reviewedAccountingDate: "2026-11-10", lines: [{ kind: "transfer", otherFinancialAccountProfileId: "daily", amount: cop(5_000_000), description: "Closing Wallet" }] };
const settleReads = async () => { await act(async () => { for (let index = 0; index < 50; index++) await Promise.resolve(); }); };

test("a Place's page shows an unconfirmed closing with what it contained and offers only to send it again", async () => {
  phone.set(storedKey, JSON.stringify({ v: 1, endings: [{ act: "close", request: storedClose }] }));
  await render(AccountRoute);
  await settleReads();
  expect(texts()).toEqual(expect.arrayContaining(["We couldn't confirm whether Wallet closed", "Recorded on November 10, 2026:",
    "Transfer to Daily", "COP 50.000", "See it and send it again"]));
  expect(buttons()).not.toContain("Close or undo this place");
  await act(async () => root!.root.find((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel === "See it and send it again").props.onPress());
  expect(state.push.mock.calls).toEqual([[{ pathname: "/place-ending", params: { profileId: "wallet" } }]]);
});

test.each([
  { name: "the Place is closed", status: "closed" as const, undo: null, act: "close", kept: false },
  { name: "the stored Undo is the one running", status: "undoing" as const, undo: operation({ kind: "running" }, 1, { idempotencyKey: "k1" }), act: "undo", kept: false },
  { name: "another Undo is running", status: "undoing" as const, undo: operation({ kind: "running" }, 1, { idempotencyKey: "other" }), act: "undo", kept: true },
])("the page forgets a stored request only once its outcome is known: $name", async ({ status, undo, act: kind, kept }) => {
  const request = kind === "close" ? storedClose
    : { workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "k1", previewFingerprint: "f", reversalDescriptionPrefix: "Reversal:" };
  phone.set(storedKey, JSON.stringify({ v: 1, endings: [{ act: kind, request }] }));
  state.statuses = { wallet: status };
  state.undo = undo ? { wallet: undo } : {};
  await render(AccountRoute);
  await settleReads();
  expect(phone.has(storedKey)).toBe(kept);
  expect(texts().includes("We couldn't confirm whether Wallet started undoing")).toBe(kept);
});

test("a stopped Undo with nothing reversed, its cancel and its receipt read in Spanish", async () => {
  state.statuses = { wallet: "undoing" };
  state.undo = { wallet: attention({ replacementDefaultFinancialAccountProfileId: "daily" }) };
  state.abort.mockImplementation(async () => {
    state.statuses = { wallet: "open" };
    return { operation: attention({ state: { kind: "aborted", abortedAt: nov9, abortedBy: "owner", defaultRestored: true },
      replacementDefaultFinancialAccountProfileId: "daily" }), replay: false };
  });
  await render(AccountRoute, "es");
  expect(texts()).toEqual(expect.arrayContaining(["Necesita atención", "Algo inesperado lo detuvo.", "Todavía no se ha reversado ningún movimiento.",
    "Tus movimientos siguen como estaban, pero el lugar queda bloqueado hasta que se arregle el problema o canceles la orden de deshacerlo.",
    "Empezó el 8 de noviembre de 2026 para reversar 7 movimientos.", "Para soporte: place_undo_unexpected_failure. x",
    "Todavía no se ha reversado nada, así que puedes cancelar esto. Wallet vuelve a ser un lugar abierto y sus movimientos quedan como estaban.",
    "Wallet también vuelve a ser tu lugar por defecto, salvo que hayas cambiado tu lugar por defecto desde entonces."]));
  await act(async () => root!.root.find((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel === "Cancelar y dejarlo abierto").props.onPress());
  expect(texts()).toEqual(expect.arrayContaining(["Se canceló antes de cambiar algo", "Se canceló el 9 de noviembre de 2026. El lugar quedó abierto otra vez.",
    "Wallet vuelve a ser tu lugar por defecto."]));
});

test("an Undo's progress reads in Spanish on the Places list", async () => {
  state.accounts = [place("daily", "Diario", 10_000), place("card", "Tarjeta", 5_000)];
  state.statuses = { card: "undoing" };
  state.undo = { card: operation({ kind: "running" }, 2) };
  await render(PlacesRoute, "es");
  expect(texts()).toContain("Deshaciendo este lugar · 2 de 7 movimientos reversados");
});
