import * as React from "react";
import { createElement, useEffect, useRef, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { PlaceDraft } from "./usePostingEditor";
import { AccountSetupForm } from "./AccountSetupForm";
import { themes } from "../../ui/tokens";
import { ThemeProvider, useSetThemeMode } from "../../ui/themeContext";

const back = vi.hoisted(() => ({ listeners: new Set<() => boolean>() }));

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
  BackHandler: { addEventListener: (_event: string, callback: () => boolean) => {
    back.listeners.add(callback);
    return { remove: () => back.listeners.delete(callback) };
  } },
  Text: "text", View: "view", Pressable: "button", TextInput: "input",
  ScrollView: "scroll", ActivityIndicator: "spinner",
  Platform: { OS: "android", select: (values: { android?: unknown }) => values.android },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));

const initial: PlaceDraft = {
  name: "Savings trip", productKind: "bankAccount", emoji: "💰",
  amount: "123", date: "2026-10-18",
  target: { kind: "destination", sourceProfileId: "daily" },
};
const dismissed = vi.fn();
const submitted = vi.fn();
const closes: Array<() => void> = [];
let root: ReactTestRenderer | undefined;

function Setup() {
  const sheet = useRef<BottomSheetModal>(null);
  const [value, setValue] = useState<PlaceDraft | null>(initial);
  useEffect(() => { sheet.current?.present(); }, []);
  return createElement(AccountSetupForm, {
    sheetRef: sheet, value, currency: "COP", editable: true, busy: false,
    pending: false, error: "", canSubmit: true, onChange: setValue,
    onSubmit: submitted, onDismiss() { dismissed(); setValue(null); },
  });
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; });
  dismissed.mockClear();
  submitted.mockClear();
  back.listeners.clear();
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

test("Look renders the standard dimming backdrop with tap-to-close", async () => {
  await mount();
  await act(async () => button("Choose emoji").props.onPress());
  await settle();
  const look = screen().findAllByType(BottomSheetModal).at(-1);
  expect(look?.props.backdropComponent).toBeTypeOf("function");
  const animation = { animatedIndex: { value: 0 }, animatedPosition: { value: 0 } };
  const backdrop = look?.props.backdropComponent(animation);
  expect(backdrop.type).toBe(BottomSheetBackdrop);
  expect(backdrop.props).toMatchObject({
    ...animation, appearsOnIndex: 0, disappearsOnIndex: -1, pressBehavior: "close",
  });
});

test("Look keeps its controls and place answers after sheet animations settle", async () => {
  await mount();
  const accountName = screen().findByProps({ accessibilityLabel: "Account name" });
  await act(async () => accountName.props.onChangeText("Trip savings"));
  const savings = screen().findAllByType("button").find((node) =>
    node.props.accessibilityRole === "radio" && node.findByType("text").children.join("") === "Savings",
  );
  if (!savings) throw new Error("Missing Savings choice");
  await act(async () => savings.props.onPress());
  const balance = screen().findByProps({ accessibilityLabel: "Balance today" });
  await act(async () => balance.props.onChangeText("456"));
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
  expect(screen().findByType(AccountSetupForm).props.value).toEqual({
    ...initial, name: "Trip savings", productKind: "savingsAccount", amount: "456", emoji: "🏦",
  });
});

test("canceling Look discards its staged emoji and custom input remains available", async () => {
  await mount();
  await act(async () => button("Choose emoji").props.onPress());
  await settle();
  const custom = screen().findByProps({ accessibilityLabel: "Custom emoji" });
  await act(async () => custom.props.onChangeText("🌿"));
  expect(screen().findByType(AccountSetupForm).props.value).toEqual(initial);
  expect(screen().findByProps({ accessibilityLabel: "Custom emoji" }).props.value).toBe("🌿");
  const lookModal = screen().findAll((node) => String(node.type) === "native-sheet").at(-1);
  if (!lookModal) throw new Error("Missing Look sheet");
  await act(async () => lookModal.props.onPanDown());
  await settle();
  expect(screen().findByType(AccountSetupForm).props.value).toEqual(initial);
  expect(screen().findByProps({ accessibilityLabel: "Choose emoji" }).findAllByType("text")[0]?.children.join("")).toBe("💰");
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

function hardwareBack() {
  for (const callback of [...back.listeners].reverse()) {
    if (callback()) return true;
  }
  return false;
}

test("Android Back cancels only Look and retains the unsaved place answers", async () => {
  await mount();
  await act(async () => screen().findByProps({ accessibilityLabel: "Account name" }).props.onChangeText("Back trip"));
  await act(async () => screen().findByProps({ accessibilityLabel: "Balance today" }).props.onChangeText("456"));
  const wallet = screen().findAllByType("button").find((node) =>
    node.props.accessibilityRole === "radio" && node.findByType("text").children.join("") === "Wallet",
  );
  if (!wallet) throw new Error("Missing Wallet choice");
  await act(async () => wallet.props.onPress());
  const before = { ...initial, name: "Back trip", amount: "456", productKind: "cash" };
  expect(screen().findByType(AccountSetupForm).props.value).toEqual(before);
  await act(async () => button("Choose emoji").props.onPress());
  await settle();
  await act(async () => screen().findByProps({ accessibilityLabel: "Custom emoji" }).props.onChangeText("🌿extra"));
  let handled = false;
  await act(async () => { handled = hardwareBack(); });
  expect(handled).toBe(true);
  await settle();
  expect(screen().findByType(AccountSetupForm).props.value).toEqual(before);
  expect(dismissed).not.toHaveBeenCalled();
  expect(screen().findAll((node) => String(node.type) === "native-sheet")).toHaveLength(1);
  expect(submitted).not.toHaveBeenCalled();
  await act(async () => button("Choose emoji").props.onPress());
  await settle();
  expect(screen().findByProps({ accessibilityLabel: "Custom emoji" }).props.value).toBe("");
  expect(button("Emoji 💰").props.accessibilityState.checked).toBe(true);
});

test("custom Look applies to the draft only after Use this; canceling setup never submits", async () => {
  await mount();
  await act(async () => button("Choose emoji").props.onPress());
  await settle();
  await act(async () => screen().findByProps({ accessibilityLabel: "Custom emoji" }).props.onChangeText("🦊extra"));
  expect(screen().findByType(AccountSetupForm).props.value).toEqual(initial);
  await act(async () => button("Use this").props.onPress());
  await settle();
  expect(screen().findByType(AccountSetupForm).props.value).toEqual({ ...initial, emoji: "🦊" });
  expect(submitted).not.toHaveBeenCalled();
  await act(async () => screen().findByType(AccountSetupForm).props.sheetRef.current.dismiss());
  await settle();
  expect(dismissed).toHaveBeenCalledOnce();
  expect(submitted).not.toHaveBeenCalled();
});

function DarkTheme() {
  const setMode = useSetThemeMode();
  useEffect(() => setMode("dark"), [setMode]);
  return createElement(Setup);
}

test.each(["light", "dark"] as const)("Look has circular themed choices and custom input in %s", async (mode) => {
  await act(async () => {
    root = create(createElement(ThemeProvider, null,
      createElement(BottomSheetModalProvider, null, createElement(mode === "dark" ? DarkTheme : Setup))));
  });
  await act(async () => button("Choose emoji").props.onPress());
  await settle();
  const choice = Object.assign({}, ...button("Emoji 💰").props.style);
  expect(choice.width).toBeGreaterThanOrEqual(48);
  expect(choice.height).toBe(choice.width);
  expect(choice.borderRadius).toBeGreaterThanOrEqual(choice.width / 2);
  expect(choice).toMatchObject({ backgroundColor: themes[mode].secondary, borderColor: themes[mode].primary });
  const input = screen().findByProps({ accessibilityLabel: "Custom emoji" });
  expect(input.props.placeholder).toBe("Or type your own");
  expect(input.props.style).toMatchObject({ backgroundColor: themes[mode].secondary, color: themes[mode].foreground });
});
