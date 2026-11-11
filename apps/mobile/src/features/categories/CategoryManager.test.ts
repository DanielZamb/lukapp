import * as React from "react";
import { createElement, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CategoryManager } from "./CategoryManager";
import { CategorySheet } from "./CategorySheet";
import { ListRow } from "../../ui/core";
import type { Category, AccountSetupRequest } from "./model";

const provider = vi.hoisted(() => ({ categories: [] as Category[], create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: () => provider.categories,
  useAction: (reference: Parameters<typeof getFunctionName>[0]) => {
    switch (getFunctionName(reference)) {
      case "accounting:createUserCategory": return provider.create;
      case "accounting:updateUserCategory": return provider.update;
      case "accounting:deleteUserCategory": return provider.remove;
      default: throw new Error("Unexpected action");
    }
  },
}));
vi.mock("./useNatureSuggestion", () => ({ useNatureSuggestion: () => ({ suggested: null, allowed: ["spend", "receive", "stillMine", "payDebt"] }) }));
vi.mock("./CategorySheet", () => ({ CategorySheet: (props: ComponentProps<typeof CategorySheet>) => createElement("category-sheet", props) }));
vi.mock("../setup/DeferredAccountSetup", () => ({ DeferredAccountSetup: ({ request }: { request: AccountSetupRequest }) => createElement("account-setup", { request }) }));
vi.mock("@gorhom/bottom-sheet", () => ({ BottomSheetModal: "modal" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport",
  ActivityIndicator: "spinner", Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input",
  BackHandler: { addEventListener: () => ({ remove: () => {} }) },
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
const category: Category = {
  id: "cafe", workspaceId: "workspace", name: "Café", normalizedName: "cafe", nature: "Expense", natureSource: "answered",
  defaultPostingAccountCode: "519560", resolvedPostingAccountCode: "519560",
  classification: { kind: "lexicon", concept: "dining", version: "category-es-en@1" }, style: { emoji: "☕", tone: "primary" },
};
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  provider.categories = [category]; vi.resetAllMocks();
  provider.update.mockResolvedValue(category); provider.remove.mockResolvedValue(null);
  provider.create.mockResolvedValue({ kind: "category", category: { ...category, id: "fresh" } });
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(initialCategoryId?: string) {
  await act(async () => { root = create(createElement(CategoryManager, { workspaceId: "workspace", subject: "owner",
    profileId: "cash", currency: "COP", timeZone: "America/Bogota", onBack: vi.fn(), initialCategoryId })); });
}
function tree() { if (!root) throw new Error("Manager not mounted"); return root.root; }
function sheet() { return tree().findByType(CategorySheet).props; }
async function press(label: string) {
  const button = tree().findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.props.onPress());
}
async function openCategory() { await act(async () => tree().findByType(ListRow).props.onPress()); }

test("a category opens with its current name and look and saves through the update API", async () => {
  await render(); await openCategory();
  expect(sheet().editor).toMatchObject({ kind: "edit", name: "Café", category });
  await act(async () => sheet().onName("Weekend"));
  await act(async () => sheet().onConfirm());
  expect(provider.update).toHaveBeenCalledExactlyOnceWith({ workspaceId: "workspace", categoryId: "cafe", name: "Weekend", style: category.style });
  expect(provider.create).not.toHaveBeenCalled();
  expect(sheet().editor).toBeNull();
});

test("unknown creation names need an explicit answer and preserve the chosen money direction", async () => {
  await render(); await press("Add category");
  await act(async () => sheet().onName("Side projects"));
  expect(sheet().canConfirm).toBe(false);
  await act(async () => sheet().onAnswer("receive"));
  expect(sheet().canConfirm).toBe(true);
  await act(async () => sheet().onConfirm());
  expect(provider.create).toHaveBeenCalledExactlyOnceWith({ workspaceId: "workspace", selection: {
    kind: "custom", name: "Side projects", answer: "receive", style: { emoji: "✨", tone: "primary", color: "h270" },
  } });
});

test("a duplicate normalized name blocks saving without a request", async () => {
  await render(); await press("Add category");
  await act(async () => { sheet().onName(" CAFE "); });
  await act(async () => sheet().onAnswer("spend"));
  expect(sheet().canConfirm).toBe(false);
  expect(sheet().error).toBe("You already have a category with that name.");
  await act(async () => sheet().onConfirm());
  expect(provider.create).not.toHaveBeenCalled();
});

test("deletion requires confirmation and cancel sends no delete request", async () => {
  await render(); await openCategory();
  await act(async () => sheet().onDelete?.());
  expect(sheet().deleting?.snapshot).toEqual({ categoryId: "cafe", name: "Café" });
  expect(provider.remove).not.toHaveBeenCalled();
  await act(async () => sheet().onCancelDelete?.());
  expect(sheet().deleting).toBeNull();
  await act(async () => sheet().onDelete?.());
  await act(async () => sheet().onConfirmDelete?.(sheet().deleting!));
  expect(provider.remove).toHaveBeenCalledExactlyOnceWith({ workspaceId: "workspace", categoryId: "cafe" });
});

test("an in-flight save blocks duplicate submissions and keeps failure answers available for retry", async () => {
  let rejectSave: ((error: unknown) => void) | undefined;
  provider.update.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectSave = reject; }));
  await render(); await openCategory();
  await act(async () => sheet().onName("Weekend"));
  await act(async () => { sheet().onConfirm(); sheet().onConfirm(); });
  expect(provider.update).toHaveBeenCalledTimes(1);
  expect(sheet().busy).toBe(true);
  await act(async () => rejectSave?.(new ConvexError({ code: "category_name_conflict" })));
  expect(sheet().busy).toBe(false);
  expect(sheet().editor).toMatchObject({ name: "Weekend" });
  expect(sheet().error).toBe("You already have a category with that name.");
  await act(async () => sheet().onConfirm());
  expect(provider.update).toHaveBeenCalledTimes(2);
});

test.each(["stillMine", "payDebt"] as const)("%s waits for category-sheet dismissal before account setup and writes no category", async (answer) => {
  await render(); await press("Add category");
  await act(async () => sheet().onName("Reserve"));
  await act(async () => sheet().onAnswer(answer));
  await act(async () => sheet().onConfirm());
  expect(provider.create).not.toHaveBeenCalled();
  expect(tree().findAll((node) => String(node.type) === "account-setup")).toHaveLength(0);
  await act(async () => sheet().onDismiss());
  expect(tree().find((node) => String(node.type) === "account-setup").props.request).toMatchObject({ name: "Reserve", answer });
});

test("a category detail link opens that category and search narrows the list", async () => {
  provider.categories = [category, { ...category, id: "salary", name: "Salary", normalizedName: "salary", nature: "Income" }];
  await render("cafe");
  expect(sheet().editor).toMatchObject({ kind: "edit", category: { id: "cafe" } });
  const search = tree().findByType("input");
  await act(async () => search.props.onChangeText("salary"));
  expect(tree().findAllByType(ListRow).map((row) => row.props.title)).toEqual(["Salary"]);
});

test("a Confirm delete kept from the confirming render deletes nothing once the confirmation was cancelled", async () => {
  await render(); await openCategory();
  await act(async () => sheet().onDelete?.());
  const shown = sheet().deleting!;
  const kept = sheet().onConfirmDelete;
  await act(async () => sheet().onCancelDelete?.());
  await act(async () => kept?.(shown));
  expect(provider.remove).not.toHaveBeenCalled();
  expect(sheet().deleting).toBeNull();
});

test("a Save kept from before the name changed renames to the name the sheet shows", async () => {
  await render(); await openCategory();
  await act(async () => sheet().onName("Week"));
  const kept = sheet().onConfirm;
  await act(async () => sheet().onName("Weekend"));
  await act(async () => kept());
  expect(provider.update.mock.calls.map(([request]) => request)).toEqual([
    { workspaceId: "workspace", categoryId: "cafe", name: "Weekend", style: category.style },
  ]);
});

test("fourth review, finding 4: two presses of the first Delete, before the sheet shows the confirmation, delete nothing", async () => {
  await render(); await openCategory();
  const first = sheet().onDelete;
  await act(async () => { first?.(); first?.(); });
  expect(provider.remove).not.toHaveBeenCalled();
  expect(sheet().deleting?.snapshot).toEqual({ categoryId: "cafe", name: "Café" });
  const confirm = sheet().onConfirmDelete!;
  const shown = sheet().deleting!;
  await act(async () => { confirm(shown); confirm(shown); });
  expect(provider.remove).toHaveBeenCalledExactlyOnceWith({ workspaceId: "workspace", categoryId: "cafe" });
});

test("a confirmation kept from one category deletes nothing after a late row press opens another", async () => {
  provider.categories = [category, { ...category, id: "salary", name: "Salary", normalizedName: "salary", nature: "Income" }];
  await render();
  const row = (title: string) => tree().findAllByType(ListRow).find((each) => each.props.title === title)!.props.onPress as () => void;
  await act(async () => row("Café")());
  await act(async () => sheet().onDelete?.());
  const shown = sheet().deleting!;
  const confirm = sheet().onConfirmDelete!;
  const salary = row("Salary");
  await act(async () => { salary(); confirm(shown); });
  expect(provider.remove).not.toHaveBeenCalled();
  expect(sheet().editor).toMatchObject({ kind: "edit", category: { id: "salary" } });
  expect(sheet().deleting).toBeNull();
});
