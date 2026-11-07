import * as React from "react";
import { createElement, useState, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { StatusBar } from "react-native";
import { EntryDetailSheet } from "./EntryDetailSheet";
import { ContextPillHost } from "../../ui/ContextPill";
import { ThemeProvider } from "../../ui/themeContext";
import { readableLayout } from "../../ui/layout";
import type { CameraCutout } from "../../device/cameraCutout";
import type { EntryDetail, EntryPlace } from "./types";

const native = vi.hoisted(() => ({
  top: 40,
  focused: true, cutout: { kind: "none", rect: null } as CameraCutout,
  present: vi.fn(), dismiss: vi.fn(), closed: vi.fn(), scrollTo: vi.fn(), query: vi.fn(), post: vi.fn(),
  backHandlers: new Set<() => boolean>(), detail: undefined as EntryDetail | undefined,
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("@react-navigation/native", () => ({ useIsFocused: () => native.focused }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: native.top, bottom: 24 }) }));
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, View: "view", Text: "text", Pressable: "button", ScrollView: "scroll", StatusBar: "status", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, flatten: (value: unknown) => Array.isArray(value) ? Object.assign({}, ...value) : value, absoluteFill: {}, hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 320, height: 720, fontScale: 1.5 }),
  BackHandler: { addEventListener: (_event: string, callback: () => boolean) => {
    native.backHandlers.add(callback);
    return { remove: () => native.backHandlers.delete(callback) };
  } },
}));
vi.mock("@gorhom/bottom-sheet", async () => {
  const { forwardRef, useImperativeHandle, createElement } = await import("react");
  return {
    BottomSheetModal: forwardRef(({ children, onChange, ...props }: {
      children?: ReactNode; onChange?: (index: number) => void;
    }, ref) => {
      useImperativeHandle(ref, () => ({ present: () => { native.present(); onChange?.(0); }, dismiss: native.dismiss }), [onChange]);
      return createElement("sheet", { ...props, onChange }, children,
        "footerComponent" in props && typeof props.footerComponent === "function" ? props.footerComponent({}) : null);
    }),
    BottomSheetScrollView: forwardRef(({ children, ...props }: { children?: ReactNode }, ref) => {
      useImperativeHandle(ref, () => ({ scrollTo: native.scrollTo }), []);
      return createElement("sheet-scroll", props, children);
    }),
    BottomSheetBackdrop: "backdrop", BottomSheetFooter: "footer", BottomSheetTextInput: "input",
  };
});
vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  return {
    default: { View: "animated-view", createAnimatedComponent: (component: unknown) => component },
    useSharedValue: (value: unknown) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => Record<string, unknown>) => new Proxy({}, { get: (_target, key) => style()[String(key)] }),
    useAnimatedReaction: (prepare: () => unknown, react: (value: unknown) => void) => React.useEffect(() => { react(prepare()); }),
    withTiming: (value: number, _options: unknown, complete?: (finished: boolean) => void) => { complete?.(true); return value; }, cancelAnimation: () => {},
    interpolate: (value: number, inputs: number[], outputs: number[]) => {
      const index = Math.min(inputs.length - 2, Math.max(0, inputs.findIndex(input => input >= value) - 1));
      return outputs[index] + (value - inputs[index]) / (inputs[index + 1] - inputs[index]) * (outputs[index + 1] - outputs[index]);
    },
    Easing: { linear: () => {}, bezier: () => {}, out: () => {}, cubic: () => {} }, ReduceMotion: { Never: "never" },
  };
});
vi.mock("react-native-worklets", () => ({ scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
vi.mock("react-native-gesture-handler", () => {
  const pan = () => {
    const gesture = { enabled: () => gesture, activeOffsetY: () => gesture, failOffsetX: () => gesture,
      onStart: () => gesture, onUpdate: () => gesture, onEnd: () => gesture, onFinalize: () => gesture };
    return gesture;
  };
  return { Gesture: { Pan: pan }, GestureDetector: "gesture" };
});
vi.mock("expo-blur", () => ({ BlurTargetView: "blur-target" }));
vi.mock("../../ui/Glass", () => ({ Glass: "glass", usePillAccessibility: () => ({ reduceMotion: false, reduceTransparency: false, screenReader: false, ready: true }) }));
vi.mock("../../device/cameraCutout", () => ({ useCameraCutout: () => native.cutout }));
vi.mock("convex/react", () => ({
  useQuery: (query: FunctionReference<"query">, args: unknown) => {
    const name = getFunctionName(query);
    native.query(name, args);
    if (args === "skip") return undefined;
    if (name === "accounting:postedEntry") return native.detail;
    if (name === "budget:evaluate") return {
      month: "2026-10", currentMonth: "2026-11", currency: "COP", jars: [{
        category: { id: "food", name: "Food", emoji: "🥗" }, revisionId: "october",
        limitMinorUnits: 500000, consumptionMinorUnits: 150000,
      }], availableCategories: [], totalsOverlap: true,
    };
  },
  useAction: () => native.post,
}));

const detail = {
  entry: { id: "entry", policy: "cash-expense@1", description: "Groceries", accountingDate: "2026-10-17",
    accountingPeriod: { year: 2026, month: 10, status: "open" }, amount: { currency: "COP", minorUnits: 150000 },
    financialAccountProfileId: "cash", financialAccountProfileName: "Daily", postedBy: "owner", postedAt: 1, replay: false, lines: [] },
  row: { id: "entry", title: "Groceries", date: "2026-10-17", detail: "Food", reversed: false,
    userCategories: [{ id: "food", name: "Food" }], primaryUserCategoryId: "food", amount: { currency: "COP", minorUnits: -150000 } },
} satisfies EntryDetail;
const places: EntryPlace[] = [{ id: "cash", emoji: "👛", productKind: "cash" }, { id: "bank", emoji: "🐷", productKind: "savingsAccount" }];
const categories = [{ id: "food", name: "Food", style: { emoji: "🥑", tone: "primary" as const } }];
function Harness({ places: profileLooks = places }: { places?: EntryPlace[] }) {
  const [open, setOpen] = useState(true);
  return createElement(ThemeProvider, { layout: readableLayout({ width: 320, fontScale: 1.5 }) },
    createElement(ContextPillHost, {},
      createElement("button", { accessibilityLabel: "Reopen", onPress: () => setOpen(true) }),
      open && createElement(EntryDetailSheet, { workspaceId: "ws", entryId: native.detail?.entry.id ?? "entry", categories, places: profileLooks,
        currentDate: "2026-11-02", onEntry: () => {}, onClose: () => { native.closed(); setOpen(false); } })));
}
let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  native.focused = true;
  native.top = 40;
  native.cutout = { kind: "none", rect: null };
  native.detail = detail;
  native.backHandlers.clear();
});
afterEach(async () => { await act(async () => root?.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function mount(profileLooks = places) { await act(async () => { root = create(createElement(Harness, { places: profileLooks })); }); }
function button(label: string) { return root.root.findByProps({ accessibilityLabel: label }); }
function pill() { return root.root.findAllByType("button").find(node => node.props.accessibilityRole === "button" && String(node.props.accessibilityLabel).startsWith("Back to summary,")); }
function summary() { return root.root.findByProps({ collapsable: false }); }
async function layout(y = 40, height = 200) { await act(async () => summary().props.onLayout({ nativeEvent: { layout: { y, height } } })); }
async function scroll(y: number) { await act(async () => root.root.findByType(BottomSheetScrollView).props.onScroll({ nativeEvent: { contentOffset: { y } } })); }
function factEmoji(label: string) {
  const fact = root.root.findAllByType("view").find(node => String(node.props.accessibilityLabel).startsWith(`${label},`));
  if (!fact) throw new Error(`Missing ${label} fact`);
  return fact.findAllByType("text").map(node => node.children.join(""))[0];
}
function styleHeight(value: unknown): unknown {
  return Array.isArray(value) ? value.map(styleHeight).filter(height => height !== undefined).at(-1) : value && typeof value === "object" ? Reflect.get(value, "height") : undefined;
}

test.each([
  { label: "configured", looks: places, expected: ["👛", "🐷"] },
  { label: "missing emoji", looks: [{ id: "cash", productKind: "cash" }, { id: "bank", productKind: "savingsAccount" }], expected: ["👛", "🏦"] },
  { label: "missing profile", looks: [], expected: ["💰", "💰"] },
] satisfies { label: string; looks: EntryPlace[]; expected: string[] }[])("transfer facts use each place's $label look", async ({ looks, expected }) => {
  native.detail = { ...detail, row: { ...detail.row, transfer: { from: { id: "cash", name: "Daily" }, to: { id: "bank", name: "Savings" } } } };
  await mount(looks);
  expect([factEmoji("From"), factEmoji("To")]).toEqual(expected);
  expect(root.root.findAllByType("view").filter(node => node.props.accessibilityLabel === "From, Daily")).toHaveLength(1);
  expect(root.root.findAllByType("view").filter(node => node.props.accessibilityLabel === "To, Savings")).toHaveLength(1);
});

test("the actual sheet scroll reveals October's context in November and Back returns to the measured summary", async () => {
  await mount();
  await layout();
  await scroll(247);
  expect(pill()).toBeUndefined();
  await scroll(248);
  expect(pill()?.props.accessibilityLabel).toBe("Back to summary, Food, COP 3.500 left");
  expect(native.query).toHaveBeenCalledWith("budget:evaluate", { workspaceId: "ws", month: "2026-10" });
  await act(async () => pill()?.props.onPress());
  expect(native.scrollTo).toHaveBeenLastCalledWith({ y: 40, animated: true });
  expect(pill()).toBeUndefined();
  await scroll(260);
  expect(pill()).toBeUndefined();
  await scroll(40);
  await scroll(248);
  expect(pill()?.props.accessibilityLabel).toBe("Back to summary, Food, COP 3.500 left");
});

test("a covering reversal hides the pill while summary geometry stays live", async () => {
  await mount(); await layout(); await scroll(248);
  expect(pill()?.props.accessibilityLabel).toContain("Food");
  await act(async () => button("Reverse entry").props.onPress());
  expect(root.root.findAllByType(BottomSheetModal)).toHaveLength(2);
  expect(pill()).toBeUndefined();
  await layout(80, 300);
  await scroll(388);
  await act(async () => button("Keep entry").props.onPress());
  expect(root.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  expect(pill()?.props.accessibilityLabel).toContain("Food");
  await act(async () => pill()?.props.onPress());
  expect(native.scrollTo).toHaveBeenLastCalledWith({ y: 80, animated: true });
  expect(native.post).not.toHaveBeenCalled();
});

test("route blur and native dismissal remove pill ownership; reopening starts at the summary", async () => {
  await mount(); await layout(); await scroll(248);
  expect(pill()?.props.accessibilityLabel).toContain("Food");
  native.focused = false;
  await act(async () => root.update(createElement(Harness)));
  expect(pill()).toBeUndefined();
  native.focused = true;
  await act(async () => root.update(createElement(Harness)));
  expect(pill()?.props.accessibilityLabel).toContain("Food");
  await act(async () => root.root.findByType(BottomSheetModal).props.onDismiss());
  expect(root.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  expect(pill()).toBeUndefined();
  await act(async () => button("Reopen").props.onPress());
  await layout();
  expect(root.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  expect(pill()).toBeUndefined();
});

test.each(["Close details", "Android Back"])("%s requests native dismissal before clearing the mounted details", async exit => {
  await mount();
  const modal = root.root.findByType(BottomSheetModal);
  expect(native.present).toHaveBeenCalledOnce();
  expect(modal.props.enablePanDownToClose).toBe(true);
  expect(modal.props.enableDynamicSizing).toBe(true);
  expect(modal.props.backdropComponent({}).props.pressBehavior).toBe("close");
  if (exit === "Close details") await act(async () => button(exit).props.onPress());
  else await act(async () => expect([...native.backHandlers].at(-1)?.()).toBe(true));
  expect(native.dismiss).toHaveBeenCalledOnce();
  expect(native.closed).not.toHaveBeenCalled();
  expect(root.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  await act(async () => modal.props.onDismiss());
  expect(native.closed).toHaveBeenCalledOnce();
  expect(root.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  expect(native.post).not.toHaveBeenCalled();
});

test("native details keeps Reverse and Close in a pinned footer outside the scrolling facts", async () => {
  await mount();
  const content = root.root.findByType(BottomSheetScrollView);
  expect(content.findAllByType("button").map(node => node.props.accessibilityLabel)).toEqual([]);
  const footer = root.root.find(node => String(node.type) === "footer");
  expect(footer.findAllByType("button").map(node => node.props.accessibilityLabel)).toEqual(["Reverse entry", "Close details"]);
  expect(content.props.enableFooterMarginAdjustment).toBe(true);
  expect(root.root.findByType(BottomSheetModal).props.enableDynamicSizing).toBe(true);
  await scroll(600);
  await act(async () => button("Close details").props.onPress());
  expect(native.dismiss).toHaveBeenCalledOnce();
  expect(native.closed).not.toHaveBeenCalled();
});

test.each([0, 40, 64])("native details keeps its dynamic sheet below a %sdp top safe area", async top => {
  native.top = top;
  await mount();
  const modal = root.root.findByType(BottomSheetModal);
  expect(modal.props.topInset).toBe(top);
  expect(modal.props.enableDynamicSizing).toBe(true);
  expect(modal.props.enablePanDownToClose).toBe(true);
  expect(modal.props.handleComponent).toBeUndefined();
});

test("the existing peek presentation docks after three seconds", async () => {
  await mount(); await layout(); await scroll(248);
  expect(pill()?.props.accessibilityLabel).toContain("Food");
  expect(styleHeight(pill()?.props.style)).toBe(128);
  await act(async () => { vi.advanceTimersByTime(3000); });
  expect(styleHeight(pill()?.props.style)).toBe(52);
});

test("a centred camera keeps the island and expands before returning to the summary", async () => {
  native.cutout = { kind: "centredPunchHole", rect: { x: 150, y: 0, width: 20, height: 30 } };
  await mount(); await layout(); await scroll(248);
  await act(async () => {
    const measure = root.root.findAllByType("text").find(node => node.props.onTextLayout && node.props.importantForAccessibility === "no-hide-descendants");
    measure?.props.onTextLayout({ nativeEvent: { lines: [{ width: 65 }] } });
  });
  expect(root.root.findByType(StatusBar).props.hidden).toBe(true);
  expect(styleHeight(pill()?.props.style)).toBe(24);
  await act(async () => pill()?.props.onPress());
  expect(native.scrollTo).not.toHaveBeenCalled();
  expect(pill()?.findAllByType("text").map(node => node.children.join(""))).toContain("Back to summary");
  await act(async () => pill()?.props.onPress());
  expect(native.scrollTo).toHaveBeenLastCalledWith({ y: 40, animated: true });
});
