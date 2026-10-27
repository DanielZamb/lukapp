import * as React from "react";
import { createElement as h, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Presentation, ReflowRow, ReflowItem, Text, TextInput, useTextPreset, useReflowStyles, FactRow, IconButton, AmountField, Field, ValueRow, SecondaryButton, useNativeStackHeaderConfig, useNativeStackHeaderOptions } from "./core";
import { ResponsiveThemeProvider, ThemeProvider } from "./themeContext";
import { textPresets, textPresetSpec, type TextPreset } from "./textPresets";
import { font } from "./tokens";
import { readableLayout, type LayoutTier } from "./layout";
import { Sheet } from "./Sheet";
import { PickerSheet } from "./PickerSheet";
import { ActionSheet, SearchPicker } from "./pickers";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
const native = vi.hoisted(() => ({ focus: vi.fn(), dismiss: vi.fn(), present: vi.fn(), platform: { OS: "ios", Version: 18 } }));
vi.mock("react-native", () => ({ Text: "text", View: "view", Pressable: "button", TextInput: "input", ScrollView: "scroll", ActivityIndicator: "spinner", KeyboardAvoidingView: "keyboard", Platform: native.platform, useWindowDimensions: () => ({ width: 390, height: 800, fontScale: 2 }),
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

test("IconButton preserves caller disabled state unless the explicit disabled prop overrides it", async () => {
  let tree = await render(h(IconButton, { accessibilityLabel: "Unavailable", accessibilityState: { disabled: true, busy: true } }));
  expect(tree.findByType("button").props.accessibilityState).toEqual({ disabled: true, busy: true });
  await act(async () => root?.unmount());
  tree = await render(h(IconButton, { accessibilityLabel: "Available", disabled: false, accessibilityState: { disabled: true, busy: true } }));
  expect(tree.findByType("button").props.accessibilityState).toEqual({ disabled: false, busy: true });
});
test.each(["ios", "android"])("custom host keeps TextInput scaling props and rendered metrics on %s at scale 2", async platform => {
  native.platform.OS = platform;
  native.platform.Version = 37;
  function CustomHost() { return h("custom-input", { ...useTextPreset("batchAmount") }); }
  const tree = await render(h(ResponsiveThemeProvider, null, h(React.Fragment, null, h(TextInput, { preset: "batchAmount" }), h(CustomHost))));
  const input = tree.findByType("input");
  const custom = tree.find(n => String(n.type) === "custom-input");
  expect(custom.props.allowFontScaling).toBe(true);
  expect(custom.props.maxFontSizeMultiplier).toBe(1.5);
  expect(flat(custom.props.style)).toEqual(flat(input.props.style));
  expect(input.props.maxFontSizeMultiplier).toBe(custom.props.maxFontSizeMultiplier);
  if (platform === "ios") expect(Number(flat(custom.props.style).fontSize) * Math.min(2, custom.props.maxFontSizeMultiplier)).toBe(27);
  native.platform.OS = "ios";
  native.platform.Version = 18;
});

test.each(["default", "reflow"] as const)("AmountField exactly preserves PostingForm amountRow at %s", async tier => {
  const change = vi.fn();
  const tree = await render(h(AmountField, { currency: "COP", legacyCurrency: "$", value: "-0", onChangeText: change, editable: true, placeholder: "-0", accessibilityLabel: "Signed amount", style: { color: "#000" } }), tier);
  expect(flat(tree.findByType("view").props.style)).toEqual({ flexDirection: tier === "default" ? "row" : "column", alignItems: tier === "default" ? "center" : "stretch", gap: 8, minHeight: 72 });
  expect(tree.findByType("text").children).toEqual(["$"]);
  expect(flat(tree.findByType("text").props.style)).toEqual({ fontFamily: font.semibold, fontSize: 28, color: "#6e6e6e" });
  const input = tree.findByType("input");
  expect(flat(input.props.style)).toEqual({ fontFamily: font.extrabold, fontSize: 44, minHeight: 64, padding: 0, flex: tier === "default" ? 1 : 0, color: "#000" });
  expect(input.props.value).toBe("-0"); expect(input.props.editable).toBe(true);
  input.props.onChangeText("-1.000"); expect(change.mock.calls).toEqual([["-1.000"]]);
});
test("AmountField uses focused card, ISO currency, capped input, and transfer direction icon at XXXL", async () => {
  const tree = await render(h(AmountField, { currency: "COP", legacyCurrency: "$", value: "10", directionLabel: "Moves between places" }), "xxxl");
  const card = flat(tree.findByType("view").props.style);
  expect(card).toMatchObject({ padding: 15, borderRadius: 24, gap: 12, borderWidth: 2 });
  expect(tree.findAllByType("text").map(n => n.children.join(""))).toEqual(["COP", "Moves between places"]);
  expect(tree.findByType("input").props.maxFontSizeMultiplier).toBe(1.2);
  expect(tree.find(n => String(n.type) === "icon").props.name).toBe("swap-horizontal");
});
test.each(["default", "reflow", "xxxl"] as const)("description Field preserves legacy and owns its XXXL input at %s", async tier => {
  const tree = await render(h(Field, { presentation: "description", label: "Description", value: "Taxi", onChangeText() {} }), tier);
  expect(flat(tree.findByType("view").props.style)).toEqual({ gap: tier === "xxxl" ? 8 : 4 });
  const label = tree.findByType("text"); const input = tree.findByType("input");
  expect(input.props.multiline).toBe(true); expect(input.props.value).toBe("Taxi");
  if (tier !== "xxxl") {
    expect(flat(label.props.style)).toEqual({ fontFamily: font.semibold, fontSize: 14, color: "#6e6e6e" });
    expect(flat(input.props.style)).toEqual({ fontFamily: font.regular, fontSize: 16, lineHeight: 24, minHeight: 44, padding: 0, color: "#0a0a0a" });
  } else expect(flat(input.props.style)).toMatchObject({ minHeight: 64, padding: 16, borderWidth: 1, borderRadius: 18 });
});
test.each(["default", "reflow"] as const)("field ValueRow keeps its complete existing default tree at %s", async tier => {
  const props = { title: "Place", value: "Cash", icon: "wallet-outline", onPress() {} } satisfies Parameters<typeof ValueRow>[0];
  await render(h(ValueRow, props), tier); const before = JSON.stringify(root?.toJSON());
  await act(async () => root?.unmount());
  await render(h(ValueRow, { ...props, presentation: "field" }), tier);
  expect(JSON.stringify(root?.toJSON())).toBe(before);
});
test("field ValueRow puts muted label above status and retains whole description in accessibility", async () => {
  const tree = await render(h(ValueRow, { presentation: "field", title: "Place", value: "Cash", meta: "A whole explanation", icon: "wallet-outline", onPress() {} }), "xxxl");
  const texts = tree.findAllByType("text");
  expect(texts.map(n => n.children.join(""))).toEqual(["Place", "Cash", "A whole explanation"]);
  expect(texts[1]?.props.maxFontSizeMultiplier).toBe(1.3);
  expect(tree.findByType("button").props.accessibilityLabel).toBe("Place, Cash, A whole explanation");
});
test("tappable FactRow matches D4 option geometry and exposes one button", async () => {
  const press = vi.fn(); const tree = await render(h(FactRow, { label: "Look", value: "Cash wallet green", emoji: "💰", actionLabel: "Change", onPress: press }), "xxxl");
  const buttons = tree.findAllByType("button"); expect(buttons).toHaveLength(1);
  expect(buttons[0]?.props.accessibilityLabel).toBe("Look, Cash wallet green, Change");
  expect(flat(buttons[0]?.props.style)).toMatchObject({ minHeight: 60, gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18 });
  expect(buttons[0]?.findAllByType("text").map(n => n.children.join(""))).toEqual(["💰", "Cash wallet green", "Change"]);
  buttons[0]?.props.onPress(); expect(press).toHaveBeenCalledTimes(1);
});
test("tappable FactRow returns the exact default SecondaryButton", async () => {
  const legacy = h(SecondaryButton, { label: "Pick a look", onPress() {} });
  await render(legacy); const before = JSON.stringify(root?.toJSON());
  await act(async () => root?.unmount());
  await render(h(FactRow, { label: "Look", value: "Cash", onPress() {}, actionLabel: "Change", legacy }));
  expect(JSON.stringify(root?.toJSON())).toBe(before);
});
test.each(["default", "reflow", "xxxl"] as const)("native header helpers preserve configs and hide only XXXL at %s", async tier => {
  const config = { hidden: false, title: "Batch" }; const options = { headerShown: true, title: "Home" };
  function Consumer() { return h("headers", { config: useNativeStackHeaderConfig(config), options: useNativeStackHeaderOptions(options) }); }
  const tree = await render(h(Consumer), tier); const result = tree.find(n => String(n.type) === "headers");
  expect(result.props.config).toEqual({ hidden: tier === "xxxl", title: "Batch" });
  expect(result.props.options).toEqual({ headerShown: tier !== "xxxl", title: "Home" });
  if (tier !== "xxxl") { expect(result.props.config).toBe(config); expect(result.props.options).toBe(options); }
});
const pickerOptions = [{ value: "cop", label: "Colombian peso", detail: "COP" }, { value: "usd", label: "US dollar", detail: "USD" }];
test("SearchPicker stages add intent before native dismissal and notifies actual presentation", async () => {
  const calls: string[] = []; const ref = React.createRef<import("@gorhom/bottom-sheet").BottomSheetModal>();
  native.dismiss.mockImplementation(() => { calls.push("dismiss requested"); });
  const tree = await render(h(SearchPicker, { title: "Places", placeholder: "Search", value: "cop", options: pickerOptions, onChange() {}, onClose: () => calls.push("closed"), onDismiss: () => calls.push("dismissed"), onPresentedChange: shown => calls.push(`presented:${shown}`), sheetRef: ref, onAddRequest: () => calls.push("staged") }), "xxxl");
  expect(native.present).not.toHaveBeenCalled();
  const modal = tree.find(n => String(n.type) === "modal");
  await act(async () => modal.props.onChange(0));
  const add = tree.findAllByType("button").find(n => n.props.accessibilityLabel === "Add a place");
  await act(async () => { add?.props.onPress(); add?.props.onPress(); });
  expect(calls).toEqual(["presented:true", "staged", "dismiss requested"]);
  await act(async () => modal.props.onDismiss());
  expect(calls).toEqual(["presented:true", "staged", "dismiss requested", "presented:false", "closed", "dismissed"]);
});
test("SearchPicker deferred add fires only once after completed dismissal", async () => {
  const calls: string[] = [];
  const tree = await render(h(SearchPicker, { title: "Places", placeholder: "Search", value: "cop", options: pickerOptions, onChange() {}, onClose: () => calls.push("closed"), onAdd: () => calls.push("add") }), "xxxl");
  const add = tree.findAllByType("button").find(n => n.props.accessibilityLabel === "Add a place");
  await act(async () => add?.props.onPress()); expect(calls).toEqual([]);
  const modal = tree.find(n => String(n.type) === "modal");
  await act(async () => { modal.props.onDismiss(); modal.props.onDismiss(); });
  expect(calls.filter(c => c === "add")).toEqual(["add"]);
  expect(calls.slice(0, 2)).toEqual(["closed", "add"]);
});
test("SearchPicker controlled search filters options and busy blocks add, selection, close, and edits", async () => {
  const search = vi.fn(); const add = vi.fn(); const change = vi.fn();
  const tree = await render(h(SearchPicker, { title: "Places", placeholder: "Search", value: "cop", options: pickerOptions, onChange: change, onClose() {}, onAddRequest: add, busy: true, search: "USD", onSearchChange: search }), "xxxl");
  const input = tree.findByType("input"); expect(input.props.value).toBe("USD"); expect(input.props.editable).toBe(false);
  expect(tree.findAllByType("text").map(n => n.children.join(""))).not.toContain("Colombian peso");
  expect(tree.findAllByType("text").map(n => n.children.join(""))).toContain("US dollar");
  const modal = tree.find(n => String(n.type) === "modal"); expect(modal.props.enablePanDownToClose).toBe(false); expect(modal.props.enableHandlePanningGesture).toBe(false);
  await act(async () => { input.props.onChangeText("COP"); for (const button of tree.findAllByType("button")) button.props.onPress?.(); });
  expect(search).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled(); expect(add).not.toHaveBeenCalled(); expect(native.dismiss).not.toHaveBeenCalled();
});

function visualTree() {
  return JSON.stringify(root?.toJSON(), (key, value) => key === "onChange" ? undefined : typeof value === "function" ? "[callback]" : value);
}
async function switchTier(node: ReactElement, tier: LayoutTier) {
  const layout = readableLayout({ width: tier === "reflow" ? 280 : 390, fontScale: tier === "xxxl" ? 1.5 : 1 });
  await act(async () => root?.update(h(ThemeProvider, { layout }, node)));
  if (!root) throw new Error("No renderer");
  return root.root;
}
test.each(["default", "reflow"] as const)("managed Sheet legacy native body stays pixel-identical to native Sheet at %s", async tier => {
  const body = h("sheet-scroll", { contentContainerStyle: { padding: 24, gap: 20 } }, h("text", { style: { fontSize: 16 } }, "Today's body"));
  const nativeModalProps = { snapPoints: ["80%"], backgroundStyle: { backgroundColor: "#fff" }, enableDynamicSizing: false };
  await render(h(Sheet, { body: "native", nativeModalProps, onClose() {} }, body), tier);
  const before = visualTree(); await act(async () => root?.unmount());
  await render(h(Sheet, { label: "Setup", tall: true, legacyBody: body, legacyNativeModalProps: nativeModalProps, onClose() {} }, h("xxxl-body")), tier);
  expect(visualTree()).toBe(before);
});
test("iOS in-process tier changes keep one presented SheetModal and ref without re-presenting", async () => {
  const ref = React.createRef<import("@gorhom/bottom-sheet").BottomSheetModal>(); const dismissed = vi.fn();
  const node = h(Sheet, { label: "Setup", tall: true, sheetRef: ref, onDismiss: dismissed, legacyBody: h("legacy-native"), legacyFooter: h("legacy-footer"), footer: h("new-footer") }, h("xxxl-body"));
  let tree = await render(node); const modal = tree.find(n => String(n.type) === "modal"); const handle = ref.current;
  await act(async () => { ref.current?.present(); modal.props.onChange(0); });
  expect(native.present).toHaveBeenCalledTimes(1);
  for (const tier of ["xxxl", "reflow", "xxxl", "default"] as const) {
    tree = await switchTier(node, tier);
    expect(tree.find(n => String(n.type) === "modal")).toBe(modal);
    expect(ref.current).toBe(handle);
    expect(tree.findAll(n => String(n.type) === "legacy-native")).toHaveLength(tier === "xxxl" ? 0 : 1);
    expect(tree.findAll(n => String(n.type) === "legacy-footer")).toHaveLength(tier === "xxxl" ? 0 : 1);
    expect(tree.findAll(n => String(n.type) === "xxxl-body")).toHaveLength(tier === "xxxl" ? 1 : 0);
  }
  expect(native.present).toHaveBeenCalledTimes(1); expect(native.dismiss).not.toHaveBeenCalled(); expect(dismissed).not.toHaveBeenCalled();
  await act(async () => { ref.current?.dismiss(); modal.props.onDismiss(); });
  expect(native.dismiss).toHaveBeenCalledTimes(1); expect(dismissed).toHaveBeenCalledTimes(1);
});
test.each(["default", "reflow"] as const)("PickerSheet legacy scroll body preserves the original PickerSheet tree at %s", async tier => {
  const body = h("view", { style: { gap: 16 } }, h("text", null, "Search places"), h("input", { value: "Cash" }));
  await render(h(PickerSheet, null, body), tier); const before = visualTree(); await act(async () => root?.unmount());
  await render(h(PickerSheet, { legacyBody: body, children: h("xxxl-options") }), tier); expect(visualTree()).toBe(before);
});
test("PickerSheet native legacy body has no extra scroller and retains one owner across tiers", async () => {
  const ref = React.createRef<import("@gorhom/bottom-sheet").BottomSheetModal>(); const dismiss = vi.fn();
  const node = h(PickerSheet, { sheetRef: ref, legacyBodyMode: "native", legacyBody: h("date-native"), legacyNativeModalProps: { snapPoints: ["50%"], backgroundStyle: { backgroundColor: "#123" } }, onDismiss: dismiss, children: h("new-dates") });
  let tree = await render(node); const modal = tree.find(n => String(n.type) === "modal");
  expect(tree.findAll(n => String(n.type) === "sheet-scroll")).toHaveLength(0); expect(modal.props.snapPoints).toEqual(["50%"]); expect(modal.props.backgroundStyle).toEqual({ backgroundColor: "#123" });
  await act(async () => { ref.current?.present(); modal.props.onChange(0); });
  tree = await switchTier(node, "xxxl"); expect(tree.find(n => String(n.type) === "modal")).toBe(modal); expect(tree.findAll(n => String(n.type) === "new-dates")).toHaveLength(1);
  expect(native.present).toHaveBeenCalledTimes(1); expect(native.dismiss).not.toHaveBeenCalled(); expect(dismiss).not.toHaveBeenCalled();
  await act(async () => modal.props.onDismiss()); expect(dismiss).toHaveBeenCalledTimes(1);
});
test("SearchPicker stable legacy body keeps external presentation and callbacks during mounted tier changes", async () => {
  const ref = React.createRef<import("@gorhom/bottom-sheet").BottomSheetModal>(); const close = vi.fn(); const dismissed = vi.fn();
  const node = h(SearchPicker, { title: "Places", placeholder: "Search places", options: pickerOptions, value: "cop", onChange() {}, onClose: close, onDismiss: dismissed, sheetRef: ref, legacyBody: h("legacy-place-picker") });
  let tree = await render(node); const modal = tree.find(n => String(n.type) === "modal"); const handle = ref.current;
  await act(async () => { ref.current?.present(); modal.props.onChange(0); });
  for (const tier of ["xxxl", "reflow", "default", "xxxl"] as const) {
    tree = await switchTier(node, tier); expect(tree.find(n => String(n.type) === "modal")).toBe(modal); expect(ref.current).toBe(handle);
    expect(tree.findAll(n => String(n.type) === "legacy-place-picker")).toHaveLength(tier === "xxxl" ? 0 : 1);
    expect(tree.findAllByType("input")).toHaveLength(tier === "xxxl" ? 1 : 0);
  }
  expect(native.present).toHaveBeenCalledTimes(1); expect(native.dismiss).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  await act(async () => modal.props.onDismiss()); expect(close).toHaveBeenCalledTimes(1); expect(dismissed).toHaveBeenCalledTimes(1);
});

test("stable sheet owners deduplicate a dismissal callback forwarded through native and public slots", async () => {
  const dismissed = vi.fn();
  let tree = await render(h(Sheet, { label: "Setup", legacyBody: h("old-body"), legacyNativeModalProps: { onDismiss: dismissed }, onDismiss: dismissed }, h("new-body")));
  await act(async () => tree.find(n => String(n.type) === "modal").props.onDismiss()); expect(dismissed).toHaveBeenCalledTimes(1);
  await act(async () => root?.unmount()); dismissed.mockClear();
  tree = await render(h(SearchPicker, { title: "Places", placeholder: "Search", value: "cop", options: pickerOptions, onChange() {}, onClose: dismissed, onDismiss: dismissed, legacyBody: h("old-picker"), legacyNativeModalProps: { onDismiss: dismissed } }));
  await act(async () => tree.find(n => String(n.type) === "modal").props.onDismiss()); expect(dismissed).toHaveBeenCalledTimes(1);
});
