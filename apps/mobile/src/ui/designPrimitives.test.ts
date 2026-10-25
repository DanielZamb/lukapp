import * as React from "react";
import { createElement as h, createRef, type ReactElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ActionBar, ActionTile, AlertDot, BrandBand, BudgetRow, CenteredMoment, ChipSet, Choice, ChoiceRow, DateSection, DestinationRow, EmojiGrid, EmojiTile, FlowSummary, Group, IconTile, InlineNotice, LookChip, MoneyHero, NoteCard, PreviewGroup, ProgressJar, Screen, Segmented, ShareBar, SheetHeader, Skeleton, Text, TintCard, ValueRow } from "./core";
import { Sheet } from "./Sheet";
import { ActionSheet, SearchPicker } from "./pickers";
import { KeyboardFrame, keyboardOverlap } from "./KeyboardFrame";
import { FooterFrame } from "./ActionBar";
import { ResponsiveThemeProvider, ThemeProvider } from "./themeContext";
import { readableLayout, type LayoutTier } from "./layout";
import { amountGroups, composeHandlers, heroFit, mix, moneyTone } from "./design";
import { chipRows } from "./selection";
import { androidScaledSize } from "./nativeText";
import { textSpecs } from "./typography";

const native = vi.hoisted(() => ({ fontScale: 1.3, scroll: { scrollTo: vi.fn() } }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
vi.mock("react-native", () => ({ Text: "text", View: "view", Image: "image", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner", KeyboardAvoidingView: "keyboard", Platform: { OS: "android", Version: 37 },
  useWindowDimensions: () => ({ width: 320, height: 700, fontScale: native.fontScale }),
  AccessibilityInfo: { setAccessibilityFocus: vi.fn() }, findNodeHandle: () => 42,
  Keyboard: { metrics: () => undefined, addListener: () => ({ remove() {} }) },
  Dimensions: { get: () => ({ height: 700 }) },
  BackHandler: { addEventListener: () => ({ remove() {} }) }, StyleSheet: { create: (value: unknown) => value, flatten: flat, hairlineWidth: 1 } }));
vi.mock("@gorhom/bottom-sheet", () => ({ BottomSheetModal: "modal", BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetFooter: "sheet-footer", BottomSheetBackdrop: "backdrop" }));
let root: ReactTestRenderer | undefined;
const noop = () => {};
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); native.fontScale = 1.3; });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
function flat(style: unknown): Record<string, unknown> { return Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : typeof style === "object" && style !== null ? Object.fromEntries(Object.entries(style)) : {}; }
async function render(element: ReactElement, tier: LayoutTier = "xxxl") {
  const layout = readableLayout({ width: tier === "reflow" ? 290 : 320, fontScale: tier === "xxxl" ? native.fontScale : 1 });
  await act(async () => { root = create(h(ThemeProvider, { layout }, element), { createNodeMock: node => node.type === "scroll" || node.type === "sheet-scroll" ? native.scroll : { present: noop, dismiss: noop } }); });
  if (!root) throw new Error("No renderer");
  return root.root;
}
function stableTree() { return JSON.stringify(root?.toJSON(), (key, value) => typeof value === "function" ? key === "style" ? value({ pressed: false }) : "[callback]" : value, 2); }
const color = { light: "#6d28d9", dark: "#c4b5fd" };

test.each([1.3, 2])("MoneyHero fits COP 56.526.163,06 at 320dp and scale %s", async scale => {
  native.fontScale = scale;
  const tree = await render(h(MoneyHero, { currency: "COP", amount: "56.526.163,06", floor: 34.6 }));
  const parent = tree.findByType("view");
  await act(async () => parent.props.onLayout({ nativeEvent: { layout: { width: 288 } } }));
  const probes = tree.findAllByType("text").filter(node => node.props.onTextLayout);
  await act(async () => probes[0]?.props.onTextLayout({ nativeEvent: { lines: [{ width: 332, capHeight: 38 }] } }));
  const number = tree.findAllByType("text")[1];
  expect(flat(number?.props.style).fontSize).toBeCloseTo(38.125);
  expect(number?.props.maxFontSizeMultiplier).toBe(1.2);
  expect(parent.props.accessibilityLabel).toBe("COP 56.526.163,06");
  expect(flat(tree.findAllByType("text")[0]?.props.style).color).toBe("#6d28d9");
});
test("MoneyHero keeps its floor and wraps complete groups", async () => {
  const tree = await render(h(MoneyHero, { currency: "COP", amount: "56.526.163,06", floor: 50, groupSeparator: "." }));
  await act(async () => tree.findByType("view").props.onLayout({ nativeEvent: { layout: { width: 130 } } }));
  await act(async () => tree.findAllByType("text").find(node => node.props.onTextLayout)?.props.onTextLayout({ nativeEvent: { lines: [{ width: 332, capHeight: 38 }] } }));
  const visible = tree.findAllByType("text").filter(node => !node.props.onTextLayout);
  expect(visible.map(node => node.children.join(""))).toEqual(["COP", "56.", "526.", "163,06"]);
  expect(flat(visible[1]?.props.style).fontSize).toBeCloseTo(50 / 1.2);
  expect(heroFit({ available: 288, measured: 270, target: 52.8, floor: 34.6 })).toEqual({ size: 52.8, wrap: false });
  expect(amountGroups("−56.526.163,06", ".")).toEqual(["−56.", "526.", "163,06"]);
});
test("ListRow clamps prose after money and keeps its complete spoken description", async () => {
  const description = "Guaya que me toco comprar al lado de compensar porque no lleve mi guaya, alli tambien venden raquetas";
  const tree = await render(h(ValueRow, { title: "One off purchases", value: "−$20.000", meta: description, onPress: noop, leading: h(EmojiTile, { emoji: "🖍️", color, size: 36 }) }));
  const texts = tree.findAllByType("text");
  expect(texts.slice(1).map(node => node.children.join(""))).toEqual(["One off purchases", "−$20.000", description]);
  expect(texts.at(-1)?.props.numberOfLines).toBe(2);
  expect(tree.findByType("button").props.accessibilityLabel).toBe(`One off purchases, −$20.000, ${description}`);
  expect(texts[1]?.props.numberOfLines).toBeUndefined();
});
test("ChipSet pairs options and spans a wide option with no check icon", async () => {
  const options = [{ value: "normal", label: "Normal" }, { value: "transfer", label: "Transfer" }, { value: "initial", label: "Initial balance", wide: true }];
  const change = vi.fn();
  const tree = await render(h(ChipSet, { options, value: "transfer", onChange: change }));
  expect(chipRows(options).map(row => row.length)).toEqual([2, 1]);
  expect(tree.findAll(node => String(node.type) === "icon")).toHaveLength(0);
  const selected = tree.findAllByType("button")[1];
  expect(selected?.props.accessibilityState).toEqual({ checked: true, disabled: false });
  expect(flat(selected?.props.style)).toMatchObject({ minHeight: 56, borderWidth: 2 });
  await act(async () => selected?.props.onPress());
  expect(change).toHaveBeenCalledWith("transfer");
});
test("ActionBar reserves the scroller through the Screen footer and leaves native IME/insets with its host", async () => {
  const tree = await render(h(Screen, { footer: h(ActionBar, { primary: { label: "Post", onPress: noop }, secondary: { label: "Add one", onPress: noop }, status: h(InlineNotice, { tone: "warning", title: "Add a description to post" }) }) }, h("body")));
  expect(tree.find(node => String(node.type) === "scroll").findAllByType(FooterFrame)).toHaveLength(0);
  expect(tree.find(node => String(node.type) === "safe-area").findAllByType(FooterFrame)).toHaveLength(1);
  expect(tree.findAllByType(KeyboardFrame)).toHaveLength(1);
  expect(keyboardOverlap(711, 425)).toBe(286);
  expect(keyboardOverlap(425, 425)).toBe(0);
  expect(keyboardOverlap(711, null)).toBe(0);
  expect(flat(tree.findByType(FooterFrame).findByType("view").props.style)).toMatchObject({ paddingVertical: 12, paddingHorizontal: 16, gap: 8 });
  expect(tree.findAllByType("button").map(node => flat(typeof node.props.style === "function" ? node.props.style({ pressed: false }) : node.props.style).minHeight)).toEqual([68, 60]);
});
test("tall Sheet shares the footer frame and lets Gorhom reserve its real measured height", async () => {
  const tree = await render(h(Sheet, { label: "Details", tall: true, footer: h("actions") }, h("body")));
  const modal = tree.find(node => String(node.type) === "modal");
  expect(modal.props).toMatchObject({ android_keyboardInputMode: "adjustPan", keyboardBehavior: "interactive", keyboardBlurBehavior: "restore" });
  expect(tree.find(node => String(node.type) === "sheet-scroll").props.enableFooterMarginAdjustment).toBe(true);
  const footer = modal.props.footerComponent({ animatedFooterPosition: {} });
  expect(footer.props.bottomInset).toBe(16);
  expect(footer.props.children.type).toBe(FooterFrame);
});
test("tall Sheet accepts ActionBar without a second footer frame", async () => {
  const actionBar = h(ActionBar, { primary: { label: "Save", onPress: noop } });
  const tree = await render(h(Sheet, { label: "Details", tall: true, footer: actionBar }));
  const footer = tree.find(node => String(node.type) === "modal").props.footerComponent({ animatedFooterPosition: {} });
  expect(footer.props.children.type).toBe(FooterFrame);
  expect(footer.props.children.props.children).toBe(actionBar);
});
test("nested footer fragments share one native frame and secondary pending disables presses", async () => {
  const tree = await render(h(FooterFrame, null, h(React.Fragment, null, h(ActionBar, { secondary: { label: "Reverse entry", pending: true, icon: "arrow-undo-outline", tone: "danger", onPress: noop } }))));
  expect(tree.findAllByType("view").filter(node => flat(node.props.style).borderTopWidth === 1)).toHaveLength(1);
  expect(tree.findByType("button").props).toMatchObject({ disabled: true, accessibilityState: { disabled: true, busy: true } });
  expect(tree.findAll(node => String(node.type) === "icon").map(node => node.props.name)).toEqual(["arrow-undo-outline"]);
});
test.each(["JPY", "BHD"])("summary and budget amounts retain %s precision", async currency => {
  const minor = currency === "JPY" ? 100 : 1234;
  const label = currency === "JPY" ? "¥100" : "BHD 1,234";
  const tree = await render(h(FlowSummary, { currency, net: minor, out: 0, in: minor }));
  expect(tree.findAllByType("text").map(node => node.children.join(""))).toContain(label);
  expect(tree.findAllByType("text").find(node => node.props.accessibilityLabel)?.props.accessibilityLabel).toBe(currency === "JPY" ? "JPY 100" : "BHD 1,234");
});
test("MoneyHero normalizes measurement and visible hero typography", async () => {
  const tree = await render(h(MoneyHero, { currency: "COP", amount: "56.526.163,06", style: { fontSize: 22, letterSpacing: -1.1 }, floor: 34.6 }));
  const number = tree.findAllByType("text")[1];
  const probe = tree.findAllByType("text").find(node => node.props.onTextLayout);
  expect(flat(number?.props.style)).toMatchObject({ fontSize: 44, letterSpacing: -2.2 });
  expect(flat(probe?.props.style)).toMatchObject({ fontSize: 44, letterSpacing: -2.2 });
});
test("ActionBar selects primary action icons", async () => {
  const tree = await render(h(ActionBar, { primary: { label: "Post money", icon: "add", onPress: noop } }));
  expect(tree.findAll(node => String(node.type) === "icon").map(node => node.props.name)).toEqual(["add"]);
});
test.each([0, 2, 4, 6, 33])("PreviewGroup shows four at most and counts all %s items", async totalCount => {
  const tree = await render(h(PreviewGroup<number>, { items: Array.from({ length: totalCount }, (_, i) => i), renderItem: item => h(ValueRow, { key: item, title: `Row ${item}` }), totalCount, viewAllLabel: count => `View all ${count} categories`, onViewAll: noop }));
  expect(tree.findAllByType(ValueRow)).toHaveLength(Math.min(totalCount, 4));
  expect(tree.findAllByType("button").map(node => node.props.accessibilityLabel)).toEqual(totalCount > 4 ? [`View all ${totalCount} categories`] : []);
  const groups = tree.findAllByType("view").filter(node => flat(node.props.style).overflow === "hidden");
  expect(groups.every(group => group.findAllByType(ValueRow).length <= 2)).toBe(true);
});
test.each([undefined, "Nu cajita"])("DateSection places shared place %s below its date", async place => {
  const tree = await render(h(DateSection, { date: "June 9", net: { label: "−$374K", minorUnits: -37400000 }, place }, h(ValueRow, { title: "Cofee" })));
  expect(tree.findAllByType("text").map(node => node.children.join(""))).toEqual(["June 9", "−$374K", ...(place ? [place] : []), "Cofee"]);
});
test("money tone and category mixes keep sign and contrast roles", () => {
  expect([moneyTone(100), moneyTone(-100), moneyTone(0), moneyTone(10, true)]).toEqual(["positive", "default", "default", "danger"]);
  expect(mix("#6d28d9", "#ffffff", 0.1)).toBe("#f0eafb");
  expect(textSpecs.xxxl.eyebrow).toMatchObject({ fontSize: 12, maxScale: 1.3, letterSpacing: 0.48 });
  expect(textSpecs.xxxl.status.maxScale).toBe(1.3);
  expect(textSpecs.xxxl.meta.maxScale).toBeUndefined();
});
test.each(["default", "reflow", "xxxl"] as const)("Screen forwards ref and composes scroll callbacks in %s", async tier => {
  const scrollRef = createRef<React.ComponentRef<typeof import("react-native").ScrollView>>();
  const first = vi.fn(), second = vi.fn();
  const tree = await render(h(Screen, { scrollRef, onScroll: first, scrollProps: { onScroll: second, scrollEventThrottle: 16 } }), tier);
  expect(scrollRef.current).toBe(native.scroll);
  const event = { nativeEvent: { contentOffset: { y: 40 } } };
  tree.find(node => String(node.type) === "scroll").props.onScroll(event);
  expect(first).toHaveBeenCalledWith(event); expect(second).toHaveBeenCalledWith(event);
  expect(tree.find(node => String(node.type) === "scroll").props.scrollEventThrottle).toBe(16);
});
test("managed Sheet forwards scroll ref and composes callbacks", async () => {
  const scrollRef = createRef<React.ComponentRef<typeof import("@gorhom/bottom-sheet").BottomSheetScrollView>>();
  const first = vi.fn(), second = vi.fn();
  const tree = await render(h(Sheet, { label: "Details", tall: true, scrollRef, onScroll: first, scrollProps: { onScroll: second, scrollEventThrottle: 16 } }));
  expect(scrollRef.current).toBe(native.scroll);
  const event = { nativeEvent: { contentOffset: { y: 40 } } };
  tree.find(node => String(node.type) === "sheet-scroll").props.onScroll(event);
  expect(first).toHaveBeenCalledWith(event); expect(second).toHaveBeenCalledWith(event);
  expect(composeHandlers(first, first)).toBe(first);
});
const newExamples = (legacy?: ReactNode): ReactElement[] => [
  h(ChoiceRow, { label: "Comida", kind: "checkbox", selected: true, onPress: noop, legacy }),
  h(ActionBar, { primary: { label: "Post", onPress: noop }, legacy }), h(ActionSheet, { title: "Actions", actions: [], onClose: noop, legacy }), h(AlertDot, { count: 1, legacy }),
  h(BudgetRow, { category: { label: "Comida", emoji: "🍔", color }, limitMinorUnits: 100, consumptionMinorUnits: 120, currency: "COP", legacy }),
  h(CenteredMoment, { icon: "checkmark", title: "Posted", legacy }), h(ChipSet, { options: [], value: "a", onChange: noop, legacy }), h(EmojiGrid, { options: [], value: "a", onChange: noop, legacy }), h(EmojiTile, { emoji: "🍔", color, legacy }),
  h(FlowSummary, { net: 0, out: 0, in: 0, currency: "COP", legacy }), h(IconTile, { icon: "add", legacy }), h(InlineNotice, { tone: "warning", title: "Wait", legacy }), h(LookChip, { emoji: "🍔", color, label: "Comida", legacy }),
  h(NoteCard, { tone: "neutral", icon: "add", title: "Note", body: "Body", legacy }), h(PreviewGroup, { items: [], renderItem: () => null, totalCount: 0, viewAllLabel: String, onViewAll: noop, legacy }), h(ProgressJar, { value: 0.5, color, legacy }),
  h(SearchPicker, { title: "Places", placeholder: "Search", options: [], value: "a", onChange: noop, onClose: noop, legacy }), h(Segmented, { options: [], value: "a", onChange: noop, legacy }), h(ShareBar, { value: 0.5, color, legacy }), h(SheetHeader, { title: "Title", onClose: noop, legacy }), h(Skeleton, { width: "100%", height: 20, legacy }),
  h(DateSection, { date: "June 9", legacy }),
];
test.each(["default", "reflow"] as const)("every new component returns null or the exact supplied legacy tree in %s", async tier => {
  await render(h(React.Fragment, null, ...newExamples()), tier); expect(root?.toJSON()).toBeNull();
  const legacy = h("legacy", { id: "unchanged" }, "Today's markup");
  await act(async () => root?.unmount());
  await render(h(React.Fragment, null, ...newExamples(legacy)), tier);
  expect(root?.toJSON()).toEqual(Array.from({ length: newExamples().length }, () => ({ type: "legacy", props: { id: "unchanged" }, children: ["Today's markup"] })));
});
test.each(["default", "reflow"] as const)("counterpart and wrapper default identities stay frozen in %s", async tier => {
  const children = h("existing", null, "Markup");
  await render(h(BrandBand, null, h(TintCard, null, children)), tier);
  expect(root?.toJSON()).toEqual({ type: "existing", props: {}, children: ["Markup"] });
  await act(async () => root?.unmount());
  const choice = { label: "Monthly", selected: true, onPress: noop };
  await render(h(ChoiceRow, choice), tier); const row = stableTree();
  expect(row).toMatchSnapshot();
  await act(async () => root?.unmount());
  await render(h(Choice, choice), tier); expect(stableTree()).toBe(row);
  await act(async () => root?.unmount());
  const destination = { title: "Plans", detail: "Budget and recovery", icon: "layers-outline", onPress: noop } satisfies Parameters<typeof DestinationRow>[0];
  await render(h(DestinationRow, destination), tier); const tile = stableTree(); expect(tile).toMatchSnapshot();
  await act(async () => root?.unmount());
  await render(h(ActionTile, destination), tier); expect(stableTree()).toBe(tile);
  await act(async () => root?.unmount());
  await render(h(MoneyHero, { currency: "COP", amount: "56.526.163,06" }), tier); expect(stableTree()).toMatchSnapshot();
});

test("responsive Android provider applies the capped HTML target without disabling font scaling", async () => {
  native.fontScale = 1.5;
  await act(async () => { root = create(h(ResponsiveThemeProvider, null, h(Text, { variant: "hero" }, "80.000"))); });
  const text = root?.root.findByType("text");
  const style = flat(text?.props.style);
  expect(text?.props.allowFontScaling).toBe(true);
  expect(text?.props.maxFontSizeMultiplier).toBe(1.2);
  expect(androidScaledSize(Number(style.fontSize), 1.5)).toBeCloseTo(52.8);
  expect(androidScaledSize(Number(style.lineHeight), 1.5)).toBeCloseTo(54.912);
});
