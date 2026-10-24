import * as React from "react";
import { createElement as h, createRef, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, expectTypeOf, test, vi } from "vitest";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { ActionTile, Choice, Columns, Field, Group, Header, ListGroup, ListRow, MoneyHero, PrimaryButton, SecondaryButton, Text, ValueRow, type ValueRowProps } from "./core";
import { SheetProvider } from "./SheetProvider";
import { Sheet, sheetPresentation, type SheetProps } from "./Sheet";
import { PickerSheet } from "./PickerSheet";
import { ThemeProvider } from "./themeContext";
import { readableLayout, type LayoutTier } from "./layout";
import { controls, font, themes, xxxlFontScale } from "./tokens";
import { textSpecs } from "./typography";

const native = vi.hoisted(() => ({ present: vi.fn(), dismiss: vi.fn(), focus: vi.fn(), back: new Set<() => boolean>() }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", TextInput: "input", ActivityIndicator: "spinner",
  AccessibilityInfo: { setAccessibilityFocus: native.focus }, findNodeHandle: () => 41,
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  BackHandler: { addEventListener: (_event: string, callback: () => boolean) => { native.back.add(callback); return { remove: () => native.back.delete(callback) }; } },
}));
vi.mock("@gorhom/bottom-sheet", async () => {
  const React = await import("react");
  return {
    BottomSheetModal: React.forwardRef((props, ref) => { React.useImperativeHandle(ref, () => ({ present: native.present, dismiss: native.dismiss })); return React.createElement("modal", props); }),
    BottomSheetModalProvider: React.Fragment,
    BottomSheetScrollView: "sheet-scroll", BottomSheetBackdrop: "backdrop", BottomSheetFooter: "sheet-footer",
  };
});
let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); native.present.mockClear(); native.dismiss.mockClear(); native.focus.mockClear(); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); expect(native.back.size).toBe(0); });
const noop = () => {};
const tiers: LayoutTier[] = ["default", "reflow", "xxxl"];
const metrics = { default: { width: 390, fontScale: 1 }, reflow: { width: 290, fontScale: 1 }, xxxl: { width: 390, fontScale: 1.5 } };
async function render(element: ReactElement, tier: LayoutTier = "xxxl") {
  await act(async () => { root = create(h(ThemeProvider, { layout: readableLayout(metrics[tier]) }, element), { createNodeMock: () => ({}) }); });
  if (!root) throw new Error("Renderer was not created");
  return root.root;
}

function flat(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return typeof style === "object" && style !== null ? Object.fromEntries(Object.entries(style)) : {};
}

test("tier threshold and narrow-width reflow preserve legacy metrics below XXXL", () => {
  expect(xxxlFontScale).toBe(1.3);
  expect(readableLayout({ width: 390, fontScale: 1.29 })).toEqual({ tier: "default", reflow: false, pagePadding: 24, touchTarget: 48 });
  expect(readableLayout({ width: 390, fontScale: 1.3 })).toEqual({ tier: "xxxl", reflow: true, pagePadding: 16, touchTarget: 56 });
  expect(readableLayout({ width: 299, fontScale: 1 })).toEqual({ tier: "reflow", reflow: true, pagePadding: 16, touchTarget: 48 });
  expect(readableLayout({ width: 300, fontScale: 1 }).tier).toBe("default");
  expect(controls.xxxl).toEqual({ touchTarget: 56, primaryButton: 68, secondaryButton: 60, input: 64, choiceRow: 72 });
});

test.each([
  [1.2999999523162842, "xxxl"], [1.149999976158142, "default"],
  [1.3, "xxxl"], [1.5, "xxxl"], [1.29, "default"],
] as const)("Android font scale %s selects %s", (fontScale, tier) => {
  expect(readableLayout({ width: 390, fontScale }).tier).toBe(tier);
});

test("default and reflow named type preserve the audited values without caps", () => {
  const expected = {
    hero: { fontFamily: font.extrabold, fontSize: 44, lineHeight: 52 },
    screen: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 37, letterSpacing: -0.7 },
    detailName: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 36 },
    section: { fontFamily: font.bold, fontSize: 20 }, money: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
    rowTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 }, body: { fontFamily: font.regular, fontSize: 16 },
    action: { fontFamily: font.bold, fontSize: 17 }, meta: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
    label: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1 },
  };
  expect(textSpecs.default).toEqual(expected);
  expect(textSpecs.reflow).toEqual(expected);
});

test.each([
  ["hero", 44, 1.04, -0.05, 1.2, font.semibold], ["screen", 32, 1.1, -0.045, 1.25, font.semibold],
  ["detailName", 30, 1.12, -0.04, 1.25, font.semibold], ["section", 20, 1.25, -0.025, 1.35, font.semibold],
  ["money", 18, 1.2, -0.035, 1.5, font.semibold], ["rowTitle", 16, 1.3, -0.02, 1.5, font.semibold],
  ["body", 16, 1.45, -0.01, undefined, font.regular], ["action", 17, 1.25, -0.015, 1.4, font.semibold],
  ["meta", 14, 1.4, 0, undefined, font.regular], ["label", 12, 1.35, 0, undefined, font.medium],
] as const)("XXXL %s matches the design spec", (name, size, line, tracking, cap, family) => {
  const spec = textSpecs.xxxl[name];
  expect(spec.fontFamily).toBe(family); expect(spec.fontSize).toBe(size);
  expect(spec.lineHeight).toBeCloseTo(size * line); expect(spec.letterSpacing).toBeCloseTo(size * tracking);
  expect(spec.maxScale).toBe(cap);
});

test.each(["default", "muted", "primary", "positive", "warning", "danger"] as const)("Text forwards props and resolves %s tone", async (tone) => {
  const tree = await render(h(Text, { variant: "hero", tone, testID: "hero", accessibilityLabel: "Balance", selectable: true }, "100"));
  const text = tree.findByType("text");
  const colors = { default: themes.light.foreground, muted: themes.light.mutedForeground, primary: "#6d28d9", positive: themes.light.positive, warning: themes.light.warning, danger: themes.light.danger };
  expect(flat(text.props.style).color).toBe(colors[tone]);
  expect(text.props).toMatchObject({ allowFontScaling: true, maxFontSizeMultiplier: 1.2, testID: "hero", accessibilityLabel: "Balance", selectable: true });
});
test.each(tiers)("Text body is uncapped in %s", async (tier) => {
  const tree = await render(h(Text, { variant: "body" }, "Body"), tier);
  expect(tree.findByType("text").props.maxFontSizeMultiplier).toBeUndefined();
});

test("ValueRow stacks meta and money under its title at XXXL and aliases ListRow", async () => {
  const tree = await render(h(ValueRow, { title: "Groceries", meta: "Yesterday", value: "COP 20", icon: "heart", onPress: noop, accessibilityLabel: "Open Groceries" }));
  expect(ListRow).toBe(ValueRow); expect(ListGroup).toBe(Group);
  expect(tree.findAllByType("text").map((node) => node.children.join(""))).toEqual(["Groceries", "Yesterday", "COP 20"]);
  const column = tree.findAllByType("view").find((node) => flat(node.props.style).flexDirection === "column");
  expect(column?.children).toHaveLength(2);
  const row = tree.findByType("button");
  expect(flat(row.props.style)).toMatchObject({ paddingVertical: 24, paddingHorizontal: 20, gap: 10 });
  expect(row.props.accessibilityLabel).toBe("Open Groceries");
  const money = tree.findAllByType("text")[2];
  expect(flat(money.props.style).fontSize).toBe(18); expect(money.props.maxFontSizeMultiplier).toBe(1.5);
});

test.each([1, 2, 3, 5])("Group splits %i rows into cards of at most two", async (count) => {
  const tree = await render(h(Group, { title: "Today" }, ...Array.from({ length: count }, (_, i) => h(ValueRow, { key: i, title: `Row ${i}` }))));
  const cards = tree.findAllByType("view").filter((node) => flat(node.props.style).overflow === "hidden");
  expect(cards.map((card) => card.findAllByType(ValueRow).length)).toEqual(Array.from({ length: Math.ceil(count / 2) }, (_, i) => Math.min(2, count - i * 2)));
  for (const card of cards) {
    const rows = card.findAllByType(ValueRow);
    expect(rows.map((row) => row.props.isLast)).toEqual(rows.length === 2 ? [false, true] : [true]);
  }
  expect(tree.findAllByType("text").filter((node) => node.children.join("") === "Today")).toHaveLength(1);
  expect(tree.findAllByType("view").some((node) => flat(node.props.style).gap === 40)).toBe(true);
});

test.each(tiers)("Columns owns item widths and ActionTile fills its cell in %s", async (tier) => {
  const tree = await render(h(Columns, null, h(ActionTile, { title: "Drafts", detail: "Review", icon: "heart", onPress: noop }), h(ValueRow, { title: "Other" })), tier);
  const grid = tree.findAllByType("view").find((node) => flat(node.props.style).justifyContent === "space-between");
  expect(flat(grid?.props.style).flexDirection).toBe(tier === "default" ? "row" : "column");
  expect(grid?.findAll((node) => node.type === "view" && flat(node.props.style).width === (tier === "default" ? "47%" : "100%")).length).toBe(2);
  expect(flat(tree.findByType("button").props.style).width).toBe("100%");
});

test.each(tiers)("MoneyHero keeps a combined accessible amount in %s", async (tier) => {
  const tree = await render(h(MoneyHero, { currency: "COP", amount: "45.000", negative: true, style: { color: "red" } }), tier);
  const texts = tree.findAllByType("text");
  if (tier === "xxxl") {
    expect(texts.map((text) => text.children.join(""))).toEqual(["COP", "−45.000"]);
    expect(texts[1]?.props).toMatchObject({ maxFontSizeMultiplier: 1.2, accessible: false });
    expect(texts[1]?.props.adjustsFontSizeToFit).toBeUndefined();
    expect(tree.findByType("view").props).toMatchObject({ accessible: true, accessibilityLabel: "−COP 45.000" });
  } else {
    expect(texts[0]?.children).toEqual(["−COP 45.000"]);
    expect(texts[0]?.props).toMatchObject({ adjustsFontSizeToFit: true, numberOfLines: 1, accessibilityLabel: "−COP 45.000" });
  }
  expect(flat(texts.at(-1)?.props.style).color).toBe("red");
});

test.each(tiers.flatMap((tier) => [false, true].map((tall) => ({ tier, tall }))))("Sheet $tier tall=$tall chooses the expected presentation", async ({ tier, tall }) => {
  const tree = await render(h(Sheet, { label: "Entry details", onClose: noop, tall, footer: h("footer-action") }, h("body-content")), tier);
  const modal = tree.find((node) => String(node.type) === "modal");
  const page = tier === "xxxl" && tall;
  expect(sheetPresentation(tier, tall)).toBe(page ? "page" : "sheet");
  expect(modal.props.snapPoints).toEqual(page ? ["100%"] : undefined);
  expect(modal.props.enableDynamicSizing).toBe(!page);
  expect(modal.props.enablePanDownToClose).toBe(!page);
  expect(native.present).toHaveBeenCalledOnce();
  if (page) {
    expect(modal.props).toMatchObject({ topInset: 24, handleComponent: null, accessible: false, android_keyboardInputMode: "adjustPan" });
    expect(tree.findAll((node) => String(node.type) === "footer-action")).toHaveLength(0);
    expect(tree.find((node) => String(node.type) === "sheet-scroll").props.enableFooterMarginAdjustment).toBe(true);
    expect(modal.props.footerComponent).toBeTypeOf("function");
    await act(async () => tree.findByType("button").props.onPress());
  } else {
    const scroll = tree.find((node) => String(node.type) === "sheet-scroll");
    expect(scroll.findAll((node) => String(node.type) === "footer-action")).toHaveLength(1);
    expect(scroll.findAllByType("button")).toHaveLength(1);
  }
});

test("manual Sheet preserves native props, dismiss callbacks and busy Back handling", async () => {
  const ref = createRef<BottomSheetModal>(); const dismiss = vi.fn(); const change = vi.fn();
  const tree = await render(h(Sheet, { body: "native", sheetRef: ref, androidBack: true, busy: true, onDismiss: dismiss,
    nativeModalProps: { snapPoints: ["80%"], enableDynamicSizing: false, topInset: 40, keyboardBehavior: "interactive", onChange: change, stackBehavior: "push" } }, h("native-body")));
  expect(native.present).not.toHaveBeenCalled(); expect(native.back.size).toBe(0);
  const modal = tree.find((node) => String(node.type) === "modal");
  expect(modal.props).toMatchObject({ snapPoints: ["80%"], topInset: 40, enablePanDownToClose: false, stackBehavior: "push" });
  expect(tree.findAll((node) => String(node.type) === "sheet-scroll")).toHaveLength(0);
  await act(async () => modal.props.onChange(0, 100, "provided"));
  expect(change).toHaveBeenCalledWith(0, 100, "provided");
  expect([...native.back].at(-1)?.()).toBe(true); expect(native.dismiss).not.toHaveBeenCalled();
  await act(async () => modal.props.onDismiss());
  expect(dismiss).toHaveBeenCalledOnce(); expect(native.back.size).toBe(0);
});

test("PickerSheet supports mount presentation and stays a sheet at XXXL", async () => {
  const tree = await render(h(PickerSheet, { presentOnMount: true, stickyHeader: false, children: h("picker-items") }));
  expect(native.present).toHaveBeenCalledOnce();
  expect(tree.find((node) => String(node.type) === "modal").props.snapPoints).toEqual(["92%"]);
  expect(tree.find((node) => String(node.type) === "modal").props.handleComponent).toBeUndefined();
  expect(tree.find((node) => String(node.type) === "sheet-scroll").props.stickyHeaderIndices).toBeUndefined();
});

test("existing controls use XXXL sizes, type and title caps", async () => {
  const tree = await render(h(React.Fragment, null, h(Header, { title: "Overview", onBack: noop }), h(PrimaryButton, { label: "Post", onPress: noop }), h(SecondaryButton, { label: "Cancel", onPress: noop }), h(Field, { label: "Amount" }), h(Choice, { label: "Monthly", selected: true, onPress: noop })));
  const buttons = tree.findAllByType("button").map((button) => typeof button.props.style === "function" ? flat(button.props.style({ pressed: false })) : flat(button.props.style));
  expect(buttons.map((style) => style.minHeight ?? style.height)).toEqual([56, 68, 60, 72]);
  expect(flat(tree.findByType("input").props.style)).toMatchObject({ minHeight: 64, borderRadius: 18 });
  const title = tree.findAllByType("text").find((text) => text.children.join("") === "Overview");
  expect(title?.props.maxFontSizeMultiplier).toBe(1.25);
  expect(flat(title?.props.style).fontFamily).toBe(font.semibold);
});


test("XXXL Group counts rows inside fragments while preserving one shared title", async () => {
  const tree = await render(h(Group, { title: "Today" }, h(React.Fragment, null,
    h(ValueRow, { title: "One" }), h(ValueRow, { title: "Two" }), h(ValueRow, { title: "Three" }))));
  const cards = tree.findAllByType("view").filter((node) => flat(node.props.style).overflow === "hidden");
  expect(cards.map((card) => card.findAllByType(ValueRow).length)).toEqual([2, 1]);
});

test("managed Sheet allows form migrations to retain their existing closing actions", async () => {
  const tree = await render(h(Sheet, { label: "Add place", closeLabel: false, scrollProps: { contentContainerStyle: { padding: 12 } } }, h("form-fields")), "default");
  expect(tree.findAllByType("button")).toHaveLength(0);
  expect(tree.find((node) => String(node.type) === "sheet-scroll").props.contentContainerStyle).toEqual({ padding: 12 });
});

test("page Back and close use the same dismissal while its footer remains on BottomSheetFooter", async () => {
  const tree = await render(h(Sheet, { label: "Details", tall: true, footer: h("footer-action") }, h("body-content")));
  expect([...native.back].at(-1)?.()).toBe(true);
  expect(native.dismiss).toHaveBeenCalledOnce();
  const modal = tree.find((node) => String(node.type) === "modal");
  let footerRoot: ReactTestRenderer | undefined;
  await act(async () => { footerRoot = create(modal.props.footerComponent({ animatedFooterPosition: {} })); });
  expect(footerRoot?.root.find((node) => String(node.type) === "sheet-footer").props.bottomInset).toBe(16);
  expect(footerRoot?.root.findAll((node) => String(node.type) === "footer-action")).toHaveLength(1);
  await act(async () => footerRoot?.unmount());
});

test("busy page locks backdrop and close, then permits Back after retry", async () => {
  const element = (busy: boolean) => h(ThemeProvider, { layout: readableLayout(metrics.xxxl) }, h(Sheet, { label: "Details", tall: true, busy }, h("body-content")));
  await act(async () => { root = create(element(true)); });
  const modal = root?.root.find((node) => String(node.type) === "modal");
  expect(modal?.props.backdropComponent({}).props).toMatchObject({ pointerEvents: "box-only", importantForAccessibility: "no-hide-descendants" });
  expect(root?.root.findByType("button").props.disabled).toBe(true);
  expect([...native.back].at(-1)?.()).toBe(true);
  expect(native.dismiss).not.toHaveBeenCalled();
  await act(async () => root?.update(element(false)));
  expect([...native.back].at(-1)?.()).toBe(true);
  expect(native.dismiss).toHaveBeenCalledOnce();
});


test("sheet presentation and legacy aliases reject conflicting public props", () => {
  expectTypeOf<{ label: string; presentOnMount: false }>().not.toExtend<SheetProps>();
  expectTypeOf<{ label: string; onClose: () => void; onDismiss: () => void }>().not.toExtend<SheetProps>();
  expectTypeOf<{ title: string; meta: string; detail: string }>().not.toExtend<ValueRowProps>();
});

test("background accessibility is hidden only while a sheet is presented", async () => {
  const tree = await render(h(React.Fragment, null,
    h(SheetProvider, null, h("main"),
      h(Sheet, { label: "Details" }, h("body-content")))));
  const boundary = tree.findByType(SheetProvider).findByType("view");
  expect(boundary.props).toMatchObject({ importantForAccessibility: "no-hide-descendants", accessibilityElementsHidden: true });
  await act(async () => tree.find((node) => String(node.type) === "modal").props.onDismiss());
  expect(boundary.props.importantForAccessibility).toBeUndefined();
  expect(boundary.props.accessibilityElementsHidden).toBeUndefined();
});

test("ref plus mount presentation restores Back after dismiss and reopen", async () => {
  const sheetRef = createRef<BottomSheetModal>();
  const tree = await render(h(Sheet, { body: "native", sheetRef, presentOnMount: true, androidBack: true }, h("main")));
  const modal = tree.find((node) => String(node.type) === "modal");
  expect(native.present).toHaveBeenCalledOnce();
  await act(async () => modal.props.onDismiss());
  expect(native.back.size).toBe(0);
  await act(async () => { sheetRef.current?.present(); modal.props.onChange(0, 100, "provided"); });
  expect(native.present).toHaveBeenCalledTimes(2);
  expect([...native.back].at(-1)?.()).toBe(true);
  expect(native.dismiss).toHaveBeenCalledOnce();
});

test("busy preserves absent and custom backdrops plus independent content panning", async () => {
  const CustomBackdrop = () => h("custom-backdrop");
  const tree = await render(h(React.Fragment, null,
    h(Sheet, { body: "native", busy: true, nativeModalProps: { enableContentPanningGesture: true } }, h("main")),
    h(Sheet, { body: "native", busy: true, nativeModalProps: { backdropComponent: CustomBackdrop, enableContentPanningGesture: true } }, h("main"))));
  const modals = tree.findAll((node) => String(node.type) === "modal");
  expect(modals[0]?.props.backdropComponent).toBeUndefined();
  expect(modals.map((modal) => modal.props.enableContentPanningGesture)).toEqual([true, true]);
  const backdrop = modals[1]?.props.backdropComponent({});
  expect(backdrop.props.pointerEvents).toBe("box-only");
  expect(backdrop.props.children.type).toBe(CustomBackdrop);
});

test("tall page has one common modal boundary and an inset row separator", async () => {
  const tree = await render(h(Sheet, { label: "Details", tall: true }, h(ValueRow, { title: "One", meta: "Date", value: "COP 20", icon: "heart", onPress: noop })));
  const modal = tree.find((node) => String(node.type) === "modal");
  expect(modal.props.containerComponent({ children: null }).props).toMatchObject({ accessibilityViewIsModal: true, accessible: false, importantForAccessibility: "no", pointerEvents: "box-none", style: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } });
  expect(tree.find((node) => String(node.type) === "sheet-scroll").props.accessibilityViewIsModal).toBeUndefined();
  const row = tree.findByType(ValueRow).findByType("button");
  expect(flat(row.props.style)).toMatchObject({ alignItems: "flex-start", borderBottomWidth: 0 });
  const separator = row.findAllByType("view").find((node) => flat(node.props.style).position === "absolute");
  expect(flat(separator?.props.style)).toMatchObject({ left: 20, right: 20, bottom: 0, height: 1 });
});


test("page title takes accessibility focus once for each presentation", async () => {
  const tree = await render(h(Sheet, { label: "Details", tall: true }, h("main")));
  const modal = tree.find((node) => String(node.type) === "modal");
  const title = tree.findAllByType("text").find((node) => node.props.accessibilityRole === "header");
  await act(async () => title?.props.onLayout());
  expect(native.focus).not.toHaveBeenCalled();
  await act(async () => modal.props.onChange(0, 100, "provided"));
  expect(native.focus).toHaveBeenCalledWith(41);
  await act(async () => { title?.props.onLayout(); modal.props.onChange(0, 100, "provided"); });
  expect(native.focus).toHaveBeenCalledOnce();
  await act(async () => { modal.props.onDismiss(); modal.props.onChange(0, 100, "provided"); });
  expect(native.focus).toHaveBeenCalledTimes(2);
});
