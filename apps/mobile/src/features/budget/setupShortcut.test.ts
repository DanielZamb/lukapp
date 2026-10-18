import { themes } from "../../ui/tokens";
import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionReference } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { Budget } from "./Budget";
import { BudgetEditorSheet } from "./BudgetEditorSheet";

const backend = vi.hoisted(() => ({
  board: {
    month: "2026-10",
    currentMonth: "2026-10",
    currency: "COP",
    jars: [],
    availableCategories: [
      { id: "food", name: "Food", emoji: "🛒" },
      { id: "transport", name: "Transport", emoji: "🚌" },
    ],
  },
}));
vi.mock("convex/react", () => ({
  useQuery: (reference: FunctionReference<"query">) =>
    getFunctionName(reference) === "budget:evaluate" ? backend.board : [],
  useAction: () => vi.fn(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-key" }));
vi.mock("react-native", () => ({ ActivityIndicator: "spinner" }));
vi.mock("../../ui/core", () => ({ Screen: "screen", useTheme: () => themes.light }));
vi.mock("../useWorkspaceCalendar", () => ({
  useWorkspaceCalendar: () => ({ month: "2026-10" }),
}));
vi.mock("./BudgetBoard", () => ({ BudgetBoard: "board" }));
vi.mock("./BudgetEditorSheet", () => ({ BudgetEditorSheet: "editor" }));
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
async function open(initialCategoryId?: string) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => {
    root = create(
      createElement(Budget, {
        workspaceId: "workspace",
        timeZone: "America/Bogota",
        initialCategoryId,
        onBack: () => {},
      }),
    );
  });
}

test("setup shortcut opens the existing Add Budget editor with the first category selected", async () => {
  await open("food");
  const props = root?.root.findByType(BudgetEditorSheet).props;
  if (!props) throw new Error("Budget editor is not mounted");
  expect(props).toMatchObject({
    title: "Add Budget",
    categoryId: "food",
    amount: "",
    canSubmit: false,
  });
  await act(async () => props.onDismiss());
  expect(root?.root.findAllByType(BudgetEditorSheet)).toHaveLength(0);
});

test("ordinary budget entry and an unavailable category do not auto-open an editor", async () => {
  await open();
  expect(root?.root.findAllByType(BudgetEditorSheet)).toHaveLength(0);
  await act(async () => root?.unmount());
  await open("not-in-this-workspace");
  expect(root?.root.findAllByType(BudgetEditorSheet)).toHaveLength(0);
});
