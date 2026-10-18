import * as React from "react";
import { createElement, createRef } from "react";
import { ScrollView } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PostingForm } from "./PostingForm";
import { emptyPostingForm } from "./PostingForm.fixtures";
import { ListRow } from "../../ui/core";
import { PlaceSheet } from "./PlaceSheet";
import { AccountSetupForm } from "./AccountSetupForm";
import type { PlaceDraft } from "./usePostingEditor";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area",
}));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet",
  BottomSheetScrollView: "sheet-scroll",
  BottomSheetTextInput: "input",
}));
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
    root?.root
      .findAllByType("text")
      .map((node) => node.children.join(""))
      .join("\n") ?? ""
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

test("one entry follows the prototype order with an open description and one Post action", async () => {
  await act(async () => {
    root = create(
      createElement(PostingForm, { ...emptyPostingForm, ...handlers }),
    );
  });
  const copy = text();
  const ordered = [
    "NEW ENTRY",
    "Post money",
    "One",
    "Batch",
    "Normal",
    "Initial balance",
    "Transfer",
    "Description",
    "Place",
    "Category",
    "Date occurred",
    "Post",
  ];
  let last = -1;
  for (const label of ordered) {
    const position = copy.indexOf(label, last + 1);
    expect(position).toBeGreaterThan(last);
    last = position;
  }
  const inputs = root!.root.findAllByType("input");
  expect(inputs.map((node) => node.props.placeholder)).toEqual([
    "-0",
    "What was it",
  ]);
  expect(inputs[1].props.multiline).toBe(true);
  expect(inputs[1].props.style.borderWidth).toBeUndefined();
  expect(
    root!.root
      .findAllByType("button")
      .filter((node) => node.props.accessibilityLabel === "Post"),
  ).toHaveLength(1);
  expect(text()).not.toContain("Keep as Draft");
});

test.each([
  ["normal", ["Place", "Category", "Date occurred"]],
  ["transfer", ["Place", "To", "Category", "Date occurred"]],
  ["initial", ["Place", "Date occurred"]],
] as const)("%s shows only its relevant rows", async (entryType, expected) => {
  await act(async () => {
    root = create(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        entryType,
      }),
    );
  });
  expect(
    root!.root.findAllByType(ListRow).map((node) => node.props.title),
  ).toEqual(expected);
});

test("the receipt is below the scroll area and Done runs the exit action", async () => {
  const onDone = vi.fn();
  await act(async () => {
    root = create(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        posted: "Taxi · −COP 12.500,00",
        onDone,
      }),
    );
  });
  const scrollCopy = root!.root
    .findByType(ScrollView)
    .findAllByType("text")
    .map((node) => node.children.join(""))
    .join("\n");
  expect(scrollCopy).not.toContain("Posted");
  expect(text()).toContain("Posted\nTaxi · −COP 12.500,00\nDone");
  expect(
    root!.root
      .findAllByType("button")
      .some((node) => node.props.accessibilityLabel === "Post"),
  ).toBe(false);
  await act(async () =>
    root!.root
      .findByProps({ accessibilityLabel: "Done", accessibilityRole: "button" })
      .props.onPress(),
  );
  expect(onDone).toHaveBeenCalledOnce();
});

test("From searches trimmed names and emoji, excludes To, and adds a place", async () => {
  const onSelect = vi.fn();
  const onAdd = vi.fn();
  const props = {
    sheetRef: createRef<BottomSheetModal>(),
    title: "From",
    search: "  savings  ",
    onSearch: vi.fn(),
    places: [
      { id: "bank", name: "Savings", emoji: "🐷" },
      { id: "to", name: "Other Savings", emoji: "🏦" },
    ],
    selectedId: "bank",
    excludedId: "to",
    disabled: false,
    onSelect,
    onAdd,
  };
  await act(async () => {
    root = create(createElement(PlaceSheet, props));
  });
  expect(text()).toBe("From\n🐷\nSavings\nAdd a place");
  await act(async () =>
    root!.root
      .findByProps({ accessibilityLabel: "🐷 Savings" })
      .props.onPress(),
  );
  expect(onSelect).toHaveBeenCalledWith("bank");
  await act(async () =>
    root!.root
      .findByProps({ accessibilityLabel: "Add a place" })
      .props.onPress(),
  );
  expect(onAdd).toHaveBeenCalledOnce();
  await act(async () =>
    root!.update(
      createElement(PlaceSheet, { ...props, title: "To", search: "🐷" }),
    ),
  );
  expect(text()).toBe("To\n🐷\nSavings\nAdd a place");
});

test("Add a place offers the three mapped types, emoji look, and balance today", async () => {
  const value: PlaceDraft = {
    name: "Travel",
    productKind: "bankAccount",
    emoji: "🐷",
    amount: "0",
    date: "2026-10-18",
  };
  const onChange = vi.fn();
  await act(async () => {
    root = create(
      createElement(AccountSetupForm, {
        sheetRef: createRef<BottomSheetModal>(),
        value,
        currency: "COP",
        editable: true,
        busy: false,
        pending: false,
        error: "",
        canSubmit: true,
        onChange,
        onSubmit: vi.fn(),
        onDismiss: vi.fn(),
      }),
    );
  });
  expect(text()).toContain(
    "Add a place\nName you recognize\nType\nChecking\nSavings\nWallet\nLook\n🐷\nChange\nBalance today\nAdd this place",
  );
  const types = root!.root
    .findByProps({ accessibilityLabel: "Place type" })
    .findAllByType("button");
  for (let i = 0; i < types.length; i++) {
    await act(async () => types[i].props.onPress());
  }
  expect(onChange.mock.calls.map(([draft]) => draft.productKind)).toEqual([
    "bankAccount",
    "savingsAccount",
    "cash",
  ]);
  await act(async () =>
    root!.root.findByProps({ accessibilityLabel: "Emoji 🏦" }).props.onPress(),
  );
  expect(onChange).toHaveBeenLastCalledWith({ ...value, emoji: "🏦" });
  expect(
    root!.root
      .findAllByType("input")
      .find((node) => node.props.accessibilityLabel === "Balance today")?.props
      .value,
  ).toBe("0");
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
