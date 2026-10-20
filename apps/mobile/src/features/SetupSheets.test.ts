import * as React from "react";
import { createElement, useEffect, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BottomSheetModal, BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Setup } from "./Setup";

vi.mock("./posting/usePostingTransport", () => ({ usePostingTransport: () => { throw new Error("No deferred account request"); } }));
vi.mock("convex/react", () => ({
  useAction: () => () => { throw new Error("Opening a setup picker must not save setup"); },
  useQuery: () => [{ id: "groceries", name: "Food", nature: "Expense" }],
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
vi.mock("react-native", () => ({
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  Text: "text", View: "view", Pressable: "button", TextInput: "input",
  ScrollView: "scroll", ActivityIndicator: "spinner",
  Platform: { OS: "android", select: (values: { android?: unknown }) => values.android },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area",
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));

const closes: Array<() => void> = [];
let root: ReactTestRenderer | undefined;

function FirstSetup() {
  const [open, setOpen] = useState(true);
  return open
    ? createElement(Setup, { subject: "owner", onComplete() {}, onCancel: () => setOpen(false) })
    : createElement("button", { accessibilityLabel: "Start setup", onPress: () => setOpen(true) });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
  closes.length = 0;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

function screen() {
  if (!root) throw new Error("Setup is not mounted");
  return root.root;
}
function control(label: string): ReactTestInstance {
  const node = screen().findAll((node) =>
    typeof node.type === "string" && node.props.accessibilityLabel === label)[0];
  if (!node) throw new Error(`Missing setup control: ${label}`);
  return node;
}
async function press(label: string) {
  await act(async () => control(label).props.onPress());
}
async function settle() {
  for (let frame = 0; frame < 5 && closes.length; frame += 1) {
    await act(async () => { closes.splice(0).forEach((close) => close()); });
  }
  expect(closes).toHaveLength(0);
}
async function mount() {
  await act(async () => {
    root = create(createElement(BottomSheetModalProvider, null, createElement(FirstSetup)));
  });
  await press("Food");
  await press("USD");
  await press("Not now, You add drafts yourself");
  await act(async () => control("Starting amount").props.onChangeText("123"));
}
function expectAnswers(currency = "USD") {
  expect(control("Starting amount").props.value).toBe("123");
  expect(control("Food").props.accessibilityState.checked).toBe(true);
  if (currency === "CAD")
    expect(control("More currencies").findByType("text").children).toEqual(["CAD"]);
  else expect(control(currency).props.accessibilityState.checked).toBe(true);
  expect(control("Not now, You add drafts yourself").props.accessibilityState.checked).toBe(true);
}

test.each([
  { label: "More currencies", child: "Search currencies" },
  { label: `Timezone, ${Intl.DateTimeFormat().resolvedOptions().timeZone}`, child: "Search timezones" },
  { label: "Add your own category", child: "Category name" },
  { label: "Food", child: "Done", longPress: true },
])("opening and canceling $child keeps first setup and its answers", async ({ label, child, longPress }) => {
  await mount();
  expectAnswers();
  if (longPress) await act(async () => control(label).props.onLongPress());
  else await press(label);
  await settle();
  expect(screen().findAllByProps({ accessibilityLabel: "Start setup" })).toHaveLength(0);
  expectAnswers();
  expect(control(child).type).toBe(child.startsWith("Search") || child === "Category name" ? "input" : "button");
  const picker = screen().findAll((node) => String(node.type) === "native-sheet").at(-1);
  if (!picker) throw new Error("Missing setup picker");
  await act(async () => picker.props.onPanDown());
  await settle();
  expectAnswers();
  expect(screen().findAll((node) => String(node.type) === "native-sheet")).toHaveLength(1);
  await press("Cancel setup");
  await settle();
  expect(control("Start setup").type).toBe("button");
});

test.each([
  { label: "More currencies", choice: "CAD, Canadian Dollar", currency: "CAD", retained: "CAD, Canadian Dollar" },
  { label: `Timezone, ${Intl.DateTimeFormat().resolvedOptions().timeZone}`, choice: "America/Bogota, Bogotá", currency: "USD", retained: "America/Bogota, Bogotá" },
])("choosing and reopening $label retains the selection and setup answers", async ({ label, choice, currency, retained }) => {
  await mount();
  await press(label);
  await settle();
  await press(choice);
  await settle();
  expectAnswers(currency);
  const reopen = label === "More currencies" ? label : "Timezone, America/Bogota";
  await press(reopen);
  await settle();
  expect(control(retained).props.accessibilityState.checked).toBe(true);
  expectAnswers(currency);
});

test("creating and restyling a category keeps setup answers after both sheets close", async () => {
  await mount();
  await press("Add your own category");
  await settle();
  await act(async () => control("Category name").props.onChangeText("Weekend"));
  await press("I spend it");
  await press("Add category");
  await settle();
  expectAnswers();
  expect(control("Weekend").props.accessibilityState.checked).toBe(true);
  await act(async () => control("Weekend").props.onLongPress());
  await settle();
  await press("Emoji 🍔");
  await press("Done");
  await settle();
  expectAnswers();
  expect(control("Weekend").findAllByType("text")[0].children).toEqual(["🍔"]);
  expect(control("Weekend").props.accessibilityState.checked).toBe(true);
});
