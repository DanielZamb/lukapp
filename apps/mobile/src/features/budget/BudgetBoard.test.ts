import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { theme } from "../../ui/core";
import { withThemeProvider } from "../../ui/testTheme";
import { BudgetBoard, type BudgetBoardProps } from "./BudgetBoard";
import type { BudgetJar } from "./model";

vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(props: Partial<BudgetBoardProps> = {}) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const defaults: BudgetBoardProps = {
    month: "2026-10", currency: "COP", saved: false, canAdd: true, jars: [], categoryColors: new Map(),
    onBack: () => {}, onAdd: () => {}, onEdit: () => {},
  };
  await act(async () => {
    root = create(withThemeProvider(createElement(BudgetBoard, { ...defaults, ...props })));
  });
  if (!root) throw new Error("Board not mounted");
  return root.root;
}
function text(screen: ReactTestInstance) {
  return screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join("")).join("\n");
}
function jar(name: string, consumptionMinorUnits: number, limitMinorUnits = 100_000_000): BudgetJar {
  return { category: { id: name, name, emoji: "🛒" }, consumptionMinorUnits, limitMinorUnits };
}

test("jars match variant A with compact remaining amounts, category borders and bottom-up fill", async () => {
  const jars = [jar("Unused", 0), jar("Partial", 64_600_000), jar("Spent", 100_000_000), jar("Over", 150_000_000), jar("Reversed", -150_000_000)];
  const screen = await render({ jars, categoryColors: new Map(jars.map((jar) => [jar.category.id, "#047857"])) });
  expect(text(screen)).toContain("OCTOBER\nBudgets\nOpen Over");
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""))).toEqual([
    "OCTOBER", "Budgets", "Open Over", "🛒", "Unused", "1M left", "🛒", "Partial", "354K left",
    "🛒", "Spent", "0 left", "🛒", "Over", "500K over", "🛒", "Reversed", "2.5M left", "Set another limit",
  ]);
  const buttons = screen.findAll((node) => String(node.type) === "Pressable").filter((node) => node.props.accessibilityLabel?.includes("spent."));
  expect(buttons[1].props.accessibilityLabel).toBe("Partial: COP 354.000,00 left of COP 1.000.000,00. COP 646.000,00 spent. Edit Budget.");
  expect(buttons.map((button) => Object.assign({}, ...button.props.style({ pressed: false })))).toEqual([
    expect.objectContaining({ width: "48%", minHeight: 132, borderWidth: 2, borderColor: "#047857", backgroundColor: theme.secondary }),
    expect.objectContaining({ borderColor: "#047857", backgroundColor: theme.secondary }),
    expect.objectContaining({ borderColor: "#047857", backgroundColor: theme.secondary }),
    expect.objectContaining({ borderColor: theme.danger, backgroundColor: `${theme.danger}18` }),
    expect.objectContaining({ borderColor: "#047857", backgroundColor: theme.secondary }),
  ]);
  const fills = screen.findAll((node) => String(node.type) === "View").filter((node) => node.props.pointerEvents === "none");
  expect(fills.map((node) => Object.assign({}, ...node.props.style))).toEqual([
    { position: "absolute", left: 0, right: 0, bottom: 0, height: "100%", backgroundColor: "#04785766" },
    { position: "absolute", left: 0, right: 0, bottom: 0, height: "35.4%", backgroundColor: "#04785766" },
    { position: "absolute", left: 0, right: 0, bottom: 0, height: "0%", backgroundColor: "#04785766" },
    { position: "absolute", left: 0, right: 0, bottom: 0, height: "100%", backgroundColor: "#04785766" },
  ]);
  expect(buttons[3].findAll((node) => String(node.type) === "Text")[2].props.style[1].color).toBe(theme.danger);
  expect(screen.findAll((node) => String(node.type) === "Icon").map((node) => node.props.name)).toEqual(["chevron-back", "arrow-forward"]);
  expect(text(screen)).not.toMatch(/Categories can overlap|PROTOTYPE|posted|August|left of/);
});

test("the next action and each jar open the selected live category; creation sits below the jars", async () => {
  const onEdit = vi.fn();
  const onAdd = vi.fn();
  const onBack = vi.fn();
  const jars = [jar("Food", 90_000_000), jar("Travel", 120_000_000), jar("Home", 150_000_000)];
  const screen = await render({ jars, onAdd, onEdit, onBack });
  await act(async () => {
    screen.findByProps({ accessibilityLabel: "Open Home" }).props.onPress();
    screen.findAll((node) => String(node.type) === "Pressable").find((node) => node.props.accessibilityLabel?.startsWith("Food:"))?.props.onPress();
    screen.findByProps({ accessibilityLabel: "Set another limit" }).props.onPress();
    screen.findByProps({ accessibilityLabel: "Back" }).props.onPress();
  });
  expect(onEdit.mock.calls).toEqual([[jars[2]], [jars[0]]]);
  expect(onAdd).toHaveBeenCalledOnce();
  expect(onBack).toHaveBeenCalledOnce();
  expect(screen.findAllByProps({ accessibilityLabel: "Previous month" })).toHaveLength(0);
  expect(screen.findAllByProps({ accessibilityLabel: "Next month" })).toHaveLength(0);
  expect(screen.findAllByProps({ accessibilityLabel: "Add Budget" })).toHaveLength(0);
});

test("the empty workspace-month action opens creation", async () => {
  const onAdd = vi.fn();
  const screen = await render({ month: "2027-01", onAdd });
  await act(async () => screen.findByProps({ accessibilityLabel: "Set a January limit" }).props.onPress());
  expect(onAdd).toHaveBeenCalledOnce();
  expect(text(screen)).toBe("JANUARY\nBudgets\nSet a January limit");
});

test("a board with every category limited omits extra creation", async () => {
  const screen = await render({ jars: [jar("Food", 0)], canAdd: false });
  expect(text(screen)).toContain("Change October's limit");
  expect(text(screen)).not.toContain("Budget saved");
  expect(screen.findAllByProps({ accessibilityLabel: "Set another limit" })).toHaveLength(0);
});
