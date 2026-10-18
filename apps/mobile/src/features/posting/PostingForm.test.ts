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
import { usePostingEditor, type PostingTransport } from "./usePostingEditor";

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

test.each([false, true])("typing a new expense preserves its sign and grouping, batch=%s", async (saveToBatch) => {
  const post = vi.fn<PostingTransport["post"]>(async () => ({
    description: "",
    amount: { currency: "COP", minorUnits: 1250000 },
  }));
  const transport: PostingTransport = {
    load: async () => ({ kind: "none" }),
    save: async (command) => ({ id: "saved", command }),
    post,
    clear: async () => {},
    abort: async () => {},
    newKey: () => "expense-key",
  };
  const queued: ReturnType<ReturnType<typeof usePostingEditor>["captureForBatch"]>[] = [];
  function Composer() {
    const editor = usePostingEditor({
      workspaceId: "workspace",
      financialAccountProfileId: "wallet",
      currency: "COP",
      timeZone: "America/Bogota",
    }, transport);
    return createElement(PostingForm, {
      ...emptyPostingForm,
      ...handlers,
      amount: editor.amount,
      onAmountChange: editor.setAmount,
      canSubmit: editor.canSubmit,
      saveToBatch,
      onPost: () => {
        if (saveToBatch) queued.push(editor.captureForBatch());
        else void editor.submit();
      },
    });
  }
  await act(async () => { root = create(createElement(Composer)); });
  const input = () => root!.root.findByProps({ accessibilityLabel: "Signed amount" });
  expect(input().props.value).toBe("-0");
  for (const digit of "12500") {
    await act(async () => input().props.onChangeText(`${input().props.value}${digit}`));
  }
  expect(input().props.value).toBe("-12.500");
  await act(async () => input().props.onChangeText("-12abc500"));
  expect(input().props.value).toBe("-12.500");
  await act(async () => root!.root.findByProps({
    accessibilityLabel: saveToBatch ? "Add to batch" : "Post",
    accessibilityRole: "button",
  }).props.onPress());
  const command = saveToBatch ? queued[0]?.command : post.mock.calls[0]?.[0];
  expect(command).toMatchObject({
    kind: "expense",
    payload: { amount: { currency: "COP", minorUnits: 1250000 } },
  });
});

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
    onDismiss: vi.fn(),
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
  await act(async () => root!.root.findByProps({ accessibilityLabel: "Use this", accessibilityRole: "button" }).props.onPress());
  expect(onChange).toHaveBeenLastCalledWith({ ...value, emoji: "🏦" });
  expect(
    root!.root
      .findAllByType("input")
      .find((node) => node.props.accessibilityLabel === "Balance today")?.props
      .value,
  ).toBe("0");
});

test("source note is optional and sits under the header", async () => {
  await act(async () => {
    root = create(createElement(PostingForm, { ...emptyPostingForm, ...handlers }));
  });
  expect(text()).not.toContain("From drafts");
  expect(text()).not.toContain("Draft on this device");
  await act(async () => {
    root?.update(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        sourceNote: "From drafts",
      }),
    );
  });
  expect(text()).toContain("From drafts");
  await act(async () => {
    root?.update(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        sourceNote: "Draft on this device",
      }),
    );
  });
  expect(text()).toContain("Draft on this device");
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
