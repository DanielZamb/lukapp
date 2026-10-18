import * as React from "react";
import { createElement, useEffect, useRef, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BottomSheetModal, BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { PlaceDraft } from "./usePostingEditor";
import { AccountSetupForm } from "./AccountSetupForm";

vi.mock("@gorhom/bottom-sheet", async () => ({
  BottomSheetModal: (await vi.importActual<{ default: typeof BottomSheetModal }>(
    "@gorhom/bottom-sheet/src/components/bottomSheetModal/BottomSheetModal",
  )).default,
  BottomSheetModalProvider: (await vi.importActual<{ default: typeof BottomSheetModalProvider }>(
    "@gorhom/bottom-sheet/src/components/bottomSheetModalProvider/BottomSheetModalProvider",
  )).default,
  BottomSheetScrollView: "scroll",
  BottomSheetTextInput: "input",
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
    React.useImperativeHandle(ref, () => {
      const close = () => closes.push(() => {
        props.onAnimate(0, -1, 0, 1000);
        props.onChange(-1, 1000, 0);
        props.onClose();
      });
      return { close, forceClose: close, snapToIndex() {} };
    });
    useEffect(() => { props.onChange(0, 0, 0); }, []);
    return createElement("native-sheet", null, props.children);
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
  Text: "text", View: "view", Pressable: "button", TextInput: "input",
  ScrollView: "scroll", ActivityIndicator: "spinner",
  Platform: { OS: "android", select: (values: { android?: unknown }) => values.android },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));

const initial: PlaceDraft = {
  name: "Savings trip", productKind: "savingsAccount", emoji: "💰",
  amount: "123", date: "2026-10-18",
  target: { kind: "destination", sourceProfileId: "daily" },
};
const dismissed = vi.fn();
const closes: Array<() => void> = [];
let root: ReactTestRenderer | undefined;

function Setup() {
  const sheet = useRef<BottomSheetModal>(null);
  const [value, setValue] = useState<PlaceDraft | null>(initial);
  useEffect(() => { sheet.current?.present(); }, []);
  return createElement(AccountSetupForm, {
    sheetRef: sheet, value, currency: "COP", editable: true, busy: false,
    pending: false, error: "", canSubmit: true, onChange: setValue,
    onSubmit() {}, onDismiss() { dismissed(); setValue(null); },
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
  dismissed.mockClear();
  closes.length = 0;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    root = create(createElement(BottomSheetModalProvider, null, createElement(Setup)));
  });
}
async function settle() {
  for (let frame = 0; frame < 5 && closes.length; frame += 1) {
    await act(async () => { closes.splice(0).forEach((close) => close()); });
  }
  expect(closes).toHaveLength(0);
}
function screen() {
  if (!root) throw new Error("Setup is not mounted");
  return root.root;
}
function button(label: string) {
  const found = screen().findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

test("Look keeps its controls and place answers after sheet animations settle", async () => {
  await mount();
  await act(async () => button("Choose emoji").props.onPress());
  await settle();
  expect(dismissed).not.toHaveBeenCalled();
  expect(button("Emoji 🏦")).toBeDefined();
  await act(async () => button("Emoji 🏦").props.onPress());
  expect(button("Emoji 🏦").props.accessibilityState.checked).toBe(true);
  await act(async () => button("Use this").props.onPress());
  await settle();
  expect(dismissed).not.toHaveBeenCalled();
  expect(button("Choose emoji")).toBeDefined();
  expect(screen().findByType(AccountSetupForm).props.value).toEqual({ ...initial, emoji: "🏦" });
});

test("dismissing place setup also removes its Look sheet", async () => {
  await mount();
  await act(async () => button("Choose emoji").props.onPress());
  await settle();
  await act(async () => screen().findByType(AccountSetupForm).props.sheetRef.current.dismiss());
  await settle();
  expect(dismissed).toHaveBeenCalledOnce();
  expect(screen().findByType(AccountSetupForm).props.value).toBeNull();
  expect(screen().findAll((node) => String(node.type) === "native-sheet")).toHaveLength(0);
});
