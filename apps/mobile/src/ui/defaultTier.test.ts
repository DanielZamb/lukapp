import * as React from "react";
import { createElement as h, useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ActionTile, Choice, Field, Header, ListGroup, ListRow, PrimaryButton, ProgressBar, SecondaryButton, useSetThemeMode } from "./core";
import { Sheet } from "./Sheet";
import { ThemeProvider } from "./themeContext";
import type { ThemeMode } from "./tokens";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
vi.mock("@gorhom/bottom-sheet", () => ({ BottomSheetModal: "modal", BottomSheetScrollView: "sheet-scroll", BottomSheetBackdrop: "backdrop" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  BackHandler: { addEventListener: () => ({ remove: () => {} }) },
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

const noop = () => {};
function Examples({ mode }: { mode: ThemeMode }) {
  const setMode = useSetThemeMode();
  useEffect(() => setMode(mode), [mode, setMode]);
  return h(React.Fragment, null,
    h(Header, { title: "Overview", eyebrow: "October", onBack: noop, onUser: noop }),
    h(PrimaryButton, { label: "Post entry", onPress: noop }),
    h(PrimaryButton, { label: "Posting", onPress: noop, pending: true }),
    h(SecondaryButton, { label: "Save draft", onPress: noop }),
    h(SecondaryButton, { label: "Reverse", onPress: noop, tone: "danger", disabled: true }),
    h(Field, { label: "Amount", helperText: "Enter an amount", value: "10" }),
    h(Field, { label: "Amount", error: "Use an amount above 0", value: "0" }),
    h(ListGroup, null,
      h(ListRow, { title: "Food", detail: "Everyday", value: "COP 20", icon: "heart", tone: "positive" }),
      h(ListRow, { title: "Transport", value: "COP 10", onPress: noop })),
    h(Choice, { label: "Every month", detail: "Repeats", selected: true, disabled: true, onPress: noop }),
    h(ActionTile, { title: "Drafts", detail: "On this device", icon: "document-text-outline", primary: true, count: 0, onPress: noop }),
    h(ActionTile, { title: "History", detail: "Your entries", icon: "time" }),
    h(ProgressBar, { value: 0.6, label: "60% used" }),
    h(Sheet, { label: "Entry details", onClose: noop }, h(ListRow, { title: "Status", value: "Posted" })),
  );
}

test.each(["light", "dark"] as const)("default render tree stays identical in %s", async (mode) => {
  await act(async () => { root = create(h(ThemeProvider, null, h(Examples, { mode }))); });
  const tree = JSON.stringify(root?.toJSON(), (key, value) => {
    if (key === "style" && typeof value === "function") {
      return { idle: value({ pressed: false }), pressed: value({ pressed: true }) };
    }
    return typeof value === "function" ? "[callback]" : value;
  }, 2);
  expect(tree).toMatchSnapshot();
});
