import * as React from "react";
import { createElement, createRef } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CategorySheet, type CategorySheetProps } from "./CategorySheet";
import { emojiFrom } from "./appearance";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet",
  BottomSheetScrollView: "sheet-scroll",
  BottomSheetTextInput: "input",
  BottomSheetBackdrop: "backdrop",
}));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll",
  TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

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
function props(overrides: Partial<CategorySheetProps> = {}): CategorySheetProps {
  return {
    sheetRef: createRef<BottomSheetModal>(), search: "", options: [], editor: null,
    busy: false, error: "", canConfirm: false,
    onSearch: vi.fn(), onSelect: vi.fn(), onCreate: vi.fn(), onName: vi.fn(),
    onStyle: vi.fn(), onConfirm: vi.fn(), onDismiss: vi.fn(), ...overrides,
  };
}
async function render(value: CategorySheetProps) {
  await act(async () => { root = create(createElement(CategorySheet, value)); });
  if (!root) throw new Error("No sheet");
  return root.root;
}
function text() {
  return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? "";
}

test("the category sheet uses sticky search, selectable emoji discs and an Add your own footer", async () => {
  const value = props({ options: [
    { key: "food", name: "Food", style: { emoji: "🛒", tone: "primary", color: "h150" }, selected: true },
    { key: "home", name: "Home", style: { emoji: "🏠", tone: "positive" }, selected: false },
  ] });
  const tree = await render(value);
  expect(tree.findByType(BottomSheetModal).props.snapPoints).toEqual(["70%"]);
  expect(tree.findByType(BottomSheetModal).props.enablePanDownToClose).toBe(true);
  expect(tree.findByType(BottomSheetScrollView).props.stickyHeaderIndices).toEqual([0]);
  const input = tree.findByType("input");
  expect(input.props.placeholder).toBe("Search");
  expect(input.props.accessibilityLabel).toBe("Search categories");
  expect(text()).toBe("Category\n🛒\nFood\n🏠\nHome\nAdd your own");
  const food = tree.findAllByType("button").find((node) => node.props.accessibilityLabel === "Food");
  expect(food?.props.accessibilityState).toEqual({ selected: true });
  expect(food?.findByType(Ionicons).props.name).toBe("checkmark");
  expect(food?.findAllByType("view")[0].props.style).toContainEqual({ backgroundColor: "#218c572e", borderColor: "#218c57" });
  await act(async () => food?.props.onPress());
  expect(value.onSelect).toHaveBeenCalledWith("food");
  const add = tree.findAllByType("button").find((node) => node.props.accessibilityLabel === "Add your own");
  expect(add?.findByType("view").props.style).toContainEqual({ borderStyle: "dashed" });
  await act(async () => add?.props.onPress());
  expect(value.onCreate).toHaveBeenCalledOnce();
});

test.each([
  ["", "No categories yet."],
  ["  coffee  ", 'Nothing matches "coffee".'],
])("empty results for %j use the prototype copy", async (search, expected) => {
  await render(props({ search }));
  expect(text()).toContain(expected);
  expect(text()).toContain("Add your own");
});

test("custom creation previews the name and look, offers 28 colors and accepts a keyboard emoji", async () => {
  const value = props({ editor: { kind: "custom", name: "", style: { emoji: "✨", tone: "primary", color: "h270" } } });
  const tree = await render(value);
  expect(text()).toContain("Your own");
  expect(text()).not.toContain("What happens to the money?");
  expect(tree.findByType("input").props.placeholder).toBe("Name it your way");
  const emojis = tree.findAllByType("button").filter((node) => node.props.accessibilityLabel?.startsWith("Emoji "));
  expect(emojis.map((node) => node.props.accessibilityLabel)).toEqual(["Emoji 🛒", "Emoji 🍔", "Emoji 🚌", "Emoji 🏠", "Emoji 💊", "Emoji 🎮", "Emoji 🛍️", "Emoji ✨"]);
  const swatches = tree.findAllByType("button").filter((node) => node.props.accessibilityLabel?.startsWith("Color "));
  expect(swatches).toHaveLength(28);
  const olive = swatches.find((node) => node.props.accessibilityLabel === "Color olive");
  await act(async () => olive?.props.onPress());
  expect(value.onStyle).toHaveBeenCalledWith({ emoji: "✨", tone: "primary", color: "olive" });
  const keyboard = tree.findAllByType("button").find((node) => node.props.accessibilityLabel === "Pick any emoji from your keyboard");
  await act(async () => keyboard?.props.onPress());
  const input = tree.findAllByType("input").find((node) => node.props.accessibilityLabel === "Type any emoji");
  await act(async () => input?.props.onChangeText("👩🏽‍💻🛒"));
  expect(value.onStyle).toHaveBeenLastCalledWith({ emoji: "👩🏽‍💻", tone: "primary", color: "h270" });
  const submit = tree.findAllByType("button").find((node) => node.props.accessibilityLabel === "Add category");
  expect(submit?.props.disabled).toBe(true);
  await act(async () => root?.update(createElement(CategorySheet, { ...value, canConfirm: true, editor: { kind: "custom", name: "Weekend", style: { emoji: "🎮", tone: "primary", color: "olive" } } })));
  expect(text()).toContain("Weekend");
  expect(tree.findAllByType("button").find((node) => node.props.accessibilityLabel === "Add category")?.props.accessibilityState.disabled).toBe(false);
});

test.each([
  ["hello", null], ["café", null], ["🇨🇴🇨🇦", "🇨🇴"], ["1️⃣", "1️⃣"], ["🛍️", "🛍️"], ["🏳️‍🌈", "🏳️‍🌈"],
])("emoji keyboard parses %j", (input, expected) => {
  expect(emojiFrom(input)).toBe(expected);
});
