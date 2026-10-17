import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { BudgetBoard, type BudgetBoardProps } from "./BudgetBoard";
import { shiftMonth } from "./model";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(props: Partial<BudgetBoardProps> = {}) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const defaults: BudgetBoardProps = {
    month: "2026-10", currency: "COP", canEdit: true, saved: false, jars: [],
    onBack: () => {}, onMonth: () => {}, onCurrentMonth: () => {}, onAdd: () => {}, onEdit: () => {},
  };
  await act(async () => { root = create(createElement(BudgetBoard, { ...defaults, ...props })); });
  if (!root) throw new Error("Board not mounted");
  return root.root;
}

test("jars show unused, partly consumed, exactly spent and over limits; a reversal can exceed the original amount left", async () => {
  const values = [0, 50000, 100000, 150000, -150000];
  const jars = values.map((consumptionMinorUnits, index) => ({
    category: { id: String(index), name: `Category ${index}`, emoji: "🛒" }, limitMinorUnits: 100000, consumptionMinorUnits,
  }));
  const screen = await render({ jars });
  const buttons = screen.findAll((node) => node.props.accessibilityLabel?.startsWith("Category "));
  expect(buttons.map((node) => node.props.accessibilityLabel)).toEqual([
    "Category 0: COP 1.000,00 left of COP 1.000,00. COP 0,00 spent. Edit Budget.",
    "Category 1: COP 500,00 left of COP 1.000,00. COP 500,00 spent. Edit Budget.",
    "Category 2: COP 0,00 left of COP 1.000,00. COP 1.000,00 spent. Edit Budget.",
    "Category 3: COP 500,00 over a limit of COP 1.000,00. COP 1.500,00 spent. Edit Budget.",
    "Category 4: COP 2.500,00 left of COP 1.000,00. −COP 1.500,00 spent. Edit Budget.",
  ]);
  const fills = screen.findAll((node) => node.props.pointerEvents === "none" && Array.isArray(node.props.style));
  expect(fills.map((node) => node.props.style[1].height)).toEqual(["100%", "50%", "100%"]);
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
});

test("Add, jar edit and monthly navigation invoke their feature callbacks", async () => {
  let adds = 0;
  let selected = "";
  let month = "2026-10";
  const jar = { category: { id: "food", name: "Food", emoji: "🛒" }, limitMinorUnits: 100000, consumptionMinorUnits: 150000 };
  const screen = await render({ jars: [jar], onAdd: () => { adds++; }, onEdit: (jar) => { selected = jar.category.id; },
    onMonth: (offset) => { month = shiftMonth(month, offset); } });
  await act(async () => {
    screen.findByProps({ accessibilityLabel: "Add Budget" }).props.onPress();
    screen.findByProps({ accessibilityLabel: "Next month" }).props.onPress();
    screen.findAll((node) => node.props.accessibilityLabel?.startsWith("Food:"))[0].props.onPress();
  });
  expect({ adds, selected, month }).toEqual({ adds: 1, selected: "food", month: "2026-11" });
});

test("historical and future boards display their limits with editing disabled and a route to the current month", async () => {
  let current = false;
  const screen = await render({ month: "2026-09", canEdit: false, onCurrentMonth: () => { current = true; },
    jars: [{ category: { id: "food", name: "Food", emoji: "🛒" }, limitMinorUnits: 100000, consumptionMinorUnits: 0 }] });
  expect(screen.findByProps({ accessibilityLabel: "Add Budget" }).props.disabled).toBe(true);
  const jar = screen.findAll((node) => node.props.accessibilityLabel?.startsWith("Food:"))[0];
  expect(jar.props.disabled).toBe(true);
  expect(jar.props.accessibilityLabel).toBe("Food: COP 1.000,00 left of COP 1.000,00. COP 0,00 spent.");
  const button = screen.findByProps({ accessibilityLabel: "Current month" });
  await act(async () => button.props.onPress());
  expect(current).toBe(true);
});
