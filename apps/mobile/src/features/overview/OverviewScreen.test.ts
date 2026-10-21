import * as React from "react";
import { createElement } from "react";
import { ActivityIndicator } from "react-native";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { theme } from "../../ui/core";
import { OverviewScreen } from "./OverviewScreen";
import type { MonthOverview } from "./model";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport",
  ActivityIndicator: "spinner", Pressable: "button", Text: "text", View: "view", ScrollView: "scroll",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));

const data: MonthOverview = {
  currency: "COP", outMinorUnits: 250000000, inMinorUnits: 150000000,
  categories: [
    { id: "over", name: "Over", style: { emoji: "🍔", tone: "warning" }, spendMinorUnits: 500000, limitMinorUnits: 400000 },
    { id: "flat", name: "Unlimited", style: { emoji: "🚕", tone: "primary" }, spendMinorUnits: 400000, limitMinorUnits: null },
    { id: "partial", name: "Partial", style: { emoji: "🛒", tone: "positive" }, spendMinorUnits: 200000, limitMinorUnits: 1000000 },
    { id: "unused", name: "Unused", style: { emoji: "👕", tone: "primary" }, spendMinorUnits: 0, limitMinorUnits: 200000 },
  ],
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
function texts(node: ReactTestInstance) { return node.findAllByType("text").map((text) => text.children.join("")); }
function screen() { if (!root) throw new Error("Overview not mounted"); return root.root; }
function button(label: string) {
  const node = screen().findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}
async function press(label: string) { await act(async () => button(label).props.onPress()); }
async function render(value: MonthOverview | undefined = data) {
  const callbacks = { onBack: vi.fn(), onHistory: vi.fn(), onCategory: vi.fn() };
  await act(async () => { root = create(createElement(OverviewScreen, { data: value, ...callbacks })); });
  return callbacks;
}
function bars() { return screen().findAll((node) => node.type === "view" && node.props.accessibilityRole === "progressbar"); }
function percentages() { return bars().map((node) => node.props.accessibilityValue.now); }

test.each([["COP", "$"], ["USD", "$"], ["EUR", "€"], ["AED", "AED "]])("shows posted spending and opens history for %s without formatToParts", async (currency, symbol) => {
  const formatToParts = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, "formatToParts");
  Reflect.deleteProperty(Intl.NumberFormat.prototype, "formatToParts");
  try {
    const callbacks = await render({
      currency, outMinorUnits: 1_000_000, inMinorUnits: 0,
      categories: [{ id: "food", name: "Food", style: { emoji: "🍔", tone: "warning" }, spendMinorUnits: 1_000_000, limitMinorUnits: null }],
    });
    expect(texts(screen())).toEqual(expect.arrayContaining(["Net", `−${symbol}10K`, "Out", `${symbol}10K`, "In", `${symbol}0`]));
    expect(texts(button("Food"))).toEqual(["🍔", "Food", `${symbol}10.000`]);
    await press("Go to tx history");
    expect(callbacks.onHistory).toHaveBeenCalledOnce();
  } finally {
    if (formatToParts) Object.defineProperty(Intl.NumberFormat.prototype, "formatToParts", formatToParts);
  }
});

test.each([
  ["Net", "−$1.000.000,00"], ["Out", "$2.500.000,00"], ["In", "$1.500.000,00"],
])("%s focuses to its full amount, hides other amounts, then restores the trio", async (label, full) => {
  await render();
  expect(texts(screen())).toEqual(expect.arrayContaining(["Net", "−$1M", "Out", "$2.5M", "In", "$1.5M"]));
  await press(label);
  expect(texts(button(label))).toEqual([label, full]);
  expect(button(label).props.accessibilityState.expanded).toBe(true);
  for (const other of ["Net", "Out", "In"].filter((item) => item !== label)) {
    expect(texts(screen())).not.toContain(other);
  }
  await press(label);
  expect(texts(screen())).toEqual(expect.arrayContaining(["Net", "−$1M", "Out", "$2.5M", "In", "$1.5M"]));
});

test("List is default with spend, draining/flat coins, colored remaining amounts and navigation", async () => {
  const callbacks = await render();
  expect(texts(screen())).toEqual(expect.arrayContaining(["Overview", "THIS MONTH"]));
  expect(texts(screen())).not.toEqual(expect.arrayContaining(["ACCOUNTS", "Recent activity"]));
  expect(button("List").props.accessibilityState.checked).toBe(true);
  const rows = screen().findAllByType("button").filter((node) => data.categories.some((category) => category.name === node.props.accessibilityLabel));
  expect(rows.map(texts)).toEqual([
    ["🍔", "Over", "$5.000", "1K over"], ["🚕", "Unlimited", "$4.000"],
    ["🛒", "Partial", "$2.000", "8K left"], ["👕", "Unused", "$0", "2K left"],
  ]);
  const overText = button("Over").findAllByType("text").find((node) => node.children.join("") === "1K over");
  const leftText = button("Partial").findAllByType("text").find((node) => node.children.join("") === "8K left");
  expect(overText?.props.style[1].color).toBe(theme.danger);
  expect(leftText?.props.style[1].color).toBe(theme.positive);
  const coinFills = screen().findAllByType("view").filter((node) => Array.isArray(node.props.style) && node.props.style[1]?.height);
  expect(coinFills.map((node) => node.props.style[1].height)).toEqual(["80%", "100%"]);
  await press("Back"); await press("Go to tx history"); await press("Partial");
  expect(callbacks.onBack).toHaveBeenCalledOnce();
  expect(callbacks.onHistory).toHaveBeenCalledOnce();
  expect(callbacks.onCategory).toHaveBeenCalledExactlyOnceWith("partial");
});

test("Bars toggle to limited categories in remaining order, clamp over to zero, toggle back and reset through List", async () => {
  await render();
  await press("Bars");
  expect(percentages()).toEqual([100, 80, 40, 0]);
  expect(texts(screen())).not.toContain("What's left");
  await press("Unlimited");
  expect(texts(screen())).toContain("What's left");
  expect(bars().map((node) => node.props.accessibilityLabel)).toEqual([
    "Over, remaining limit", "Unused, remaining limit", "Partial, remaining limit",
  ]);
  expect(percentages()).toEqual([0, 100, 80]);
  expect(texts(button("Over, what's left"))).toEqual(["🍔", "1K over"]);
  expect(button("Over, what's left").findAllByType("text")[1].props.style[1].color).toBe(theme.danger);
  await press("Partial, what's left");
  expect(percentages()).toEqual([100, 80, 40, 0]);
  await press("Partial"); await press("List"); await press("Bars");
  expect(texts(screen())).not.toContain("What's left");
  expect(percentages()).toEqual([100, 80, 40, 0]);
});

test("with no limits a bar tap does nothing, including when all spends are zero", async () => {
  await render({ ...data, categories: data.categories.map((category) => ({ ...category, spendMinorUnits: 0, limitMinorUnits: null })) });
  await press("Bars"); await press("Over");
  expect(texts(screen())).not.toContain("What's left");
  expect(percentages()).toEqual([0, 0, 0, 0]);
});

test("exactly spent limits have zero remaining without an over warning", async () => {
  await render({ ...data, categories: [{ ...data.categories[0], spendMinorUnits: 400000 }] });
  expect(texts(button("Over"))).toContain("0 left");
  await press("Bars"); await press("Over");
  expect(texts(button("Over, what's left"))).toEqual(["🍔", "0"]);
  expect(percentages()).toEqual([0]);
});

test("loading keeps the header and history available, and an empty workspace has zero flow", async () => {
  await act(async () => { root = create(createElement(OverviewScreen, { data: undefined, onBack: vi.fn(), onHistory: vi.fn(), onCategory: vi.fn() })); });
  expect(screen().findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(texts(screen())).toContain("Go to tx history");
  await act(async () => root?.update(createElement(OverviewScreen, { data: { currency: "COP", outMinorUnits: 0, inMinorUnits: 0, categories: [] }, onBack: vi.fn(), onHistory: vi.fn(), onCategory: vi.fn() })));
  expect(screen().findAllByType(ActivityIndicator)).toHaveLength(0);
  expect(texts(screen()).filter((value) => value === "$0")).toHaveLength(3);
  expect(texts(screen())).toContain("No categories yet.");
});
