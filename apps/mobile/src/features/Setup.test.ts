import * as React from "react";
import { createElement, type PropsWithChildren } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import { Setup } from "./Setup";
import { SetupCompletion } from "./setup/Completion";
import {
  starterCategories,
  categoryPalette,
  emojiFrom,
} from "./categories/looks";
import { currencyOptions } from "./setup/currencies";
import { functionalCurrencyCodes } from "../../../../src/accounting/currencies";
import type { SetupSummary } from "./setup/model";

const backend = vi.hoisted(() => ({ ensure: vi.fn() }));
vi.mock("convex/react", () => ({
  useAction: () => backend.ensure,
  useQuery: () => [
    { id: "groceries", name: "Food", nature: "Expense" },
    { id: "transport", name: "Transport", nature: "Expense" },
    { id: "dining", name: "Dining", nature: "Expense" },
  ],
}));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "pressable",
  ScrollView: "scroll",
  TextInput: "input",
  ActivityIndicator: "spinner",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area",
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("@gorhom/bottom-sheet", async () => {
  const { forwardRef, useState, useImperativeHandle, createElement } =
    await import("react");
  return {
    BottomSheetModal: forwardRef(function Modal(
      { children, onDismiss }: PropsWithChildren<{ onDismiss?: () => void }>,
      ref,
    ) {
      const [open, setOpen] = useState(false);
      useImperativeHandle(ref, () => ({
        present: () => setOpen(true),
        dismiss: () => {
          setOpen(false);
          onDismiss?.();
        },
      }));
      return open ? createElement("sheet", { onDismiss, testID: "native-sheet" }, children) : null;
    }),
    BottomSheetScrollView: forwardRef(function Scroll(
      { children, ...props }: PropsWithChildren,
      ref,
    ) {
      useImperativeHandle(ref, () => ({ scrollToEnd: () => {} }));
      return createElement("scroll", props, children);
    }),
    BottomSheetTextInput: "input",
    BottomSheetBackdrop: "backdrop",
  };
});
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  backend.ensure
    .mockReset()
    .mockResolvedValue({ firstCategoryId: "saved-food" });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function nodes(label: string) {
  return (
    root?.root.findAll(
      (node) =>
        typeof node.type === "string" &&
        node.props.accessibilityLabel === label,
    ) ?? []
  );
}
function node(label: string): ReactTestInstance {
  const found = nodes(label)[0];
  if (!found) throw new Error(`Missing control: ${label}`);
  return found;
}
async function press(label: string) {
  await act(async () => {
    const control = node(label);
    if (!control.props.disabled) control.props.onPress();
  });
}
async function type(label: string, value: string) {
  await act(async () => node(label).props.onChangeText(value));
}
function text() {
  return (
    root?.root
      .findAllByType("text")
      .map((node) => node.children.join(""))
      .join("\n") ?? ""
  );
}
async function open() {
  const complete = vi.fn();
  const cancel = vi.fn();
  await act(async () => {
    root = create(
      createElement(Setup, { onComplete: complete, onCancel: cancel }),
    );
  });
  return { complete, cancel };
}
async function reveal() {
  await press("Food");
  await press("COP");
  await press("Not now, You add drafts yourself");
}

test("only categories open; choices reveal currency, alerts, then empty amount and never retract", async () => {
  await open();
  expect(text()).toContain("Where does your money go?");
  expect(nodes("COP")).toHaveLength(0);
  expect(nodes("Starting amount")).toHaveLength(0);
  await press("Food");
  expect(node("COP").props.accessibilityState.checked).toBe(false);
  expect(nodes("Use them, Alerts become drafts you confirm")).toHaveLength(0);
  expect(
    nodes(`Timezone, ${Intl.DateTimeFormat().resolvedOptions().timeZone}`),
  ).toHaveLength(1);
  await press("COP");
  expect(nodes("Starting amount")).toHaveLength(0);
  await press("Not now, You add drafts yourself");
  expect(node("Starting amount").props).toMatchObject({
    value: "",
    placeholder: "0",
    keyboardType: "decimal-pad",
  });
  expect(text()).toContain("COP 0. Bank plus the cash in your pocket.");
  await press("Food");
  expect(nodes("Starting amount")).toHaveLength(1);
  expect(node("Start tracking").props.disabled).toBe(true);
  expect(text()).toContain("Pick at least one category to start");
  await press("Start tracking");
  expect(backend.ensure).not.toHaveBeenCalled();
});

test("long press restyles without selecting; dismissal discards changes; creation validates and caps the board at twelve", async () => {
  await open();
  await act(async () => node("Food").props.onLongPress());
  expect(nodes("Category name")).toHaveLength(0);
  await press("Emoji 🍔");
  await act(async () =>
    root?.root.findAll((node) => node.props.testID === "native-sheet").at(-1)?.props.onDismiss(),
  );
  // The native sheet reports dismissal after it leaves the screen.
  expect(node("Food").findAllByType("text")[0].children).toEqual(["🛒"]);
  await act(async () => node("Food").props.onLongPress());
  await press("Emoji 🍔");
  await press("Color h30");
  await press("Done");
  expect(node("Food").props.accessibilityState.checked).toBe(false);
  await press("Food");
  expect(node("Food").props.style[1]).toMatchObject({
    borderColor: "#8c5721",
    backgroundColor: "#8c572124",
    borderWidth: 2,
  });
  for (const category of starterCategories.slice(1)) await press(category.name);
  await press("Add your own category");
  expect(node("Add category").props.disabled).toBe(true);
  await type("Category name", "Food");
  expect(node("Add category").props.disabled).toBe(true);
  await type("Category name", "Weekend");
  await press("Add category");
  await press("Add your own category");
  await type("Category name", "Travel");
  await press("Add category");
  expect(text()).toContain("12 of 12");
  await press("Add your own category");
  await type("Category name", "Thirteenth");
  expect(node("Add category").props.disabled).toBe(true);
  await press("Add category");
  expect(nodes("Thirteenth")).toHaveLength(0);
  await act(async () =>
    root?.root.findAll((node) => node.props.testID === "native-sheet").at(-1)?.props.onDismiss(),
  );
  await press("Food");
  await press("Food");
  expect(text()).toContain("12 of 12");
});

test("More searches all supported currencies by code and name, marks selection, and has empty results copy", async () => {
  await open();
  await press("Food");
  await press("More currencies");
  expect(new Set(currencyOptions.map(({ code }) => code))).toEqual(
    functionalCurrencyCodes,
  );
  await type("Search currencies", "Canadian");
  await press("CAD, Canadian Dollar");
  expect(text()).toContain("Canadian Dollar");
  expect(nodes("Use them, Alerts become drafts you confirm")).toHaveLength(1);
  await press("More currencies");
  await type("Search currencies", "CAD");
  expect(node("CAD, Canadian Dollar").props.accessibilityState.checked).toBe(
    true,
  );
  await type("Search currencies", "zzzz");
  expect(text()).toContain('Nothing matches "zzzz".');
});

test("timezone search changes the row without revealing alerts or gating currency", async () => {
  await open();
  await press("Food");
  await press(`Timezone, ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  await type("Search timezones", "Bogota");
  await press("America/Bogota, Bogotá");
  expect(nodes("Timezone, America/Bogota")).toHaveLength(1);
  expect(nodes("Use them, Alerts become drafts you confirm")).toHaveLength(0);
  await press("USD");
  expect(nodes("Use them, Alerts become drafts you confirm")).toHaveLength(1);
});

test("Start tracking saves real setup answers once, with empty meaning zero and consent only", async () => {
  const { complete } = await open();
  await reveal();
  await press("I already know my spending. I want budgets.");
  await press("Start tracking");
  expect(backend.ensure).toHaveBeenCalledExactlyOnceWith({
    functionalCurrency: "COP",
    startingMinorUnits: 0,
    categories: [
      {
        kind: "preset",
        presetId: "groceries",
        style: { emoji: "🛒", tone: "primary", color: "h150" },
      },
    ],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    purchaseAlertsConsent: false,
    wantsBudgets: true,
  });
  expect(complete).toHaveBeenCalledWith({
    currency: "COP",
    startingMinorUnits: 0,
    purchaseAlertsConsent: false,
    wantsBudgets: true,
    firstCategoryId: "saved-food",
    categories: [{ ...starterCategories[0], source: "starter" }],
  });
});

test("comma cents parse exactly, malformed amounts stay editable, and a thrown ensure unlocks an identical retry", async () => {
  const { complete } = await open();
  await reveal();
  await type("Starting amount", "1,234");
  await press("Start tracking");
  expect(backend.ensure).not.toHaveBeenCalled();
  expect(node("Starting amount").props.editable).toBe(true);
  await type("Starting amount", "1.500,25");
  backend.ensure.mockRejectedValueOnce(new Error("lost acknowledgement"));
  await press("Start tracking");
  expect(node("Starting amount").props.editable).toBe(true);
  expect(node("Cancel setup").props.disabled).toBe(false);
  expect(node("Start tracking").props.disabled).toBe(false);
  expect(text()).toContain("Retry with the same answers.");
  await type("Starting amount", "invalid edit");
  await press("Food");
  await press("Start tracking");
  expect(
    backend.ensure.mock.calls.map(([payload]) => payload.startingMinorUnits),
  ).toEqual([150025, 150025]);
  expect(backend.ensure.mock.calls[1][0]).toEqual(backend.ensure.mock.calls[0][0]);
  expect(complete).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({
    startingMinorUnits: 150025,
    categories: [{ ...starterCategories[0], source: "starter" }],
  }));
});

test("setup_conflict drops the saved request and allows edited answers to be submitted", async () => {
  const { complete } = await open();
  await reveal();
  backend.ensure.mockRejectedValueOnce(new ConvexError({ code: "setup_conflict" }));
  await press("Start tracking");

  expect(node("Cancel setup").props.disabled).toBe(false);
  expect(node("Starting amount").props.editable).toBe(true);
  expect(node("Start tracking").props.disabled).toBe(false);
  expect(text()).toContain("Setup was already saved with different answers.");
  await type("Starting amount", "25");
  await press("USD");
  await press("Start tracking");

  expect(backend.ensure.mock.calls.map(([payload]) => ({
    currency: payload.functionalCurrency,
    amount: payload.startingMinorUnits,
  }))).toEqual([
    { currency: "COP", amount: 0 },
    { currency: "USD", amount: 2500 },
  ]);
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({
    currency: "USD",
    startingMinorUnits: 2500,
  }));
});

test.each([
  { failure: "setup_conflict", error: new ConvexError({ code: "setup_conflict" }) },
  { failure: "thrown ensure", error: new Error("lost acknowledgement") },
])("$failure leaves Cancel enabled and dismissal calls onCancel", async ({ error }) => {
  const { cancel, complete } = await open();
  await reveal();
  backend.ensure.mockRejectedValueOnce(error);
  await press("Start tracking");
  expect(node("Cancel setup").props.disabled).toBe(false);
  await press("Cancel setup");
  expect(cancel).toHaveBeenCalledOnce();
  expect(complete).not.toHaveBeenCalled();
  expect(nodes("Start tracking")).toHaveLength(0);
});

test("Cancel setup and pan dismissal leave without saving", async () => {
  const { cancel } = await open();
  await reveal();
  await press("Cancel setup");
  expect(cancel).toHaveBeenCalledOnce();
  expect(backend.ensure).not.toHaveBeenCalled();
  const second = await open();
  await act(async () => root?.root.findAll((node) => node.props.testID === "native-sheet")[0].props.onDismiss());
  expect(second.cancel).toHaveBeenCalledOnce();
  expect(backend.ensure).not.toHaveBeenCalled();
});

test("completion shows six look chips and exact summary, then goes home", async () => {
  const home = vi.fn();
  const summary: SetupSummary = {
    categories: starterCategories
      .slice(0, 7)
      .map((category) => ({ ...category, source: "starter" })),
    currency: "COP",
    startingMinorUnits: 150025,
    purchaseAlertsConsent: true,
    wantsBudgets: true,
    firstCategoryId: "food",
  };
  await act(async () => {
    root = create(createElement(SetupCompletion, { summary, onHome: home }));
  });
  expect(text()).toContain("You're set");
  expect(text()).toContain("Purchase alerts can become drafts.");
  expect(text()).toContain("Budgets stay one door away.");
  expect(text()).not.toContain("Shopping");
  expect(
    root?.root
      .findAllByType("text")
      .flatMap((node) => node.children)
      .join(""),
  ).toContain(
    "Colombian Peso, starting from COP 1.500,25. Tracking Food, Transport, Dining and 4 more.",
  );
  await press("Go to home");
  expect(home).toHaveBeenCalledOnce();
});

test("palette has 28 unique swatches and arbitrary emoji keeps one grapheme", () => {
  expect(new Set(categoryPalette.map(({ id }) => id)).size).toBe(28);
  expect(emojiFrom("hello")).toBeNull();
  expect(emojiFrom("👨‍👩‍👧‍👦🎉")).toBe("👨‍👩‍👧‍👦");
});
