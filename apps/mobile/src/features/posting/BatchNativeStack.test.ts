import * as React from "react";
import { createElement } from "react";
import { ScrollView } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BatchNativeStack, batchRowFor } from "./BatchNativeStack";
import { PostingForm } from "./PostingForm";
import { emptyPostingForm } from "./PostingForm.fixtures";
import type { usePostingBatch } from "./usePostingBatch";

const platform = vi.hoisted(() => ({ OS: "ios" }));
const backHandler = vi.hoisted(() => ({
  addEventListener: vi.fn((_name: string, _callback: () => boolean) => ({
    remove: vi.fn(),
  })),
}));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  TextInput: "input",
  ActivityIndicator: "spinner",
  Platform: platform,
  BackHandler: backHandler,
  StyleSheet: {
    create: (value: unknown) => value,
    hairlineWidth: 1,
    absoluteFill: {},
  },
}));
vi.mock("react-native-screens", () => ({
  ScreenStack: "stack",
  ScreenStackItem: (props: {
    children?: React.ReactNode;
    headerConfig?: { children?: React.ReactNode };
  }) =>
    React.createElement(
      "section",
      props,
      props.headerConfig?.children,
      props.children,
    ),
  ScreenStackHeaderLeftView: "header-left",
  ScreenStackHeaderRightView: "header-right",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area",
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  platform.OS = "ios";
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function batch(): ReturnType<typeof usePostingBatch> {
  return {
    queue: [],
    busy: false,
    editable: true,
    error: "",
    posted: null,
    keep: vi.fn(),
    remove: vi.fn(),
    postAll: vi.fn(),
  };
}
const props = {
  currency: "COP",
  composing: false,
  compose: null,
  onCancel: vi.fn(),
  onAdd: vi.fn(),
  onEdit: vi.fn(),
  onBack: vi.fn(),
  onOne: vi.fn(),
  rowFor: () => ({
    category: "Food",
    place: "Wallet",
    emoji: "🍜",
    color: "#6d28d9",
  }),
};
const out = {
  id: "out",
  command: {
    kind: "expense",
    payload: {
      workspaceId: "workspace",
      financialAccountProfileId: "wallet",
      accountingDate: "2026-10-18",
      description: "",
      amount: { currency: "COP", minorUnits: 1000 },
      idempotencyKey: "out",
    },
  },
} as const;
const incoming = {
  id: "in",
  command: {
    kind: "income",
    payload: {
      ...out.command.payload,
      description: "Refund",
      amount: { currency: "COP", minorUnits: 3000 },
      idempotencyKey: "in",
    },
  },
} as const;
function copy() {
  return root!.root
    .findAllByType("text")
    .map((node) => node.children.join(""))
    .join("\n");
}
async function render(
  value: ReturnType<typeof usePostingBatch>,
  extra: Partial<typeof props> = {},
) {
  await act(async () => {
    root = create(
      createElement(BatchNativeStack, { ...props, ...extra, batch: value }),
    );
  });
}

test("empty tape has exact copy, no badge, and Add one without a Post action", async () => {
  await render(batch());
  expect(copy()).toBe(
    "One\nBatch\nAdd the transactions you want to post together. They stay on this device until you post.\nThe batch is empty\nEvery one you add lands here with its amount, so you can check the net before it posts.\nAdd one",
  );
  expect(root!.root.findByType("section").props.headerConfig.title).toBe(
    "Batch",
  );
  expect(
    root!.root.findByProps({ accessibilityLabel: "Leave the batch" }),
  ).toBeDefined();
  expect(copy()).not.toContain("PROTOTYPE STATE");
});

test("rows edit, remove, and show both directions only for a mixed queue", async () => {
  const value = { ...batch(), queue: [out, incoming] };
  await render(value);
  expect(copy()).toContain(
    "2 drafts held on this device. Nothing is posted yet.\n🍜\nUntitled\nFood · Wallet\n−$10",
  );
  expect(copy()).toContain("Out\n−$10\nIn\n+$30\nNET\n+$20");
  await act(async () =>
    root!.root
      .findByProps({ accessibilityLabel: "Edit untitled draft" })
      .props.onPress(),
  );
  expect(props.onEdit).toHaveBeenCalledWith(out);
  const stopPropagation = vi.fn();
  await act(async () =>
    root!.root
      .findByProps({ accessibilityLabel: "Remove untitled draft" })
      .props.onPress({ stopPropagation }),
  );
  expect(stopPropagation).toHaveBeenCalledOnce();
  expect(value.remove).toHaveBeenCalledWith("out");
  await act(async () =>
    root!.update(
      createElement(BatchNativeStack, {
        ...props,
        batch: { ...value, queue: [out] },
      }),
    ),
  );
  expect(copy()).toContain(
    "1 draft held on this device. Nothing is posted yet.",
  );
  expect(copy()).toContain("NET\n−$10");
  expect(copy()).not.toContain("\nOut\n");
  expect(copy()).not.toContain("\nIn\n");
});

test("batch chips use the primary category palette colour and update after a restyle", async () => {
  const item = { ...out, command: { ...out.command, payload: {
    ...out.command.payload,
    userCategoryIds: ["food", "travel"],
    primaryUserCategoryId: "travel",
  } } };
  const categories = [
    { id: "food", name: "Food", style: { emoji: "🍜", tone: "primary", color: "h0" } },
    { id: "travel", name: "Travel", style: { emoji: "🚌", tone: "primary", color: "h120" } },
  ] satisfies NonNullable<Parameters<typeof batchRowFor>[0]["categories"]>;
  const rowFor = () => batchRowFor({ item, categories, profiles: [{ id: "wallet", name: "Wallet" }] });
  await render({ ...batch(), queue: [item] }, { rowFor });
  const chip = () => root!.root.findAllByType("text").find((node) => node.children.join("") === "🚌")!.parent!;
  expect(chip().props.style).toContainEqual({ backgroundColor: "#218c2122" });
  expect(copy()).toContain("Food · Travel · Wallet");
  categories[1].style.color = "h240";
  await act(async () => root!.update(createElement(BatchNativeStack, {
    ...props, rowFor, batch: { ...batch(), queue: [item] },
  })));
  expect(chip().props.style).toContainEqual({ backgroundColor: "#21218c22" });
});

test("the header Post appears only after the full-width action scrolls out of view", async () => {
  await render({ ...batch(), queue: [out] });
  const screens = () =>
    root!.root
      .findAllByType("button")
      .filter((node) => node.props.accessibilityLabel === "Post 1");
  expect(screens()).toHaveLength(1);
  const measured = root!.root
    .findAllByType("view")
    .find((node) => node.props.onLayout);
  await act(async () =>
    measured!.props.onLayout({
      nativeEvent: { layout: { y: 900, height: 50 } },
    }),
  );
  const scroll = (y: number) =>
    root!.root.findByType(ScrollView).props.onScroll({
      nativeEvent: {
        contentOffset: { y },
        layoutMeasurement: { height: 500 },
      },
    });
  await act(async () => scroll(100));
  expect(screens()).toHaveLength(2);
  await act(async () => scroll(500));
  expect(screens()).toHaveLength(1);
});

test("native modal slides from bottom and dismissal cancels; Android back also cancels", async () => {
  platform.OS = "android";
  await render({ ...batch(), queue: [out] }, { composing: true });
  const modal = root!.root.findByProps({ screenId: "batch-compose" });
  expect(modal.props.stackPresentation).toBe("modal");
  expect(modal.props.stackAnimation).toBe("slide_from_bottom");
  expect(modal.props.gestureEnabled).toBe(true);
  await act(async () => modal.props.onDismissed());
  expect(props.onCancel).toHaveBeenCalledOnce();
  const callback = backHandler.addEventListener.mock.calls[0]?.[1];
  expect(callback).toBeDefined();
  expect(callback?.()).toBe(true);
  expect(props.onCancel).toHaveBeenCalledTimes(2);
});

test("batch receipt reports count and net and Done leaves", async () => {
  await render({ ...batch(), posted: { count: 2, net: 2000 } });
  expect(copy()).toContain("Posted 2\nNet +$20 · this month\nDone");
  await act(async () =>
    root!.root
      .findByProps({ accessibilityLabel: "Done", accessibilityRole: "button" })
      .props.onPress(),
  );
  expect(props.onBack).toHaveBeenCalledOnce();
});

test("One shows the waiting count and the modal saves to batch without a posted banner", async () => {
  const handlers = {
    onAmountChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onBack: vi.fn(),
    onPlace: vi.fn(),
    onCategory: vi.fn(),
    onDate: vi.fn(),
    onPost: vi.fn(),
    onDone: vi.fn(),
    onBatch: vi.fn(),
  };
  await act(async () => {
    root = create(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        batchCount: 3,
      }),
    );
  });
  expect(
    root!.root.findByProps({ accessibilityLabel: "Batch, 3 waiting" }),
  ).toBeDefined();
  await act(async () =>
    root!.root
      .findByProps({ accessibilityLabel: "Batch, 3 waiting" })
      .props.onPress(),
  );
  expect(handlers.onBatch).toHaveBeenCalledOnce();
  await act(async () =>
    root!.update(
      createElement(PostingForm, {
        ...emptyPostingForm,
        ...handlers,
        saveToBatch: true,
        posted: null,
        canSubmit: true,
      }),
    ),
  );
  expect(copy()).toContain("Add to batch");
  expect(copy()).not.toContain("Posted");
  expect(
    root!.root.findAllByProps({ accessibilityRole: "tablist" }),
  ).toHaveLength(0);
});
