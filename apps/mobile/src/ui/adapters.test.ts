import * as React from "react";
import { createElement as h, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Presentation, ReflowRow, ReflowItem, Text, TextInput, useReflowStyles, FactRow, IconButton } from "./core";
import { ThemeProvider } from "./themeContext";
import { textPresets, textPresetSpec, type TextPreset } from "./textPresets";
import { font } from "./tokens";
import { readableLayout, type LayoutTier } from "./layout";
import { Sheet } from "./Sheet";
import { ActionSheet } from "./pickers";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
const native = vi.hoisted(() => ({ focus: vi.fn(), dismiss: vi.fn(), present: vi.fn() }));
vi.mock("react-native", () => ({ Text: "text", View: "view", Pressable: "button", TextInput: "input", ScrollView: "scroll", ActivityIndicator: "spinner", KeyboardAvoidingView: "keyboard", Platform: { OS: "ios", Version: 18 },
  AccessibilityInfo: { setAccessibilityFocus: native.focus }, findNodeHandle: () => 42,
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  StyleSheet: { create: (x: unknown) => x, flatten: flat, hairlineWidth: 1 } }));
vi.mock("@gorhom/bottom-sheet", () => ({ BottomSheetModal: "modal", BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetFooter: "sheet-footer", BottomSheetBackdrop: "backdrop" }));
let root: ReactTestRenderer | undefined;
function flat(value: unknown): Record<string, unknown> { return Array.isArray(value) ? Object.assign({}, ...value.map(flat)) : typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {}; }
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks(); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(node: ReactElement, tier: LayoutTier = "default") {
  const layout = readableLayout({ width: tier === "reflow" ? 280 : 390, fontScale: tier === "xxxl" ? 1.5 : 1 });
  await act(async () => { root = create(h(ThemeProvider, { layout }, node), { createNodeMock: () => ({ present: native.present, dismiss: native.dismiss }) }); });
  if (!root) throw new Error("No renderer");
  return root.root;
}
const exact: Record<TextPreset, object> = {
  sheetTitle: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  badge: { fontFamily: font.bold, fontSize: 11 },
  flowAmount: { fontFamily: font.extrabold, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 },
  flowFocus: { fontFamily: font.extrabold, fontSize: 36, lineHeight: 40, letterSpacing: -0.8 },
  barAmount: { fontFamily: font.bold, fontSize: 12 }, composeLabel: { fontFamily: font.medium, fontSize: 13 },
  rowMeta: { fontFamily: font.regular, fontSize: 13 }, batchAmount: { fontFamily: font.semibold, fontSize: 15, fontVariant: ["tabular-nums"] },
  batchNet: { fontFamily: font.extrabold, fontSize: 32 }, impactAmount: { fontFamily: font.extrabold, fontSize: 36 },
  amountCurrency: { fontFamily: font.semibold, fontSize: 28 }, amountInput: { fontFamily: font.extrabold, fontSize: 44 },
  rowName: { fontFamily: font.semibold, fontSize: 16 }, rowSubtitle: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  rowMoney: { fontFamily: font.semibold, fontSize: 14 }, detailAmount: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  footnote: { fontFamily: font.regular, fontSize: 13, lineHeight: 19 }, systemFootnote: { fontSize: 13, lineHeight: 19 },
  filterSort: { fontFamily: font.bold, fontSize: 14 }, body: { fontFamily: font.regular, fontSize: 16 }, bodyCopy: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: font.bold, fontSize: 16 }, action: { fontFamily: font.bold, fontSize: 17 }, caption: { fontFamily: font.regular, fontSize: 12 },
  captionMedium: { fontFamily: font.medium, fontSize: 12 }, captionStrong: { fontFamily: font.bold, fontSize: 12 }, captionLine: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  rowTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 }, money: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 }, fieldLabel: { fontFamily: font.semibold, fontSize: 14 },
  sectionTitle: { fontFamily: font.extrabold, fontSize: 24 }, budgetInput: { fontFamily: font.extrabold, fontSize: 44, letterSpacing: -1.2 },
  detailName: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 36 }, healthTitle: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 33 },
  monthTitle: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 34 }, monthCount: { fontFamily: font.extrabold, fontSize: 64, lineHeight: 68, letterSpacing: -2 },
  draftAmount: { fontFamily: font.extrabold, fontSize: 38, lineHeight: 43, letterSpacing: -0.8 }, draftBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 }, warningBody: { fontFamily: font.regular, fontSize: 18, lineHeight: 27 },
  composeSelected: { fontFamily: font.bold, fontSize: 13 }, segmentLabel: { fontFamily: font.medium, fontSize: 16 }, completionAmount: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 52 }, startingAmount: { fontFamily: font.extrabold, fontSize: 40, lineHeight: 48, letterSpacing: -1 }, placeHeroEmoji: { fontSize: 40, lineHeight: 48 }, placeLookEmoji: { fontSize: 32, lineHeight: 38 }, tileEmoji: { fontSize: 22, lineHeight: 26 },
  nativeInput: {}, system: {}, emoji16: { fontSize: 16 }, emoji17: { fontSize: 17 }, emoji18: { fontSize: 18 }, emoji21: { fontSize: 21 }, emoji22: { fontSize: 22 }, emoji26: { fontSize: 26 }, emoji28: { fontSize: 28 },
};

test.each(["default", "reflow"] as const)("all presets preserve literal legacy typography and omissions at %s", async tier => {
  for (const preset of Object.keys(textPresets) as TextPreset[]) {
    const tree = await render(h(Text, { preset }, "Sample"), tier);
    expect(flat(tree.findByType("text").props.style), preset).toEqual(exact[preset]);
    expect(tree.findByType("text").props.maxFontSizeMultiplier).toBeUndefined();
    await act(async () => root?.unmount());
  }
});
test("preset XXXL scaling keeps system family absent, prose uncapped, and money tabular", async () => {
  const tree = await render(h(React.Fragment, null, h(Text, { preset: "batchAmount" }, "12"), h(Text, { preset: "bodyCopy" }, "Copy"), h(Text, { preset: "emoji22" }, "x")), "xxxl");
  const nodes = tree.findAllByType("text");
  expect(flat(nodes[0]?.props.style)).toMatchObject({ fontFamily: font.semibold, fontSize: 18, lineHeight: 21.599999999999998, fontVariant: ["tabular-nums"] });
  expect(nodes.map(n => n.props.maxFontSizeMultiplier)).toEqual([1.5, undefined, 1.3]);
  expect(flat(nodes[2]?.props.style)).toEqual({ fontSize: 22 });
  expect(textPresetSpec("xxxl", "systemFootnote")).not.toHaveProperty("fontFamily");
});
test("TextInput preserves an empty native spec, refs, and input events", async () => {
  const change = vi.fn(); const ref = React.createRef<import("react-native").TextInput>();
  const tree = await render(h(TextInput, { preset: "nativeInput", ref, value: "", onChangeText: change, style: { minHeight: 48, paddingHorizontal: 16 } }));
  const input = tree.findByType("input");
  expect(flat(input.props.style)).toEqual({ minHeight: 48, paddingHorizontal: 16 });
  expect(ref.current).not.toBeNull();
  input.props.onChangeText("Cash"); expect(change.mock.calls).toEqual([["Cash"]]);
});
test.each(["default", "reflow", "xxxl"] as const)("Presentation selects identity at %s without mounting alternate content", async tier => {
  const other = vi.fn(() => h("text", null, "other"));
  const tree = await render(h(Presentation, { legacy: h("legacy"), reflow: null }, h(other)), tier);
  expect(other).toHaveBeenCalledTimes(tier === "xxxl" ? 1 : 0);
  expect(tree.findAll(n => String(n.type) === "legacy")).toHaveLength(tier === "default" ? 1 : 0);
  expect(root?.toJSON()).toEqual(tier === "reflow" ? null : expect.anything());
});
test.each(["default", "reflow", "xxxl"] as const)("row, item, text, and bar adapters reproduce layout at %s", async tier => {
  const stacked = tier !== "default";
  const tree = await render(h(ReflowRow, { align: "flex-end", reflowAlign: "stretch", gap: 16 }, h(ReflowItem, { flex: 1, reflowFlex: 0 }, h(Text, { preset: "rowMoney", reflow: "trail" }, "10")), h(Text, { preset: "barAmount", reflow: "bar" }, "20")), tier);
  const views = tree.findAllByType("view"); const texts = tree.findAllByType("text");
  expect(flat(views[0]?.props.style)).toEqual({ flexDirection: stacked ? "column" : "row", alignItems: stacked ? "stretch" : "flex-end", gap: 16 });
  expect(flat(views[1]?.props.style)).toEqual({ flex: stacked ? 0 : 1 });
  expect(flat(texts[0]?.props.style)).toMatchObject({ maxWidth: stacked ? "100%" : "45%", textAlign: stacked ? "left" : "right" });
  expect(texts[0]?.props.numberOfLines).toBe(stacked ? undefined : 1);
  expect(flat(texts[1]?.props.style).maxWidth).toBe(stacked ? "45%" : 80);
});
test("layout hook reproduces category trail and CapitalFlow flex", async () => {
  function Consumer() { const flow = useReflowStyles(); return h("result", { value: { row: flow.row("center", "stretch"), side: flow.flex(1, 0), trail: flow.trail(), text: flow.text, bar: flow.bar } }); }
  const tree = await render(h(Consumer), "reflow");
  expect(tree.find(n => String(n.type) === "result").props.value).toEqual({ row: { flexDirection: "column", alignItems: "stretch" }, side: { flex: 0 }, trail: { maxWidth: "100%", alignItems: "flex-start" }, text: { numberOfLines: undefined, textAlign: "left" }, bar: { maxWidth: "45%" } });
});
test("FactRow preserves legacy identity and orders its XXXL label above the value", async () => {
  let tree = await render(h(FactRow, { label: "Place", value: "Cash", legacy: h("legacy") })); expect(tree.findAll(n => String(n.type) === "legacy")).toHaveLength(1);
  await act(async () => root?.unmount());
  tree = await render(h(FactRow, { label: "Place", value: "Cash", icon: "wallet-outline" }), "xxxl");
  expect(tree.findAllByType("text").map(n => n.children.join(""))).toEqual(["Place", "Cash"]);
  expect(tree.find(n => String(n.type) === "icon").props.size).toBe(24);
});
test.each(["header", "brand", "remove"] as const)("IconButton %s keeps legacy geometry and grows to 56 at XXXL", async preset => {
  let tree = await render(h(IconButton, { preset, icon: "close", iconSize: 18, accessibilityLabel: "Remove", onPress() {} }));
  const base = flat(tree.findByType("button").props.style({ pressed: false }));
  expect(base.width).toBe(preset === "remove" ? 26 : 48); expect(base.height).toBe(base.width);
  if (preset === "brand") expect(base).toMatchObject({ borderRadius: 999, borderWidth: 1, alignItems: "center", justifyContent: "center" });
  expect(tree.find(n => String(n.type) === "icon").props.size).toBe(18);
  await act(async () => root?.unmount());
  tree = await render(h(IconButton, { preset, accessibilityLabel: "Remove", disabled: true }), "xxxl");
  expect(flat(tree.findByType("button").props.style({ pressed: false })).width).toBe(56);
  expect(tree.findByType("button").props.accessibilityState).toEqual({ disabled: true });
});
test("headerless tall sheet retains title focus through native presentation", async () => {
  const tree = await render(h(Sheet, { label: "Entry details", tall: true, header: false, onClose() {} }, h("content")), "xxxl");
  const title = tree.findByType("text"); expect(title.children).toEqual(["Entry details"]);
  expect(tree.findAllByType("button")).toHaveLength(0);
  expect(flat(title.props.style)).toEqual({ position: "absolute", left: -10000, width: 1, height: 1 });
  await act(async () => tree.find(n => String(n.type) === "modal").props.onChange(0));
  expect(native.focus.mock.calls).toEqual([[42]]);
  await act(async () => title.props.onLayout()); expect(native.focus).toHaveBeenCalledTimes(1);
});
test("disabled ActionSheet action retains button semantics and cannot activate", async () => {
  const press = vi.fn(); const tree = await render(h(ActionSheet, { title: "Where", onClose() {}, actions: [{ icon: "add", label: "Create a place", status: "Loading", disabled: true, onPress: press }] }), "xxxl");
  const button = tree.findAllByType("button").find(n => n.props.accessibilityLabel === "Create a place, Loading");
  expect(button?.props.accessibilityState).toEqual({ disabled: true }); expect(button?.props.disabled).toBe(true);
  button?.props.onPress?.(); expect(press).not.toHaveBeenCalled();
});
