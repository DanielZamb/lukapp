import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PostingForm } from "./PostingForm";
import { emptyPostingForm } from "./PostingForm.fixtures";

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

function text() {
  return (
    root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ??
    ""
  );
}

const handlers = {
  onAmountChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onBack: vi.fn(),
  onPlace: vi.fn(),
  onCategory: vi.fn(),
  onDate: vi.fn(),
  onPost: vi.fn(),
  onDone: vi.fn(),
};

test("description uses Field and Keep as Draft is optional", async () => {
  await act(async () => {
    root = create(createElement(PostingForm, { ...emptyPostingForm, ...handlers }));
  });
  expect(text()).toContain("Description");
  expect(text()).not.toContain("Keep as Draft");
  const onKeepDraft = vi.fn();
  await act(async () => {
    root?.update(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        onKeepDraft,
        canKeepDraft: true,
      }),
    );
  });
  expect(text()).toContain("Keep as Draft");
  const keep = root?.root
    .findAllByType("button")
    .find((node) => node.props.accessibilityLabel === "Keep as Draft");
  await act(async () => keep?.props.onPress());
  expect(onKeepDraft).toHaveBeenCalledOnce();
});

test("a Candidate locks Transfer and Initial balance", async () => {
  const onEntryType = vi.fn();
  await act(async () => {
    root = create(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        onEntryType,
        lockEntryType: true,
      }),
    );
  });
  const chips = root?.root
    .findAllByType("button")
    .filter((node) => node.props.accessibilityRole === "radio");
  expect(
    chips?.every((chip) => chip.props.accessibilityState?.disabled === true),
  ).toBe(true);
  expect(chips?.every((chip) => chip.props.onPress === undefined)).toBe(true);
  expect(onEntryType).not.toHaveBeenCalled();
});
