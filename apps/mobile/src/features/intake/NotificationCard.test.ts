import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NotificationCard, signedAmount } from "./NotificationCard";
import { openAmount } from "../amount/session";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {} }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  KeyboardAvoidingView: "keyboard", Platform: { OS: "android" }, useWindowDimensions: () => ({ width: 360, height: 760, fontScale: 1 }),
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer | undefined;
const onUseAmount = vi.fn(); const onUseDescription = vi.fn();
const text = "Compra por $32.000 en TIENDA D1. Saldo disponible: $1.250.300";
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); onUseAmount.mockClear(); onUseDescription.mockClear(); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(props: Partial<React.ComponentProps<typeof NotificationCard>> = {}) {
  await act(async () => { root = create(createElement(NotificationCard, { notification: { text, packageName: "com.nu.production", at: 0 },
    appLabel: "Nu", currency: "COP", amount: openAmount("COP", "-32.000"), editable: true, onUseAmount, onUseDescription, ...props })); });
}
const texts = () => root?.root.findAllByType("text") ?? [];
const all = () => texts().map((node) => node.children.filter((child) => typeof child === "string").join("")).join("|");
const word = (value: string) => { const found = texts().find((node) => node.children.length === 1 && node.children[0] === value && node.props.onPress); if (!found) throw new Error(`No word ${value}`); return found; };

test("tapping an amount in the notification uses it", async () => {
  await render();
  const balance = texts().find((node) => node.props.accessibilityLabel === "Use $1.250.300 as the amount");
  await act(async () => { balance?.props.onPress(); });
  expect(onUseAmount).toHaveBeenCalledWith(125_030_000);
  expect(all()).toContain("Dashed amounts look like balances.");
});

test("tapping a first and a last word sets the description", async () => {
  await render();
  await act(async () => { word("TIENDA").props.onPress(); });
  expect(all()).toContain("Now tap the last word of the description.");
  await act(async () => { word("D1").props.onPress(); });
  expect(onUseDescription).toHaveBeenCalledWith("TIENDA D1");
});

test("a security code stays hidden until asked", async () => {
  await render({ notification: { text: "Tu clave dinámica es 482913", packageName: "com.todo1.mobile", at: 0 } });
  expect(all()).not.toContain("482913"); expect(all()).toContain("Hidden.");
  await act(async () => { root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === "Show the notification")?.props.onPress(); });
  expect(all()).toContain("482913");
});

test("a read-only form shows the notification without taps", async () => {
  await render({ editable: false });
  expect(texts().find((node) => node.props.accessibilityLabel === "Use $32.000 as the amount")?.props.onPress).toBeUndefined();
  expect(all()).toContain("From this notification.");
});

test("a Candidate without saved text explains that its original notification is unavailable", async () => {
  await render({ notification: { text: "", packageName: "com.nu.production", at: 0 } });
  expect(all()).toContain("Original notification");
  expect(all()).toContain("Notification text unavailable");
  expect(all()).toContain("No notification text was saved for this Candidate.");
  expect(all()).not.toContain("Tap an amount");
});

test("a tapped amount keeps the form's sign and is written in the workspace currency's format", () => {
  const tapped = (minor: number, currency: string, current: string, fallback: "in" | "out") =>
    signedAmount(minor, currency, openAmount(currency, current), fallback).editor.text;
  expect(tapped(125_030_000, "COP", "-32.000", "out")).toBe("-1.250.300");
  expect(tapped(3_200_000, "COP", "50.000", "out")).toBe("32.000");
  expect(tapped(3_200_000, "COP", "-", "in")).toBe("-32.000");
  expect(tapped(3_200_000, "COP", "", "out")).toBe("-32.000");
  expect(tapped(125_030_050, "USD", "-32,000", "out")).toBe("-1,250,300.50");
  expect(tapped(3_200_000, "USD", "", "in")).toBe("32,000");
});

test("the card reads in Spanish while the bank's text and app name stay as captured", async () => {
  const { LanguageProvider, formatDateTime } = await import("../../i18n");
  const at = Date.UTC(2026, 10, 10, 17, 5);
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "es" }, createElement(NotificationCard, {
    notification: { text, packageName: "com.nu.production", at }, appLabel: "Nu", currency: "COP", amount: openAmount("COP", "-32.000"), editable: true, onUseAmount, onUseDescription }))); });
  expect(all()).toContain("Notificación original");
  expect(all()).toContain("Nu");
  expect(all()).toContain(formatDateTime("es", at));
  expect(all()).toContain("Toca un monto para usarlo, o toca dos palabras para la descripción. Los montos subrayados con rayas parecen saldos.");
  expect(all()).toContain("TIENDA");
  expect(root?.root.findByProps({ accessibilityLabel: "Notificación de Nu" })).toBeTruthy();
  expect(texts().some((node) => node.props.accessibilityLabel === "Usar $32.000 como monto")).toBe(true);
  expect(texts().some((node) => node.props.accessibilityLabel === text)).toBe(true);
  for (const english of ["Original notification", "Tap an amount", "Dashed amounts"]) expect(all()).not.toContain(english);
});
