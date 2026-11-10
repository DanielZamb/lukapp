import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Place } from "../places/model";

type Status = "open" | "undoing" | "closed" | "undone";
const state = vi.hoisted(() => ({
  push: vi.fn(), back: vi.fn(), profileId: "wallet",
  accounts: [] as Place[], statuses: {} as Record<string, Status>, undo: {} as Record<string, unknown>,
}));
vi.mock("expo-router", () => ({
  router: { push: state.push, back: state.back }, Redirect: "Redirect", useLocalSearchParams: () => ({ profileId: state.profileId }),
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useAction: () => vi.fn(),
    useQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      if (args === "skip") return undefined;
      const name = getFunctionName(ref);
      if (name === "accounting:listFinancialAccountProfiles") return state.accounts.map((account) => ({
        id: account.financialAccountProfileId, workspaceId: "ws", name: account.name, productKind: account.productKind,
        ledgerAccountId: "ledger", status: state.statuses[account.financialAccountProfileId] ?? "open" }));
      if (name === "accounting:placeUndoStatus") return state.undo[(args as { financialAccountProfileId: string }).financialAccountProfileId] ?? null;
      return { jars: [], removedLimits: [] };
    },
  };
});
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ month: "2026-11" }) }));
vi.mock("../HomePlaceSetup", () => ({ HomePlaceSetup: "AddPlace" }));
vi.mock("../places/EmojiSheet", () => ({ EmojiSheet: "EmojiSheet" }));
vi.mock("../places/RenameSheet", () => ({ RenameSheet: "RenameSheet" }));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", functionalCurrency: "COP", timeZone: "America/Bogota" },
    financialAccountProfile: { id: "daily" } }),
  usePostedActivity: (_workspaceId: string, _timeZone: string, status?: string) => ({
    accounts: status === "all" ? state.accounts : state.accounts.filter((account) => (state.statuses[account.financialAccountProfileId] ?? "open") === "open"),
  }),
  useRecentActivity: () => ({ page: [] }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "KeyboardAvoidingView",
  Text: "Text", View: "View", Pressable: "Pressable", ScrollView: "ScrollView", ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
import AccountRoute from "../../../app/account";
import PlacesRoute from "../../../app/places";
import { LanguageProvider } from "../../i18n";
import { ListRow } from "../../ui/core";

const place = (id: string, name: string, minorUnits = 0, extra: Partial<Place> = {}): Place => ({
  financialAccountProfileId: id, name, nature: "Asset", productKind: "bankAccount", trackingFrom: "2026-09-24",
  balance: { currency: "COP", minorUnits }, ...extra });
const operation = (status: unknown, reversedCount = 0) =>
  ({ id: "op", state: status, reversedCount, hasReversedEntries: reversedCount > 0, alreadyReversedCount: 0 });
const nov9 = Date.UTC(2026, 10, 9, 17, 0);
const retryAt = Date.UTC(2026, 10, 10, 20, 30);

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.profileId = "wallet";
  state.accounts = [place("daily", "Daily", 10_000), place("wallet", "Wallet")];
  state.statuses = {};
  state.undo = {};
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(screen: typeof AccountRoute, language?: "es") {
  await act(async () => {
    root = create(language ? createElement(LanguageProvider, { initialPreference: language }, createElement(screen)) : createElement(screen));
  });
}
const texts = () => root!.root.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
const buttons = () => root!.root.findAll((node) => String(node.type) === "Pressable").map((node) => node.props.accessibilityLabel);
const nameRow = () => root!.root.find((node) => node.type === ListRow && node.props.title === "Name");

test("an open Place offers a quiet way to end it, opened above its own page", async () => {
  await render(AccountRoute);
  expect(texts().at(-1)).toBe("Close or undo this place");
  await act(async () => root!.root.find((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel === "Close or undo this place").props.onPress());
  expect(state.push.mock.calls).toEqual([[{ pathname: "/place-ending", params: { profileId: "wallet" } }]]);
});

test("a closed Place keeps its history but offers no rename, look, default or ending", async () => {
  state.statuses = { wallet: "closed" };
  state.profileId = "wallet";
  await render(AccountRoute);
  expect(texts()).toContain("This place is closed. Its history stays here, but nothing new can be recorded in it.");
  expect(buttons()).not.toContain("Change look");
  expect(buttons()).not.toContain("Close or undo this place");
  expect(buttons()).toContain("See in history");
  expect(nameRow().props.onPress).toBeUndefined();
});

test("the closed Default badge and the sole-place name follow open Places only", async () => {
  state.accounts = [place("daily", "My money", 10_000), place("wallet", "Wallet")];
  state.statuses = { wallet: "closed" };
  state.profileId = "daily";
  await render(AccountRoute, "es");
  expect(texts().slice(0, 2)).toEqual(["LUGAR", "Mi plata"]);
  expect(texts()).not.toContain("Por defecto");
});

test.each([
  { name: "running", status: "undoing" as const, operation: operation({ kind: "running" }, 3),
    shown: ["Undoing this place", "3 movements reversed", "It keeps going even if you close the app. Meanwhile nothing new can be recorded here."] },
  { name: "paused", status: "undoing" as const, operation: operation({ kind: "paused", code: "locked_period", retryAt }, 1),
    shown: ["Paused", "This month is closed, and undoing needs it open.", "It tries again on its own at Nov 10, 2026, 3:30 PM.", "1 movement reversed"] },
  { name: "needs attention with nothing reversed", status: "undoing" as const,
    operation: operation({ kind: "needs_attention", code: "category_not_found", detail: "Category missing", journalEntryId: "j7" }),
    shown: ["Needs attention", "No movement has been reversed yet.",
      "Your movements are as they were, but the place stays locked until it's reviewed.",
      "Detail: category_not_found. Category missing", "Movement: j7", "Tell us through Report a problem and include this detail."] },
  { name: "needs attention after reversing some", status: "undoing" as const,
    operation: operation({ kind: "needs_attention", code: "place_undo_stalled", detail: "No progress" }, 4),
    shown: ["Needs attention", "4 movements reversed",
      "Part of it was already reversed, so the place stays in progress and can't be used. It didn't finish; it needs a review.",
      "Detail: place_undo_stalled. No progress", "Tell us through Report a problem and include this detail."] },
  { name: "done", status: "undone" as const, operation: operation({ kind: "done", endingId: "e", completedAt: nov9 }, 12),
    shown: ["Undone", "Undone on November 9, 2026.", "12 movements reversed"] },
])("the account page shows an Undo that is $name, and the same after the app restarts", async ({ status, operation, shown }) => {
  state.statuses = { wallet: status };
  state.undo = { wallet: operation };
  await render(AccountRoute);
  const before = texts();
  expect(before).toEqual(expect.arrayContaining(shown));
  expect(before).toContain(status === "undoing" ? "While it's being undone, nothing new can be recorded in this place."
    : "This place was undone: every movement in it was reversed. Its history stays here, but nothing new can be recorded in it.");
  expect(buttons()).not.toContain("Close or undo this place");
  await act(async () => root!.unmount());
  await render(AccountRoute);
  expect(texts()).toEqual(before);
});

test("the Places list counts open Places, follows an Undo and lists ended Places with their act", async () => {
  state.accounts = [place("daily", "Daily", 10_000), place("card", "Card", 5_000), place("wallet", "Wallet"), place("old", "Old")];
  state.statuses = { card: "undoing", wallet: "closed", old: "undone" };
  state.undo = { card: operation({ kind: "running" }, 2), old: operation({ kind: "done", endingId: "e", completedAt: nov9 }, 5) };
  await render(PlacesRoute);
  expect(texts()).toEqual(["ONE POOL", "Daily", "What you have now", "COP 100",
    "Bank and pocket are still one pool. Add a place when money lives apart.",
    "💰", "Daily", "COP 100",
    "💰", "Card", "Undoing this place · 2 movements reversed", "COP 50",
    "Add another place",
    "Closed places", "💰", "Wallet", "Closed", "💰", "Old", "Undone on November 9, 2026"]);
  await act(async () => root!.root.find((node) => String(node.type) === "Pressable" && node.props.accessibilityLabel === "Wallet, Closed").props.onPress());
  expect(state.push.mock.calls).toEqual([[{ pathname: "/account", params: { profileId: "wallet" } }]]);
});

test("the closed section reads in Spanish", async () => {
  state.accounts = [place("daily", "Daily", 10_000), place("savings", "Ahorros"), place("wallet", "Billetera")];
  state.statuses = { wallet: "closed" };
  await render(PlacesRoute, "es");
  expect(texts().slice(0, 2)).toEqual(["TUS LUGARES", "Lugares"]);
  expect(texts().slice(-5)).toEqual(["Agregar otro lugar", "Lugares cerrados", "💰", "Billetera", "Cerrado"]);
});
