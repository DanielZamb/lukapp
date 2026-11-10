import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CategoryManager } from "./CategoryManager";
import { ListRow } from "../../ui/core";
import type { Category } from "./model";

const provider = vi.hoisted(() => ({
  categories: [] as Category[], create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  backListeners: [] as (() => boolean)[],
}));
vi.mock("convex/react", () => ({
  useQuery: () => provider.categories,
  useAction: (reference: Parameters<typeof getFunctionName>[0]) => ({
    "accounting:createUserCategory": provider.create,
    "accounting:updateUserCategory": provider.update,
    "accounting:deleteUserCategory": provider.remove,
  })[getFunctionName(reference)],
}));
vi.mock("./useNatureSuggestion", () => ({ useNatureSuggestion: () => ({ suggested: null, allowed: ["spend", "receive", "stillMine", "payDebt"] }) }));
vi.mock("../setup/DeferredAccountSetup", () => ({ DeferredAccountSetup: "account-setup" }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "modal", BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
}));
vi.mock("react-native-gesture-handler", () => ({ ScrollView: "scroll" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "keyboard-viewport",
  ActivityIndicator: "spinner", Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  BackHandler: { addEventListener: (_: string, listener: () => boolean) => {
    provider.backListeners.push(listener);
    return { remove: () => { provider.backListeners.splice(provider.backListeners.indexOf(listener), 1); } };
  } },
}));

const palette: Category = {
  id: "cafe", workspaceId: "workspace", name: "Café", normalizedName: "cafe", nature: "Expense", natureSource: "answered",
  defaultPostingAccountCode: "519560", resolvedPostingAccountCode: "519560",
  classification: { kind: "lexicon", concept: "dining", version: "category-es-en@1" }, style: { emoji: "☕", tone: "primary", color: "h270" },
};
const imported: Category = { ...palette, id: "gym", name: "Gym", normalizedName: "gym", style: { emoji: "🏋️", tone: "positive", color: "#a1b2c3" } };
let root: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  provider.backListeners.length = 0;
  provider.categories = [palette];
  provider.update.mockImplementation(async (args: { name: string; style: Category["style"] }) => ({ ...palette, ...args }));
  provider.create.mockResolvedValue({ kind: "category", category: { ...palette, id: "fresh" } });
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

async function render() {
  await act(async () => { root = create(createElement(CategoryManager, { workspaceId: "workspace", subject: "owner",
    profileId: "cash", currency: "COP", timeZone: "America/Bogota", onBack: vi.fn() })); });
  if (!root) throw new Error("not mounted");
  return root.root;
}
const buttons = (screen: ReactTestInstance, label: string) =>
  screen.findAll((node) => node.type === "button" && node.props.accessibilityLabel === label);
async function press(screen: ReactTestInstance, label: string) {
  const [button] = buttons(screen, label).slice(-1);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => button.props.onPress());
}
const input = (screen: ReactTestInstance, label: string) =>
  screen.find((node) => node.type === "input" && node.props.accessibilityLabel === label);
const type = (screen: ReactTestInstance, label: string, text: string) => act(async () => input(screen, label).props.onChangeText(text));
const texts = (screen: ReactTestInstance) => screen.findAllByType("text").map((node) => node.children.join(""));
const previewChip = (screen: ReactTestInstance) => screen.findAllByType("view").find((node) => Array.isArray(node.props.style) &&
  node.findAllByType("text", { deep: false }).some((text) => ["Weekend", "Café"].includes(text.children.join(""))));
async function openCategory(screen: ReactTestInstance, name: string) {
  await act(async () => screen.findAllByType(ListRow).find((row) => row.props.title === name)?.props.onPress());
}
async function pressBack() {
  for (const listener of [...provider.backListeners].reverse()) if (listener()) return;
}

test("creating a category with a custom color saves the exact hex and previews it on the category chip", async () => {
  const screen = await render();
  await press(screen, "Add category");
  await type(screen, "Category name", "Weekend");
  await press(screen, "I spend it");
  await press(screen, "Custom color");
  expect(texts(screen)).toContain("Pick a color");
  expect(input(screen, "Hex color code").props.value).toBe("#57218C");
  await type(screen, "Hex color code", "#2e7d32");
  expect(previewChip(screen)?.props.style).toContainEqual({ backgroundColor: "#2E7D3224", borderColor: "#2E7D32" });
  await press(screen, "Use this color");
  expect(texts(screen)).not.toContain("Pick a color");
  expect(buttons(screen, "Custom color #2E7D32")[0]?.props.accessibilityState).toMatchObject({ selected: true });
  await press(screen, "Add category");
  expect(provider.create.mock.calls).toEqual([[{ workspaceId: "workspace", selection: {
    kind: "custom", name: "Weekend", answer: "spend", style: { emoji: "✨", tone: "primary", color: "#2E7D32" },
  } }]]);
});

test("editing builds an exact color from hue, saturation and lightness and saves it", async () => {
  const screen = await render();
  await openCategory(screen, "Café");
  await press(screen, "Custom color");
  await press(screen, "Hue 0 degrees");
  await press(screen, "Saturation 100 percent");
  await press(screen, "Lightness 50 percent");
  expect(input(screen, "Hex color code").props.value).toBe("#FF0000");
  expect(buttons(screen, "Lightness 50 percent")[0]?.props.accessibilityState).toEqual({ selected: true });
  await press(screen, "Lightness 90 percent");
  expect(input(screen, "Hex color code").props.value).toBe("#FFCCCC");
  expect(previewChip(screen)?.props.style).toContainEqual({ backgroundColor: "#FFCCCC24", borderColor: "#8a8a8a" });
  await press(screen, "Use this color");
  await press(screen, "Save changes");
  expect(provider.update.mock.calls).toEqual([[{ workspaceId: "workspace", categoryId: "cafe", name: "Café",
    style: { emoji: "☕", tone: "primary", color: "#FFCCCC" } }]]);
});

test("an invalid hex cannot be used and says why", async () => {
  const screen = await render();
  await openCategory(screen, "Café");
  await press(screen, "Custom color");
  for (const typed of ["#12345", "#12345G", "blue"]) {
    await type(screen, "Hex color code", typed);
    expect(screen.findAll((node) => node.type === "text" && node.props.accessibilityRole === "alert")
      .map((node) => node.children.join(""))).toEqual(["Use # and six characters from 0–9 and A–F."]);
    expect(buttons(screen, "Use this color")[0]?.props.accessibilityState.disabled).toBe(true);
    await press(screen, "Use this color");
    expect(texts(screen)).toContain("Pick a color");
  }
  expect(previewChip(screen)?.props.style).toContainEqual({ backgroundColor: "#57218c24", borderColor: "#57218c" });
});

test("Cancel and Android Back close the picker and keep the previous color", async () => {
  const screen = await render();
  await openCategory(screen, "Café");
  for (const close of ["cancel", "android-back"]) {
    await press(screen, "Custom color");
    await type(screen, "Hex color code", "#123456");
    expect(previewChip(screen)?.props.style).toContainEqual({ backgroundColor: "#12345624", borderColor: "#123456" });
    if (close === "cancel") await press(screen, "Cancel");
    else await act(async () => pressBack());
    expect(texts(screen)).not.toContain("Pick a color");
    expect(buttons(screen, "Save changes")).toHaveLength(1);
    expect(previewChip(screen)?.props.style).toContainEqual({ backgroundColor: "#57218c24", borderColor: "#57218c" });
  }
  await type(screen, "Category name", "Cafecito");
  await press(screen, "Save changes");
  expect(provider.update.mock.calls).toEqual([[{ workspaceId: "workspace", categoryId: "cafe", name: "Cafecito", style: palette.style }]]);
});

test("a stored exact color survives a name-only or emoji-only edit and shows as the custom choice", async () => {
  provider.categories = [palette, imported];
  const screen = await render();
  await openCategory(screen, "Gym");
  expect(buttons(screen, "Custom color #a1b2c3")[0]?.props.accessibilityState).toMatchObject({ selected: true });
  expect(buttons(screen, "Color h270")[0]?.props.accessibilityState).toMatchObject({ selected: false });
  await type(screen, "Category name", "Gym & pool");
  await press(screen, "Save changes");
  await openCategory(screen, "Gym");
  await press(screen, "Emoji 🎮");
  await press(screen, "Save changes");
  expect(provider.update.mock.calls.map(([args]) => [args.name, args.style])).toEqual([
    ["Gym & pool", { emoji: "🏋️", tone: "positive", color: "#a1b2c3" }],
    ["Gym", { emoji: "🎮", tone: "positive", color: "#a1b2c3" }],
  ]);
});

test("choosing a palette swatch after a custom color stores the palette id as before", async () => {
  provider.categories = [imported];
  const screen = await render();
  await openCategory(screen, "Gym");
  await press(screen, "Color h150");
  expect(buttons(screen, "Custom color")[0]?.props.accessibilityState).toMatchObject({ selected: false });
  await press(screen, "Save changes");
  expect(provider.update.mock.calls[0]?.[0].style).toEqual({ emoji: "🏋️", tone: "positive", color: "h150" });
});
