import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ActionTile, Field, ListGroup, ListRow } from "./core";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  TextInput: "input",
  ActivityIndicator: "spinner",
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
      createElement(Field, {
        label: "Amount",
        helperText: "Enter an amount.",
        value: "10",
        onChangeText: vi.fn(),
      }),
    );
  });
  const text = root?.root.findAllByType("text").map((node) => node.children.join("")) ?? [];
  expect(text).toContain("Amount");
  expect(text).toContain("Enter an amount.");
  expect(root?.root.findAllByType("input")).toHaveLength(1);
});

test("ListRow shows chevron only when actionable and marks the last grouped row", async () => {
  await act(async () => {
    root = create(
      createElement(
        ListGroup,
        null,
        createElement(ListRow, { title: "Static", value: "COP 1" }),
        createElement(ListRow, {
          title: "Open",
          detail: "Daily",
          value: "COP 2",
          onPress: vi.fn(),
        }),
      ),
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
      createElement(ActionTile, {
        title: "Drafts",
        detail: "Coming later",
        icon: "document-text-outline",
        primary: true,
      }),
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
