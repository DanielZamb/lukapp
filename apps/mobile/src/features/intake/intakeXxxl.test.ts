// The intake screens at XXXL (D4): pinned primary actions, paired cards, one
// return path from Sources, the acknowledgement's spoken meaning and app logos.
import * as React from "react";
import { createElement as h, type ReactElement } from "react";
import { getFunctionName } from "convex/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ThemeProvider } from "../../ui/themeContext";
import { readableLayout } from "../../ui/layout";
import { DraftsScreen } from "../DraftsScreen";
import type { IntakeCandidate } from "./candidates";
import { IntakeContext } from "./IntakeProvider";
import { INTAKE_ACKNOWLEDGEMENT, IntakeSetup } from "./IntakeSetup";
import { IntakeSelectionPicker } from "./IntakeSelectionPicker";
import { NotificationCard } from "./NotificationCard";
import { intakeSourcesStatus } from "./presentation";
import { emptyState, serializeState } from "./durableState";
import { fixture, mapping } from "./service.testSupport";
import type { IntakeSnapshot } from "./service";

const boundary = vi.hoisted(() => { const query = vi.fn(); return { query, client: { query }, report: vi.fn(() => false), uuid: 0 }; });
vi.mock("convex/react", () => ({ useConvex: () => boundary.client }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {} }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `11111111-1111-4111-8111-${String(++boundary.uuid).padStart(12, "0")}` }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => boundary.report }));
vi.mock("../../../modules/notification-intake", async (original) => ({
  ...await original<typeof import("../../../modules/notification-intake")>(),
  sourceIcons: { list: async ({ packageNames }: { packageNames: string[] }) =>
    Object.fromEntries(packageNames.filter((name) => name === "com.nu.production").map((name) => [name, "iVBORw0KGgo="])) },
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    Platform: { OS: "ios" }, KeyboardAvoidingView: "keyboard-viewport", Modal: "modal", Image: "image",
    useWindowDimensions: () => ({ width: 320, height: 640, scale: 3, fontScale: 1.5 }),
    FlatList: ({ data, renderItem, ListEmptyComponent }: { data: unknown[]; renderItem: (input: { item: unknown }) => React.ReactNode; ListEmptyComponent: React.ReactNode }) =>
      React.createElement("virtual-list", null, data.length ? data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item }))) : ListEmptyComponent),
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

let root: ReactTestRenderer | undefined;
let f: ReturnType<typeof fixture>;
const workspace = { id: "workspace-1", kind: "Personal", functionalCurrency: "COP", timeZone: "America/Bogota",
  chartOfAccountsTemplate: "co-puc-personal@1", currentAccountingPeriod: { year: 2026, month: 10, status: "open" } };
const profiles = [
  { id: "account-1", workspaceId: "workspace-1", name: "Daily money", productKind: "cash", ledgerAccountId: "cash", emoji: "👛" },
  { id: "account-2", workspaceId: "workspace-1", name: "Savings", productKind: "savingsAccount", ledgerAccountId: "savings" },
  { id: "account-3", workspaceId: "workspace-1", name: "Card", productKind: "creditCard", ledgerAccountId: "card" },
];
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.query.mockReset().mockImplementation(async (ref) => getFunctionName(ref) === "accounting:openWorkspace" ? workspace : profiles);
  f = fixture();
  f.setPages([{ captures: [], nextCursor: null }]);
  vi.spyOn(f.native, "listSources").mockResolvedValue([{ packageName: "com.nu.production", label: "Nu" }, { packageName: "com.whatsapp", label: "WhatsApp" }]);
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const xxxl = readableLayout({ width: 320, fontScale: 1.5 });
async function mount(element: ReactElement) {
  await act(async () => { root = create(h(ThemeProvider, { layout: xxxl }, element)); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
const all = (type: string) => root?.root.findAll((node) => node.type === type) ?? [];
const words = () => all("text").map((node) => node.children.filter((child) => typeof child === "string").join("")).join("\n");
const labels = () => all("button").map((node) => String(node.props.accessibilityLabel ?? ""));
function button(label: string) {
  const found = all("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label} in ${labels().join(" | ")}`);
  return found;
}
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }
/** Logos load in a batch after the rows render. */
async function settle() { await act(async () => { for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0)); }); }
/** The footer sits beside the scroller, not inside it, so it stays pinned. */
function pinned(label: string) {
  const scroll = all("scroll")[0];
  const target = button(label);
  let node: ReactTestInstance | null = target;
  while (node) { if (node === scroll) return false; node = node.parent; }
  return true;
}
/** Cards hold at most two rows: every row's nearest card has one or two rows. */
function cardSizes(rowLabels: string[]) {
  return rowLabels.map((label) => {
    let node: ReactTestInstance | null = button(label).parent;
    while (node && !(flat(node.props.style).borderRadius === 24 && flat(node.props.style).overflow === "hidden")) node = node.parent;
    if (!node) throw new Error(`No card around ${label}`);
    return node.findAll((child) => typeof child.type === "string" && rowLabels.includes(String(child.props.accessibilityLabel)), { deep: true }).length;
  });
}

const at = Date.UTC(2026, 9, 17, 12);
const candidate = (id: string, description: string, amountMinorUnits: number | null, extra: Partial<IntakeCandidate> = {}): IntakeCandidate => ({
  id, createdAt: at, expiresAt: at + 2 * 86_400_000, workspaceId: "workspace", currency: "COP",
  // Stored amounts are positive; the direction carries the sign.
  suggestion: { direction: amountMinorUnits !== null && amountMinorUnits > 0 ? "in" : "out", description, amountMinorUnits: amountMinorUnits === null ? null : Math.abs(amountMinorUnits),
    accountingDate: "2026-10-17", financialAccountProfileId: "daily", userCategoryIds: ["food"], primaryUserCategoryId: null },
  parserVersion: "parser@1", consentVersion: "consent@1", ...extra,
});
const ready = candidate("c-ready", "RAPPI*RESTAURANTES", -4590000);
const income = candidate("c-in", "", 25000000, { notification: { text: "Transferencia de MIGUEL A", packageName: "com.nu.production", at } });
const inbox = (props: Partial<React.ComponentProps<typeof DraftsScreen>> = {}) => h(DraftsScreen, {
  drafts: [], now: [ready, income], wait: [candidate("c-wait", "UBER *TRIP", -1840000)], ready: [ready], readyTotal: 4590000,
  currency: "COP", segment: "now", readyToShow: true, error: "", confirming: false, month: "October",
  places: [{ id: "daily", name: "Daily money" }], confirmedCount: null, onContinueAfterConfirmation: vi.fn(), onSegment: vi.fn(),
  onBack: vi.fn(), onSources: vi.fn(), onResumeDraft: vi.fn(), onOpenCandidate: vi.fn(), onConfirmReady: vi.fn(), onCompleteMonth: vi.fn(),
  otherNotifications: [candidate("c-other", "", null, { notification: { text: "Nu\nTu tarjeta llega mañana", packageName: "com.nu.production", at } })],
  discardNotices: [{ reason: "Multiple amounts", time: at }],
  sourcesStatus: { state: { label: "Connected", tone: "positive", icon: "checkmark" }, text: "reading 1 app" }, ...props,
});

test("Candidates pins Confirm, tabs by Now and Later, and puts money on its own line", async () => {
  const onConfirmReady = vi.fn(); const onSegment = vi.fn(); const onSources = vi.fn();
  await mount(inbox({ onConfirmReady, onSegment, onSources }));
  expect(pinned("Confirm 1 ready")).toBe(true);
  await press("Confirm 1 ready");
  expect(onConfirmReady).toHaveBeenCalledOnce();
  const tabs = all("button").filter((node) => node.props.accessibilityRole === "tab");
  expect(tabs.map((tab) => [tab.props.accessibilityLabel, tab.props.accessibilityState.selected])).toEqual([["Now, 2", true], ["Later, 1", false]]);
  await act(async () => { tabs[1]?.props.onPress(); });
  expect(onSegment).toHaveBeenCalledWith("wait");
  expect(words()).toContain("−COP 45.900");
  expect(words()).toContain("COP 250.000");
  // A ready expense and income without a description, which needs review.
  const rows = ["Review RAPPI*RESTAURANTES, −COP 45.900, Ready · Daily money", "Review Transferencia de MIGUEL A, COP 250.000, Needs review"];
  expect(cardSizes(rows)).toEqual([2, 2]);
  await press("Notification intake, Connected · reading 1 app");
  expect(onSources).toHaveBeenCalledOnce();
  expect(labels()).not.toContain("Sources");
});

test("Candidates keeps no amount footer while loading and offers Month Close when nothing waits", async () => {
  await mount(inbox({ readyToShow: false }));
  expect(labels().some((label) => label.startsWith("Confirm"))).toBe(false);
  await act(async () => root?.unmount());
  const onCompleteMonth = vi.fn();
  await mount(inbox({ now: [], wait: [], ready: [], readyTotal: 0, otherNotifications: [], onCompleteMonth }));
  expect(words()).toContain("Review complete");
  expect(words()).toContain("October is ready to close. Candidates never block Month Close.");
  expect(pinned("Continue to Month Close")).toBe(true);
  await press("Continue to Month Close");
  expect(words()).toContain("Still on this phone");
  expect(pinned("Continue anyway")).toBe(true);
  await press("Continue anyway");
  expect(onCompleteMonth).toHaveBeenCalledOnce();
});

test("the warning link, discarded notices and other notifications open and return", async () => {
  const onOpenCandidate = vi.fn(); const onDismissDiscardNotices = vi.fn(async () => {});
  await mount(inbox({ onOpenCandidate, onDismissDiscardNotices }));
  await press("Read before using intake: a shortcut, not a statement");
  expect(words()).toContain("What can go wrong");
  expect(pinned("I understand")).toBe(true);
  await press("I understand");
  expect(labels()).not.toContain("Read before using intake: a shortcut, not a statement");
  await press("Other notifications, 1");
  await settle();
  await press(labels().find((label) => label.startsWith("Nu, Tu tarjeta llega mañana")) ?? "missing");
  expect(onOpenCandidate).toHaveBeenCalledWith("c-other");
  expect(all("image").map((node) => node.props.source.uri)).toContain("data:image/png;base64,iVBORw0KGgo=");
  await press("Discarded, 1 notification, no text kept");
  expect(pinned("OK, clear them")).toBe(true);
  await press("OK, clear them");
  expect(onDismissDiscardNotices).toHaveBeenCalledOnce();
  expect(words()).toContain("Candidates");
});

test("Records added is a centred moment with its action pinned", async () => {
  const onContinueAfterConfirmation = vi.fn();
  await mount(inbox({ confirmedCount: 3, onContinueAfterConfirmation }));
  expect(words()).toContain("3 records added");
  expect(pinned("Back to Candidates")).toBe(true);
  await press("Back to Candidates");
  expect(onContinueAfterConfirmation).toHaveBeenCalledOnce();
});

async function mountSetup() {
  await f.service.refresh().catch(() => {});
  await mount(h(IntakeContext.Provider, { value: f.service }, h(IntakeSetup, { workspaceId: "workspace-1", onBack: vi.fn() })));
}

test("Sources keeps one return path, its acknowledgement meaning and logos at XXXL", async () => {
  f.setValue(serializeState(emptyState()));
  await mountSetup();
  const check = button(INTAKE_ACKNOWLEDGEMENT);
  expect(check.props.accessibilityRole).toBe("checkbox");
  expect(pinned("Continue")).toBe(true);
  await press(INTAKE_ACKNOWLEDGEMENT);
  await press("Continue");
  expect(words()).toContain("Not reading any app yet");
  expect(pinned("Add an app")).toBe(true);
  // SEN-103: Sources returns to its caller; it never opens the inbox forward.
  expect(labels().filter((label) => /inbox|candidate/i.test(label))).toEqual([]);
  expect(labels().filter((label) => label === "Refresh status")).toHaveLength(1);
  await press("Add an app");
  await settle();
  expect(words()).toContain("Likely bank apps");
  expect(all("image").map((node) => node.props.source.uri)).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  await press("Nu");
  expect(words()).toContain("Where do Nu alerts go?");
  const radios = all("button").filter((node) => node.props.accessibilityRole === "radio").map((node) => node.props.accessibilityLabel);
  expect(radios).toEqual(["Daily money, Cash", "Savings, Savings", "Card, Credit card"]);
  expect(cardSizes(radios)).toEqual([2, 2, 1]);
  await press("Savings, Savings");
  expect(pinned("Start reading Nu")).toBe(true);
});

test("a configured app shows its logo in the hub and on its page", async () => {
  f.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, packageName: "com.nu.production" }], activeSelectionIds: [mapping.sourceSelectionId] }));
  await mountSetup();
  await settle();
  expect(words()).toContain("Reading 1 app");
  expect(all("image")).toHaveLength(1);
  await press("Nu, To Daily money");
  expect(words()).toContain("Alerts go to");
  expect(all("image")).toHaveLength(1);
  expect(pinned("Stop reading Nu")).toBe(true);
});

test("the picker lists apps in cards of two with the D4 sheet head", async () => {
  const onSelect = vi.fn(); const onClose = vi.fn();
  const options = ["Nu", "Bancolombia", "Davivienda"].map((label, index) => ({ id: `com.bank${index}.app`, label, detail: `com.bank${index}.app`, initial: label[0] ?? "", likely: true }));
  await mount(h(IntakeSelectionPicker, { title: "Add an app", eyebrow: "3 ON THIS PHONE", searchLabel: "Search apps", options, disabled: false, empty: "None", onSelect, onClose }));
  expect(cardSizes(["Nu", "Bancolombia", "Davivienda"])).toEqual([2, 2, 1]);
  await press("Close Add an app");
  expect(onClose).toHaveBeenCalledOnce();
  await act(async () => { root?.root.findByProps({ accessibilityLabel: "Search apps" }).props.onChangeText("davi"); });
  expect(words()).toContain("1 result");
  await press("Davivienda");
  expect(onSelect).toHaveBeenCalledWith("com.bank2.app");
});

test("the notification card keeps its taps at XXXL and shows the sender's logo", async () => {
  const onUseAmount = vi.fn();
  await mount(h(NotificationCard, { notification: { text: "Compra por $32.000 en TIENDA D1", packageName: "com.nu.production", at },
    appLabel: "Nu", currency: "COP", amount: "-32.000", editable: true, onUseAmount, onUseDescription: vi.fn() }));
  expect(all("image")).toHaveLength(1);
  const amount = all("text").find((node) => node.props.accessibilityLabel === "Use $32.000 as the amount");
  await act(async () => { amount?.props.onPress(); });
  expect(onUseAmount).toHaveBeenCalledWith(3_200_000);
});

test("the Sources row states the intake's live condition", () => {
  const base: IntakeSnapshot = { state: { ...emptyState(), activeSelectionIds: ["a", "b"] }, error: "", loaded: true, wipePending: false, drain: null,
    status: { schemaVersion: 2, epoch: "a".repeat(22), enabled: true, access: "granted", connection: "connected", changeSequence: 1, pendingCount: 0,
      gap: null, lastConnectedAt: 1, checkedAt: 1, notices: [], storageState: "healthy", consentVersion: "" } };
  const line = (status: Partial<NonNullable<IntakeSnapshot["status"]>> = {}, extra: Partial<IntakeSnapshot> = {}) => {
    const value = intakeSourcesStatus({ ...base, ...extra, status: { ...base.status, ...status } as IntakeSnapshot["status"] });
    return value && [value.state?.label, value.text].filter(Boolean).join(" · ");
  };
  expect(line()).toBe("Connected · reading 2 apps");
  expect(line({}, { state: emptyState() })).toBe("Connected · not reading any app");
  expect(line({ connection: "disconnected" })).toBe("Not connected");
  expect(line({ access: "not_granted" })).toBe("Needs access");
  expect(line({ storageState: "corrupt" })).toBe("Blocked · nothing new is read");
  expect(line({}, { wipePending: true })).toBe("Blocked · nothing new is read");
  expect(intakeSourcesStatus({ ...base, status: { supported: false, reason: "platform" } })).toBeUndefined();
});
