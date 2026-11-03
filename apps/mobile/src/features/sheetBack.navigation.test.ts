import * as React from "react";
import { createElement, useEffect, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BottomSheetModal, BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { RestyleSheet } from "./categories/SetupRestyleSheet";
import { CategoryPicker } from "./categories/CategoryPicker";
import { HistoryFilterSheet, useHistoryFilterPresentation } from "./history/HistoryFilters";
import { ThemeProvider } from "../ui/themeContext";
import { readableLayout } from "../ui/layout";
import type { HistoryQuery } from "./history/filter";
import { Sheet } from "../ui/Sheet";
import { PickerSheet } from "../ui/PickerSheet";

vi.mock("./posting/usePostingTransport", () => ({ usePostingTransport: () => { throw new Error("No deferred account request"); } }));
vi.mock("convex/react", () => ({
  useAction: () => () => { throw new Error("Opening a setup picker must not save setup"); },
  useQuery: () => [],
}));
vi.mock("@gorhom/bottom-sheet", async () => ({
  BottomSheetModal: (await vi.importActual<{ default: typeof BottomSheetModal }>(
    "@gorhom/bottom-sheet/src/components/bottomSheetModal/BottomSheetModal",
  )).default,
  BottomSheetModalProvider: (await vi.importActual<{ default: typeof BottomSheetModalProvider }>(
    "@gorhom/bottom-sheet/src/components/bottomSheetModalProvider/BottomSheetModalProvider",
  )).default,
  BottomSheetScrollView: "scroll",
  BottomSheetTextInput: "input",
  BottomSheetBackdrop: "backdrop",
}));
vi.mock("@gorhom/bottom-sheet/src/hooks", async () =>
  vi.importActual("@gorhom/bottom-sheet/src/hooks/useBottomSheetModalInternal"));
vi.mock("@gorhom/bottom-sheet/src/contexts", async () => ({
  ...await vi.importActual("@gorhom/bottom-sheet/src/contexts/modal/internal"),
  ...await vi.importActual("@gorhom/bottom-sheet/src/contexts/modal/external"),
}));
vi.mock("@gorhom/bottom-sheet/src/utilities", () => ({ print() {} }));
vi.mock("@gorhom/bottom-sheet/src/components/bottomSheet", () => ({
  default: React.forwardRef(function NativeSheet(props: React.PropsWithChildren<{
    onAnimate: (...args: number[]) => void;
    onChange: (...args: number[]) => void;
    onClose: () => void;
  }>, ref) {
    const close = () => closes.push(() => {
      props.onAnimate(0, -1, 0, 1000);
      props.onChange(-1, 1000, 0);
      props.onClose();
    });
    React.useImperativeHandle(ref, () => ({ close, forceClose: close, snapToIndex() {} }));
    useEffect(() => { props.onChange(0, 0, 0); }, []);
    return createElement("native-sheet", { onPanDown: close }, props.children);
  }),
}));
vi.mock("@gorhom/bottom-sheet/src/components/bottomSheetHostingContainer", () => ({
  BottomSheetHostingContainer: () => null,
}));
vi.mock("react-native-reanimated", () => ({
  useSharedValue: (value: unknown) => React.useRef({ value }).current,
  Easing: { out: (value: unknown) => value, exp: () => {} },
}));
const hardware = vi.hoisted(() => ({ listeners: [] as Array<() => boolean> }));
vi.mock("react-native", () => ({
  BackHandler: { addEventListener: (_event: string, listener: () => boolean) => {
    hardware.listeners.push(listener);
    return { remove() { hardware.listeners = hardware.listeners.filter((item) => item !== listener); } };
  } },
  Text: "text", View: "view", Pressable: "button", TextInput: "input",
  ScrollView: "scroll", ActivityIndicator: "spinner",
  Platform: { OS: "android", select: (values: { android?: unknown }) => values.android },
  StyleSheet: { create: (value: unknown) => value, flatten: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area",
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("react-native-gesture-handler", () => ({ ScrollView: "gesture-scroll" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "calendar" }));


const closes: Array<() => void> = [];
let frames: FrameRequestCallback[] = [];
let root: ReactTestRenderer | undefined;
const closed = vi.fn();
function Harness({ flow }: { flow: "setup" | "history" | "sheet" | "category" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<HistoryQuery>({ search: "", profileIds: ["daily"], categoryIds: [], range: "all", customFrom: null, customTo: null });
  const presentation = useHistoryFilterPresentation();
  const close = () => { closed(); setOpen(false); presentation.close(); };
  return createElement(React.Fragment, null,
    createElement("button", { accessibilityLabel: "Open child", onPress: () => { setOpen(true); presentation.open("places"); } }),
    createElement("caller", { testID: "caller", query, amount: "123", currency: "USD", category: "Food" }),
    flow === "setup" ? open && createElement(RestyleSheet, { target: { kind: "create" }, names: [], onCommit: () => {}, onAccountSetup: () => {}, onClose: close })
      : flow === "category" ? createElement(CategoryPicker, { workspaceId: "workspace", visible: open, value: { ids: [], primaryId: null }, onChange: () => {}, onClose: close })
      : flow === "sheet" ? open && createElement(Sheet, { label: "Shared sheet", onDismiss: close }, createElement("text", null, "Caller body"))
      : createElement(HistoryFilterSheet, { query, onQuery: setQuery, sort: { key: "date", dir: "desc" }, onSort: () => {}, places: [{ id: "daily", name: "Daily" }], categories: [], today: "2026-11-03", presentation: { ...presentation, close } }),
  );
}
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("__DEV__", false); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  frames = []; closes.length = 0; hardware.listeners = []; closed.mockClear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function settle() {
  for (let turn = 0; turn < 6 && (frames.length || closes.length); turn += 1) {
    await act(async () => { const pending = frames; frames = []; pending.forEach((frame) => frame(0)); });
    await act(async () => closes.splice(0).forEach((close) => close()));
  }
}
async function back() {
  await act(async () => { expect([...hardware.listeners].reverse().some((listener) => listener())).toBe(true); });
}
test.each([
  { flow: "setup", fontScale: 1 }, { flow: "history", fontScale: 1 }, { flow: "sheet", fontScale: 1 }, { flow: "category", fontScale: 1 },
  { flow: "setup", fontScale: 2.1 }, { flow: "history", fontScale: 2.1 }, { flow: "sheet", fontScale: 2.1 }, { flow: "category", fontScale: 2.1 },
] as const)("$flow at fontScale $fontScale closes once when Back precedes presentation and can reopen", async ({ flow, fontScale }) => {
  await act(async () => { root = create(createElement(ThemeProvider, { layout: readableLayout({ width: 390, fontScale }) }, createElement(BottomSheetModalProvider, null, createElement(Harness, { flow })))); });
  const open = () => root!.root.findByProps({ accessibilityLabel: "Open child" }).props.onPress();
  for (let iteration = 0; iteration < 3; iteration += 1) {
    await act(async () => open());
    expect(root!.root.findAll((node) => String(node.type) === "native-sheet")).toHaveLength(0);
    await back();
    expect(closed).toHaveBeenCalledTimes(iteration);
    await settle();
    expect(closed).toHaveBeenCalledTimes(iteration + 1);
    expect(root!.root.findAll((node) => String(node.type) === "native-sheet")).toHaveLength(0);
    expect(hardware.listeners).toHaveLength(0);
    expect(root!.root.findByProps({ testID: "caller" }).props).toMatchObject({ amount: "123", currency: "USD", category: "Food", query: { profileIds: ["daily"] } });
  }
});

test("Back while busy does not queue dismissal, and repeated Back while closing returns once", async () => {
  const close = vi.fn();
  const render = (busy: boolean) => createElement(BottomSheetModalProvider, null, createElement(PickerSheet, { androidBack: true, busy, onDismiss: close, children: createElement("text", null, "Busy picker") }));
  await act(async () => { root = create(render(true)); });
  await back(); await settle();
  expect(close).not.toHaveBeenCalled();
  expect(root!.root.findAll((node) => String(node.type) === "native-sheet")).toHaveLength(1);
  await act(async () => root!.update(render(false)));
  await back(); await back();
  expect(close).not.toHaveBeenCalled();
  await settle();
  expect(close).toHaveBeenCalledOnce();
  expect(hardware.listeners).toHaveLength(0);
});
test("repeated Back before presentation queues one close", async () => {
  await act(async () => { root = create(createElement(BottomSheetModalProvider, null, createElement(Harness, { flow: "history" }))); });
  await act(async () => root!.root.findByProps({ accessibilityLabel: "Open child" }).props.onPress());
  await back(); await back(); await back();
  expect(closed).not.toHaveBeenCalled();
  await settle();
  expect(closed).toHaveBeenCalledOnce();
  expect(hardware.listeners).toHaveLength(0);
});
