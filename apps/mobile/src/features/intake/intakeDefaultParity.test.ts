// Pins the default and reflow trees of the notification intake screens to
// their pre-XXL source (2559fa3). XXL work may change the XXXL tier only.
import * as React from "react";
import { createElement as h, useEffect, type ReactElement } from "react";
import { getFunctionName } from "convex/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { openAmount } from "../amount/session";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { NativeStatus } from "../../../modules/notification-intake";
import { ThemeProvider, useSetThemeMode } from "../../ui/themeContext";
import { readableLayout, type ReadableLayout } from "../../ui/layout";
import type { ThemeMode } from "../../ui/tokens";
import { DraftsScreen } from "../DraftsScreen";
import type { DraftListItem } from "../localEntryDrafts";
import type { IntakeCandidate } from "./candidates";
import { IntakeContext } from "./IntakeProvider";
import { IntakeSetup } from "./IntakeSetup";
import { IntakeSelectionPicker } from "./IntakeSelectionPicker";
import { MonthCloseWarning, ReconciliationWarning } from "./InboxDetails";
import { NotificationCard } from "./NotificationCard";
import { emptyState, serializeState } from "./durableState";
import { fixture, mapping, now } from "./service.testSupport";

process.env.TZ = "UTC";
const boundary = vi.hoisted(() => { const query = vi.fn(); return { query, client: { query }, report: vi.fn(() => false), uuid: 0 }; });
vi.mock("convex/react", () => ({ useConvex: () => boundary.client }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `11111111-1111-4111-8111-${String(++boundary.uuid).padStart(12, "0")}` }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => boundary.report }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("@gorhom/bottom-sheet", () => import("../../ui/bottomSheet.testSupport"));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    Platform: { OS: "android", Version: 35 }, KeyboardAvoidingView: "keyboard-viewport", Modal: "modal", Image: "image",
    FlatList: ({ data, renderItem, ListEmptyComponent, ItemSeparatorComponent, keyExtractor: _key, ...props }: {
      data: unknown[]; renderItem: (input: { item: unknown }) => React.ReactNode; ListEmptyComponent: React.ReactNode;
      ItemSeparatorComponent?: () => React.ReactNode; keyExtractor?: unknown;
    }) => React.createElement("virtual-list", props, data.length
      ? data.map((item, index) => React.createElement(React.Fragment, { key: index }, index > 0 && ItemSeparatorComponent ? React.createElement(ItemSeparatorComponent) : null, renderItem({ item })))
      : ListEmptyComponent),
    Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
    StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1, flatten: flat, absoluteFill: {} },
    Easing: { out: () => 0, in: () => 0, quad: () => 0 },
    Animated: { View: "animated-view", Value: class { interpolate() { return 0; } }, timing: () => ({}), sequence: () => ({}), loop: () => ({ start() {}, stop() {} }) },
    Keyboard: { dismiss() {}, addListener: () => ({ remove() {} }) },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
  };
});

function flat(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? Object.assign({}, ...value.map(flat))
    : typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {};
}
function effectiveTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(effectiveTree);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (key === "style" || key === "contentContainerStyle") {
      const style = typeof item === "function" ? item({ pressed: false }) : item;
      return [[key, effectiveTree(flat(style))]];
    }
    if (typeof item === "function" || key.startsWith("on") || key === "ref" || key === "allowFontScaling" || item === undefined) return [];
    return [[key, effectiveTree(item)]];
  }));
}

let root: ReactTestRenderer | undefined;
let f: ReturnType<typeof fixture>;
let statusFields: Partial<NativeStatus>;
const workspace = { id: "workspace-1", kind: "Personal", functionalCurrency: "COP", timeZone: "America/Bogota",
  chartOfAccountsTemplate: "co-puc-personal@1", currentAccountingPeriod: { year: 2026, month: 10, status: "open" } };
const profiles = [
  { id: "account-1", workspaceId: "workspace-1", name: "Daily money", productKind: "cash", ledgerAccountId: "cash" },
  { id: "account-2", workspaceId: "workspace-1", name: "Savings", productKind: "savingsAccount", ledgerAccountId: "savings" },
];
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.uuid = 0;
  boundary.query.mockReset().mockImplementation(async (ref) => getFunctionName(ref) === "accounting:openWorkspace" ? workspace : profiles);
  statusFields = {};
  f = fixture();
  f.setPages([{ captures: [], nextCursor: null }]);
  vi.spyOn(f.native, "listSources").mockResolvedValue([
    { packageName: "com.nu.production", label: "Nu" }, { packageName: "com.bancolombia.app", label: "Bancolombia" },
    { packageName: "com.whatsapp", label: "WhatsApp" }, { packageName: "app.bank", label: "Bank" },
  ]);
  const getStatus = f.native.getStatus;
  vi.spyOn(f.native, "getStatus").mockImplementation(async () => {
    const status = await getStatus();
    if (!("epoch" in status)) throw new Error("Test status missing");
    return { ...status, ...statusFields };
  });
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function Appearance({ mode, children }: React.PropsWithChildren<{ mode: ThemeMode }>) {
  const setMode = useSetThemeMode();
  useEffect(() => setMode(mode), [mode, setMode]);
  return children;
}
const layouts: [string, ReadableLayout][] = [
  ["default", readableLayout({ width: 393, fontScale: 1 })],
  ["reflow", readableLayout({ width: 320, fontScale: 1.15 })],
];
// Dark only changes colours, so reflow is pinned in light.
const variants = layouts.flatMap(([tier, layout]) => (tier === "reflow" ? ["light"] as const : ["light", "dark"] as const)
  .map((mode) => [`${tier} ${mode}`, layout, mode] as const));
async function mount(element: ReactElement, layout: ReadableLayout, mode: ThemeMode) {
  await act(async () => { root = create(h(ThemeProvider, { layout }, h(Appearance, { mode }, element))); });
}
const snapshot = () => effectiveTree(root?.toJSON());
function button(label: string) {
  const found = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
const has = (label: string) => root?.root.findAllByType("button").some((node) => node.props.accessibilityLabel === label) ?? false;
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }

// ---------- Candidates inbox ----------

const expiresAt = Date.UTC(2026, 9, 17, 12);
const drafts: DraftListItem[] = [
  { id: "open-1", status: "open", kind: "normal", description: "", expiresAt, workspaceId: "workspace" },
  { id: "post-1", status: "posting", kind: "expense", description: "Food", expiresAt, workspaceId: "workspace" },
];
const candidate = (id: string, description: string, amountMinorUnits: number | null, extra: Partial<IntakeCandidate> = {}): IntakeCandidate => ({
  id, createdAt: expiresAt, expiresAt: expiresAt + 2 * 86_400_000, workspaceId: "workspace", currency: "COP",
  suggestion: { direction: amountMinorUnits !== null && amountMinorUnits > 0 ? "in" : "out", description, amountMinorUnits,
    accountingDate: "2026-10-17", financialAccountProfileId: "daily", userCategoryIds: ["food"], primaryUserCategoryId: null },
  parserVersion: "parser@1", consentVersion: "consent@1", ...extra,
});
const ready = candidate("c-ready", "RAPPI*RESTAURANTES", -4590000);
const review = candidate("c-review", "", null, { notification: { text: "Transferencia de MIGUEL A", packageName: "com.nu.production", at: expiresAt } });
const usd = candidate("c-usd", "Amazon", -1999, { currency: "USD" });
const other = candidate("c-other", "", null, { notification: { text: "Nu\nTu tarjeta llega mañana", packageName: "com.nu.production", at: expiresAt } });
const inbox = (props: Partial<React.ComponentProps<typeof DraftsScreen>> = {}) => h(DraftsScreen, {
  drafts: [], now: [], wait: [], ready: [], readyTotal: 0, currency: "COP", segment: "now", readyToShow: true, error: "",
  confirming: false, month: "October", places: [{ id: "daily", name: "Daily money" }], confirmedCount: null,
  onContinueAfterConfirmation: vi.fn(), onSegment: vi.fn(), onBack: vi.fn(), onSources: vi.fn(), onResumeDraft: vi.fn(),
  onOpenCandidate: vi.fn(), onConfirmReady: vi.fn(), onCompleteMonth: vi.fn(), ...props,
});
const full = {
  drafts, now: [ready, review, usd], wait: [candidate("c-wait", "UBER *TRIP", -1840000)], ready: [ready], readyTotal: 4590000,
  otherNotifications: [other], discardNotices: [{ reason: "Missing amount or direction" as const, time: expiresAt }, { reason: "Multiple amounts" as const, time: expiresAt + 60_000 }],
  intakeWarning: "Some notifications may be missing.",
};

test.each(variants)("Candidates keep their default tree (%s)", async (_name, layout, mode) => {
  const states: [string, ReactElement][] = [
    ["loading", inbox({ readyToShow: false })],
    ["empty", inbox()],
    ["error", inbox({ error: "Could not load Candidates." })],
    ["filled-now", inbox(full)],
    ["filled-wait", inbox({ ...full, segment: "wait" })],
    ["confirming", inbox({ ...full, confirming: true })],
    ["added", inbox({ ...full, confirmedCount: 3 })],
  ];
  for (const [name, element] of states) {
    await mount(element, layout, mode);
    expect(snapshot()).toMatchSnapshot(name);
    await act(async () => root?.unmount());
  }
  await mount(inbox(full), layout, mode);
  await press("Other notifications, 1");
  expect(snapshot()).toMatchSnapshot("other-notifications-open");
  await press("Notifications discarded");
  expect(snapshot()).toMatchSnapshot("discarded");
  await press("OK");
  await press("Open reconciliation warning");
  expect(snapshot()).toMatchSnapshot("warning");
  await press("I understand");
  await press("Preview Month Close warning");
  expect(snapshot()).toMatchSnapshot("month-close");
});

test.each(variants)("inbox details keep their default tree (%s)", async (_name, layout, mode) => {
  await mount(h(ReconciliationWarning, { onBack: vi.fn() }), layout, mode);
  expect(snapshot()).toMatchSnapshot("reconciliation");
  await act(async () => root?.unmount());
  await mount(h(MonthCloseWarning, { month: "October", count: 3, onBack: vi.fn(), onContinue: vi.fn() }), layout, mode);
  expect(snapshot()).toMatchSnapshot("month-close");
});

// ---------- Notification card ----------

test.each(variants)("the notification card keeps its default tree (%s)", async (_name, layout, mode) => {
  const card = (props: Partial<React.ComponentProps<typeof NotificationCard>> = {}) => h(NotificationCard, {
    notification: { text: "Compra por $32.000 en TIENDA D1. Saldo disponible: $1.250.300", packageName: "com.nu.production", at: expiresAt },
    appLabel: "Nu", currency: "COP", amount: openAmount("COP", "-32.000"), editable: true, onUseAmount: vi.fn(), onUseDescription: vi.fn(), ...props,
  });
  const states: [string, ReactElement][] = [
    ["editable", card()],
    ["read-only", card({ editable: false })],
    ["hidden", card({ notification: { text: "Tu clave dinámica es 482913", packageName: "com.todo1.mobile", at: expiresAt } })],
    ["empty", card({ notification: { text: "", packageName: "com.nu.production", at: expiresAt }, appLabel: undefined })],
  ];
  for (const [name, element] of states) {
    await mount(element, layout, mode);
    expect(snapshot()).toMatchSnapshot(name);
    await act(async () => root?.unmount());
  }
});

// ---------- Sources ----------

test.each(variants)("the app picker keeps its default tree (%s)", async (_name, layout, mode) => {
  const options = [
    { id: "com.nu.production", label: "Nu", detail: "com.nu.production", initial: "N", likely: true },
    { id: "com.bancolombia.app", label: "Bancolombia", detail: "com.bancolombia.app", initial: "B", likely: true },
    { id: "com.whatsapp", label: "WhatsApp", detail: "com.whatsapp", initial: "W" },
  ];
  const picker = (extra: Partial<React.ComponentProps<typeof IntakeSelectionPicker>> = {}) => h(IntakeSelectionPicker, {
    title: "Add an app", eyebrow: "3 ON THIS PHONE", searchLabel: "Search apps", guidance: "Bank emails are not bank-app notifications.",
    options, disabled: false, empty: "No installed apps can send alerts.", onSelect: vi.fn(), onClose: vi.fn(), ...extra,
  });
  for (const [name, element] of [["grouped", picker()], ["disabled", picker({ disabled: true })], ["none", picker({ options: [] })]] as const) {
    await mount(element, layout, mode);
    expect(snapshot()).toMatchSnapshot(name);
    await act(async () => root?.unmount());
  }
});

async function mountSetup(layout: ReadableLayout, mode: ThemeMode) {
  await f.service.refresh().catch(() => {});
  await mount(h(IntakeContext.Provider, { value: f.service }, h(IntakeSetup, { workspaceId: "workspace-1", onBack: vi.fn() })), layout, mode);
}
async function acknowledge() {
  if (!has("I've read the notification intake disclosure")) await press(has("Review and turn on") ? "Review and turn on" : "Add another app");
  await press("I've read the notification intake disclosure");
  await press("Continue");
}

test.each(variants)("intake setup keeps its default tree (%s)", async (_name, layout, mode) => {
  // First run: nothing set up, access missing, disclosure first.
  f.setValue(serializeState(emptyState()));
  statusFields = { access: "not_granted", connection: "disconnected", lastConnectedAt: null };
  await mountSetup(layout, mode);
  expect(snapshot()).toMatchSnapshot("disclosure");
  await press("Read the full disclosure");
  await press("I've read the notification intake disclosure");
  expect(snapshot()).toMatchSnapshot("disclosure-read");
  await press("Continue");
  expect(snapshot()).toMatchSnapshot("hub-no-access");
  await act(async () => root?.unmount());

  // Reading one app, with notices, a gap and a reconsent prompt.
  f.setValue(serializeState({ ...emptyState(), mappings: [mapping], activeSelectionIds: [mapping.sourceSelectionId] }));
  statusFields = { consentVersion: "notification-disclosure@2", gap: { reason: "overflow", since: now - 3_600_000, rejectedCount: 2 },
    notices: [{ id: "notice-1", kind: "no_amount", count: 2, firstAt: now - 7_200_000, lastAt: now - 3_600_000 }] };
  await mountSetup(layout, mode);
  expect(snapshot()).toMatchSnapshot("hub-reading");
  await acknowledge();
  await press("Add another app");
  expect(snapshot()).toMatchSnapshot("picker");
  await press("Nu");
  expect(snapshot()).toMatchSnapshot("place");
  await press("Savings");
  expect(snapshot()).toMatchSnapshot("place-chosen");
  await press("Back");
  await press(button("Bank, To Daily money").props.accessibilityLabel);
  expect(snapshot()).toMatchSnapshot("app");
  await press("Back");
  await press("Turn off and wipe");
  expect(snapshot()).toMatchSnapshot("wipe");
  await act(async () => root?.unmount());

  // Blocked storage.
  statusFields = { storageState: "corrupt" };
  await mountSetup(layout, mode);
  expect(snapshot()).toMatchSnapshot("hub-corrupt");
});
