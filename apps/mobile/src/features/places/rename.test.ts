import * as React from "react";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Place } from "./model";

const state = vi.hoisted(() => ({
  back: vi.fn(), push: vi.fn(), rename: vi.fn(), changeLook: vi.fn(), present: vi.fn(), dismiss: vi.fn(),
  reportFailure: vi.fn((_error: unknown) => false), accounts: [] as Place[], listeners: [] as (() => boolean)[],
}));
vi.mock("expo-router", () => ({
  router: { push: state.push, back: state.back }, Redirect: "redirect", useLocalSearchParams: () => ({ profileId: "daily" }),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return { useAction: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "accounting:renameAccount" ? state.rename : state.changeLook };
});
vi.mock("./EmojiSheet", () => ({ EmojiSheet: "emoji-sheet" }));
vi.mock("@gorhom/bottom-sheet", async () => {
  const { forwardRef, useImperativeHandle, createElement } = await import("react");
  return {
    BottomSheetModal: forwardRef(({ children, onDismiss, ...props }: { children?: ReactNode; onDismiss: () => void }, ref) => {
      useImperativeHandle(ref, () => ({ present: state.present, dismiss: () => { state.dismiss(); onDismiss(); } }), [onDismiss]);
      return createElement("sheet", { ...props, onDismiss }, children);
    }),
    BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
  };
});
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  BackHandler: { addEventListener: (_event: string, listener: () => boolean) => {
    state.listeners.push(listener);
    return { remove: () => { state.listeners = state.listeners.filter((item) => item !== listener); } };
  } },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => state.reportFailure }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", functionalCurrency: "COP", timeZone: "America/Bogota" },
    financialAccountProfile: { id: "daily" } }),
  usePostedActivity: () => ({ accounts: state.accounts }),
  useRecentActivity: () => ({ page: [] }),
}));
import AccountRoute from "../../../app/account";
import { LanguageProvider } from "../../i18n";
import { historyListRow } from "../history/listModel";

const daily: Place = { financialAccountProfileId: "daily", name: "Daily", nature: "Asset", productKind: "bankAccount",
  trackingFrom: "2026-09-24", balance: { currency: "COP", minorUnits: 10000 } };
const savings: Place = { ...daily, financialAccountProfileId: "savings", name: "Savings", productKind: "savingsAccount" };
const receipt = { id: "daily", workspaceId: "ws", name: "Everyday", productKind: "bankAccount" as const, ledgerAccountId: "ledger" };
let root: ReactTestRenderer | undefined;
let language: "en" | "es" = "en";
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.reportFailure.mockImplementation(() => false);
  state.accounts = [daily, savings];
  state.listeners = [];
  language = "en";
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

const page = () => createElement(LanguageProvider, { initialPreference: language }, createElement(AccountRoute));
async function render() { await act(async () => { root = create(page()); }); }
async function refresh() { await act(async () => root?.update(page())); }
function tree() { if (!root) throw new Error("Account not mounted"); return root.root; }
function texts() { return tree().findAllByType("text").map((node) => node.children.join("")); }
function button(label: string) {
  const found = tree().findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function nameRow() { return tree().find((node) => node.props.title === "Name" && typeof node.props.onPress === "function"); }
function input() {
  return tree().findAll((node) => node.type === "input"
    && [placeLabel.en, placeLabel.es].includes(node.props.accessibilityLabel))[0];
}
const placeLabel = { en: "Place name", es: "Nombre del lugar" };
function alerts() { return tree().findAll((node) => node.type === "text" && node.props.accessibilityRole === "alert").map((node) => node.children.join("")); }
async function openSheet() { await act(async () => nameRow().props.onPress()); }
async function type(value: string) { await act(async () => input().props.onChangeText(value)); }
async function save(label = "Save name") { await act(async () => button(label).props.onPress()); }
async function systemBack() {
  await act(async () => {
    for (const listener of [...state.listeners].reverse()) if (listener()) return;
    state.back();
  });
}

test("Name opens a one-field sheet that renames against the last-read name and returns to the same page", async () => {
  state.rename.mockResolvedValue(receipt);
  await render();
  expect(nameRow().props.value).toBe("Daily");
  await openSheet();
  expect(state.present).toHaveBeenCalledOnce();
  expect(input().props).toMatchObject({ value: "Daily", editable: true });
  await type("  Everyday  ");
  await save();
  expect(state.rename.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "daily", name: "Everyday", expectedName: "Daily",
  }]]);
  expect(input()).toBeUndefined();
  expect(state.back).not.toHaveBeenCalled();
  expect(state.push).not.toHaveBeenCalled();
  state.accounts = [{ ...daily, name: "Everyday" }, savings];
  await refresh();
  expect(texts().slice(0, 2)).toEqual(["PLACE", "Everyday"]);
  expect(nameRow().props.value).toBe("Everyday");
});

test("blank and unchanged names send nothing, and closing the sheet sends nothing", async () => {
  await render();
  await openSheet();
  await type("   ");
  expect(alerts()).toEqual(["Enter a name for this place."]);
  expect(button("Save name").props.disabled).toBe(true);
  await type(" Daily ");
  expect(alerts()).toEqual([]);
  expect(button("Save name").props.disabled).toBe(true);
  await type("Fresh");
  expect(button("Save name").props.disabled).toBe(false);
  await systemBack();
  expect(input()).toBeUndefined();
  expect(state.rename).not.toHaveBeenCalled();
});

test.each([
  { code: "account_name_conflict", typed: "Savings", message: "Another place is already called “Savings”. Choose a different name." },
  { code: "name_required", typed: "Fresh", message: "Enter a name for this place." },
  { code: "financial_account_profile_not_found", typed: "Fresh", message: "This place is no longer available." },
  { code: "workspace_membership_required", typed: "Fresh", message: "The name was not saved. Try again." },
])("$code keeps the typed name and explains the refusal", async ({ code, typed, message }) => {
  state.rename.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code, message: "internal wording" }));
  await render();
  await openSheet();
  await type(typed);
  await save();
  expect(alerts()).toEqual([message]);
  expect(input().props).toMatchObject({ value: typed, editable: true });
  expect(button("Save name").props.disabled).toBe(false);
  expect(JSON.stringify(root?.toJSON())).not.toContain(code);
});

test("a stale name shows the current name, keeps the typed one and saves against the refreshed name", async () => {
  state.rename.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "account_name_stale" }))
    .mockResolvedValueOnce(receipt);
  await render();
  await openSheet();
  await type("Everyday");
  await save();
  state.accounts = [{ ...daily, name: "Daily shared" }, savings];
  await refresh();
  expect(alerts()).toEqual([
    "This place was renamed somewhere else. It is now called “Daily shared”. Your name is still here; save again to use it.",
  ]);
  expect(input().props.value).toBe("Everyday");
  await save();
  expect(state.rename.mock.calls.map(([request]) => request)).toEqual([
    { workspaceId: "ws", financialAccountProfileId: "daily", name: "Everyday", expectedName: "Daily" },
    { workspaceId: "ws", financialAccountProfileId: "daily", name: "Everyday", expectedName: "Daily shared" },
  ]);
  expect(input()).toBeUndefined();
});

test("an uncertain rename stays frozen, survives system back, and retries the identical command", async () => {
  state.rename.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(receipt);
  await render();
  await openSheet();
  await type("Everyday");
  await save();
  expect(alerts()).toEqual(["Could not confirm the new name. Retry to safely check the same change."]);
  expect(input().props).toMatchObject({ value: "Everyday", editable: false });
  await type("Something else");
  expect(input().props.value).toBe("Everyday");
  await systemBack();
  expect(input()).toBeDefined();
  expect(state.back).not.toHaveBeenCalled();
  expect(tree().findByType("sheet" as never).props.enablePanDownToClose).toBe(false);
  state.accounts = [{ ...daily, name: "Everyday" }, savings];
  await refresh();
  await save("Retry saving the name");
  const first = { workspaceId: "ws", financialAccountProfileId: "daily", name: "Everyday", expectedName: "Daily" };
  expect(state.rename.mock.calls.map(([request]) => request)).toEqual([first, first]);
  expect(input()).toBeUndefined();
});

test("an access failure goes to the device handler and the retry repeats the same command", async () => {
  const revoked = new ConvexError({ code: "device_revoked" });
  state.reportFailure.mockImplementation((error) => error === revoked);
  state.rename.mockRejectedValueOnce(revoked).mockResolvedValueOnce(receipt);
  await render();
  await openSheet();
  await type("Everyday");
  await save();
  expect(state.reportFailure).toHaveBeenCalledWith(revoked);
  expect(input().props.editable).toBe(false);
  await save("Retry saving the name");
  expect(state.rename.mock.calls[1][0]).toEqual(state.rename.mock.calls[0][0]);
  expect(state.rename.mock.calls[0][0]).toEqual({
    workspaceId: "ws", financialAccountProfileId: "daily", name: "Everyday", expectedName: "Daily",
  });
});

test("system back and sheet dismissal close the sheet before the page, twice, without stacking", async () => {
  await render();
  for (const close of ["back", "dismiss"] as const) {
    await openSheet();
    expect(tree().findAllByType("sheet" as never)).toHaveLength(1);
    expect(state.listeners).toHaveLength(1);
    if (close === "back") await systemBack();
    else await act(async () => tree().findByType("sheet" as never).props.onDismiss());
    expect(tree().findAllByType("sheet" as never)).toHaveLength(0);
    expect(state.listeners).toHaveLength(0);
    expect(texts().slice(0, 2)).toEqual(["PLACE", "Daily"]);
  }
  expect(state.back).not.toHaveBeenCalled();
  await systemBack();
  expect(state.back).toHaveBeenCalledOnce();
});

test.each([
  { lang: "en" as const, label: "My money", canSave: false },
  { lang: "es" as const, label: "Mi plata", canSave: true },
])("a sole place with its setup name shows the $lang label and saving it stores what the person saw", async ({ lang, label, canSave }) => {
  language = lang;
  state.accounts = [{ ...daily, name: "My money" }];
  state.rename.mockResolvedValue({ ...receipt, name: label });
  await render();
  expect(texts().slice(0, 2)).toEqual(["PLACE", label]);
  const row = tree().find((node) => typeof node.props.onPress === "function" && node.props.value === label);
  await act(async () => row.props.onPress());
  expect(input().props.value).toBe(label);
  const saveLabel = lang === "es" ? "Guardar nombre" : "Save name";
  expect(button(saveLabel).props.disabled).toBe(!canSave);
  if (!canSave) return;
  await save(saveLabel);
  expect(state.rename.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "daily", name: "Mi plata", expectedName: "My money",
  }]]);
});

test("a renamed sole place keeps its own name in both languages", async () => {
  state.accounts = [{ ...daily, name: "Everyday" }];
  for (const lang of ["en", "es"] as const) {
    language = lang;
    await render();
    expect(texts()[1]).toBe("Everyday");
    await act(async () => root?.unmount());
  }
  root = undefined;
});

test("history resolves a renamed place by its unchanged id", () => {
  const row = {
    id: "1", title: "Lunch", date: "2026-10-17", detail: "Food", userCategories: [], financialAccountProfileId: "daily",
    reversed: false, amount: { currency: "COP", minorUnits: -150000 },
  };
  expect(historyListRow(row, [], [{ id: "daily", name: "Daily" }], "2026-10-18").placeName).toBe("Daily");
  expect(historyListRow(row, [], [{ id: "daily", name: "Everyday" }], "2026-10-18").placeName).toBe("Everyday");
});
