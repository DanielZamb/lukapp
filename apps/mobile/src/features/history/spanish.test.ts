import * as React from "react";
import { ConvexError } from "convex/values";
import { createElement, type ReactElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { LanguageProvider } from "../../i18n";
import { EntryDetailScreen } from "./EntryDetailScreen";
import { dateRanges, filterHistory, historyDateLabel } from "./filter";
import { HistoryScreen } from "./HistoryScreen";
import { compactHistoryAmount, historyListRow } from "./listModel";
import type { EntryDetail, HistoryRow } from "./types";
import { reversalFailureMessage } from "./useReversal";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet", BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "calendar" }));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  Platform: { OS: "android" }, Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  FlatList: (props: {
    data: HistoryRow[]; ListHeaderComponent: ReactNode; ListFooterComponent: ReactNode; ListEmptyComponent: ReactNode;
    renderItem: (input: { item: HistoryRow; index: number }) => ReactNode;
  }) => createElement("list", null, props.ListHeaderComponent,
    props.data.length ? props.data.map((item, index) => createElement("article", { key: item.id }, props.renderItem({ item, index }))) : props.ListEmptyComponent,
    props.ListFooterComponent),
}));

const en = createTranslator("en");
const es = createTranslator("es");
const row = {
  id: "posted", title: "Mercado semanal", date: "2025-08-23", detail: "Comida",
  financialAccountProfileId: "cash", primaryUserCategoryId: "food", reversed: true,
  userCategories: [{ id: "food", name: "Comida" }],
  amount: { currency: "COP", minorUnits: -126425 },
} satisfies HistoryRow;
const categories = [{ id: "food", name: "Comida", style: { emoji: "🥑", tone: "primary" as const } }];
const places = [{ id: "cash", name: "Efectivo" }];
const detail = {
  entry: {
    id: "entry", policy: "cash-expense@1", description: "Mercado", accountingDate: "2026-10-17",
    accountingPeriod: { year: 2026, month: 10, status: "open" }, amount: { currency: "COP", minorUnits: 150000 },
    financialAccountProfileId: "cash", financialAccountProfileName: "Efectivo", postedBy: "owner", postedAt: 1, replay: false,
    lines: [{ ledgerAccountId: "internal-account", code: "53050501", name: "Internal expense account", nature: "Expense",
      debitMinorUnits: 150000, creditMinorUnits: 0, userCategories: [{ id: "food", name: "Comida" }] }],
  },
  row: {
    id: "entry", title: "Mercado", date: "2026-10-17", detail: "Comida", reversed: false,
    userCategories: [{ id: "food", name: "Comida" }], primaryUserCategoryId: "food",
    amount: { currency: "COP", minorUnits: -150000 },
  },
} satisfies EntryDetail;

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
async function inSpanish(element: ReactElement) {
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "es" }, element)); });
}
function text() { return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? ""; }
function labels() {
  return root?.root.findAll((node) => typeof node.props.accessibilityLabel === "string")
    .map((node) => node.props.accessibilityLabel as string) ?? [];
}

test("history dates read in each language and keep the workspace calendar day", () => {
  expect(historyDateLabel("2026-08-22", 2026, "en")).toBe("August 22");
  expect(historyDateLabel("2026-08-22", 2026, "es")).toBe("22 de agosto");
  expect(historyDateLabel("2025-12-31", 2026, "es")).toBe("31 de diciembre de 2025");
  expect(historyDateLabel("2026-01-01", 2026, "es")).toBe("1 de enero");
});

test("date ranges keep their ids and bounds and only the labels change language", () => {
  const english = dateRanges("2026-08-23", en);
  const spanish = dateRanges("2026-08-23", es);
  expect(spanish.map(({ label, ...range }) => range)).toEqual(english.map(({ label, ...range }) => range));
  expect(spanish.map((range) => range.label)).toEqual(["Todas las fechas", "Últimos 7 días", "Agosto", "Julio", "Junio"]);
});

test("search finds a row by its Spanish date words when reading in Spanish", () => {
  const query = { search: "agosto", profileIds: [], categoryIds: [], range: "all" as const, customFrom: null, customTo: null };
  expect(filterHistory([row], query, { today: "2026-08-23", language: "es", profileNames: {} })).toEqual([row]);
  expect(filterHistory([row], query, { today: "2026-08-23", language: "en", profileNames: {} })).toEqual([]);
});

test("list rows join stored names with the translated reversal status", () => {
  expect(historyListRow(row, categories, places, "2026-01-01", es).subtitle).toBe("23 de agosto de 2025 · 🥑 Comida · Efectivo · Reversado");
  expect(historyListRow(row, categories, places, "2026-01-01", en).subtitle).toBe("August 23, 2025 · 🥑 Comida · Efectivo · Reversed");
});

test.each([
  [150000, "$1.5K", "$1,5 mil"], [110000000, "$1.1M", "$1,1 M"], [99900, "$999", "$999"],
])("compact history amount %i reads %s and %s", (minorUnits, english, spanish) => {
  expect(compactHistoryAmount(minorUnits, "COP", "en")).toBe(english);
  expect(compactHistoryAmount(minorUnits, "COP", "es")).toBe(spanish);
});

test("reversal failures map each server code to a message in the reader's language", () => {
  const failure = (code: string) => new ConvexError({ kind: "accounting", code, message: "Journal Entry already reversed" });
  expect(reversalFailureMessage(failure("journal_entry_already_reversed"), es)).toBe("Este movimiento ya tiene una reversión. Abre la reversión vinculada.");
  expect(reversalFailureMessage(failure("reversal_cannot_be_reversed"), es)).toBe("Una reversión no se puede reversar. Mejor registra un movimiento nuevo.");
  expect(reversalFailureMessage(failure("locked_period"), es)).toBe("No pudimos hacer la reversión. Revisa el movimiento y que haya un mes abierto.");
  expect(reversalFailureMessage(new Error("offline"), es)).toBe("No pudimos confirmar la reversión. Reintenta: revisamos la misma reversión sin duplicarla.");
  expect(reversalFailureMessage(failure("journal_entry_already_reversed"), en)).toBe("This entry already has a reversal. Open its linked reversal.");
  expect(reversalFailureMessage(failure("locked_period"), es)).not.toContain("Journal Entry");
});

test("the History screen reads in Spanish with its filters and dates", async () => {
  const rows: HistoryRow[] = [{ ...row, date: "2026-10-17", reversed: false }];
  await inSpanish(createElement(HistoryScreen, {
    rows, scopedRows: undefined, total: 1, hasMore: true, loadingMore: false, onLoadMore: vi.fn(),
    categories, places, currentDate: "2026-10-18", currency: "COP", onEntry: vi.fn(), onBack: vi.fn(),
  }));
  const shown = text();
  for (const spanish of ["EN TODOS TUS LUGARES", "Historial", "Neto", "Sale", "Entra", "Todos los lugares", "Todas las categorías",
    "Fechas", "Más recientes primero", "1 de 1 cargados", "17 de octubre · 🥑 Comida · Efectivo", "Cargar más movimientos",
    "Los filtros y los totales cubren solo los movimientos cargados."])
    expect(shown).toContain(spanish);
  expect(labels()).toEqual(expect.arrayContaining(["Volver", "Buscar movimientos"]));
  for (const english of ["History", "ACROSS ALL PLACES", "All places", "Newest first", "loaded", "Load more", "October"])
    expect(`${shown}\n${labels().join("\n")}`).not.toContain(english);
});

test("the reversal confirmation says a new opposite movement is added and the original stays", async () => {
  const props = { detail, reversal: { kind: "confirming" } as const,
    onBack: vi.fn(), onEntry: vi.fn(), onReverse: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn() };
  await inSpanish(createElement(EntryDetailScreen, props));
  const shown = text();
  expect(shown).toContain("¿Reversar este movimiento?");
  expect(shown).toContain("Esto registra un movimiento nuevo en sentido contrario. El original no se borra: sigue en tu historial.");
  expect(shown).toContain("Categoría principal\nComida");
  expect(labels()).toEqual(expect.arrayContaining(["Sí, reversar", "No reversar"]));
  expect(shown).not.toMatch(/Reverse|Posted|Primary|keeps the original/);
  await act(async () => root?.update(createElement(LanguageProvider, { initialPreference: "es" },
    createElement(EntryDetailScreen, { ...props, reversal: { kind: "idle" } }))));
  expect(labels()).toContain("Reversar movimiento");
});
