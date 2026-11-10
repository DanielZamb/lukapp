import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import BudgetRoute from "../../../app/budget";
import { api } from "../api";
import type { Category } from "../categories/model";

type Evaluation = FunctionReturnType<typeof api.budget.evaluate>;
let board: Evaluation | undefined;
let categories: Pick<Category, "id" | "style">[] | undefined;
let totals: FunctionReturnType<typeof api.accounting.categoryTotals> | undefined;
let priorTotals: FunctionReturnType<typeof api.accounting.categoryTotals> | undefined;
let month = "2026-10";
let accountCount = 1;
const queries = vi.fn();
type Receipt = FunctionReturnType<typeof api.budget.setCategoryLimit>;
type TargetArgs = FunctionArgs<typeof api.budget.removeCategoryLimit>;
const save = vi.fn<(args: FunctionArgs<typeof api.budget.setCategoryLimit>) => Promise<Receipt>>();
const spendNothing = vi.fn<(args: TargetArgs) => Promise<Receipt>>();
const removeLimit = vi.fn<(args: TargetArgs) => Promise<Receipt>>();
const back = vi.fn();
const reset = vi.fn();
const backListeners: (() => boolean)[] = [];
vi.mock("expo-router", () => ({ router: { back: () => back() }, useNavigation: () => ({ dispatch: reset }), Redirect: "Redirect", useLocalSearchParams: () => ({}) }));
vi.mock("expo-crypto", () => {
  let sequence = 0;
  return { randomUUID: () => `key-${++sequence}` };
});
vi.mock("convex/react", () => ({
  useQuery: (reference: FunctionReference<"query">, args: unknown) => {
    const name = getFunctionName(reference);
    queries(name, args);
    if (args === "skip") return undefined;
    if (name === "accounting:categoryTotals") return (args as { month: string }).month === month ? totals : priorTotals;
    return name === "budget:evaluate" ? board : categories;
  },
  useAction: (reference: FunctionReference<"action">) => ({
    "budget:setCategoryLimit": save, "budget:setCategorySpendNothing": spendNothing, "budget:removeCategoryLimit": removeLimit,
  })[getFunctionName(reference)],
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "workspace", timeZone: "America/Bogota" } }),
  usePostedActivity: () => ({ accounts: Array.from({ length: accountCount }, () => ({})) }),
}));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ month }) }));
vi.mock("./BudgetEditorSheet", () => ({ BudgetEditorSheet: "EditorSheet" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "Sheet", BottomSheetScrollView: "SheetScroll", BottomSheetBackdrop: "Backdrop", BottomSheetTextInput: "SheetInput",
}));
vi.mock("react-native", () => ({
  BackHandler: { addEventListener: (_: string, listener: () => boolean) => {
    backListeners.push(listener);
    return { remove: () => { backListeners.splice(backListeners.indexOf(listener), 1); } };
  } },
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport",
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queries.mockClear(); save.mockReset(); spendNothing.mockReset(); removeLimit.mockReset();
  back.mockClear(); reset.mockClear(); accountCount = 1;
  month = "2026-10";
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [], jars: [],
    availableCategories: [{ id: "food", name: "Food", emoji: "🛒" }] };
  totals = { month, currency: "COP", totalsOverlap: true, categories: [{ categoryId: "food", name: "Food", nature: "Expense", minorUnits: 86_000_000 }] };
  categories = [{ id: "food", style: { emoji: "🛒", tone: "positive" } }];
  priorTotals = { month: "2026-09", currency: "COP", totalsOverlap: true,
    categories: [{ categoryId: "food", name: "Food", nature: "Expense", minorUnits: 7_312_345 }] };
  save.mockImplementation(async (request) => ({ replay: false, revision: {
    id: "revision", workspaceId: request.workspaceId, categoryId: request.categoryId, effectiveMonth: request.effectiveMonth,
    limitMinorUnits: request.limit.minorUnits, expectedRevisionId: request.expectedRevisionId,
    sequence: 1, idempotencyKey: request.idempotencyKey, createdBy: "owner", createdAt: 1,
  } }));
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render() {
  await act(async () => { root = create(createElement(BudgetRoute), { createNodeMock: (element) => {
    const props = element.props;
    if (element.type === "Sheet" && props && typeof props === "object" && "onDismiss" in props && typeof props.onDismiss === "function") {
      return { present() {}, dismiss: props.onDismiss };
    }
    return null;
  } }); });
  if (!root) throw new Error("Budget not mounted");
  return root.root;
}

function texts(screen: ReactTestInstance) {
  return screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
}

test("creation chooses a category before the composer, then saves shared-parser minor units for the current month", async () => {
  const screen = await render();
  expect(queries.mock.calls).toContainEqual(["budget:evaluate", { workspaceId: "workspace", month: "2026-10", refreshKey: expect.any(String) }]);
  await act(async () => screen.findByProps({ accessibilityLabel: "Set a October limit" }).props.onPress());
  expect(texts(screen)).toContain("Choose a category");
  expect(screen.findAllByProps({ accessibilityLabel: "Monthly limit" })).toHaveLength(0);
  await act(async () => screen.findByProps({ accessibilityRole: "radio" }).props.onPress());
  expect(texts(screen)).toContain("Limit for Food");
  expect(texts(screen)).toContain("BUDGET");
  expect(texts(screen)).toContain("COP 860.000 out this month");
  expect(texts(screen)).toContain("Stay under");
  expect(screen.findAll((node) => String(node.type) === "EditorSheet")).toHaveLength(0);
  expect(screen.findByProps({ accessibilityLabel: "Monthly limit" }).props).toMatchObject({ keyboardType: "decimal-pad", placeholder: "0" });
  expect(screen.findByProps({ accessibilityLabel: "Save this limit" }).props.disabled).toBe(false);
  expect(screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.value).toBe("800.000");
  expect(screen.findByProps({ accessibilityLabel: "COP 800.000" }).props.accessibilityState.selected).toBe(true);
  expect(texts(screen).some((text) => text.startsWith("Repeats each month"))).toBe(false);
  expect(screen.findByProps({ accessibilityLabel: "Remaining jar" }).props.accessibilityValue).toEqual({ min: 0, max: 100, now: 0, text: "−COP 60.000 remaining" });
  expect(texts(screen)).toContain("This jar is already empty.");
  expect(["COP 600.000", "COP 800.000", "COP 1.000.000", "COP 1.200.000"].map((label) => screen.findByProps({ accessibilityLabel: label }).props.accessibilityLabel))
    .toEqual(["COP 600.000", "COP 800.000", "COP 1.000.000", "COP 1.200.000"]);
  await act(async () => screen.findByProps({ accessibilityLabel: "COP 1.000.000" }).props.onPress());
  expect(screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.value).toBe("1.000.000");
  totals = { month, currency: "COP", totalsOverlap: true, categories: [] };
  await act(async () => root?.update(createElement(BudgetRoute)));
  expect(screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.value).toBe("1.000.000");
  totals = { month, currency: "COP", totalsOverlap: true, categories: [{ categoryId: "food", name: "Food", nature: "Expense", minorUnits: 86_000_000 }] };
  await act(async () => root?.update(createElement(BudgetRoute)));
  expect(screen.findByProps({ accessibilityLabel: "Remaining jar" }).props.accessibilityValue).toEqual({ min: 0, max: 100, now: 14, text: "COP 140.000 remaining" });
  expect(texts(screen)).toContain("What is still in the jar. Spent eats it.");
  await act(async () => screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.onChangeText("0"));
  expect(screen.findByProps({ accessibilityLabel: "Save this limit" }).props.disabled).toBe(true);
  await act(async () => screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.onChangeText("1.500.000,25"));
  await act(async () => screen.findByProps({ accessibilityLabel: "Save this limit" }).props.onPress());
  expect(save.mock.calls).toEqual([[{
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 150_000_025 },
    expectedRevisionId: null, idempotencyKey: expect.any(String),
  }]]);
  expect(texts(screen)).toContain("Budgets");
  expect(texts(screen)).toContain("Budget saved");
  expect(reset.mock.calls).toEqual([[{ type: "RESET", payload: { index: 0, routes: [{ name: "level-unlocked", params: {
    door: "budget", category: "Food", emoji: "🛒", color: "#047857", currency: "COP", limitMinorUnits: 150_000_025,
  } }] } }]]);
});

test.each(["second place", "existing limit"])("a workspace with a %s returns home after saving a new limit", async (unlockedBy) => {
  if (unlockedBy === "second place") accountCount = 2;
  else if (board) board.jars.push({ category: { id: "travel", name: "Travel", emoji: "✈️" }, revisionId: "travel-limit", limitMinorUnits: 10_000_000, consumptionMinorUnits: 0 });
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: unlockedBy === "second place" ? "Set a October limit" : "Set another limit" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityRole: "radio" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.onChangeText("50.000"));
  await act(async () => screen.findByProps({ accessibilityLabel: "Save this limit" }).props.onPress());
  expect(save).toHaveBeenCalledOnce();
  expect(reset.mock.calls).toEqual([[{ type: "RESET", payload: { index: 0, routes: [{ name: "index" }] } }]]);
});

test("the first limit still unlocks when live data updates before its receipt arrives", async () => {
  let acknowledge: (() => void) | undefined;
  const receipt = save.getMockImplementation();
  if (!receipt) throw new Error("Missing save implementation");
  save.mockImplementationOnce(async (request) => {
    await new Promise<void>((resolve) => { acknowledge = resolve; });
    return receipt(request);
  });
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Set a October limit" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityRole: "radio" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.onChangeText("50.000"));
  await act(async () => screen.findByProps({ accessibilityLabel: "Save this limit" }).props.onPress());
  expect(reset).not.toHaveBeenCalled();
  if (board) board.jars.push({ category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "revision", limitMinorUnits: 5_000_000, consumptionMinorUnits: 0 });
  await act(async () => root?.update(createElement(BudgetRoute)));
  await act(async () => acknowledge?.());
  expect(reset.mock.calls).toEqual([[{ type: "RESET", payload: { index: 0, routes: [{ name: "level-unlocked", params: {
    door: "budget", category: "Food", emoji: "🛒", color: "#047857", currency: "COP", limitMinorUnits: 5_000_000,
  } }] } }]]);
});

test("the under-jars control offers only unlimited categories and both creation pages go back to the board", async () => {
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [],
    availableCategories: [{ id: "food", name: "Food", emoji: "🛒" }],
    jars: [{ category: { id: "travel", name: "Travel", emoji: "✈️" }, revisionId: "travel-revision", limitMinorUnits: 20_000_000, consumptionMinorUnits: 0 }] };
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Set another limit" }).props.onPress());
  expect(texts(screen)).toContain("Choose a category");
  expect(screen.findAllByProps({ accessibilityRole: "radio" }).map((node) => texts(node))).toEqual([["🛒 Food"]]);
  await act(async () => screen.findByProps({ accessibilityLabel: "Back" }).props.onPress());
  expect(texts(screen)).toContain("Budgets");
  await act(async () => screen.findByProps({ accessibilityLabel: "Set another limit" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityRole: "radio" }).props.onPress());
  expect(texts(screen)).toContain("Limit for Food");
  await act(async () => screen.findByProps({ accessibilityLabel: "Back" }).props.onPress());
  expect(texts(screen)).toContain("Budgets");
  expect(back).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});

test("composer waits for spending and preserves a failed save for a safe retry", async () => {
  totals = undefined;
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Set a October limit" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityRole: "radio" }).props.onPress());
  expect(screen.findByProps({ accessibilityLabel: "Loading category spending" }).type).toBe("ActivityIndicator");
  totals = { month, currency: "COP", totalsOverlap: true, categories: [] };
  await act(async () => root?.update(createElement(BudgetRoute)));
  expect(texts(screen)).toContain("COP 0 out this month");
  expect(texts(screen)).toContain("COP 200.000");
  expect(screen.findAllByProps({ accessibilityLabel: "COP 0" })).toHaveLength(0);
  expect(screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.value).toBe("400.000");
  expect(screen.findByProps({ accessibilityLabel: "COP 400.000" }).props.accessibilityState.selected).toBe(true);
  save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  await act(async () => screen.findByProps({ accessibilityLabel: "Save this limit" }).props.onPress());
  expect(texts(screen)).toContain("Could not confirm saving. Retry to safely check the same Budget.");
  expect(reset).not.toHaveBeenCalled();
  expect(screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.editable).toBe(false);
  expect(screen.findAllByProps({ accessibilityLabel: "Back" })).toHaveLength(0);
  await act(async () => screen.findByProps({ accessibilityLabel: "Retry save" }).props.onPress());
  expect(save.mock.calls.map(([request]) => [request.limit.minorUnits, request.idempotencyKey]))
    .toEqual([[40_000_000, save.mock.calls[0][0].idempotencyKey], [40_000_000, save.mock.calls[0][0].idempotencyKey]]);
  expect(texts(screen)).toContain("Budget saved");
  expect(reset).toHaveBeenCalledOnce();
});

test("editing an existing limit closes and refreshes the board with a saved confirmation without navigating", async () => {
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [], availableCategories: [], jars: [{
    category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "live-revision", limitMinorUnits: 10_000_000, consumptionMinorUnits: 8_000_000,
  }] };
  const screen = await render();
  const jar = screen.findAll((node) => String(node.type) === "Pressable").find((node) => node.props.accessibilityLabel?.startsWith("Food:"));
  expect(jar?.props.style({ pressed: false })[1]).toEqual({ borderColor: "#047857", backgroundColor: "#f4f4f5" });
  await act(async () => screen.findByProps({ accessibilityLabel: "Food hit 80%" }).props.onPress());
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join("")))
    .toEqual(expect.arrayContaining(["OCTOBER", "Food", "$20K", "Stay under this month", "$100K", "$120K", "$300K"]));
  expect(queries.mock.calls).toContainEqual(["accounting:categoryTotals", { workspaceId: "workspace", month: "2026-09" }]);
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join("")))
    .not.toContain("September Food spent $73K. Saving applies to October and future months.");
  await act(async () => screen.findByProps({ accessibilityLabel: "Limit $120K" }).props.onPress());
  expect(screen.findByProps({ accessibilityLabel: "Limit $120K" }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join("")))
    .toContain("September Food spent $73K. Saving applies to October and future months.");
  const evaluationBeforeSave = queries.mock.calls.filter(([name]) => name === "budget:evaluate").at(-1);
  await act(async () => screen.findByProps({ accessibilityLabel: "Save October" }).props.onPress());
  expect(save.mock.calls[0][0]).toMatchObject({ categoryId: "food", expectedRevisionId: "live-revision", limit: { currency: "COP", minorUnits: 12_000_000 } });
  expect(texts(screen)).toContain("Budgets");
  expect(texts(screen)).toContain("Budget saved");
  expect(reset).not.toHaveBeenCalled();
  expect(screen.findAllByType(BottomSheetModal)).toHaveLength(0);
  expect(queries.mock.calls.filter(([name]) => name === "budget:evaluate").at(-1)).not.toEqual(evaluationBeforeSave);
  await act(async () => screen.findByProps({ accessibilityLabel: "Back" }).props.onPress());
  expect(back).toHaveBeenCalledOnce();
});

test("a jar tap updates an overdrawn jar and Close leaves Set another limit on the category composer", async () => {
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [],
    availableCategories: [{ id: "travel", name: "Travel", emoji: "✈️" }], jars: [{
    category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "revision", limitMinorUnits: 40_000_000, consumptionMinorUnits: 45_000_000,
  }] };
  const screen = await render();
  const jar = screen.findAll((node) => String(node.type) === "Pressable").find((node) => node.props.accessibilityLabel?.startsWith("Food:"));
  await act(async () => jar?.props.onPress());
  const text = () => screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
  expect(text()).toContain("−$50K");
  await act(async () => screen.findByProps({ accessibilityLabel: "Limit $700K" }).props.onPress());
  expect(text()).toContain("$250K");
  expect(screen.findByProps({ accessibilityLabel: "Remaining in Food" }).props.accessibilityValue).toMatchObject({ now: 36 });
  const modal = screen.findByType(BottomSheetModal);
  expect(modal.props.backdropComponent({}).props).toMatchObject({ opacity: 0.4, pressBehavior: "close" });
  await act(async () => screen.findByProps({ accessibilityLabel: "Close" }).props.onPress());
  expect(screen.findAllByType(BottomSheetModal)).toHaveLength(0);
  expect(save).not.toHaveBeenCalled();
  await act(async () => screen.findByProps({ accessibilityLabel: "Set another limit" }).props.onPress());
  expect(texts(screen)).toContain("Choose a category");
  expect(screen.findAllByProps({ accessibilityRole: "radio" }).map((node) => texts(node))).toEqual([["✈️ Travel"]]);
});

test.each([20_000_000, -20_000_000, -30_000_000])("duplicate or non-positive spend suggestion for %s is dropped, and missing prior activity displays zero", async (consumptionMinorUnits) => {
  month = "2027-01";
  priorTotals = { month: "2026-12", currency: "COP", totalsOverlap: true, categories: [] };
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [], availableCategories: [], jars: [{
    category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "revision", limitMinorUnits: 40_000_000, consumptionMinorUnits,
  }] };
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Change January's limit" }).props.onPress());
  expect(screen.findAll((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel?.startsWith("Limit "))
    .map((node) => node.props.accessibilityLabel)).toEqual(["Limit $400K", "Limit $480K"]);
  expect(queries.mock.calls).toContainEqual(["accounting:categoryTotals", { workspaceId: "workspace", month: "2026-12" }]);
  await act(async () => screen.findByProps({ accessibilityLabel: "Limit $480K" }).props.onPress());
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join("")))
    .toContain("December Food spent $0. Saving applies to January and future months.");
  await act(async () => screen.findByType(BottomSheetModal).props.onDismiss());
  expect(screen.findAllByType(BottomSheetModal)).toHaveLength(0);
});

test("prior spend loads without a fabricated zero, and uncertain saves freeze chips and dismissal until retry", async () => {
  priorTotals = undefined;
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [], availableCategories: [], jars: [{
    category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "revision", limitMinorUnits: 40_000_000, consumptionMinorUnits: 20_000_000,
  }] };
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityLabel: "Limit $480K" }).props.onPress());
  const text = () => screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
  expect(text()).toContain("Loading September spending. Saving applies to October and future months.");
  priorTotals = { month: "2026-09", currency: "COP", totalsOverlap: true,
    categories: [{ categoryId: "food", name: "Food", nature: "Expense", minorUnits: 65_000_000 }] };
  await act(async () => root?.update(createElement(BudgetRoute)));
  expect(text()).toContain("September Food spent $650K. Saving applies to October and future months.");
  save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  await act(async () => screen.findByProps({ accessibilityLabel: "Save October" }).props.onPress());
  expect(screen.findByProps({ accessibilityLabel: "Limit $400K" }).props.disabled).toBe(true);
  expect(screen.findByType(BottomSheetModal).props.backdropComponent({}).props.pressBehavior).toBe("none");
  expect(text()).not.toContain("Close");
  await act(async () => screen.findByProps({ accessibilityLabel: "Retry save" }).props.onPress());
  expect(save.mock.calls.map(([request]) => request)).toEqual([{
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 48_000_000 },
    expectedRevisionId: "revision", idempotencyKey: expect.any(String),
  }, save.mock.calls[0][0]]);
  expect(screen.findAllByType(BottomSheetModal)).toHaveLength(0);
});

test("loading waits for live data and rollover requests the new workspace month", async () => {
  board = undefined;
  const screen = await render();
  expect(screen.find((node) => String(node.type) === "ActivityIndicator").props.accessibilityLabel).toBe("Loading Budget");
  month = "2026-11";
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [], availableCategories: [], jars: [] };
  await act(async () => root?.update(createElement(BudgetRoute)));
  expect(queries.mock.calls).toContainEqual(["budget:evaluate", { workspaceId: "workspace", month: "2026-11", refreshKey: expect.any(String) }]);
  expect(screen.findByProps({ accessibilityLabel: "Set a November limit" }).props.disabled).toBeFalsy();
});

function limitJar(limitMinorUnits = 40_000_000, revisionId = "revision") {
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [], availableCategories: [], jars: [{
    category: { id: "food", name: "Food", emoji: "🛒" }, revisionId, limitMinorUnits, consumptionMinorUnits: 20_000_000,
  }] };
}
const limitInput = (screen: ReactTestInstance) => screen.findByProps({ accessibilityLabel: "New limit in COP" });
const typeLimit = (screen: ReactTestInstance, text: string) => act(async () => limitInput(screen).props.onChangeText(text));
const saveButton = (screen: ReactTestInstance) => screen.findByProps({ accessibilityLabel: "Save October" });

test("an existing limit saves typed amounts below and above it that no shortcut offers", async () => {
  limitJar();
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
  expect(limitInput(screen).props).toMatchObject({ value: "400.000,00", keyboardType: "decimal-pad", editable: true });
  expect(texts(screen)).toContain("This is the current limit. Type another amount or tap a shortcut.");
  expect(saveButton(screen).props.accessibilityState.disabled).toBe(true);
  await typeLimit(screen, "315500");
  expect(limitInput(screen).props.value).toBe("315.500");
  expect(screen.findAll((node) => String(node.type) === "Pressable" && node.props.accessibilityState?.selected === true)).toHaveLength(0);
  await act(async () => saveButton(screen).props.onPress());
  limitJar(31_550_000, "lowered");
  await act(async () => root?.update(createElement(BudgetRoute)));
  await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
  expect(limitInput(screen).props.value).toBe("315.500,00");
  await typeLimit(screen, "1.234.567,8");
  await act(async () => saveButton(screen).props.onPress());
  expect(save.mock.calls.map(([request]) => request)).toEqual([
    { workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 31_550_000 },
      expectedRevisionId: "revision", idempotencyKey: expect.any(String) },
    { workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 123_456_780 },
      expectedRevisionId: "lowered", idempotencyKey: expect.any(String) },
  ]);
  expect(save.mock.calls[0][0].idempotencyKey).not.toBe(save.mock.calls[1][0].idempotencyKey);
});

test.each([
  { typed: "", message: "Type the new limit." },
  { typed: "-50.000", message: "The limit must be more than zero." },
  { typed: ",", message: "Write the amount like this: 1.234,50" },
  { typed: "-", message: "Write the amount like this: 1.234,50" },
])("typed limit '$typed' cannot be saved and says why", async ({ typed, message }) => {
  limitJar();
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
  await typeLimit(screen, typed);
  expect(screen.findAll((node) => String(node.type) === "Text" && node.props.accessibilityRole === "alert")
    .map((node) => node.children.join(""))).toEqual([message]);
  expect(saveButton(screen).props.accessibilityState.disabled).toBe(true);
  await act(async () => saveButton(screen).props.onPress());
  expect(save).not.toHaveBeenCalled();
  await typeLimit(screen, "250.000");
  expect(screen.findAll((node) => String(node.type) === "Text" && node.props.accessibilityRole === "alert")).toHaveLength(0);
  expect(saveButton(screen).props.accessibilityState.disabled).toBe(false);
});

test("a typed limit whose save reply is lost retries the frozen command, not a re-read of the field", async () => {
  limitJar();
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
  await typeLimit(screen, "275.000");
  save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  await act(async () => saveButton(screen).props.onPress());
  expect(limitInput(screen).props.editable).toBe(false);
  await typeLimit(screen, "999.000");
  expect(limitInput(screen).props.value).toBe("275.000");
  expect(texts(screen)).toContain("Could not confirm saving. Retry to safely check the same Budget.");
  await act(async () => screen.findByProps({ accessibilityLabel: "Retry save" }).props.onPress());
  expect(save.mock.calls.map(([request]) => request)).toEqual([
    { workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 27_500_000 },
      expectedRevisionId: "revision", idempotencyKey: save.mock.calls[0][0].idempotencyKey },
    { workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 27_500_000 },
      expectedRevisionId: "revision", idempotencyKey: save.mock.calls[0][0].idempotencyKey },
  ]);
  expect(screen.findAllByType(BottomSheetModal)).toHaveLength(0);
});

test("a concurrent limit change is shown and keeps the amount the person typed", async () => {
  limitJar();
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
  await typeLimit(screen, "275.000");
  save.mockRejectedValueOnce(new ConvexError({ kind: "budget", code: "limit_changed" }));
  await act(async () => saveButton(screen).props.onPress());
  expect(screen.findAll((node) => String(node.type) === "Text" && node.props.accessibilityRole === "alert")
    .map((node) => node.children.join(""))).toEqual(["This limit or month changed. Close and reopen the Budget to use its latest limit."]);
  expect(limitInput(screen).props).toMatchObject({ value: "275.000", editable: false });
  expect(saveButton(screen).props.accessibilityState.disabled).toBe(true);
  expect(save).toHaveBeenCalledOnce();
  await act(async () => screen.findByProps({ accessibilityLabel: "Close" }).props.onPress());
  expect(screen.findAllByType(BottomSheetModal)).toHaveLength(0);
});

test("closing the limit sheet twice, by Android Back and by Close, returns to the same Budget screen", async () => {
  limitJar();
  const screen = await render();
  for (const close of ["android-back", "close-button"]) {
    await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
    expect(screen.findAllByType(BottomSheetModal)).toHaveLength(1);
    await typeLimit(screen, "123.000");
    if (close === "android-back") await act(async () => { expect(backListeners.at(-1)?.()).toBe(true); });
    else await act(async () => screen.findByProps({ accessibilityLabel: "Close" }).props.onPress());
    expect(screen.findAllByType(BottomSheetModal)).toHaveLength(0);
    expect(backListeners).toHaveLength(0);
    expect(texts(screen).filter((text) => text === "Budgets")).toHaveLength(1);
  }
  expect(back).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
  await act(async () => screen.findByProps({ accessibilityLabel: "Back" }).props.onPress());
  expect(back).toHaveBeenCalledOnce();
});

test("Android Back does not dismiss a limit sheet whose save is still unconfirmed", async () => {
  limitJar();
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
  await typeLimit(screen, "275.000");
  save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  await act(async () => saveButton(screen).props.onPress());
  await act(async () => { expect(backListeners.at(-1)?.()).toBe(true); });
  expect(screen.findAllByType(BottomSheetModal)).toHaveLength(1);
  expect(back).not.toHaveBeenCalled();
});

test.each([
  { color: "#2E7D32", outline: "#2E7D32", edge: null },
  { color: "#FFF3B0", outline: "#8a8a8a", edge: { borderWidth: 1, borderColor: "#8a8a8a" } },
])("a stored exact color $color renders on the jar and in the limit sheet", async ({ color, outline, edge }) => {
  limitJar();
  categories = [{ id: "food", style: { emoji: "🛒", tone: "positive", color } }];
  const screen = await render();
  const jar = screen.findAll((node) => String(node.type) === "Pressable").find((node) => node.props.accessibilityLabel?.startsWith("Food:"));
  expect(jar?.props.style({ pressed: false })[1]).toEqual({ borderColor: outline, backgroundColor: "#f4f4f5" });
  await act(async () => screen.findByProps({ accessibilityLabel: "Change October's limit" }).props.onPress());
  const track = screen.find((node) => String(node.type) === "View" && node.props.accessibilityLabel === "Remaining in Food");
  expect(track.props.style.slice(1)).toEqual([{ backgroundColor: `${color}22` }, edge]);
  expect(track.findAllByType("View" as never)[1].props.style.slice(1)).toEqual([{ width: "50%", backgroundColor: color }, edge]);
});

const alerts = (screen: ReactTestInstance) => screen.findAll((node) => String(node.type) === "Text" && node.props.accessibilityRole === "alert")
  .map((node) => node.children.join(""));
const press = (screen: ReactTestInstance, label: string) => act(async () => screen.findByProps({ accessibilityLabel: label }).props.onPress());
const androidBack = () => act(async () => { expect(backListeners.at(-1)?.()).toBe(true); });
const sheets = (screen: ReactTestInstance) => screen.findAllByType(BottomSheetModal).length;
const foodCategory = { id: "food", name: "Food", emoji: "🛒" };
const travelJar = { category: { id: "travel", name: "Travel", emoji: "✈️" }, revisionId: "travel-revision", limitMinorUnits: 10_000_000, consumptionMinorUnits: 0 };
function decision(args: TargetArgs, kind: "spendNothing" | "remove", id: string): Receipt {
  return { replay: false, revision: { id, workspaceId: args.workspaceId, categoryId: args.categoryId, effectiveMonth: args.effectiveMonth,
    limitMinorUnits: 0, kind, expectedRevisionId: args.expectedRevisionId, sequence: 2, idempotencyKey: args.idempotencyKey,
    createdBy: "owner", createdAt: 2 } };
}

test("a typed zero offers both acts in plain words, saves nothing by itself, and Back clears the choice before the sheet", async () => {
  limitJar();
  const screen = await render();
  await press(screen, "Change October's limit");
  await typeLimit(screen, "0");
  expect(alerts(screen)).toEqual([]);
  expect(texts(screen)).toEqual(expect.arrayContaining([
    "A limit of zero?", "Zero can mean two things. Choose one.",
    "Spend nothing in this category", "Any spending in Food shows as over the limit.",
    "Remove limit", "The limit stops applying from October. Earlier months stay as they were.",
  ]));
  expect(screen.findAll((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel?.startsWith("Limit "))).toHaveLength(0);
  expect(saveButton(screen).props.accessibilityState.disabled).toBe(true);
  await act(async () => saveButton(screen).props.onPress());
  await androidBack();
  expect(limitInput(screen).props.value).toBe("400.000,00");
  expect(texts(screen)).not.toContain("A limit of zero?");
  expect(sheets(screen)).toBe(1);
  await androidBack();
  expect(sheets(screen)).toBe(0);
  expect([save.mock.calls, spendNothing.mock.calls, removeLimit.mock.calls]).toEqual([[], [], []]);
});

test("removing from the typed-zero choice names the category and month, sends one removal, and the category can get a limit again", async () => {
  limitJar();
  board?.jars.push(travelJar);
  const screen = await render();
  await press(screen, "Food: COP 200.000,00 left of COP 400.000,00. COP 200.000,00 spent. Edit Budget.");
  await typeLimit(screen, "0");
  await press(screen, "Remove limit");
  expect(texts(screen)).toEqual(expect.arrayContaining([
    "Remove the limit for Food?", "The limit stops applying from October. Earlier months stay as they were.",
  ]));
  removeLimit.mockImplementation(async (args) => {
    board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, jars: [travelJar], availableCategories: [foodCategory],
      removedLimits: [{ categoryId: "food", revisionId: "removal", effectiveMonth: month }] };
    return decision(args, "remove", "removal");
  });
  await press(screen, "Remove limit");
  expect(removeLimit.mock.calls).toEqual([[{
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", expectedRevisionId: "revision", idempotencyKey: expect.any(String),
  }]]);
  expect(sheets(screen)).toBe(0);
  expect(alerts(screen)).toEqual(["Limit for Food removed from October."]);
  expect(screen.findAll((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel?.startsWith("Food:"))).toHaveLength(0);
  await press(screen, "Set another limit");
  await act(async () => screen.findByProps({ accessibilityRole: "radio" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.onChangeText("300.000"));
  await press(screen, "Save this limit");
  expect(save.mock.calls.map(([args]) => args)).toEqual([{
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 30_000_000 },
    expectedRevisionId: "removal", idempotencyKey: expect.any(String),
  }]);
  expect(spendNothing).not.toHaveBeenCalled();
});

test("a removal not yet in the evaluated board shows no removal confirmation", async () => {
  limitJar();
  const screen = await render();
  await press(screen, "Change October's limit");
  await press(screen, "Remove limit");
  removeLimit.mockImplementation(async (args) => decision(args, "remove", "removal"));
  await press(screen, "Remove limit");
  expect(removeLimit).toHaveBeenCalledOnce();
  expect(alerts(screen)).toEqual([]);
});

test("Spend nothing next to the shortcuts explains its effect, sends one zero-limit decision, and the jar then reads as over a zero limit", async () => {
  limitJar();
  const screen = await render();
  await press(screen, "Change October's limit");
  await press(screen, "Spend nothing");
  expect(texts(screen)).toEqual(expect.arrayContaining(["Spend nothing in Food?", "Any spending in Food shows as over the limit."]));
  spendNothing.mockImplementation(async (args) => {
    board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, availableCategories: [], removedLimits: [],
      jars: [{ category: foodCategory, revisionId: "zero", limitMinorUnits: 0, consumptionMinorUnits: 20_000_000 }] };
    return decision(args, "spendNothing", "zero");
  });
  await press(screen, "Keep a limit of zero");
  expect(spendNothing.mock.calls).toEqual([[{
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", expectedRevisionId: "revision", idempotencyKey: expect.any(String),
  }]]);
  expect(sheets(screen)).toBe(0);
  expect(texts(screen)).toEqual(["OCTOBER", "Budgets", "Open Food", "Budget saved", "🛒", "Food", "Spend nothing", "200K over"]);
  expect(screen.findAllByProps({ accessibilityLabel: "Food: COP 200.000,00 over a spend-nothing limit. Edit Budget." })).toHaveLength(1);
  expect([save.mock.calls, removeLimit.mock.calls]).toEqual([[], []]);
});

test("a spend-nothing jar's sheet starts empty without multiplied shortcuts, and a typed amount becomes a normal limit", async () => {
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, removedLimits: [], availableCategories: [],
    jars: [{ category: foodCategory, revisionId: "zero", limitMinorUnits: 0, consumptionMinorUnits: 20_000_000 }] };
  const screen = await render();
  await press(screen, "Open Food");
  expect(limitInput(screen).props.value).toBe("");
  expect(alerts(screen)).toEqual([]);
  expect(texts(screen)).toEqual(expect.arrayContaining([
    "Spend nothing", "−$200K", "Food is set to spend nothing. Type an amount to give it a limit.",
  ]));
  expect(screen.findByProps({ accessibilityLabel: "Remaining in Food" }).props.accessibilityValue)
    .toEqual({ min: 0, max: 100, now: 0, text: "COP 200.000,00 over" });
  expect(screen.findAll((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel?.startsWith("Limit "))
    .map((node) => node.props.accessibilityLabel)).toEqual(["Limit $400K"]);
  expect(screen.findAllByProps({ accessibilityLabel: "Spend nothing" })).toHaveLength(0);
  await typeLimit(screen, "0");
  expect(texts(screen)).toContain("Food is already set to spend nothing.");
  expect(screen.findAllByProps({ accessibilityLabel: "Spend nothing in this category" })).toHaveLength(0);
  await typeLimit(screen, "150.000");
  await press(screen, "Save October");
  expect(save.mock.calls.map(([args]) => args)).toEqual([{
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 15_000_000 },
    expectedRevisionId: "zero", idempotencyKey: expect.any(String),
  }]);
});

test("an unconfirmed removal keeps its confirmation frozen through Back, and Retry sends the identical removal", async () => {
  limitJar();
  const screen = await render();
  await press(screen, "Change October's limit");
  await press(screen, "Remove limit");
  removeLimit.mockRejectedValueOnce(new Error("lost acknowledgement"));
  await press(screen, "Remove limit");
  expect(alerts(screen)).toEqual(["Could not confirm saving. Retry to safely check the same Budget."]);
  expect(screen.findAllByProps({ accessibilityLabel: "Cancel" })).toHaveLength(0);
  expect(screen.findByType(BottomSheetModal).props.backdropComponent({}).props.pressBehavior).toBe("none");
  await androidBack();
  expect(sheets(screen)).toBe(1);
  expect(texts(screen)).toContain("Remove the limit for Food?");
  removeLimit.mockImplementation(async (args) => decision(args, "remove", "removal"));
  await press(screen, "Retry");
  const removal = { workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", expectedRevisionId: "revision",
    idempotencyKey: removeLimit.mock.calls[0][0].idempotencyKey };
  expect(removeLimit.mock.calls).toEqual([[removal], [removal]]);
  expect(sheets(screen)).toBe(0);
});

test("a removal that meets a newer limit is shown, and closing refreshes the Budget", async () => {
  limitJar();
  const screen = await render();
  await press(screen, "Change October's limit");
  await press(screen, "Remove limit");
  removeLimit.mockRejectedValueOnce(new ConvexError({ kind: "budget", code: "limit_changed" }));
  await press(screen, "Remove limit");
  expect(alerts(screen)).toEqual(["This limit or month changed. Close and reopen the Budget to use its latest limit."]);
  expect(screen.findByProps({ accessibilityLabel: "Remove limit" }).props.accessibilityState.disabled).toBe(true);
  const evaluationBeforeClose = queries.mock.calls.filter(([name]) => name === "budget:evaluate").at(-1);
  await press(screen, "Cancel");
  await press(screen, "Close");
  expect(sheets(screen)).toBe(0);
  expect(queries.mock.calls.filter(([name]) => name === "budget:evaluate").at(-1)).not.toEqual(evaluationBeforeClose);
  expect(removeLimit).toHaveBeenCalledOnce();
});

test("every new choice closes on Back before the sheet, and two round trips return to the same Budget screen with nothing sent", async () => {
  limitJar();
  const screen = await render();
  for (const round of [1, 2]) {
    await press(screen, "Change October's limit");
    await press(screen, "Remove limit");
    expect(texts(screen)).toContain("Remove the limit for Food?");
    await androidBack();
    expect(texts(screen)).not.toContain("Remove the limit for Food?");
    expect(limitInput(screen).props.value).toBe("400.000,00");
    await press(screen, "Spend nothing");
    await press(screen, "Cancel");
    expect(texts(screen)).not.toContain("Spend nothing in Food?");
    await typeLimit(screen, "0");
    await press(screen, "Spend nothing in this category");
    expect(texts(screen)).toContain("Spend nothing in Food?");
    await androidBack();
    expect(texts(screen)).toContain("A limit of zero?");
    await androidBack();
    expect(texts(screen)).not.toContain("A limit of zero?");
    expect(sheets(screen)).toBe(1);
    if (round === 1) await androidBack();
    else {
      await press(screen, "Remove limit");
      await act(async () => screen.findByType(BottomSheetModal).props.onDismiss());
    }
    expect(sheets(screen)).toBe(0);
    expect(backListeners).toHaveLength(0);
    expect(texts(screen).filter((text) => text === "Budgets")).toHaveLength(1);
  }
  expect([save.mock.calls, spendNothing.mock.calls, removeLimit.mock.calls]).toEqual([[], [], []]);
  expect(back).not.toHaveBeenCalled();
});

test("a new limit refuses a typed zero with a message and offers neither removal nor spend nothing", async () => {
  const screen = await render();
  await press(screen, "Set a October limit");
  await act(async () => screen.findByProps({ accessibilityRole: "radio" }).props.onPress());
  await act(async () => screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.onChangeText("0"));
  expect(alerts(screen)).toEqual(["The limit must be more than zero."]);
  expect(screen.findByProps({ accessibilityLabel: "Save this limit" }).props.disabled).toBe(true);
  expect(texts(screen).filter((text) => /zero\?|Remove|Spend nothing/.test(text))).toEqual([]);
  await press(screen, "Save this limit");
  await act(async () => screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.onChangeText("50.000"));
  expect(alerts(screen)).toEqual([]);
  expect([save.mock.calls, spendNothing.mock.calls, removeLimit.mock.calls]).toEqual([[], [], []]);
});
