import * as React from "react";
import { createElement, type PropsWithChildren } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { NatureAnswer } from "./categories/model";
import { ConvexError } from "convex/values";
import { Setup } from "./Setup";
import { SetupCategories } from "./categories/SetupCategories";
import { SetupCompletion } from "./setup/Completion";
import {
  starterCategories,
  categoryPalette,
  emojiFrom,
} from "./categories/looks";
import { currencyOptions } from "./setup/currencies";
import { functionalCurrencyCodes } from "../../../../src/accounting/currencies";
import type { SetupSummary } from "./setup/model";

const backend = vi.hoisted(() => ({ ensure: vi.fn(), place: vi.fn(), save: vi.fn(), clear: vi.fn(), key: 0, suggestions: {} as Record<string, NatureAnswer | null> }));
vi.mock("./posting/usePostingTransport", () => {
  const transport = {
    load: async () => ({ kind: "none" }),
    save: backend.save, post: backend.place, clear: backend.clear,
    abort: async () => {}, newKey: () => `setup-${++backend.key}`,
  };
  return { usePostingTransport: () => transport };
});
vi.mock("convex/react", () => ({
  useAction: () => backend.ensure,
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: { name?: string } | "skip") => {
    if (getFunctionName(reference).endsWith(":suggestCategoryNature"))
      return args === "skip" ? undefined : { suggested: backend.suggestions[args.name ?? ""] ?? null };
    return [
      { id: "groceries", name: "Food", nature: "Expense" },
      { id: "transport", name: "Transport", nature: "Expense" },
      { id: "dining", name: "Dining", nature: "Expense" },
    ];
  },
}));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  BackHandler: { addEventListener: () => ({ remove() {} }) },
  Platform: { OS: "ios" },
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
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
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
    .mockResolvedValue({ firstCategoryId: "saved-food", workspace: { id: "workspace", timeZone: "America/Bogota" }, financialAccountProfile: { id: "money" } });
  backend.key = 0;
  backend.suggestions = {};
  backend.save.mockReset().mockImplementation(async (command) => ({ id: "saved-place", command }));
  backend.place.mockReset().mockResolvedValue({ description: "New place", amount: { currency: "COP", minorUnits: 0 }, financialAccountProfileId: "new-place" });
  backend.clear.mockReset().mockResolvedValue(undefined);
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
      createElement(Setup, { subject: "owner", onComplete: complete, onCancel: cancel }),
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

test("setup shows twelve suggestions and allows more custom categories while validating names and restyling", async () => {
  await open();
  expect(starterCategories).toHaveLength(12);
  expect(root?.root.findAll((node) => typeof node.type === "string" && node.props.accessibilityRole === "checkbox")).toHaveLength(12);
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
  expect(text()).toContain("12 selected");
  await press("Add your own category");
  expect(node("Add category").props.disabled).toBe(true);
  await type("Category name", "Food");
  expect(node("Add category").props.disabled).toBe(true);
  await type("Category name", "Weekend");
  await press("I spend it");
  expect(node("Add category").props.disabled).toBeFalsy();
  await press("Add category");
  expect(node("Weekend").props.accessibilityState.checked).toBe(true);
  expect(text()).toContain("13 selected");
  await press("Add your own category");
  await type("Category name", "Travel");
  await press("I spend it");
  await press("Add category");
  expect(text()).toContain("14 selected");
  await press("Add your own category");
  await type("Category name", "Another");
  await press("I spend it");
  expect(node("Add category").props.disabled).toBeFalsy();
  await press("Add category");
  expect(node("Another").props.accessibilityState.checked).toBe(true);
  await press("Food");
  await press("Food");
  expect(text()).toContain("15 selected");
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

test("comma cents parse exactly, malformed amounts stay editable, and an uncertain ensure locks an identical retry", async () => {
  const { complete } = await open();
  await reveal();
  await type("Starting amount", "1,234");
  await press("Start tracking");
  expect(backend.ensure).not.toHaveBeenCalled();
  expect(node("Starting amount").props.editable).toBe(true);
  await type("Starting amount", "1.500,25");
  backend.ensure.mockRejectedValueOnce(new Error("lost acknowledgement"));
  await press("Start tracking");
  expect(node("Starting amount").props.editable).toBe(false);
  expect(node("Cancel setup").props.disabled).toBe(true);
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

test("setup_conflict leaves Cancel enabled and dismissal calls onCancel", async () => {
  const { cancel, complete } = await open();
  await reveal();
  backend.ensure.mockRejectedValueOnce(new ConvexError({ code: "setup_conflict" }));
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


test("the actual custom setup editor blocks unknown names, resets answers and preserves receive in defaults", async () => {
  await open();
  await press("Add your own category");
  await type("Category name", "Arriendo especial");
  expect(node("Add category").props.disabled).toBe(true);
  await press("I receive it");
  await type("Category name", "Another income");
  expect(node("Add category").props.disabled).toBe(true);
  await press("I receive it");
  await press("Add category");
  await press("COP");
  await press("Not now, You add drafts yourself");
  await press("Start tracking");
  expect(backend.ensure.mock.calls[0][0].categories).toEqual([
    { kind: "custom", name: "Another income", answer: "receive", style: expect.any(Object) },
  ]);
});


async function deferPlace(answer = "It is still mine", name = "Reserve") {
  await press("Add your own category");
  await type("Category name", name);
  await press(answer);
  await press("Add category");
}

test("deferred accounts never enter categories; defaults succeed first and account retry never repeats them", async () => {
  const { complete } = await open();
  await deferPlace("I pay a debt", "My loan");
  expect(nodes("COP")).toHaveLength(0);
  expect(backend.ensure).not.toHaveBeenCalled();
  expect(backend.place).not.toHaveBeenCalled();
  await reveal();
  backend.ensure.mockRejectedValueOnce(new Error("no reply"));
  await press("Start tracking");
  expect(backend.place).not.toHaveBeenCalled();
  await press("Start tracking");
  expect(text()).toContain("Basic setup has been saved");
  expect(backend.ensure.mock.calls[1][0].categories).toEqual([
    { kind: "preset", presetId: "groceries", style: starterCategories[0].style },
  ]);
  expect(nodes("My loan")).toHaveLength(0);
  expect(node("Add this place").props.disabled).toBe(true);
  expect(node("How much do you still owe?").props.value).toBe("0");
  await press("Loan");
  await type("How much do you still owe?", "42");
  backend.place.mockRejectedValueOnce(new Error("lost place reply"));
  await press("Add this place");
  expect(nodes("Add later")).toHaveLength(0);
  expect(node("Account name").props.editable).toBe(false);
  await press("Retry setup");
  expect(backend.ensure).toHaveBeenCalledTimes(2);
  expect(backend.place).toHaveBeenCalledTimes(2);
  expect(backend.place.mock.calls[1][0]).toEqual(backend.place.mock.calls[0][0]);
  expect(backend.place.mock.calls[0][0]).toMatchObject({ kind: "setup", payload: {
    workspaceId: "workspace", name: "My loan", productKind: "loan", amount: { currency: "COP", minorUnits: 4200 }, idempotencyKey: "setup-1",
  } });
  expect(backend.ensure.mock.invocationCallOrder[1]).toBeLessThan(backend.place.mock.invocationCallOrder[0]);
  expect(complete).toHaveBeenCalledOnce();
});

test("Add later explicitly skips only the unsubmitted deferred place after defaults", async () => {
  const { complete } = await open();
  await deferPlace();
  await reveal();
  await press("Start tracking");
  expect(complete).not.toHaveBeenCalled();
  await press("Add later");
  expect(backend.ensure).toHaveBeenCalledOnce();
  expect(backend.place).not.toHaveBeenCalled();
  expect(backend.save).not.toHaveBeenCalled();
  expect(complete).toHaveBeenCalledOnce();
});


test("setup shows an overridable name suggestion and keeps the confirmed flow answer", async () => {
  backend.suggestions.savings = "stillMine";
  await open();
  await press("Add your own category");
  await type("Category name", "Savings");
  expect(text()).toContain("Suggested from the name. You can change it.");
  expect(node("It is still mine").props.accessibilityState.checked).toBe(true);
  await press("I receive it");
  await press("Add category");
  await press("COP");
  await press("Not now, You add drafts yourself");
  await press("Start tracking");
  expect(backend.ensure.mock.calls[0][0].categories[0]).toMatchObject({ kind: "custom", name: "Savings", answer: "receive" });
  expect(backend.place).not.toHaveBeenCalled();
});

test("a deferred place uses the selected non-COP workspace currency without substituting it", async () => {
  await open();
  await deferPlace();
  await press("Food");
  await press("More currencies");
  await type("Search currencies", "CAD");
  await press("CAD, Canadian Dollar");
  await press("Not now, You add drafts yourself");
  await press("Start tracking");
  await type("Balance today", "12,34");
  await press("Add this place");
  expect(backend.ensure.mock.calls[0][0].functionalCurrency).toBe("CAD");
  expect(backend.place.mock.calls[0][0].payload.amount).toEqual({ currency: "CAD", minorUnits: 1234 });
});


test("uncertain defaults keep account queue, categories and currency read-only through dismissal and retry", async () => {
  const { complete, cancel } = await open();
  await deferPlace("It is still mine", "Reserve A");
  await reveal();
  await type("Starting amount", "12");
  backend.ensure.mockRejectedValueOnce(new Error("no acknowledgement"));
  await press("Start tracking");
  expect(node("Food").props.disabled).toBe(true);
  expect(node("Add your own category").props.disabled).toBe(true);
  expect(node("USD").props.disabled).toBe(true);
  expect(node("Starting amount").props.editable).toBe(false);
  expect(node("Cancel setup").props.disabled).toBe(true);
  expect(node("Start tracking").props.disabled).toBe(false);
  expect(text()).toContain("Your submitted answers are read-only until setup is confirmed.");
  await press("Add your own category");
  expect(nodes("Category name")).toHaveLength(0);
  await act(async () => {
    root?.root.findByType(SetupCategories).props.onAccountSetup({ name: "Reserve B", answer: "stillMine", style: { emoji: "B", tone: "primary" } });
    root?.root.findByType(SetupCategories).props.onChange([]);
    node("USD").props.onPress();
    node("Starting amount").props.onChangeText("99");
    node("Cancel setup").props.onPress();
  });
  await act(async () => root?.root.findAll((node) => node.props.testID === "native-sheet")[0].props.onDismiss());
  expect(cancel).not.toHaveBeenCalled();
  expect(text()).toContain("Reserve A will be added after basic setup.");
  expect(text()).not.toContain("Reserve B");
  expect(node("Food").props.accessibilityState.checked).toBe(true);
  expect(node("COP").props.accessibilityState.checked).toBe(true);
  expect(node("Starting amount").props.value).toBe("12");
  await press("Start tracking");
  expect(backend.ensure.mock.calls[1][0]).toEqual(backend.ensure.mock.calls[0][0]);
  expect(backend.ensure.mock.calls[1][0]).toMatchObject({ functionalCurrency: "COP", startingMinorUnits: 1200 });
  expect(node("Account name").props.value).toBe("Reserve A");
  await press("Add this place");
  expect(backend.place).toHaveBeenCalledOnce();
  expect(backend.place.mock.calls[0][0].payload.name).toBe("Reserve A");
  expect(backend.ensure).toHaveBeenCalledTimes(2);
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ currency: "COP", startingMinorUnits: 1200, categories: [{ ...starterCategories[0], source: "starter" }] }));
});
