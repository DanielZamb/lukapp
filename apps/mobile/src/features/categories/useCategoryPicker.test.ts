import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { useCategoryPicker } from "./useCategoryPicker";
import type { Category, CategoryPreset } from "./model";
import type { TransactionCategories } from "./transactionSelection";
import { canPostCategories } from "./transactionSelection";

const provider = vi.hoisted(() => ({ categories: [] as Category[], create: vi.fn(), restyle: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference);
    if (name.endsWith(":listUserCategories")) return provider.categories;
    if (name.endsWith(":listCategoryPresets")) return [];
    return null;
  },
  useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference).endsWith(":createUserCategory") ? provider.create : provider.restyle,
}));
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function category(id: string, code = "same"): Category {
  return { id, workspaceId: "workspace", name: id, normalizedName: id, nature: "Expense", natureSource: "answered",
    classification: { kind: "fallback", version: "test" }, style: { emoji: "🏷️", tone: "primary" }, resolvedPostingAccountCode: code };
}
async function open(categories: Category[], direction: "in" | "out" = "out") {
  provider.categories = categories;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let value: TransactionCategories = { ids: [], primaryId: null };
  let picker: ReturnType<typeof useCategoryPicker> | undefined;
  const close = vi.fn();
  function Harness() {
    picker = useCategoryPicker({ kind: "posting", workspaceId: "workspace", direction, value,
      onChange: (next) => { value = next; root?.update(createElement(Harness)); } }, close);
    return null;
  }
  await act(async () => { root = create(createElement(Harness)); });
  return {
    value: () => value, close,
    sheet: () => { if (!picker) throw new Error("No picker"); return picker.sheet; },
  };
}

test("the searchable sheet toggles up to three, prompts for an encompassing category above three and stays open", async () => {
  const picker = await open([category("food"), category("family"), category("weekend"), category("extra")]);
  for (const id of ["food", "family", "weekend", "extra"])
    await act(async () => picker.sheet().onSelect(id));
  expect(picker.value()).toEqual({ ids: ["food", "family", "weekend"], primaryId: null });
  expect(picker.sheet().limitReached).toBe(true);
  expect(picker.sheet().primaryOptions).toBeUndefined();
  expect(picker.sheet().options?.filter((option) => option.selected).map((option) => option.key)).toEqual(["food", "family", "weekend"]);
  expect(picker.close).not.toHaveBeenCalled();
  await act(async () => picker.sheet().onSearch("fám"));
  expect(picker.sheet().options?.map((option) => option.key)).toEqual(["family"]);
  await act(async () => picker.sheet().onSelect("family"));
  expect(picker.value()).toEqual({ ids: ["food", "weekend"], primaryId: null });
  expect(picker.sheet().limitReached).toBe(false);
});

test("only conflicting mappings ask for a primary and removing that identity clears the answer", async () => {
  const picker = await open([category("food", "groceries"), category("dining", "restaurants"), category("family", "groceries")]);
  await act(async () => { picker.sheet().onSelect("food"); });
  await act(async () => { picker.sheet().onSelect("family"); });
  expect(picker.sheet().primaryOptions).toBeUndefined();
  await act(async () => { picker.sheet().onSelect("dining"); });
  expect(picker.sheet().primaryOptions?.map((option) => option.key)).toEqual(["food", "dining", "family"]);
  expect(picker.value().primaryId).toBeNull();
  await act(async () => picker.sheet().onPrimary("outside"));
  expect(picker.value().primaryId).toBeNull();
  await act(async () => picker.sheet().onPrimary("dining"));
  expect(picker.value().primaryId).toBe("dining");
  await act(async () => picker.sheet().onSelect("dining"));
  expect(picker.value()).toEqual({ ids: ["food", "family"], primaryId: null });
  expect(picker.sheet().primaryOptions).toBeUndefined();
});

test("creating an encompassing category replaces the set only after explicit confirmation", async () => {
  const picker = await open([category("one"), category("two"), category("three"), category("four")]);
  for (const id of ["one", "two", "three", "four"])
    await act(async () => picker.sheet().onSelect(id));
  await act(async () => picker.sheet().onCreateEncompassing());
  await act(async () => { picker.sheet().onName("Family weekend"); picker.sheet().onAnswer("spend"); });
  expect(picker.value().ids).toEqual(["one", "two", "three"]);
  provider.create.mockResolvedValueOnce({ kind: "category", category: category("encompassing") });
  await act(async () => picker.sheet().onConfirm());
  expect(picker.value()).toEqual({ ids: ["encompassing"], primaryId: null });
  expect(provider.create).toHaveBeenCalledWith({ workspaceId: "workspace", selection: { kind: "custom", name: "Family weekend", answer: "spend", style: { emoji: "🏷️", tone: "primary" } } });
});

test("adding a preset uses the same sheet without replacing selected categories", async () => {
  const picker = await open([category("family")]);
  await act(async () => picker.sheet().onSelect("family"));
  const preset: CategoryPreset = { id: "groceries", name: "Food", nature: "Expense" };
  await act(async () => picker.sheet().onPreset(preset));
  provider.create.mockResolvedValueOnce({ kind: "category", category: category("new-food") });
  await act(async () => picker.sheet().onConfirm());
  expect(picker.value()).toEqual({ ids: ["family", "new-food"], primaryId: null });
});

test("posting waits for all selected classification details and an explicit primary only when needed", () => {
  const selected = { ids: ["food", "family"], primaryId: null };
  expect(canPostCategories(selected, undefined)).toBe(false);
  expect(canPostCategories(selected, [category("food")])).toBe(false);
  expect(canPostCategories(selected, [category("food"), category("family")])).toBe(true);
  const mixed = [category("food", "groceries"), category("family", "other")];
  expect(canPostCategories(selected, mixed)).toBe(false);
  expect(canPostCategories({ ...selected, primaryId: "outside" }, mixed)).toBe(false);
  expect(canPostCategories({ ...selected, primaryId: "food" }, mixed)).toBe(true);
});

test("income uses Income categories and receive classification answers in the shared picker", async () => {
  const salary = { ...category("salary"), nature: "Income" as const };
  const picker = await open([category("food"), salary], "in");
  expect(picker.sheet().options?.map((option) => option.key)).toEqual(["salary"]);
  await act(async () => picker.sheet().onCreate());
  expect(picker.sheet().allowedAnswers).toEqual(["receive", "stillMine", "payDebt"]);
  await act(async () => { picker.sheet().onName("Salary"); picker.sheet().onAnswer("receive"); });
  provider.create.mockResolvedValueOnce({ kind: "category", category: salary });
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create).toHaveBeenCalledWith({ workspaceId: "workspace", selection: { kind: "custom", name: "Salary", answer: "receive", style: { emoji: "🏷️", tone: "primary" } } });
  expect(picker.value()).toEqual({ ids: ["salary"], primaryId: null });
});
