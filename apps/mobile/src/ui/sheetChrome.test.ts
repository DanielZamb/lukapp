import * as React from "react";
import { createElement as h, createRef, useEffect, useState, type ComponentProps, type ReactElement } from "react";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { ActionBar, AlertDot, IconButton } from "./core";
import { PickerSheet } from "./PickerSheet";
import { Sheet, type SheetProps } from "./Sheet";
import { ThemeProvider, useSetThemeMode } from "./themeContext";
import { readableLayout, type LayoutTier } from "./layout";
import type { ThemeMode } from "./tokens";
import { PostingImpactSheet } from "../features/budget/PostingImpactSheet";
import { CategorySheet, type CategorySheetProps } from "../features/categories/CategorySheet";
import { HistoryFilters, HistoryFilterSheet, useHistoryFilterPresentation } from "../features/history/HistoryFilters";
import type { HistoryQuery } from "../features/history/filter";

const native = vi.hoisted(() => ({ platform: "android", bottom: 48, footerHeight: 156, back: new Set<() => boolean>(), present: vi.fn(), dismiss: vi.fn() }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: native.bottom, left: 0, right: 0 }) }));
vi.mock("react-native-gesture-handler", () => ({ ScrollView: "gesture-scroll" }));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "calendar" }));
vi.mock("@gorhom/bottom-sheet", async () => {
  const { createElement } = await import("react");
  return {
    BottomSheetModal: ({ children, footerComponent, containerComponent: Container, ...props }: React.PropsWithChildren<{
      footerComponent?: (props: object) => React.ReactNode; containerComponent?: React.ComponentType<React.PropsWithChildren>;
    }>) => {
      const modal = createElement("modal", { ...props, ...(Container && { containerComponent: Container }) }, children, footerComponent?.({ animatedFooterPosition: {} }));
      return Container ? createElement(Container, null, modal) : modal;
    },
    BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetFooter: "sheet-footer", BottomSheetBackdrop: "backdrop",
  };
});
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", TextInput: "input", ActivityIndicator: "spinner", ScrollView: "scroll",
  Platform: { get OS() { return native.platform; }, Version: 37 },
  AccessibilityInfo: { setAccessibilityFocus: vi.fn() }, findNodeHandle: () => 42,
  BackHandler: { addEventListener: (_name: string, callback: () => boolean) => { native.back.add(callback); return { remove: () => native.back.delete(callback) }; } },
  StyleSheet: { create: (value: unknown) => value, flatten: flat, hairlineWidth: 1 },
}));

function flat(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : typeof style === "object" && style !== null ? Object.fromEntries(Object.entries(style)) : {};
}

const require = createRequire(import.meta.url);
const gorhom = createRequire(require.resolve("@gorhom/bottom-sheet/package.json"));
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${readFileSync(gorhom.resolve("./lib/commonjs/hooks/useBottomSheetContentContainerStyle.js"), "utf8")}\n})`)(
  (id: string) => {
    if (id === "react-native") return { Platform: { OS: "android" }, StyleSheet: { compose: (a: unknown, b: unknown) => [a, b] } };
    if (id === "react-native-reanimated") return {
      runOnJS: (callback: (value: number) => void) => callback,
      useAnimatedReaction: (prepare: () => number, react: (value: number) => void) => useEffect(() => react(prepare()), [native.footerHeight]),
    };
    if (id === "./useBottomSheetInternal") return { useBottomSheetInternal: () => ({ animatedLayoutState: { get: () => ({ footerHeight: native.footerHeight }) } }) };
    return gorhom(id);
  }, module, module.exports,
);
const loaded: unknown = module.exports;
if (!loaded || typeof loaded !== "object" || !("useBottomSheetContentContainerStyle" in loaded) || typeof loaded.useBottomSheetContentContainerStyle !== "function") throw new Error("Installed Gorhom footer hook is unavailable");
const useInstalledContentStyle = loaded.useBottomSheetContentContainerStyle;
function MeasuredScroll({ style }: { style: unknown }) {
  const padded = useInstalledContentStyle(true, style);
  return h("measured-scroll", { style: padded });
}

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); native.platform = "android"; native.bottom = 48; native.footerHeight = 156; vi.clearAllMocks(); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); expect(native.back.size).toBe(0); });
function Mode({ mode }: { mode: ThemeMode }) { const setMode = useSetThemeMode(); useEffect(() => setMode(mode), [mode, setMode]); return null; }
async function render(element: ReactElement, mode: ThemeMode = "light", tier: LayoutTier = "xxxl") {
  await act(async () => { root = create(h(ThemeProvider, { layout: readableLayout({ width: tier === "reflow" ? 290 : 320, fontScale: tier === "xxxl" ? 2 : 1 }) }, h(Mode, { mode }), element), { createNodeMock: () => ({ present: native.present, dismiss: native.dismiss }) }); });
  if (!root) throw new Error("No renderer");
  return root.root;
}
function button(tree: ReactTestInstance, label: string) { return tree.findAllByType("button").find(node => node.props.accessibilityLabel === label) ?? (() => { throw new Error(`Missing action ${label}`); })(); }
function modal(tree: ReactTestInstance) { return tree.find(node => String(node.type) === "modal"); }
function scroll(tree: ReactTestInstance) { return tree.find(node => String(node.type) === "sheet-scroll"); }
function styleNumber(style: unknown, property: string) {
  const value = flat(style)[property];
  if (typeof value !== "number") throw new Error(`Expected numeric ${property}`);
  return value;
}

function renderedSheet() {
  return JSON.stringify(root?.toJSON(), (key, value) => typeof value === "function" ? key === "style" ? value({ pressed: false }) : "[callback]" : value, 2);
}

const existingSheets = [
  { name: "managed", props: { label: "Actions", closeLabel: false, children: h("content"), footer: h("actions") } },
  { name: "tall page", props: { label: "Details", tall: true, closeLabel: false, children: h("content"), footer: h("actions") } },
  { name: "native body", props: { body: "native", children: h("native-content"), nativeModalProps: { topInset: 72, enablePanDownToClose: true, enableDynamicSizing: false } } },
  { name: "legacy body", props: { label: "Budget would cross", children: h("content"), footer: h("actions"), legacyBody: h("legacy-content"), legacyFooter: h("legacy-actions") } },
] satisfies { name: string; props: SheetProps }[];

test.each(["default", "reflow", "xxxl"] as const)("existing Sheet callers retain their rendered contract in %s", async tier => {
  for (const example of existingSheets) {
    for (const mode of ["light", "dark"] as const) {
      await render(h(Sheet, example.props), mode, tier);
      expect(renderedSheet()).toMatchSnapshot(`${example.name}, ${mode}`);
      await act(async () => root?.unmount());
    }
  }
});

test.each(["default", "reflow"] as const)("native presentation preserves the entire existing Sheet tree in %s", async tier => {
  for (const platform of ["android", "ios"]) for (const mode of ["light", "dark"] as const) {
    native.platform = platform;
    const props = { label: "Entry details", closeLabel: false, children: h("content"), footer: h("actions") } satisfies SheetProps;
    await render(h(Sheet, props), mode, tier);
    const previous = renderedSheet();
    await act(async () => root?.unmount());
    await render(h(Sheet, { ...props, presentation: "native" }), mode, tier);
    expect(renderedSheet()).toBe(previous);
    await act(async () => root?.unmount());
  }
});

test("iOS native presentation puts the scrolling facts and pinned actions in one ungrouped modal scope", async () => {
  native.platform = "ios";
  const reverse = vi.fn(), close = vi.fn();
  const tree = await render(h(Sheet, { label: "Entry details", presentation: "native", closeLabel: false,
    footer: h(ActionBar, { secondary: [{ label: "Reverse entry", onPress: reverse }, { label: "Close details", onPress: close }] }) }, h("facts")));
  const content = scroll(tree);
  expect(content.props.accessibilityViewIsModal).toBeUndefined();
  const scopes = tree.findAllByType("view").filter(node => node.props.accessibilityViewIsModal === true);
  expect(scopes).toHaveLength(1);
  const scope = scopes[0];
  if (!scope) throw new Error("Missing modal accessibility scope");
  expect(scope.props.accessible).toBe(false);
  expect(scope.find(node => String(node.type) === "facts")).toBe(content.find(node => String(node.type) === "facts"));
  expect(modal(tree).props.accessible).toBe(false);
  await act(async () => { button(scope, "Reverse entry").props.onPress(); button(scope, "Close details").props.onPress(); });
  expect(reverse).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

test("Android native presentation retains its rendered contract", async () => {
  await render(h(Sheet, { label: "Entry details", presentation: "native", closeLabel: false, footer: h("actions") }, h("content")));
  expect(renderedSheet()).toMatchSnapshot();
});

test.each(existingSheets)("iOS keeps the existing $name accessibility scope", async example => {
  native.platform = "ios";
  const tree = await render(h(Sheet, example.props));
  if (example.name === "tall page") {
    const scope = tree.findAllByType("view").find(node => node.props.accessibilityViewIsModal === true);
    expect(scope?.props.accessible).toBe(false);
    expect(scope?.find(node => String(node.type) === "content")).toBe(scroll(tree).find(node => String(node.type) === "content"));
    expect(scroll(tree).props.accessibilityViewIsModal).toBeUndefined();
  } else if (example.name === "native body") {
    expect(modal(tree).findAll(node => String(node.type) === "native-content")).toHaveLength(1);
    expect(modal(tree).props.containerComponent).toBeUndefined();
  } else {
    expect(scroll(tree).props.accessibilityViewIsModal).toBe(true);
    expect(modal(tree).props.containerComponent).toBeUndefined();
  }
});

test.each([0, 48])("native presentation reserves a changing measured footer above a %sdp bottom inset", async bottom => {
  native.bottom = bottom;
  const tree = await render(h(Sheet, { label: "Entry details", presentation: "native", closeLabel: false, footer: h("actions") }, h("content")));
  expect(modal(tree).props).toMatchObject({ topInset: 24, enableDynamicSizing: true, enablePanDownToClose: true });
  const content = scroll(tree);
  expect(content.props.enableFooterMarginAdjustment).toBe(true);
  expect(content.findAll(node => String(node.type) === "actions")).toHaveLength(0);
  expect(tree.find(node => String(node.type) === "sheet-footer").props.bottomInset).toBe(bottom);
  expect(tree.find(node => String(node.type) === "sheet-footer").findAll(node => String(node.type) === "actions")).toHaveLength(1);
  const padded = content.props.contentContainerStyle;
  await act(async () => { root?.update(h(MeasuredScroll, { style: padded })); });
  expect(flat(root!.root.find(node => String(node.type) === "measured-scroll").props.style).paddingBottom).toBe(bottom === 0 ? 200 : 224);
  native.footerHeight = 252;
  await act(async () => { root?.update(h(MeasuredScroll, { style: padded })); });
  expect(flat(root!.root.find(node => String(node.type) === "measured-scroll").props.style).paddingBottom).toBe(bottom === 0 ? 296 : 320);
});

test.each(["light", "dark"] as const)("SEN-95 #1 unread indicator overlaps the bell's upper-right circular border in %s", async mode => {
  const open = vi.fn();
  const tree = await render(h(IconButton, { preset: "brand", accessibilityLabel: "Alerts, 3 unread", onPress: open }, h(AlertDot, { count: 3 })), mode);
  const dot = tree.findByType(AlertDot).findByType("view");
  const bellStyle = button(tree, "Alerts, 3 unread").props.style({ pressed: false });
  const bellWidth = styleNumber(bellStyle, "width"), bellHeight = styleNumber(bellStyle, "height");
  const bellBorder = styleNumber(bellStyle, "borderWidth");
  const bellRadius = Math.min(bellWidth, bellHeight) / 2;
  const dotWidth = styleNumber(dot.props.style, "width"), dotHeight = styleNumber(dot.props.style, "height");
  const centerX = bellWidth - bellBorder - styleNumber(dot.props.style, "right") - dotWidth / 2;
  const centerY = bellBorder + styleNumber(dot.props.style, "top") + dotHeight / 2;
  const distance = Math.hypot(centerX - bellWidth / 2, centerY - bellHeight / 2);
  const paintedRadius = Math.min(dotWidth, dotHeight) / 2 - styleNumber(dot.props.style, "borderWidth");
  expect(styleNumber(bellStyle, "borderRadius")).toBeGreaterThanOrEqual(bellRadius);
  expect(centerX).toBeGreaterThan(bellWidth / 2);
  expect(centerY).toBeLessThan(bellHeight / 2);
  expect(distance - paintedRadius).toBeLessThan(bellRadius - bellBorder);
  expect(distance + paintedRadius).toBeGreaterThan(bellRadius);
  expect(dot.props).toMatchObject({ accessible: false, accessibilityElementsHidden: true });
  await act(async () => button(tree, "Alerts, 3 unread").props.onPress());
  expect(open).toHaveBeenCalledOnce();
});
test("SEN-95 #1 no unread indicator for zero; legacy presentation stays unchanged", async () => {
  let tree = await render(h(AlertDot, { count: 0 }));
  expect(tree.findAllByType("view")).toHaveLength(0);
  await act(async () => root?.unmount());
  tree = await render(h(AlertDot, { count: 3, legacy: h("legacy-dot") }), "light", "default");
  expect(tree.findAll(node => String(node.type) === "legacy-dot")).toHaveLength(1);
});

const impact = [{ category: { id: "food", name: "Food", emoji: "🍔" }, overMinorUnits: 1000 }];
test.each(["post", "reconsider", "swipe", "back"] as const)("SEN-95 #2 budget warning uses the shared handle and decides once via %s", async action => {
  const onContinue = vi.fn(), onReconsider = vi.fn();
  const tree = await render(h(PostingImpactSheet, { description: "Lunch", currency: "COP", hits: impact, onContinue, onReconsider }));
  await act(async () => modal(tree).props.onChange(0));
  expect(modal(tree).props).toMatchObject({ enablePanDownToClose: true, enableDynamicSizing: true });
  expect(modal(tree).props.handleComponent).toBeUndefined();
  expect(tree.findAllByType("text").filter(node => node.props.accessibilityRole === "header").map(node => node.children.join(""))).toEqual(["Budget would cross"]);
  expect(tree.findAll(node => String(node.type) === "icon").some(node => node.props.name === "close")).toBe(false);
  if (action === "post" || action === "reconsider") {
    const control = button(tree, action === "post" ? "Post anyway" : "Reconsider");
    await act(async () => { control.props.onPress(); control.props.onPress(); });
  }
  if (action === "back") {
    expect([...native.back].at(-1)?.()).toBe(true);
    expect(native.dismiss).toHaveBeenCalledOnce();
  }
  await act(async () => { modal(tree).props.onDismiss(); modal(tree).props.onDismiss(); });
  expect(onContinue).toHaveBeenCalledTimes(action === "post" ? 1 : 0);
  expect(onReconsider).toHaveBeenCalledTimes(action === "post" ? 0 : 1);
});

function categoryProps(): CategorySheetProps {
  return { sheetRef: createRef<BottomSheetModal>(), search: "", options: [{ key: "food", name: "Food", style: { emoji: "🍔", tone: "primary" }, selected: true }], editor: null, busy: false, error: "", canConfirm: false, answer: null, suggested: null, allowed: [],
    onAnswer: vi.fn(), onSearch: vi.fn(), onSelect: vi.fn(), onCreate: vi.fn(), onName: vi.fn(), onStyle: vi.fn(), onConfirm: vi.fn(), onDismiss: vi.fn(), onDone: vi.fn() };
}
test.each([0, 16, 48])("SEN-95 #3 / SEN-85 picker Done clears a %sdp system navigation inset", async bottom => {
  native.bottom = bottom;
  const props = categoryProps();
  const tree = await render(h(CategorySheet, props));
  expect(modal(tree).props.bottomInset).toBe(bottom);
  expect(modal(tree).props.keyboardBehavior).toBe("interactive");
  await act(async () => tree.findByType("input").props.onChangeText("Food"));
  expect(props.onSearch).toHaveBeenCalledWith("Food");
  await act(async () => button(tree, "Food").props.onPress());
  expect(props.onSelect).toHaveBeenCalledWith("food");
  await act(async () => button(scroll(tree), "Done").props.onPress());
  expect(props.onDone).toHaveBeenCalledOnce();
});

const initialQuery: HistoryQuery = { search: "", profileIds: [], categoryIds: [], range: "all", customFrom: null, customTo: null };
function HistoryHarness() {
  const [query, onQuery] = useState(initialQuery);
  const presentation = useHistoryFilterPresentation();
  const props: ComponentProps<typeof HistoryFilters> = { query, onQuery, presentation, onSort() {}, sort: { key: "date", dir: "desc" }, today: "2026-11-03", places: [], categories: [
    { id: "food", name: "Food", style: { emoji: "🍔", tone: "primary" } },
    { id: "work", name: "Work", style: { emoji: "👩🏽‍💻", tone: "primary" } },
    { id: "plain", name: "No emoji", style: { emoji: "", tone: "primary" } },
  ] };
  return h(React.Fragment, null, h(HistoryFilters, props), h(HistoryFilterSheet, props), h("query", { value: query }));
}

test.each(["light", "dark"] as const)("SEN-95 #7 dates scroll clear of the measured footer and retain both dates in %s", async mode => {
  const tree = await render(h(HistoryHarness), mode);
  await act(async () => button(tree, "Dates, All time").props.onPress());
  const content = scroll(tree);
  expect(content.props.enableFooterMarginAdjustment).toBe(true);
  expect(button(content, "From")).toBeDefined();
  await act(async () => button(content, "From").props.onPress());
  await act(async () => tree.find(node => String(node.type) === "calendar").props.onChange({ type: "set" }, new Date(2026, 10, 1)));
  await act(async () => button(content, "To").props.onPress());
  await act(async () => tree.find(node => String(node.type) === "calendar").props.onChange({ type: "set" }, new Date(2026, 10, 2)));
  const padded = content.props.contentContainerStyle;
  await act(async () => button(tree, "Show movements").props.onPress());
  expect(tree.findAll(node => String(node.type) === "modal")).toHaveLength(0);
  expect(tree.find(node => String(node.type) === "query").props.value).toMatchObject({ customFrom: "2026-11-01", customTo: "2026-11-02" });
  await act(async () => button(tree, "Dates, Nov 1 – Nov 2").props.onPress());
  expect(button(tree, "From Nov 1")).toBeDefined();
  expect(button(tree, "To Nov 2")).toBeDefined();
  await act(async () => { root?.update(h(MeasuredScroll, { style: padded })); });
  expect(flat(root!.root.find(node => String(node.type) === "measured-scroll").props.style).paddingBottom).toBe(196);
  native.footerHeight = 252;
  await act(async () => { root?.update(h(MeasuredScroll, { style: padded })); });
  expect(flat(root!.root.find(node => String(node.type) === "measured-scroll").props.style).paddingBottom).toBe(292);
});

test("SEN-95 #7 footer inset is owned once by the picker container", async () => {
  const tree = await render(h(PickerSheet, { footer: h("action"), children: h("control") }));
  expect(modal(tree).props.bottomInset).toBe(48);
  expect(tree.find(node => String(node.type) === "sheet-footer").props.bottomInset).toBe(0);
});

test.each([false, true])("picker Back ownership remains opt-in, androidBack=%s", async androidBack => {
  const tree = await render(h(PickerSheet, { ...(androidBack && { androidBack }), children: h("control") }));
  expect(native.back.size).toBe(androidBack ? 1 : 0);
  if (androidBack) {
    expect([...native.back].at(-1)?.()).toBe(true);
    expect(native.dismiss).toHaveBeenCalledOnce();
  }
  expect(modal(tree).props.enablePanDownToClose).toBe(true);
});

test.each(["light", "dark"] as const)("SEN-95 #8 category rows show their emoji and keep the aggregate distinct in %s", async mode => {
  const tree = await render(h(HistoryHarness), mode);
  await act(async () => button(tree, "Categories, All 3").props.onPress());
  for (const [label, emoji] of [["Food", "🍔"], ["Work", "👩🏽‍💻"], ["No emoji", "✨"]]) {
    expect(button(tree, label).findAllByType("text").map(node => node.children.join(""))).toContain(emoji);
  }
  expect(button(tree, "All categories").findAllByType("text").map(node => node.children.join(""))).toEqual(["All categories"]);
  await act(async () => button(tree, "Food").props.onPress());
  expect(button(tree, "Food").props.accessibilityState.checked).toBe(true);
  await act(async () => button(tree, "Show movements").props.onPress());
  expect(tree.findAll(node => String(node.type) === "modal")).toHaveLength(0);
  await act(async () => button(tree, "Categories, 🍔 Food").props.onPress());
  expect(button(tree, "Food").props.accessibilityState.checked).toBe(true);
  await act(async () => button(tree, "All categories").props.onPress());
  expect(tree.find(node => String(node.type) === "query").props.value.categoryIds).toEqual([]);
});
