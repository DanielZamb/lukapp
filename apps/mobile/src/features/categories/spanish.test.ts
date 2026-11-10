import * as React from "react";
import { ConvexError } from "convex/values";
import { createElement, createRef, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { createTranslator } from "../../../../../src/i18n";
import { LanguageProvider } from "../../i18n";
import { CategoryLookScreen } from "../categoryLook/CategoryLookScreen";
import { OverviewScreen } from "../overview/OverviewScreen";
import { CategorySheet, type CategorySheetProps } from "./CategorySheet";
import { categoryFailureMessage, type Category } from "./model";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native-gesture-handler", () => ({ ScrollView: "gesture-scroll" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet", BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
}));
vi.mock("convex/react", () => ({ useQuery: () => undefined, useAction: () => vi.fn() }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" }, KeyboardAvoidingView: "keyboard-viewport",
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

const en = createTranslator("en");
const es = createTranslator("es");
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
function sheet(overrides: Partial<CategorySheetProps>): CategorySheetProps {
  return {
    sheetRef: createRef<BottomSheetModal>(), search: "", options: [], editor: null,
    answer: null, suggested: null, allowed: ["spend", "receive", "stillMine", "payDebt"], onAnswer: vi.fn(),
    busy: false, error: "", canConfirm: false,
    onSearch: vi.fn(), onSelect: vi.fn(), onCreate: vi.fn(), onName: vi.fn(),
    onStyle: vi.fn(), onConfirm: vi.fn(), onDismiss: vi.fn(), ...overrides,
  };
}

test("category save failures map each server code to the reader's language", () => {
  const failure = (code: string) => new ConvexError({ kind: "accounting", code });
  expect(categoryFailureMessage(failure("category_name_conflict"), es)).toBe("Ya tienes una categoría con ese nombre.");
  expect(categoryFailureMessage(failure("category_name_too_long"), es)).toBe("Usa máximo 80 caracteres.");
  expect(categoryFailureMessage(failure("name_required"), es)).toBe("Escribe un nombre para la categoría.");
  expect(categoryFailureMessage(failure("category_not_found"), es)).toBe("Esta categoría ya no está disponible. Cierra el editor y elige otra.");
  expect(categoryFailureMessage(failure("something_new"), es)).toBe("No pudimos guardar el cambio. Intenta de nuevo.");
  expect(categoryFailureMessage(failure("category_name_conflict"), en)).toBe("You already have a category with that name.");
});

test("the new-category question asks what happens to the money in Spanish", async () => {
  await inSpanish(createElement(CategorySheet, sheet({
    editor: { kind: "custom", name: "Arriendo", answer: null, style: { emoji: "🏠", tone: "primary", color: "h270" } },
    suggested: "spend", answer: "spend",
  })));
  const shown = text();
  for (const spanish of ["¿Qué pasa con la plata?", "Lo sugerimos por el nombre. Puedes cambiarlo.", "Nombre de la categoría"])
    expect(shown).toContain(spanish);
  expect(labels()).toEqual(expect.arrayContaining(["La gasto", "Me llega", "Sigue siendo mía", "Pago una deuda", "Agregar categoría",
    "Emoji 🏠", "Elige cualquier emoji de tu teclado"]));
  expect(`${shown}\n${labels().join("\n")}`).not.toMatch(/I spend it|What happens|Add category|Category name/);
});

test("editing keeps the stored name and explains the money direction in one sentence", async () => {
  const category = { id: "rent", name: "Rent", normalizedName: "rent", nature: "Expense", style: { emoji: "🏠", tone: "primary" } } as unknown as Category;
  await inSpanish(createElement(CategorySheet, sheet({
    editor: { kind: "edit", category, name: "Rent", style: category.style }, onDelete: vi.fn(), confirmingDelete: true,
  })));
  const shown = text();
  expect(shown).toContain("Sale plata. Cambiar el nombre, el ícono o el color no cambia si la plata entra o sale.");
  expect(shown).toContain("¿Eliminar Rent?");
  expect(labels()).toEqual(expect.arrayContaining(["Guardar cambios", "Conservar categoría", "Sí, eliminar"]));
});

test("the picker counts the selection and offers the encompassing category in Spanish", async () => {
  await inSpanish(createElement(CategorySheet, sheet({
    search: "zz", options: [], selectionCount: 3, limitReached: true, onDone: vi.fn(), onCreateEncompassing: vi.fn(),
  })));
  const shown = text();
  expect(shown).toContain("Nada coincide con “zz”.");
  expect(shown).toContain("3 de 3 elegidas. Cada una cuenta el monto completo.");
  expect(shown).toContain("Elige máximo tres categorías. Quita una o crea una categoría que las abarque.");
  expect(labels()).toEqual(expect.arrayContaining(["Buscar categorías", "Agregar la tuya", "Crear una categoría que las abarque", "Listo"]));
});

test("Overview reads in Spanish with compact remaining and over amounts", async () => {
  await inSpanish(createElement(OverviewScreen, {
    data: {
      currency: "COP", outMinorUnits: 250000000, inMinorUnits: 150000000,
      categories: [
        { id: "over", name: "Salidas", style: { emoji: "🍔", tone: "warning" }, spendMinorUnits: 500000, limitMinorUnits: 400000 },
        { id: "partial", name: "Mercado", style: { emoji: "🛒", tone: "positive" }, spendMinorUnits: 200000, limitMinorUnits: 2000000 },
      ],
    },
    onBack: vi.fn(), onHistory: vi.fn(), onCategory: vi.fn(),
  }));
  const shown = text();
  for (const spanish of ["ESTE MES", "Resumen", "Neto", "Sale", "Entra", "Lista", "Barras", "1 mil de más", "Quedan 18 mil"])
    expect(shown).toContain(spanish);
  expect(labels()).toContain("Ver historial");
  expect(shown).not.toMatch(/Overview|THIS MONTH| left| over|Net\b/);
});

test("the category look reads in Spanish with frasco wording", async () => {
  const data = { id: "food", name: "Mercado", style: { emoji: "🛒", tone: "primary" as const }, currency: "COP",
    spendMinorUnits: 150000, limitMinorUnits: 400000, recent: [] };
  await inSpanish(createElement(CategoryLookScreen, { data, onBack: vi.fn(), onSetLimit: vi.fn(), onEdit: vi.fn() }));
  const shown = text();
  for (const spanish of ["ESTE MES", "Salió este mes", "Todavía no hay nada en esta categoría"]) expect(shown).toContain(spanish);
  expect(shown).toContain("Quedan COP 2.500 en el frasco");
  expect(labels()).toEqual(expect.arrayContaining(["Lo que queda en el frasco", "Cambiar el tope", "Editar categoría"]));
  expect(shown).not.toMatch(/THIS MONTH|still in the jar|Out this month/);
});
