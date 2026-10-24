import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { useCategoryPicker } from "./useCategoryPicker";
import type { Category, CategoryPreset } from "./model";
import type { TransactionCategories } from "./transactionSelection";
import { canPostCategories } from "./transactionSelection";

const provider = vi.hoisted(() => ({ categories: [] as Category[], create: vi.fn(), restyle: vi.fn(), suggestion: null as null | { name: string; suggested: "spend" | "receive" | "stillMine" | "payDebt" | null }, account: vi.fn(() => true) }));
vi.mock("convex/react", () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: { name?: string; direction?: string } | "skip") => {
    const name = getFunctionName(reference);
    if (name.endsWith(":listUserCategories")) return provider.categories;
    if (name.endsWith(":listCategoryPresets")) return [];
    return args !== "skip" && args.name === provider.suggestion?.name
      ? provider.suggestion : undefined;
  },
  useAction: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference).endsWith(":createUserCategory") ? provider.create : provider.restyle,
}));
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); vi.clearAllMocks(); provider.suggestion = null; provider.account.mockReturnValue(true); });

function category(id: string, code = "same"): Category {
  return { id, workspaceId: "workspace", name: id, normalizedName: id, nature: "Expense", natureSource: "answered",
    classification: { kind: "fallback", version: "test" }, style: { emoji: "🏷️", tone: "primary" }, resolvedPostingAccountCode: code };
}

test("posting shows both money directions and switches the selected group after choosing a category", async () => {
  const salary = { ...category("salary"), nature: "Income" as const };
  const picker = await open([category("food"), salary]);
  expect(picker.sheet().options?.map((option) => option.key)).toEqual(["food", "salary"]);
  await act(async () => picker.sheet().onSelect("food"));
  await act(async () => picker.sheet().onSelect("salary"));
  expect(picker.value()).toEqual({ ids: ["salary"], primaryId: null });
  expect(picker.sheet().options?.map((option) => option.key)).toEqual(["food", "salary"]);
  await act(async () => picker.sheet().onSelect("food"));
  expect(picker.value()).toEqual({ ids: ["food"], primaryId: null });
  await act(async () => picker.sheet().onCreate());
  expect(picker.sheet().allowed).toEqual(["spend", "receive", "stillMine", "payDebt"]);
  await act(async () => { picker.sheet().onName("Bonus"); picker.sheet().onAnswer("receive"); });
  provider.create.mockResolvedValueOnce({ kind: "category", category: { ...category("bonus"), nature: "Income" } });
  await act(async () => picker.sheet().onConfirm());
  expect(picker.value()).toEqual({ ids: ["bonus"], primaryId: null });
  expect(provider.create.mock.calls[0][0].selection.answer).toBe("receive");
});
async function open(categories: Category[]) {
  provider.categories = categories;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let value: TransactionCategories = { ids: [], primaryId: null };
  let picker: ReturnType<typeof useCategoryPicker> | undefined;
  const close = vi.fn();
  function Harness() {
    picker = useCategoryPicker({ kind: "posting", workspaceId: "workspace", value, onAccountSetup: provider.account,
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

test("a category deleted while selected stays removable from the draft", async () => {
  const picker = await open([category("food")]);
  await act(async () => picker.sheet().onSelect("food"));
  provider.categories = [];
  await act(async () => picker.sheet().onSearch("unavailable"));
  expect(picker.sheet().options).toEqual([{ key: "food", name: "Unavailable category", style: { emoji: "✨", tone: "primary", color: "h270" }, selected: true }]);
  await act(async () => picker.sheet().onSelect("food"));
  expect(picker.value()).toEqual({ ids: [], primaryId: null });
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
  await act(async () => { picker.sheet().onName("Family weekend"); });
  expect(picker.value().ids).toEqual(["one", "two", "three"]);
  await act(async () => { if (picker.sheet().editor?.kind === "custom") picker.sheet().onAnswer("spend"); });
  provider.create.mockResolvedValueOnce({ kind: "category", category: category("encompassing") });
  await act(async () => picker.sheet().onConfirm());
  expect(picker.value()).toEqual({ ids: ["encompassing"], primaryId: null });
  expect(provider.create).toHaveBeenCalledWith({ workspaceId: "workspace", selection: { kind: "custom", name: "Family weekend", answer: "spend", style: { emoji: "✨", tone: "primary", color: "h270" } } });
});

test("adding a preset uses the same sheet without replacing selected categories", async () => {
  const picker = await open([category("family")]);
  await act(async () => picker.sheet().onSelect("family"));
  const preset: CategoryPreset = { id: "groceries", name: "Food", nature: "Expense" };
  await act(async () => picker.sheet().onPreset(preset));
  await act(async () => { if (picker.sheet().editor?.kind === "custom") picker.sheet().onAnswer("spend"); });
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

test("income creation requires receive and preserves the selected answer", async () => {
  const salary = { ...category("salary"), nature: "Income" as const };
  const picker = await open([category("food"), salary]);
  expect(picker.sheet().options?.map((option) => option.key)).toEqual(["food", "salary"]);
  await act(async () => picker.sheet().onCreate());
  await act(async () => { picker.sheet().onName("Bonus"); });
  await act(async () => { if (picker.sheet().editor?.kind === "custom") picker.sheet().onAnswer("receive"); });
  provider.create.mockResolvedValueOnce({ kind: "category", category: { ...category("bonus"), nature: "Income" } });
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create).toHaveBeenCalledWith({ workspaceId: "workspace", selection: { kind: "custom", name: "Bonus", answer: "receive", style: { emoji: "✨", tone: "primary", color: "h270" } } });
  expect(picker.value()).toEqual({ ids: ["bonus"], primaryId: null });
});


test("custom creation selects the new category, persists its look and closes", async () => {
  const picker = await open([category("food")]);
  await act(async () => picker.sheet().onSelect("food"));
  await act(async () => picker.sheet().onCreate());
  expect(picker.sheet().canConfirm).toBe(false);
  await act(async () => {
    picker.sheet().onName("  Weekend  ");
    picker.sheet().onStyle({ emoji: "👩🏽‍💻", tone: "primary", color: "olive" });
  });
  await act(async () => picker.sheet().onAnswer("spend"));
  expect(picker.sheet().canConfirm).toBe(true);
  await act(async () => { if (picker.sheet().editor?.kind === "custom") picker.sheet().onAnswer("spend"); });
  provider.create.mockResolvedValueOnce({ kind: "category", category: category("weekend") });
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create).toHaveBeenCalledWith({ workspaceId: "workspace", selection: {
    kind: "custom", name: "Weekend", answer: "spend", style: { emoji: "👩🏽‍💻", tone: "primary", color: "olive" },
  } });
  expect(picker.value()).toEqual({ ids: ["food", "weekend"], primaryId: null });
  expect(picker.close).toHaveBeenCalledOnce();
  expect(picker.sheet().editor).toBeNull();
});

test.each(["", "   ", "Food", " FÓOD  ", "food"])("creation blocks empty or duplicate name %j, including direct confirmation", async (name) => {
  const picker = await open([category("Food")]);
  await act(async () => picker.sheet().onCreate());
  await act(async () => picker.sheet().onName(name));
  expect(picker.sheet().canConfirm).toBe(false);
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create).not.toHaveBeenCalled();
  expect(picker.close).not.toHaveBeenCalled();
});

test.each([12, 43])("custom creation remains available with %i workspace categories even when search hides them", async (count) => {
  const picker = await open(Array.from({ length: count }, (_, index) => category(`category-${index}`)));
  await act(async () => picker.sheet().onSearch("New category"));
  expect(picker.sheet().options).toEqual([]);
  await act(async () => picker.sheet().onCreate());
  await act(async () => picker.sheet().onAnswer("spend"));
  expect(picker.sheet().canConfirm).toBe(true);
  await act(async () => { if (picker.sheet().editor?.kind === "custom") picker.sheet().onAnswer("spend"); });
  provider.create.mockResolvedValueOnce({ kind: "category", category: category("new-category") });
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create).toHaveBeenCalledWith({ workspaceId: "workspace", selection: {
    kind: "custom", name: "New category", answer: "spend", style: { emoji: "✨", tone: "primary", color: "h270" },
  } });
  expect(picker.value()).toEqual({ ids: ["new-category"], primaryId: null });
  expect(picker.close).toHaveBeenCalledOnce();
});

test.each([12, 43])("preset creation remains available with %i workspace categories", async (count) => {
  const picker = await open(Array.from({ length: count }, (_, index) => category(`category-${index}`)));
  await act(async () => picker.sheet().onPreset({ id: "groceries", name: "Food", nature: "Expense" }));
  await act(async () => picker.sheet().onAnswer("spend"));
  expect(picker.sheet().canConfirm).toBe(true);
  await act(async () => { if (picker.sheet().editor?.kind === "custom") picker.sheet().onAnswer("spend"); });
  provider.create.mockResolvedValueOnce({ kind: "category", category: category("new-food") });
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create).toHaveBeenCalledWith({ workspaceId: "workspace", selection: {
    kind: "preset", presetId: "groceries", style: { emoji: "✨", tone: "primary", color: "h270" },
  } });
  expect(picker.value()).toEqual({ ids: ["new-food"], primaryId: null });
  expect(picker.close).toHaveBeenCalledOnce();
});

test("Add your own at three explicitly replaces the set and selects the created category", async () => {
  const picker = await open([category("one"), category("two"), category("three")]);
  for (const id of ["one", "two", "three"])
    await act(async () => picker.sheet().onSelect(id));
  await act(async () => picker.sheet().onCreate());
  expect(picker.sheet().replacingSelection).toBe(true);
  await act(async () => picker.sheet().onName("Together"));
  await act(async () => { if (picker.sheet().editor?.kind === "custom") picker.sheet().onAnswer("spend"); });
  provider.create.mockResolvedValueOnce({ kind: "category", category: category("together") });
  await act(async () => picker.sheet().onConfirm());
  expect(picker.value()).toEqual({ ids: ["together"], primaryId: null });
  expect(picker.close).toHaveBeenCalledOnce();
});

test("a failed create leaves the selection and editor available for retry", async () => {
  const picker = await open([category("food")]);
  await act(async () => picker.sheet().onSelect("food"));
  await act(async () => picker.sheet().onCreate());
  await act(async () => picker.sheet().onName("Weekend"));
  await act(async () => picker.sheet().onAnswer("spend"));
  provider.create.mockRejectedValueOnce(new Error("offline"));
  await act(async () => picker.sheet().onConfirm());
  expect(picker.value()).toEqual({ ids: ["food"], primaryId: null });
  expect(picker.sheet().editor).toMatchObject({ kind: "custom", name: "Weekend" });
  expect(picker.sheet().error).toBe("Could not save this category. Try again.");
  expect(picker.sheet().busy).toBe(false);
  expect(picker.close).not.toHaveBeenCalled();
});


test("unknown custom names require an explicit allowed answer and reset it on rename", async () => {
  const picker = await open([]);
  await act(async () => picker.sheet().onCreate());
  await act(async () => picker.sheet().onName("Unrecognized idea"));
  expect(picker.sheet().canConfirm).toBe(false);
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create).not.toHaveBeenCalled();
  await act(async () => picker.sheet().onAnswer("receive"));
  expect(picker.sheet().canConfirm).toBe(true);
  await act(async () => picker.sheet().onAnswer("spend"));
  expect(picker.sheet().canConfirm).toBe(true);
  await act(async () => picker.sheet().onName("Another unknown"));
  expect(picker.sheet().canConfirm).toBe(false);
});

test.each(["stillMine", "payDebt"] as const)("%s routes to account setup without a category write and retains editor on refusal", async (answer) => {
  const picker = await open([]);
  await act(async () => picker.sheet().onCreate());
  await act(async () => picker.sheet().onName("My place"));
  await act(async () => picker.sheet().onAnswer(answer));
  provider.account.mockReturnValueOnce(false);
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create).not.toHaveBeenCalled();
  expect(provider.account).toHaveBeenCalledWith({ name: "My place", answer, style: { emoji: "✨", tone: "primary", color: "h270" } });
  expect(picker.sheet().editor?.kind).toBe("custom");
  expect(picker.sheet().error).toContain("unavailable");
  expect(picker.close).not.toHaveBeenCalled();
  provider.account.mockReturnValueOnce(true);
  await act(async () => picker.sheet().onConfirm());
  expect(picker.close).toHaveBeenCalledOnce();
});


test("the current name receives a visible suggestion that can be overridden", async () => {
  provider.suggestion = { name: "savings", suggested: "stillMine" };
  const picker = await open([]);
  await act(async () => picker.sheet().onCreate());
  await act(async () => picker.sheet().onName("  Sávings  "));
  expect(picker.sheet().suggested).toBe("stillMine");
  expect(picker.sheet().answer).toBe("stillMine");
  expect(picker.sheet().canConfirm).toBe(true);
  await act(async () => picker.sheet().onAnswer("spend"));
  provider.create.mockResolvedValueOnce({ kind: "category", category: category("savings-expense") });
  await act(async () => picker.sheet().onConfirm());
  expect(provider.create.mock.calls[0][0].selection.answer).toBe("spend");
  expect(provider.account).not.toHaveBeenCalled();
  await act(async () => picker.sheet().onCreate());
  await act(async () => picker.sheet().onName("Unrecognized later name"));
  expect(picker.sheet().suggested).toBeNull();
  expect(picker.sheet().canConfirm).toBe(false);
});
