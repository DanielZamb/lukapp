import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import BudgetRoute from "../../../app/budget";
import { api } from "../api";
import type { Category } from "../categories/model";
import type { BudgetTransport } from "./useBudgetEditor";

type Evaluation = FunctionReturnType<typeof api.budget.evaluate>;
let board: Evaluation | undefined;
let categories: Pick<Category, "id" | "style">[] | undefined;
let priorTotals: FunctionReturnType<typeof api.accounting.categoryTotals> | undefined;
let month = "2026-10";
const queries = vi.fn();
const save = vi.fn<BudgetTransport["save"]>();
const back = vi.fn();
vi.mock("expo-router", () => ({ router: { back: () => back() }, Redirect: "Redirect" }));
vi.mock("expo-crypto", () => {
  let sequence = 0;
  return { randomUUID: () => `key-${++sequence}` };
});
vi.mock("convex/react", () => ({
  useQuery: (reference: FunctionReference<"query">, args: unknown) => {
    const name = getFunctionName(reference);
    queries(name, args);
    if (args === "skip") return undefined;
    if (name === "accounting:categoryTotals") return priorTotals;
    return name === "budget:evaluate" ? board : categories;
  },
  useAction: () => save,
}));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({ workspace: { id: "workspace", timeZone: "America/Bogota" } }) }));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ month }) }));
vi.mock("./BudgetEditorSheet", () => ({ BudgetEditorSheet: "EditorSheet" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "Sheet", BottomSheetScrollView: "SheetScroll", BottomSheetBackdrop: "Backdrop",
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  queries.mockClear(); save.mockReset(); back.mockClear();
  month = "2026-10";
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, jars: [],
    availableCategories: [{ id: "food", name: "Food", emoji: "🛒" }] };
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

test("the empty action opens the existing add sheet and saves a current-workspace-month limit", async () => {
  const screen = await render();
  expect(queries.mock.calls).toContainEqual(["budget:evaluate", { workspaceId: "workspace", month: "2026-10", refreshKey: expect.any(String) }]);
  expect(queries.mock.calls).toContainEqual(["accounting:listUserCategories", { workspaceId: "workspace" }]);
  await act(async () => screen.findByProps({ accessibilityLabel: "Set a October limit" }).props.onPress());
  expect(screen.find((node) => String(node.type) === "EditorSheet").props).toMatchObject({
    title: "Add Budget", monthLabel: "October 2026", categoryFixed: false,
    categories: [{ id: "food", name: "Food", emoji: "🛒" }],
  });
  await act(async () => {
    const editor = screen.find((node) => String(node.type) === "EditorSheet");
    editor.props.onCategory("food");
    editor.props.onAmount("100.000");
  });
  await act(async () => screen.find((node) => String(node.type) === "EditorSheet").props.onSave());
  expect(save.mock.calls).toEqual([[{
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 10_000_000 },
    expectedRevisionId: null, idempotencyKey: expect.any(String),
  }]]);
  expect(screen.findAll((node) => String(node.type) === "EditorSheet")).toHaveLength(0);
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""))).toContain("Budget saved");
});

test("the live next action opens the current jar revision and uses the category's saved color", async () => {
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, availableCategories: [], jars: [{
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
    .not.toContain("September Food spent COP 73.123,45. Saving applies to October and future months.");
  await act(async () => screen.findByProps({ accessibilityLabel: "Limit $120K" }).props.onPress());
  expect(screen.findByProps({ accessibilityLabel: "Limit $120K" }).props.accessibilityState).toMatchObject({ selected: true });
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join("")))
    .toContain("September Food spent COP 73.123,45. Saving applies to October and future months.");
  await act(async () => screen.findByProps({ accessibilityLabel: "Save October" }).props.onPress());
  expect(save.mock.calls[0][0]).toMatchObject({ categoryId: "food", expectedRevisionId: "live-revision", limit: { currency: "COP", minorUnits: 12_000_000 } });
  await act(async () => screen.findByProps({ accessibilityLabel: "Back" }).props.onPress());
  expect(back).toHaveBeenCalledOnce();
});

test("a jar tap updates an overdrawn jar and Close leaves Set another limit on the existing add editor", async () => {
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true,
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
  expect(screen.find((node) => String(node.type) === "EditorSheet").props).toMatchObject({
    title: "Add Budget", categoryFixed: false, categories: [{ id: "travel", name: "Travel", emoji: "✈️" }],
  });
});

test.each([20_000_000, -20_000_000, -30_000_000])("duplicate or non-positive spend suggestion for %s is dropped, and missing prior activity displays zero", async (consumptionMinorUnits) => {
  month = "2027-01";
  priorTotals = { month: "2026-12", currency: "COP", totalsOverlap: true, categories: [] };
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, availableCategories: [], jars: [{
    category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "revision", limitMinorUnits: 40_000_000, consumptionMinorUnits,
  }] };
  const screen = await render();
  await act(async () => screen.findByProps({ accessibilityLabel: "Change January's limit" }).props.onPress());
  expect(screen.findAll((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel?.startsWith("Limit "))
    .map((node) => node.props.accessibilityLabel)).toEqual(["Limit $400K", "Limit $480K"]);
  expect(queries.mock.calls).toContainEqual(["accounting:categoryTotals", { workspaceId: "workspace", month: "2026-12" }]);
  await act(async () => screen.findByProps({ accessibilityLabel: "Limit $480K" }).props.onPress());
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join("")))
    .toContain("December Food spent COP 0,00. Saving applies to January and future months.");
  await act(async () => screen.findByType(BottomSheetModal).props.onDismiss());
  expect(screen.findAllByType(BottomSheetModal)).toHaveLength(0);
});

test("prior spend loads without a fabricated zero, and uncertain saves freeze chips and dismissal until retry", async () => {
  priorTotals = undefined;
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, availableCategories: [], jars: [{
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
  expect(text()).toContain("September Food spent COP 650.000,00. Saving applies to October and future months.");
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
  board = { month, currentMonth: month, currency: "COP", totalsOverlap: true, availableCategories: [], jars: [] };
  await act(async () => root?.update(createElement(BudgetRoute)));
  expect(queries.mock.calls).toContainEqual(["budget:evaluate", { workspaceId: "workspace", month: "2026-11", refreshKey: expect.any(String) }]);
  expect(screen.findByProps({ accessibilityLabel: "Set a November limit" }).props.disabled).toBeFalsy();
});
