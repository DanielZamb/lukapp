import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Text } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LocalInput, LocalInputLease } from "../../local-auth/localInput";
import PostRoute from "../../../app/post";
import { BatchNativeStack } from "../posting/BatchNativeStack";
import { PostingForm } from "../posting/PostingForm";
import type { LoadResult, PostingTransport } from "../posting/usePostingEditor";
import type { PendingPosting } from "../posting/pendingPostingSchema";
import { PostingImpactSheet } from "./PostingImpactSheet";
import type { api } from "../api";
import type { FunctionReturnType } from "convex/server";

const memory = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => memory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { memory.set(key, value); },
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "DateTimePicker" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModalProvider: "SheetProvider", BottomSheetModal: "Sheet", BottomSheetView: "SheetView", BottomSheetScrollView: "SheetScroll", BottomSheetBackdrop: "Backdrop",
}));
vi.mock("react-native-screens", () => ({ ScreenStack: "Stack", ScreenStackItem: "StackItem", ScreenStackHeaderLeftView: "HeaderLeft", ScreenStackHeaderRightView: "HeaderRight" }));
vi.mock("expo-router", () => ({ useLocalSearchParams: () => ({}), router: { replace: vi.fn(), back: vi.fn() }, Redirect: "Redirect" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("react-native", () => ({
  Text: "Text", View: "View", Pressable: "Button", ScrollView: "ScrollView", TextInput: "Input", ActivityIndicator: "Spinner",
  Platform: { OS: "ios" }, Keyboard: { dismiss: vi.fn() }, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace", functionalCurrency: "COP", timeZone: "America/Bogota" }, financialAccountProfile: { id: "bank" },
}) }));
vi.mock("../useLocalEntryDrafts", () => ({ useLocalEntryDrafts: () => ({ port: null }) }));
vi.mock("../useIntakeCandidates", () => ({ useIntakeCandidates: () => ({}) }));
vi.mock("../intake/facts", () => ({ factsFromCandidate: vi.fn(), suggestionOf: vi.fn() }));
vi.mock("../posting/usePostingTransport", () => ({ usePostingTransport: () => transport }));
vi.mock("../categories/CategoryPicker", () => ({ CategoryPicker: () => null }));
vi.mock("../posting/PlaceSheet", () => ({ PlaceSheet: () => null }));
vi.mock("../posting/AccountSetupForm", () => ({ AccountSetupForm: () => null }));
vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useConvex: () => ({ query: async (_query: unknown, args: unknown) => {
    batchBudgetArgs.push(args);
    if (!budget) throw new Error("Budget unavailable");
    return budget;
  } }),
  useQuery: (query: FunctionReference<"query">, args: unknown) => {
    if (args === "skip") return undefined;
    switch (getFunctionName(query)) {
      case "accounting:listUserCategories": return ["food", "home"].map((id) => ({ id, name: id, resolvedPostingAccountCode: "expense", style: { emoji: "🛒", tone: "primary" } }));
      case "accounting:listFinancialAccountProfiles": return [{ id: "bank", name: "Bank" }, { id: "card", name: "Card" }];
      case "budget:evaluate": budgetArgs = args; return budget;
    }
  },
}));

let root: ReactTestRenderer | undefined;
let budget: FunctionReturnType<typeof api.budget.evaluate> | undefined;
let budgetArgs: unknown;
let batchBudgetArgs: unknown[];
let transport: ReturnType<typeof makeTransport>;
function makeTransport() {
  let nextKey = 0;
  return {
    load: vi.fn(async (): Promise<LoadResult> => ({ kind: "none" })),
    save: vi.fn(async (command: PendingPosting) => ({ id: "draft", command })),
    post: vi.fn(async (entry: PendingPosting) => ({
      description: "description" in entry.payload ? entry.payload.description : entry.payload.name,
      amount: { ...entry.payload.amount, minorUnits: (entry.kind === "expense" || entry.kind === "transfer" ? -1 : 1) * entry.payload.amount.minorUnits },
    })),
    clear: vi.fn(async () => {}), abort: vi.fn(async () => {}), newKey: () => nextKey++ === 0 ? "post-key" : `post-key-${nextKey}`,
  } satisfies PostingTransport;
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  memory.clear();
  batchBudgetArgs = [];
  transport = makeTransport();
  budgetArgs = undefined;
  budget = {
    month: "2026-10", currentMonth: "2026-10", currency: "COP", totalsOverlap: true, availableCategories: [],
    jars: ["food", "home"].map((id) => ({
      category: { id, name: id === "food" ? "Food" : "Home", emoji: "" },
      revisionId: id, limitMinorUnits: 10000000, consumptionMinorUnits: 9000000,
    })),
  };
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function form() {
  if (!root) throw new Error("Post not mounted");
  return root.root.findByType(PostingForm).props;
}
function text() {
  return root?.root.findAllByType(Text).map((node) => node.children.join("")).join("\n");
}
async function open() {
  await act(async () => { root = create(createElement(LocalInput.Provider, { value: new LocalInputLease("owner", "session") }, createElement(PostRoute))); });
  await act(async () => {
    form().onAmountChange("-120.000,00");
    form().onDescriptionChange("Groceries");
    root?.root.findByType(DateTimePicker).props.onChange({}, new Date("2026-10-18T12:00:00"));
  });
}
async function press(label: string) {
  if (!root) throw new Error("Post not mounted");
  const button = root.root.findByProps({ accessibilityLabel: label, accessibilityRole: "button" });
  await act(async () => { button.props.onPress(); });
}

test("crossing sheet shows all impacts; Reconsider leaves the draft, Continue posts once with the usual banner", async () => {
  await open();
  const { CategoryPicker } = await import("../categories/CategoryPicker");
  await act(async () => {
    root?.root.findByType(CategoryPicker).props.onChange({ ids: ["food", "home"], primaryId: null });
  });
  await act(async () => form().onPost());
  expect(text()).toContain("BUDGET WOULD CROSS");
  expect(text()).toContain("Food 110K over");
  expect(text()).toContain("Home 110K over");
  expect(transport.post).not.toHaveBeenCalled();
  await press("Reconsider");
  expect(root?.root.findAllByType(PostingImpactSheet)).toHaveLength(0);
  expect({ amount: form().amount, description: form().description, editable: form().editable }).toEqual({ amount: "-120.000,00", description: "Groceries", editable: true });
  expect(transport.post).not.toHaveBeenCalled();
  await act(async () => form().onPost());
  await act(async () => root?.root.findByType(PostingImpactSheet).findByType(BottomSheetModal).props.onDismiss());
  expect(form().amount).toBe("-120.000,00");
  expect(transport.post).not.toHaveBeenCalled();
  await act(async () => form().onPost());
  if (!root) throw new Error("Post not mounted");
  const continueButton = root.root.findByProps({ accessibilityLabel: "Continue anyway", accessibilityRole: "button" });
  await act(async () => { continueButton.props.onPress(); continueButton.props.onPress(); });
  expect(transport.post.mock.calls.map(([entry]) => entry)).toEqual([{
    kind: "expense", payload: {
      workspaceId: "workspace", financialAccountProfileId: "bank", amount: { currency: "COP", minorUnits: 12000000 },
      accountingDate: "2026-10-18",
      description: "Groceries", idempotencyKey: "post-key", userCategoryIds: ["food", "home"],
    },
  }]);
  expect(form().posted).toBe("Groceries · −COP 120.000,00");
  expect(text()).toContain("Posted");
});

test("unselected, under-limit and already-over jars do not interrupt posting", async () => {
  await open();
  const { CategoryPicker } = await import("../categories/CategoryPicker");
  await act(async () => {
    root?.root.findByType(CategoryPicker).props.onChange({ ids: ["food"], primaryId: null });
    form().onAmountChange("-10.000,00");
  });
  await act(async () => form().onPost());
  expect(form().posted).toBe("Groceries · −COP 10.000,00");
  if (!budget) throw new Error("Budget missing");
  budget.jars[0].consumptionMinorUnits = 11000000;
  await act(async () => { form().onAmountChange("-120.000,00"); });
  await act(async () => { root?.root.findByType(CategoryPicker).props.onChange({ ids: ["food"], primaryId: null }); });
  await act(async () => form().onPost());
  expect(form().posted).toBe("Entry · −COP 120.000,00");
  expect(root?.root.findAllByType(PostingImpactSheet)).toHaveLength(0);
});

test("budget loading waits for an expense but does not change income, transfers or opening balances", async () => {
  budget = undefined;
  await open();
  expect(form().canSubmit).toBe(false);
  await act(async () => form().onPost());
  expect(transport.post).not.toHaveBeenCalled();
  await act(async () => form().onAmountChange("120.000,00"));
  expect(form().canSubmit).toBe(true);
  await act(async () => form().onPost());
  expect(transport.post.mock.calls[0][0].kind).toBe("income");
  await act(async () => { form().onEntryType("transfer"); form().onAmountChange("120.000,00"); });
  const { PlaceSheet } = await import("../posting/PlaceSheet");
  await act(async () => form().onDestination());
  await act(async () => root?.root.findByType(PlaceSheet).props.onSelect("card"));
  await act(async () => form().onPost());
  expect(transport.post.mock.calls[1][0].kind).toBe("transfer");
  await act(async () => { form().onEntryType("initial"); form().onAmountChange("120.000,00"); });
  await act(async () => form().onPost());
  expect(transport.post.mock.calls[2][0].kind).toBe("opening");
});

test("a backdated expense checks the accounting month", async () => {
  await open();
  const picker = root?.root.findByType(DateTimePicker);
  await act(async () => picker?.props.onChange({}, new Date("2026-09-15T12:00:00")));
  expect(budgetArgs).toEqual({ workspaceId: "workspace", month: "2026-09" });
});

test("retrying a pending expense preserves its command and idempotency key", async () => {
  const command: PendingPosting = {
    kind: "expense",
    payload: {
      workspaceId: "workspace", financialAccountProfileId: "bank", accountingDate: "2026-10-18",
      amount: { currency: "COP", minorUnits: 12000000 }, description: "Saved groceries",
      userCategoryIds: ["food"], idempotencyKey: "original-key",
    },
  };
  transport.load.mockResolvedValue({ kind: "pending", id: "saved", command });
  await open();
  await act(async () => form().onPost());
  expect(transport.post.mock.calls.map(([entry]) => entry)).toEqual([command]);
  expect(form().posted).toBe("Saved groceries · −COP 120.000,00");
  expect(root?.root.findAllByType(PostingImpactSheet)).toHaveLength(0);
});


test("batch route queues One, cancels modal edits, adds another, and posts through the existing transport", async () => {
  await open();
  await act(async () => form().onBatch());
  const tape = () => {
    if (!root) throw new Error("Post not mounted");
    return root.root.findByType(BatchNativeStack).props;
  };
  expect(tape().batch.queue).toHaveLength(1);
  expect(transport.post).not.toHaveBeenCalled();
  const first = tape().batch.queue[0];
  await act(async () => tape().onEdit(first));
  await act(async () => form().onDescriptionChange("Cancelled edit"));
  await act(async () => tape().onCancel());
  expect(tape().batch.queue[0]).toEqual(first);
  await act(async () => tape().onAdd());
  expect(form().amount).toBe("-");
  expect(form().saveToBatch).toBe(true);
  expect(form().posted).toBeNull();
  await act(async () => {
    form().onAmountChange("+30.000");
    form().onDescriptionChange("Refund");
  });
  await act(async () => form().onPost());
  expect(tape().batch.queue).toHaveLength(2);
  expect(transport.post).not.toHaveBeenCalled();
  await act(async () => tape().onOne());
  expect(form().batchCount).toBe(2);
  expect(form().amount).toBe("-");
  await act(async () => form().onBatch());
  await act(async () => { await tape().batch.postAll(); });
  expect(transport.post.mock.calls.map(([entry]) => entry)).toEqual([
    { kind: "expense", payload: { workspaceId: "workspace", financialAccountProfileId: "bank", accountingDate: "2026-10-18", amount: { currency: "COP", minorUnits: 12000000 }, description: "Groceries", idempotencyKey: "post-key" } },
    { kind: "income", payload: { workspaceId: "workspace", financialAccountProfileId: "bank", accountingDate: expect.any(String), amount: { currency: "COP", minorUnits: 3000000 }, description: "Refund", idempotencyKey: "post-key-2" } },
  ]);
  expect(tape().batch.queue).toEqual([]);
  expect(tape().batch.posted).toEqual({ count: 2, net: -9000000 });
  expect(transport.clear).toHaveBeenCalledTimes(2);
});


test("Post all checks cumulative expenses and shows the existing confirmation once for the whole batch", async () => {
  await open();
  const { CategoryPicker } = await import("../categories/CategoryPicker");
  const tape = () => {
    if (!root) throw new Error("Post not mounted");
    return root.root.findByType(BatchNativeStack).props;
  };
  await act(async () => {
    form().onAmountChange("-6.000");
    root?.root.findByType(CategoryPicker).props.onChange({ ids: ["food"], primaryId: null });
  });
  await act(async () => form().onBatch());
  await act(async () => tape().onAdd());
  await act(async () => {
    form().onAmountChange("-6.000");
    form().onDescriptionChange("Second expense");
    root?.root.findByType(DateTimePicker).props.onChange({}, new Date("2026-10-19T12:00:00"));
    root?.root.findByType(CategoryPicker).props.onChange({ ids: ["food"], primaryId: null });
  });
  await act(async () => form().onPost());
  let posting: Promise<void> | undefined;
  await act(async () => { posting = tape().batch.postAll(); });
  expect(batchBudgetArgs).toEqual([{ workspaceId: "workspace", month: "2026-10" }]);
  expect(root?.root.findAllByType(PostingImpactSheet)).toHaveLength(1);
  expect(text()).toContain("Food 2K over");
  expect(transport.save).not.toHaveBeenCalled();
  await press("Reconsider");
  await act(async () => { await posting; });
  expect(tape().batch.queue).toHaveLength(2);
  expect(transport.post).not.toHaveBeenCalled();
  await act(async () => { posting = tape().batch.postAll(); });
  await press("Continue anyway");
  await act(async () => { await posting; });
  expect(transport.post).toHaveBeenCalledTimes(2);
  expect(root?.root.findAllByType(PostingImpactSheet)).toHaveLength(0);
  expect(tape().batch.queue).toEqual([]);
});
