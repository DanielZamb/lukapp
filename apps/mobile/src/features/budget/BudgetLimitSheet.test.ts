import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BudgetLimitSheet } from "./BudgetLimitSheet";
import type { BudgetJar } from "./model";

vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "Sheet", BottomSheetScrollView: "SheetScroll", BottomSheetBackdrop: "Backdrop",
}));
vi.mock("react-native", () => ({
  Pressable: "Pressable", Text: "Text", View: "View", ScrollView: "ScrollView", TextInput: "TextInput",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

const jar: BudgetJar = {
  category: { id: "food", name: "Food", emoji: "🛒" },
  limitMinorUnits: 40_000_000,
  consumptionMinorUnits: 20_000_000,
};

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

async function renderSheet(currency: string) {
  await act(async () => {
    root = create(createElement(BudgetLimitSheet, {
      month: "2026-10",
      currency,
      jar,
      color: "#047857",
      previousMonth: "2026-09",
      previousSpendMinorUnits: 7_312_345,
      minorUnits: jar.limitMinorUnits,
      busy: false,
      pending: false,
      editable: true,
      canSubmit: true,
      canDismiss: true,
      error: "",
      onLimit: () => {},
      onSave: () => {},
      onDismiss: () => {},
    }), {
      createNodeMock: (element) => {
        const props = element.props;
        if (element.type === "Sheet" && props && typeof props === "object" && "onDismiss" in props && typeof props.onDismiss === "function") {
          return { present() {}, dismiss: props.onDismiss };
        }
        return null;
      },
    });
  });
  if (!root) throw new Error("BudgetLimitSheet not mounted");
  return root.root;
}

function textContent(screen: ReactTestRenderer["root"]) {
  return screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
}

test.each(["COP", "USD"])("shows the narrow $ symbol for %s when formatToParts is missing", async (currency) => {
  const formatToParts = Intl.NumberFormat.prototype.formatToParts;
  // @ts-expect-error Hermes iOS omits formatToParts
  delete Intl.NumberFormat.prototype.formatToParts;
  try {
    const screen = await renderSheet(currency);
    const text = textContent(screen);
    expect(text).toEqual(expect.arrayContaining(["$200K", "Stay under this month", "$400K", "$480K"]));
    expect(screen.findByProps({ label: "Save October" }).props.label).toBe("Save October");
    expect(screen.findAll((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel?.startsWith("Limit "))
      .map((node) => node.props.accessibilityLabel)).toEqual(["Limit $400K", "Limit $480K"]);
  } finally {
    Intl.NumberFormat.prototype.formatToParts = formatToParts;
  }
});
