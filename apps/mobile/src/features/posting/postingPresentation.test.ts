import * as React from "react";
import { createElement, useState, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PostingForm, postingDateOptions, type EntryType } from "./PostingForm";
import { BatchNativeStack, batchSharedPlace } from "./BatchNativeStack";
import type { QueuedPosting, usePostingBatch } from "./usePostingBatch";
import { emptyPostingForm } from "./PostingForm.fixtures";
import { ScrollView } from "react-native";
import { ThemeProvider } from "../../ui/themeContext";
import { readableLayout } from "../../ui/layout";

const dimensions = vi.hoisted(() => ({ width: 320, height: 640, scale: 1, fontScale: 1.5 }));

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area",
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "modal",
  BottomSheetTextInput: "input",
  BottomSheetScrollView: "sheet-scroll",
  BottomSheetFooter: "footer",
  BottomSheetBackdrop: "backdrop",
}));
vi.mock("react-native-screens", () => ({
  ScreenStack: "stack",
  ScreenStackItem: "stack-item",
  ScreenStackHeaderLeftView: "left",
  ScreenStackHeaderRightView: "right",
}));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  TextInput: "input",
  useWindowDimensions: () => dimensions,
  ActivityIndicator: "spinner",
  KeyboardAvoidingView: "keyboard",
  Platform: { OS: "ios" },
  Keyboard: { dismiss: vi.fn() },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  StyleSheet: {
    create: (value: unknown) => value,
    flatten: flat,
    hairlineWidth: 1,
    absoluteFill: {},
  },
}));

test.each([
  [
    "America/Bogota",
    "2026-11-01T03:30:00Z",
    [
      { value: "2026-10-31", label: "Today · October 31" },
      { value: "2026-10-30", label: "Yesterday · October 30" },
    ],
  ],
  [
    "Pacific/Auckland",
    "2026-10-31T12:30:00Z",
    [
      { value: "2026-11-01", label: "Today · November 1" },
      { value: "2026-10-31", label: "Yesterday · October 31" },
    ],
  ],
  [
    "America/Bogota",
    "2027-01-01T17:00:00Z",
    [
      { value: "2027-01-01", label: "Today · January 1" },
      { value: "2026-12-31", label: "Yesterday · December 31" },
    ],
  ],
  [
    "America/Bogota",
    "2028-03-01T17:00:00Z",
    [
      { value: "2028-03-01", label: "Today · March 1" },
      { value: "2028-02-29", label: "Yesterday · February 29" },
    ],
  ],
  [
    "America/New_York",
    "2026-03-09T04:30:00Z",
    [
      { value: "2026-03-09", label: "Today · March 9" },
      { value: "2026-03-08", label: "Yesterday · March 8" },
    ],
  ],
])("date shortcuts use civil days in %s at %s", (zone, instant, expected) => {
  expect(postingDateOptions(zone, new Date(instant))).toEqual(expected);
});

function expense(id: string, place = "wallet") {
  return {
    id,
    command: {
      kind: "expense",
      payload: {
        workspaceId: "workspace",
        financialAccountProfileId: place,
        accountingDate: "2026-10-26",
        description: id,
        amount: { currency: "COP", minorUnits: 1000 },
        idempotencyKey: id,
      },
    },
  } satisfies QueuedPosting;
}
const rowFor = () => ({
  place: "Wallet",
  category: "Food",
  emoji: "🍜",
  color: "#6d28d9",
});

test("only a nonempty batch with one source identity has a shared place heading", () => {
  expect(batchSharedPlace([], rowFor)).toBeUndefined();
  expect(batchSharedPlace([expense("one")], rowFor)).toBe("Wallet");
  expect(batchSharedPlace([expense("one"), expense("two")], rowFor)).toBe(
    "Wallet",
  );
  expect(
    batchSharedPlace([expense("one"), expense("two", "other")], rowFor),
  ).toBeUndefined();
});

test("a transfer shares its From place, and same-named distinct places stay separate", () => {
  const transfer: QueuedPosting = {
    id: "transfer",
    command: {
      kind: "transfer",
      payload: {
        workspaceId: "workspace",
        sourceFinancialAccountProfileId: "wallet",
        destinationFinancialAccountProfileId: "savings",
        accountingDate: "2026-10-26",
        description: "Move",
        amount: { currency: "COP", minorUnits: 1000 },
        idempotencyKey: "transfer",
      },
    },
  };
  expect(batchSharedPlace([expense("one"), transfer], rowFor)).toBe("Wallet");
  expect(
    batchSharedPlace([expense("one", "savings"), transfer], rowFor),
  ).toBeUndefined();
});

function flat(value: unknown): Record<string, unknown> {
  return Array.isArray(value)
    ? Object.assign({}, ...value.map(flat))
    : typeof value === "object" && value !== null
      ? Object.fromEntries(Object.entries(value))
      : {};
}
let mounted: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => mounted?.unmount());
  mounted = undefined;
  vi.unstubAllGlobals();
});
async function show(element: ReactElement, fontScale = 1.5) {
  dimensions.fontScale = fontScale;
  await act(async () => {
    mounted = create(
      createElement(
        ThemeProvider,
        { layout: readableLayout({ width: 320, fontScale }) },
        element,
      ),
    );
  });
  if (!mounted) throw new Error("Missing renderer");
  return mounted.root;
}
const formHandlers = {
  onAmountChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onBack: vi.fn(),
  onPlace: vi.fn(),
  onCategory: vi.fn(),
  onDate: vi.fn(),
  onPost: vi.fn(),
  onDone: vi.fn(),
  onEntryType: vi.fn(),
};

test.each([1.5, 2])(
  "the disabled Post reason stays beside its action at scale %s",
  async (scale) => {
    const screen = await show(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...formHandlers,
        blockedReason: "Add a description before posting.",
      }),
      scale,
    );
    expect(
      screen
        .findByType(ScrollView)
        .findAllByType("text")
        .some(
          (node) =>
            node.children.join("") === "Add a description before posting.",
        ),
    ).toBe(false);
    const reason = screen
      .findAllByType("text")
      .find(
        (node) =>
          node.children.join("") === "Add a description before posting.",
      );
    expect(reason).toBeDefined();
    const post = screen.findByProps({
      accessibilityLabel: "Post",
      accessibilityRole: "button",
    });
    expect(post.props.disabled).toBe(true);
    expect(flat(post.props.style({ pressed: false })).minHeight).toBe(68);
    expect(
      screen.findByProps({ accessibilityLabel: "Description" }).props.multiline,
    ).toBe(true);
  },
);

test("the transfer footer confirms the reviewed places before it can post", async () => {
  const onConfirm = vi.fn();
  const onPost = vi.fn();
  const screen = await show(
    createElement(PostingForm, {
      ...emptyPostingForm,
      ...formHandlers,
      entryType: "transfer",
      onPost,
      transferReview: {
        required: true,
        canConfirm: true,
        onConfirm,
        onSwap: vi.fn(),
      },
    }),
  );
  const scroll = screen.findByType(ScrollView);
  expect(
    scroll
      .findAllByType("button")
      .some((node) => node.props.accessibilityLabel === "Confirm From and To"),
  ).toBe(false);
  await act(async () =>
    screen
      .findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Confirm From and To",
      })
      .props.onPress(),
  );
  expect(onConfirm).toHaveBeenCalledOnce();
  expect(onPost).not.toHaveBeenCalled();
});

test("the Posted moment shows the receipt and category, with Done and Post another", async () => {
  const done = vi.fn();
  const another = vi.fn();
  const screen = await show(
    createElement(PostingForm, {
      ...emptyPostingForm,
      ...formHandlers,
      onDone: done,
      onAnother: another,
      posted: "Taxi · −COP 12.500",
      receipt: {
        description: "Taxi",
        minorUnits: -1250000,
        amount: "12.500",
        category: { name: "Transport", emoji: "🚕", color: "#6d28d9" },
      },
    }),
  );
  const copy = screen
    .findAllByType("text")
    .map((node) => node.children.join(""))
    .join("\n");
  expect(copy).toContain("Posted");
  expect(copy).toContain("Transport");
  expect(copy).toContain("Taxi");
  expect(screen.findAllByType("input")).toHaveLength(0);
  await act(async () =>
    screen
      .findByProps({ accessibilityRole: "button", accessibilityLabel: "Done" })
      .props.onPress(),
  );
  await act(async () =>
    screen
      .findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Post another",
      })
      .props.onPress(),
  );
  expect(done).toHaveBeenCalledOnce();
  expect(another).toHaveBeenCalledOnce();
});

test.each([1, 1.5])("a Candidate's original notification shows above the form at font scale %s", async (scale) => {
  const screen = await show(createElement(PostingForm, {
    ...emptyPostingForm, ...formHandlers, sourceNote: "From a notification",
    notification: createElement("view", { testID: "kept-notification" }),
  }), scale);
  expect(screen.findAllByProps({ testID: "kept-notification" })).toHaveLength(1);
  expect(screen.findAllByType("text").map((node) => node.children.join(""))).not.toContain("From a notification");
});

test("a failed post retains frozen answers and the retry action", async () => {
  const retry = vi.fn();
  const screen = await show(
    createElement(PostingForm, {
      ...emptyPostingForm,
      ...formHandlers,
      amount: "-12.500",
      description: "Taxi",
      pending: true,
      editable: false,
      canSubmit: true,
      error: "Offline",
      onPost: retry,
    }),
  );
  const copy = screen
    .findAllByType("text")
    .map((node) => node.children.join(""))
    .join("\n");
  expect(copy).toContain("Couldn't post yet");
  expect(copy).toContain(
    "It's saved for retry. These answers stay fixed until it posts.",
  );
  expect(
    screen.findByProps({ accessibilityLabel: "Signed amount" }).props,
  ).toMatchObject({ value: "-12.500", editable: false });
  expect(
    screen.findByProps({ accessibilityLabel: "Description" }).props,
  ).toMatchObject({ value: "Taxi", editable: false });
  await act(async () =>
    screen
      .findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Retry posting",
      })
      .props.onPress(),
  );
  expect(retry).toHaveBeenCalledOnce();
});

test.each([1, 1.5, 2.1])("a debt-cap rejection is an inline alert with editable facts at font scale %s", async (scale) => {
  const message = "This payment exceeds the total debt still owed. Reduce the amount and try again.";
  const screen = await show(createElement(PostingForm, {
    ...emptyPostingForm, ...formHandlers, entryType: "transfer", amount: "-450.000,00",
    description: "Pay card", place: "Bank", destination: "Card",
    error: message, editable: true, canSubmit: true,
  }), scale);
  const alerts = screen.findAllByProps({ accessibilityRole: "alert" });
  expect(alerts.some((alert) => alert.findAllByType("text")
    .some((node) => node.children.join("").includes(message)) || alert.children.join("").includes(message))).toBe(true);
  expect(screen.findByProps({ accessibilityLabel: "Signed amount" }).props.value).toBe("-450.000,00");
  expect(screen.findByProps({ accessibilityLabel: "Signed amount" }).props.editable).toBe(true);
});

test("the batch keeps full descriptions accessible while its actions stay outside the scroller", async () => {
  const description =
    "A description long enough to take more than two lines at the largest system text size on a narrow phone";
  const first = expense("one");
  first.command.payload.description = description;
  const queue = [first, expense("two"), expense("three")];
  const remove = vi.fn();
  const postAll = vi.fn();
  const onEdit = vi.fn();
  const onAdd = vi.fn();
  const batch = {
    queue,
    busy: false,
    editable: true,
    error: "",
    posted: null,
    keep: vi.fn(),
    remove,
    postAll,
  } satisfies ReturnType<typeof usePostingBatch>;
  const screen = await show(
    createElement(BatchNativeStack, {
      batch,
      currency: "COP",
      composing: false,
      compose: null,
      onCancel: vi.fn(),
      onAdd,
      onEdit,
      onBack: vi.fn(),
      onOne: vi.fn(),
      rowFor,
    }),
  );
  const row = screen.findByProps({
    accessibilityRole: "button",
    accessibilityLabel: `Food, −$10, ${description}`,
  });
  const descriptionText = row
    .findAllByType("text")
    .find((node) => node.children.join("") === description);
  expect(descriptionText?.props.numberOfLines).toBe(2);
  const removeButton = screen.findByProps({
    accessibilityRole: "button",
    accessibilityLabel: `Remove ${description}`,
  });
  expect(flat(removeButton.props.style({ pressed: false }))).toMatchObject({ width: 56, height: 56 });
  const stopPropagation = vi.fn();
  await act(async () => removeButton.props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith("one");
  expect(onEdit).not.toHaveBeenCalled();
  expect(
    screen
      .findByType(ScrollView)
      .findAllByType("button")
      .some((node) => node.props.accessibilityLabel === "Post 3"),
  ).toBe(false);
  await act(async () =>
    screen
      .findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Post 3",
      })
      .props.onPress(),
  );
  await act(async () =>
    screen
      .findByProps({
        accessibilityRole: "button",
        accessibilityLabel: "Add one",
      })
      .props.onPress(),
  );
  expect(postAll).toHaveBeenCalledOnce();
  expect(onAdd).toHaveBeenCalledOnce();
});

function HalfTypedEntry({ scale }: { scale: number }) {
  const [amount, setAmount] = useState("-");
  const [description, setDescription] = useState("");
  const [entryType, setEntryType] = useState<EntryType>("normal");
  return createElement(
    ThemeProvider,
    { layout: readableLayout({ width: 320, fontScale: scale }) },
    createElement(PostingForm, {
      ...emptyPostingForm,
      ...formHandlers,
      amount,
      description,
      entryType,
      onAmountChange: setAmount,
      onDescriptionChange: setDescription,
      onEntryType: setEntryType,
    }),
  );
}

test("changing tiers mid-entry preserves amount, description, selected type and focus intent", async () => {
  await act(async () => {
    mounted = create(createElement(HalfTypedEntry, { scale: 1 }));
  });
  const screen = () => {
    if (!mounted) throw new Error("Missing entry");
    return mounted.root;
  };
  await act(async () =>
    screen()
      .findByProps({ accessibilityLabel: "Signed amount" })
      .props.onChangeText("-1234"),
  );
  await act(async () =>
    screen()
      .findByProps({ accessibilityLabel: "Description" })
      .props.onChangeText("Taxi, still typing"),
  );
  await act(async () =>
    screen().findByProps({ accessibilityLabel: "Description" }).props.onFocus(),
  );
  await act(async () =>
    screen()
      .findAllByType("button")
      .find(
        (node) =>
          node.props.accessibilityRole === "radio" &&
          node
            .findAllByType("text")
            .some((text) => text.children.join("") === "Transfer"),
      )
      ?.props.onPress(),
  );
  for (const scale of [1.5, 2, 1]) {
    await act(async () =>
      mounted?.update(createElement(HalfTypedEntry, { scale })),
    );
    expect(
      screen().findByProps({ accessibilityLabel: "Signed amount" }).props.value,
    ).toBe("-1.234");
    expect(
      screen().findByProps({ accessibilityLabel: "Description" }).props,
    ).toMatchObject({ value: "Taxi, still typing", autoFocus: true });
    const transfer = screen()
      .findAllByType("button")
      .find(
        (node) =>
          node.props.accessibilityRole === "radio" &&
          node
            .findAllByType("text")
            .some((text) => text.children.join("") === "Transfer"),
      );
    expect(transfer?.props.accessibilityState.checked).toBe(true);
  }
});
