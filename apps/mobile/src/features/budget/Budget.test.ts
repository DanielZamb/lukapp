import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import BudgetRoute from "../../../app/budget";
import { api } from "../api";
import type { Category } from "../categories/model";
import type { BudgetTransport } from "./useBudgetEditor";

type Evaluation = FunctionReturnType<typeof api.budget.evaluate>;
let board: Evaluation | undefined;
let categories: Pick<Category, "id" | "style">[] | undefined;
let totals: FunctionReturnType<typeof api.accounting.categoryTotals> | undefined;
let month = "2026-10";
let accountCount = 1;
const queries = vi.fn();
const save = vi.fn<BudgetTransport["save"]>();
const back = vi.fn();
const reset = vi.fn();
vi.mock("expo-router", () => ({ router: { back: () => back() }, useNavigation: () => ({ dispatch: reset }), Redirect: "Redirect" }));
vi.mock("expo-crypto", () => {
  let sequence = 0;
  return { randomUUID: () => `key-${++sequence}` };
});
vi.mock("convex/react", () => ({
  useQuery: (reference: FunctionReference<"query">, args: unknown) => {
    const name = getFunctionName(reference);
    queries(name, args);
    return name === "budget:evaluate" ? board : name === "accounting:categoryTotals" ? totals : categories;
  },
  useAction: () => save,
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "workspace", timeZone: "America/Bogota" } }),
  usePostedActivity: () => ({ accounts: Array.from({ length: accountCount }, () => ({})) }),
}));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ month }) }));
vi.mock("./BudgetEditorSheet", () => ({ BudgetEditorSheet: "EditorSheet" }));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput", View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queries.mockClear(); save.mockReset(); back.mockClear(); reset.mockClear(); accountCount = 1;
  month = "2026-10";
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, jars: [],
    availableCategories: [{ id: "food", name: "Food", emoji: "🛒" }] };
  totals = { month, currency: "COP", totalsOverlap: true, categories: [{ categoryId: "food", name: "Food", nature: "Expense", minorUnits: 86_000_000 }] };
  categories = [{ id: "food", style: { emoji: "🛒", tone: "positive" } }];
  save.mockImplementation(async (request) => ({ replay: false, revision: {
    id: "revision", workspaceId: request.workspaceId, categoryId: request.categoryId, effectiveMonth: request.effectiveMonth,
    limitMinorUnits: request.limit.minorUnits, expectedRevisionId: request.expectedRevisionId,
    sequence: 1, idempotencyKey: request.idempotencyKey, createdBy: "owner", createdAt: 1,
  } }));
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render() {
  await act(async () => { root = create(createElement(BudgetRoute)); });
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
  expect(screen.findByProps({ accessibilityLabel: "Save this limit" }).props.disabled).toBe(true);
  expect(screen.findByProps({ accessibilityLabel: "Remaining jar" }).props.accessibilityValue).toEqual({ min: 0, max: 100, now: 0, text: "−COP 860.000 remaining" });
  expect(texts(screen)).toContain("This jar is already empty.");
  expect(["COP 600.000", "COP 800.000", "COP 1.000.000", "COP 1.200.000"].map((label) => screen.findByProps({ accessibilityLabel: label }).props.accessibilityLabel))
    .toEqual(["COP 600.000", "COP 800.000", "COP 1.000.000", "COP 1.200.000"]);
  await act(async () => screen.findByProps({ accessibilityLabel: "COP 1.000.000" }).props.onPress());
  expect(screen.findByProps({ accessibilityLabel: "Monthly limit" }).props.value).toBe("1.000.000");
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
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true,
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
  await act(async () => screen.findByProps({ accessibilityLabel: "COP 400.000" }).props.onPress());
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
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, availableCategories: [], jars: [{
    category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "live-revision", limitMinorUnits: 10_000_000, consumptionMinorUnits: 8_000_000,
  }] };
  const screen = await render();
  const jar = screen.findAll((node) => String(node.type) === "Pressable").find((node) => node.props.accessibilityLabel?.startsWith("Food:"));
  expect(jar?.props.style({ pressed: false })[1]).toEqual({ borderColor: "#047857", backgroundColor: "#f4f4f5" });
  await act(async () => screen.findByProps({ accessibilityLabel: "Food hit 80%" }).props.onPress());
  expect(screen.find((node) => String(node.type) === "EditorSheet").props).toMatchObject({ title: "Edit Budget", categoryFixed: true, amount: "100.000,00" });
  await act(async () => screen.find((node) => String(node.type) === "EditorSheet").props.onAmount("120.000"));
  const evaluationBeforeSave = queries.mock.calls.filter(([name]) => name === "budget:evaluate").at(-1);
  await act(async () => screen.find((node) => String(node.type) === "EditorSheet").props.onSave());
  expect(save.mock.calls[0][0]).toMatchObject({ categoryId: "food", expectedRevisionId: "live-revision", limit: { currency: "COP", minorUnits: 12_000_000 } });
  expect(reset).not.toHaveBeenCalled();
  expect(screen.findAll((node) => String(node.type) === "EditorSheet")).toHaveLength(0);
  expect(texts(screen)).toContain("Budgets");
  expect(texts(screen)).toContain("Budget saved");
  expect(queries.mock.calls.filter(([name]) => name === "budget:evaluate").at(-1)).not.toEqual(evaluationBeforeSave);
  await act(async () => screen.findByProps({ accessibilityLabel: "Back" }).props.onPress());
  expect(back).toHaveBeenCalledOnce();
});

test("loading waits for live data and rollover requests the new workspace month", async () => {
  board = undefined;
  const screen = await render();
  expect(screen.find((node) => String(node.type) === "ActivityIndicator").props.accessibilityLabel).toBe("Loading Budget");
  month = "2026-11";
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, availableCategories: [], jars: [] };
  await act(async () => root?.update(createElement(BudgetRoute)));
  expect(queries.mock.calls).toContainEqual(["budget:evaluate", { workspaceId: "workspace", month: "2026-11", refreshKey: expect.any(String) }]);
  expect(screen.findByProps({ accessibilityLabel: "Set a November limit" }).props.disabled).toBeFalsy();
});
