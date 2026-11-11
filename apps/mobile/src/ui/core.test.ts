import * as React from "react";
import { createElement, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ActionTile, Choice, ConfirmationScreen, Field, LanguageToggle, ListGroup, ListRow, useSetThemeMode } from "./core";
import { LanguageProvider } from "../i18n";
import { ThemeProvider } from "./themeContext";
import { themes, type ThemeMode } from "./tokens";
import { withThemeProvider } from "./testTheme";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  TextInput: "input",
  ActivityIndicator: "spinner",
  KeyboardAvoidingView: "keyboard-viewport",
  Platform: { OS: "ios" },
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

test("Field renders label, input, and helper copy", async () => {
  await act(async () => {
    root = create(
      withThemeProvider(createElement(Field, {
        label: "Amount",
        helperText: "Enter an amount.",
        value: "10",
        onChangeText: vi.fn(),
      })),
    );
  });
  const text = root?.root.findAllByType("text").map((node) => node.children.join("")) ?? [];
  expect(text).toContain("Amount");
  expect(text).toContain("Enter an amount.");
  expect(root?.root.findAllByType("input")).toHaveLength(1);
});

test("ActionTile with count 0 stays pressable and shows 0", async () => {
  const onPress = vi.fn();
  await act(async () => {
    root = create(
      withThemeProvider(createElement(ActionTile, {
        title: "Drafts",
        detail: "On this device",
        icon: "document-text-outline",
        count: 0,
        onPress,
      })),
    );
  });
  const labels =
    root?.root.findAllByType("text").map((node) => node.children.join("")) ?? [];
  expect(labels).toContain("0");
  const button = root?.root.findByType("button");
  expect(button?.props.accessibilityLabel).toBe("Drafts, 0, On this device");
  await act(async () => button?.props.onPress());
  expect(onPress).toHaveBeenCalledOnce();
});

test("ListRow shows chevron only when actionable and marks the last grouped row", async () => {
  await act(async () => {
    root = create(
      withThemeProvider(createElement(
        ListGroup,
        null,
        createElement(ListRow, { title: "Static", value: "COP 1" }),
        createElement(ListRow, {
          title: "Open",
          detail: "Daily",
          value: "COP 2",
          onPress: vi.fn(),
        }),
      )),
    );
  });
  const text =
    root?.root.findAllByType("text").map((node) => node.children.join("")) ?? [];
  expect(text.join("\n")).toContain("Static");
  expect(text.join("\n")).toContain("Open");
  expect(root?.root.findAll((node) => String(node.type) === "icon")).toHaveLength(1);
  expect(root?.root.findAllByType("button")).toHaveLength(1);
  const lastRow = root?.root.findAllByType("button")[0];
  const rowStyle = lastRow?.props.style;
  const flatStyle = Array.isArray(rowStyle)
    ? Object.assign({}, ...rowStyle.filter(Boolean))
    : rowStyle;
  expect(flatStyle?.borderBottomWidth).toBe(0);
});

test("primary ActionTile detail text uses full opacity on primaryForeground", async () => {
  await act(async () => {
    root = create(
      withThemeProvider(createElement(ActionTile, {
        title: "Drafts",
        detail: "Coming later",
        icon: "document-text-outline",
        primary: true,
      })),
    );
  });
  const detailNode = root?.root
    .findAllByType("text")
    .find((node) => node.children.join("") === "Coming later");
  const style = detailNode?.props.style;
  const flatStyle = Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean))
    : style;
  expect(flatStyle?.opacity).toBeUndefined();
});

test.each(["light", "dark"] as const)("Choice preserves its selected and disabled presentation in %s mode", async (mode: ThemeMode) => {
  function Harness() {
    const setMode = useSetThemeMode();
    useEffect(() => setMode(mode), [setMode]);
    return createElement(Choice, { label: "I spend it", selected: true, disabled: true, onPress: vi.fn() });
  }
  await act(async () => { root = create(withThemeProvider(createElement(Harness))); });
  const button = root?.root.findByType("button");
  expect(button?.props.accessibilityState).toEqual({ checked: true, disabled: true });
  expect(button?.props.disabled).toBe(true);
  const style = Object.assign({}, ...button?.props.style.filter(Boolean));
  expect(style).toMatchObject({ backgroundColor: themes[mode].secondary, borderColor: themes[mode].primary, minHeight: 76, opacity: 0.45 });
});

test("built-in labels follow the chosen language and the language choice stacks at the largest text", async () => {
  const spanish = (child: React.ReactElement, reflow = false) => createElement(LanguageProvider, { initialPreference: "es" },
    createElement(ThemeProvider, { layout: { reflow, pagePadding: 16 } }, child));
  await act(async () => {
    root = create(spanish(createElement(ConfirmationScreen, { title: "Listo", detail: "Guardado", onContinue: vi.fn() })));
  });
  expect(root?.root.findAllByType("button").map((node) => node.props.accessibilityLabel)).toEqual(["Continuar"]);
  await act(async () => root?.update(spanish(createElement(LanguageToggle))));
  const segments = () => root?.root.findAllByType("button") ?? [];
  expect(segments().map((node) => node.props.accessibilityLabel)).toEqual(["Usar el idioma del celular", "English", "Español"]);
  expect(segments().map((node) => node.props.style[1])).toEqual([{ flexBasis: "30%" }, { flexBasis: "30%" }, { flexBasis: "30%" }]);
  await act(async () => root?.update(spanish(createElement(LanguageToggle), true)));
  expect(segments().map((node) => node.props.style[1])).toEqual([false, false, false]);
  const group = root?.root.find((node) => node.props.accessibilityRole === "radiogroup" && typeof node.type === "string");
  expect([group?.props.style].flat(3).filter(Boolean).reduce((all, part) => ({ ...all, ...part }), {}).flexDirection).toBe("column");
});
