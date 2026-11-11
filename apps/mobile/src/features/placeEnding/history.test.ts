import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import type { EntryDetail } from "../history/types";

const queries = vi.hoisted(() => ({ calls: [] as Array<[string, unknown]>, places: [] as unknown[] }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      const name = getFunctionName(ref);
      queries.calls.push([name, args]);
      if (name === "accounting:listFinancialAccountProfiles") return queries.places;
      if (name === "accounting:listUserCategories") return [];
      return undefined;
    },
  };
});
vi.mock("expo-router", () => ({ router: { back: vi.fn() }, Redirect: "Redirect", useLocalSearchParams: () => ({}) }));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", timeZone: "America/Bogota", functionalCurrency: "COP" }, financialAccountProfile: { id: "daily" } }),
}));
vi.mock("../history/usePostedHistory", () => ({ usePostedHistory: () => ({ rows: [], hasMore: false, loadingMore: false, loadMore: vi.fn() }) }));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ date: "2026-11-10" }) }));
vi.mock("../history/HistoryScreen", () => ({ HistoryScreen: "HistoryScreen" }));
vi.mock("../history/EntryDetailSheet", () => ({ EntryDetailSheet: "EntryDetailSheet" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@gorhom/bottom-sheet", () => import("../../ui/bottomSheet.testSupport"));
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "KeyboardAvoidingView",
  Text: "Text", View: "View", Pressable: "Pressable", ScrollView: "ScrollView", ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
import HistoryRoute from "../../../app/history";
import { EntryDetailScreen } from "../history/EntryDetailScreen";
import { reversalFailureMessage } from "../history/useReversal";
import { candidateErrorText, rejectionMessage } from "../posting/rejection";
import { LanguageProvider } from "../../i18n";
import type { PlaceProfile } from "./model";

const place = (id: string, name: string, status: PlaceProfile["status"]): PlaceProfile =>
  ({ id, workspaceId: "ws", name, productKind: "bankAccount", ledgerAccountId: `ledger-${id}`, status });
const expense = {
  entry: {
    id: "entry", policy: "cash-expense@1", description: "Groceries", accountingDate: "2026-10-17",
    accountingPeriod: { year: 2026, month: 10, status: "open" }, amount: { currency: "COP", minorUnits: 150000 },
    financialAccountProfileId: "daily", financialAccountProfileName: "Daily", postedBy: "owner", postedAt: 1, replay: false,
    lines: [{ ledgerAccountId: "expense", code: "5305", name: "Expense", nature: "Expense", debitMinorUnits: 150000, creditMinorUnits: 0,
      userCategories: [{ id: "food", name: "Food" }] }],
  },
  row: {
    id: "entry", title: "Groceries", date: "2026-10-17", detail: "Food", reversed: false, financialAccountProfileId: "daily",
    userCategories: [{ id: "food", name: "Food" }], primaryUserCategoryId: "food", amount: { currency: "COP", minorUnits: -150000 },
  },
} satisfies EntryDetail;
const transfer = {
  entry: { ...expense.entry, policy: "account-transfer@1", description: "To savings", lines: [] },
  row: { ...expense.row, title: "To savings", userCategories: [], primaryUserCategoryId: undefined,
    transfer: { from: { id: "daily", name: "Daily" }, to: { id: "savings", name: "Savings" } } },
} satisfies EntryDetail;

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queries.calls = [];
  queries.places = [];
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
const texts = () => root!.root.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
const buttons = () => root!.root.findAll((node) => String(node.type) === "Pressable").map((node) => node.props.accessibilityLabel);
async function detail(entry: EntryDetail, places: PlaceProfile[], language?: "es") {
  const screen = createElement(EntryDetailScreen, { detail: entry, reversal: { kind: "idle" }, places,
    onBack: vi.fn(), onEntry: vi.fn(), onReverse: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn() });
  await act(async () => { root = create(language ? createElement(LanguageProvider, { initialPreference: language }, screen) : screen); });
}

test("an entry of a closed Place names it as closed and offers no reversal, saying why", async () => {
  await detail(expense, [place("daily", "Daily", "closed")]);
  expect(texts()).toContain("Daily (closed)");
  expect(texts()).toContain("This movement touches Daily, which is closed. Movements of a closed place can't be reversed.");
  expect(buttons()).not.toContain("Reverse entry");
});

test("a transfer touching a Place being undone names it and waits for the Undo to finish", async () => {
  await detail(transfer, [place("daily", "Daily", "open"), place("savings", "Savings", "undoing")]);
  expect(texts()).toEqual(expect.arrayContaining(["Daily", "Savings (being undone)",
    "This movement touches Savings, which is being undone. Wait for it to finish."]));
  expect(buttons()).not.toContain("Reverse entry");
});

test("an entry whose Places are all open can still be reversed", async () => {
  await detail(transfer, [place("daily", "Daily", "open"), place("savings", "Savings", "open")]);
  expect(buttons()).toContain("Reverse entry");
  expect(texts()).not.toContain("Daily (closed)");
});

test("entry detail reads in Spanish for a closed Place", async () => {
  await detail(transfer, [place("daily", "Daily", "open"), place("savings", "Savings", "undone")], "es");
  expect(texts()).toEqual(expect.arrayContaining(["Savings (cerrado)",
    "Este movimiento toca Savings, que está cerrado. Los movimientos de un lugar cerrado no se pueden reversar."]));
  expect(buttons()).not.toContain("Reversar movimiento");
});

test("History reads every Place and names ended ones in its rows and filters", async () => {
  queries.places = [place("daily", "Daily", "open"), place("wallet", "Wallet", "closed"), place("card", "Card", "undoing")];
  await act(async () => { root = create(createElement(HistoryRoute)); });
  expect(queries.calls.filter(([name]) => name === "accounting:listFinancialAccountProfiles").map(([, args]) => args))
    .toContainEqual({ workspaceId: "ws", status: "all" });
  const screen = root!.root.find((node) => String(node.type) === "HistoryScreen");
  expect((screen.props.places as PlaceProfile[]).map((item) => item.name)).toEqual(["Daily", "Wallet (closed)", "Card (being undone)"]);
});

test("the refusals for ended and undoing Places have their own messages in both languages", () => {
  const ended = new ConvexError({ kind: "accounting", code: "financial_account_profile_ended", message: "This Place has ended. Choose an open Place" });
  const undoing = new ConvexError({ kind: "accounting", code: "place_undo_in_progress", message: "A Place is being undone. Wait for it to finish" });
  const en = createTranslator("en");
  const es = createTranslator("es");
  expect(reversalFailureMessage(ended, en)).toBe("That place is closed. Choose another open place.");
  expect(reversalFailureMessage(undoing, es)).toBe("Ese lugar se está deshaciendo y no recibe movimientos nuevos. Elige otro lugar.");
  expect(rejectionMessage(en.t, undoing, "posting.rejectProfileNotFound"))
    .toBe("That place is being undone and takes no new movements. Choose another place.");
  expect(candidateErrorText(es.t, "This Place has ended. Choose an open Place")).toBe("Ese lugar está cerrado. Elige otro lugar abierto.");
});
