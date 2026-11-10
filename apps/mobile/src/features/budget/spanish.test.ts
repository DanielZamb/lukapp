import * as React from "react";
import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { LanguageProvider } from "../../i18n";
import { withThemeProvider } from "../../ui/testTheme";
import { BudgetBoard } from "./BudgetBoard";
import { BudgetLimitSheet } from "./BudgetLimitSheet";
import { compactAmount, monthLabel, nextAction, type BudgetJar } from "./model";
import { PostingImpactSheet } from "./PostingImpactSheet";

vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "Sheet", BottomSheetScrollView: "SheetScroll", BottomSheetBackdrop: "Backdrop", BottomSheetTextInput: "SheetInput",
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport",
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", View: "View", ScrollView: "ScrollView", TextInput: "TextInput",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

const en = createTranslator("en");
const es = createTranslator("es");
/** The no-break space between a Spanish compact number and its unit. */
const nb = "\u00a0";
function jar(name: string, consumptionMinorUnits: number, limitMinorUnits = 100_000_000): BudgetJar {
  return { category: { id: name, name, emoji: "🛒" }, consumptionMinorUnits, limitMinorUnits };
}

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
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: "es" }, withThemeProvider(element)));
  });
  if (!root) throw new Error("Not mounted");
  return root.root;
}
function texts(screen: ReactTestInstance) {
  return screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
}
function labels(screen: ReactTestInstance) {
  return screen.findAll((node) => typeof node.props.accessibilityLabel === "string").map((node) => node.props.accessibilityLabel as string);
}

test("the next Budget action names the month inside one sentence in each language", () => {
  const cool = jar("Comida", 10_000_000);
  expect(nextAction([cool], "2026-10", en).label).toBe("Change October's limit");
  expect(nextAction([cool], "2026-10", es).label).toBe("Cambiar el tope de octubre");
  expect(nextAction([], "2027-01", en).label).toBe("Set a January limit");
  expect(nextAction([], "2027-01", es).label).toBe("Ponerle un tope a enero");
  expect(nextAction([jar("Mercado", 90_000_000)], "2026-10", es).label).toBe("Mercado ya va en el 80%");
  expect(nextAction([jar("Mercado", 150_000_000)], "2026-10", es).label).toBe("Abrir Mercado");
  expect(monthLabel("2027-01", "monthYear", "es")).toBe("Enero de 2027");
  expect(monthLabel("2027-01", "month", "es")).toBe("Enero");
});

test.each([
  [0, "0", "0"], [123, "1.23", "1,23"], [125_000, "1.3K", `1,3${nb}mil`], [35_400_000, "354K", `354${nb}mil`],
  [100_000_000, "1M", `1${nb}M`], [123_000_000, "1.23M", `1,23${nb}M`], [-35_400_000, "−354K", `−354${nb}mil`],
])("compact Budget amount %s reads %s in English and %s in Spanish", (minorUnits, english, spanish) => {
  expect(compactAmount(minorUnits, "COP", "en")).toBe(english);
  expect(compactAmount(minorUnits, "COP", "es")).toBe(spanish);
});

test("the Budget board reads in Colombian Spanish with tope and frasco wording", async () => {
  const jars = [jar("Comida", 64_600_000), jar("Salidas", 150_000_000)];
  const screen = await inSpanish(createElement(BudgetBoard, {
    month: "2026-10", currency: "COP", saved: true, canAdd: true, jars, categoryColors: new Map(),
    onBack: () => {}, onAdd: () => {}, onEdit: () => {},
  }));
  expect(texts(screen)).toEqual([
    "OCTUBRE", "Presupuestos", "Abrir Salidas", "Presupuesto guardado",
    "🛒", "Comida", `Quedan 354${nb}mil`, "🛒", "Salidas", `500${nb}mil de más`, "Poner otro tope",
  ]);
  expect(labels(screen)).toContain(
    "Comida: quedan COP 354.000,00 de un tope de COP 1.000.000,00. Llevas COP 646.000,00 gastados. Editar presupuesto.");
  expect(labels(screen)).toContain(
    "Salidas: te pasaste COP 500.000,00 de un tope de COP 1.000.000,00. Llevas COP 1.500.000,00 gastados. Editar presupuesto.");
  const all = [...texts(screen), ...labels(screen)].join("\n");
  for (const english of ["Budgets", "Set another limit", " left", " over", "Budget saved", "Edit Budget"])
    expect(all).not.toContain(english);
});

test("the limit sheet keeps the month phrases whole in Spanish", async () => {
  const screen = await inSpanish(createElement(BudgetLimitSheet, {
    month: "2026-10", currency: "COP", jar: jar("Comida", 20_000_000, 40_000_000), color: "#047857",
    previousMonth: "2026-09", previousSpendMinorUnits: 7_312_345, minorUnits: 50_000_000, amount: "500.000",
    amountIssue: null, busy: false, pending: false, editable: true, canSubmit: true, canDismiss: true, error: "",
    onLimit: () => {}, onAmount: () => {}, onSave: () => {}, onDismiss: () => {},
  }));
  const shown = texts(screen);
  expect(shown).toContain("OCTUBRE");
  expect(shown).toContain(`En septiembre gastaste $73${nb}mil en Comida. El cambio aplica para octubre y los meses siguientes.`);
  expect(shown).toContain("Tope para este mes");
  expect(labels(screen)).toContain("Guardar para octubre");
  expect(labels(screen)).toContain("Lo que queda en Comida");
  expect(shown.join("\n")).not.toMatch(/Saving applies|Stay under|October/);
});

test("the posting impact sheet formats the overage with the shared compact helper in one message", async () => {
  const screen = await inSpanish(createElement(PostingImpactSheet, {
    description: "", currency: "COP", onContinue: () => {}, onReconsider: () => {},
    hits: [{ category: { id: "food", name: "Comida", emoji: "🛒" }, overMinorUnits: 120_000_000 }],
  }));
  const shown = texts(screen);
  // Intl separates the number and "M" with a no-break space.
  expect(shown).toContain(`Comida: 1,2${nb}M de más`);
  expect(shown).toContain("TE PASARÍAS DEL TOPE");
  expect(shown).toContain("Movimiento");
  expect(labels(screen)).toEqual(expect.arrayContaining(["Continuar igual", "Pensarlo mejor"]));
  expect(shown.join("\n")).not.toMatch(/ over|BUDGET|Entry/);
});
