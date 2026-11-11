import * as React from "react";
import { createElement } from "react";
import { FlatList } from "react-native";
import { getFunctionName } from "convex/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { formatDateTime } from "../../../../../src/i18n/format";
import type { NativeStatus, UnsupportedStatus } from "../../../modules/notification-intake";
import { IntakeContext } from "./IntakeProvider";
import { INTAKE_ACKNOWLEDGEMENT, INTAKE_DISCLOSURE_VERSION, IntakeSetup } from "./IntakeSetup";
import { IntakeService } from "./service";
import { capture, fixture, mapping, now } from "./service.testSupport";
import { emptyState, serializeState, type SourceMapping } from "./durableState";
import { intakeWarning } from "./presentation";

const boundary = vi.hoisted(() => ({ query: vi.fn(), report: vi.fn(() => false), uuid: 0 }));
const client = { query: boundary.query };
vi.mock("convex/react", () => ({ useConvex: () => client }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => `11111111-1111-4111-8111-${String(++boundary.uuid).padStart(12, "0")}` }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => boundary.report }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "keyboard-viewport",
  Modal: "modal",
  FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: { data: unknown[]; renderItem: (input: { item: unknown }) => React.ReactNode; ListEmptyComponent: React.ReactNode }) => createElement("virtual-list", props, data.length ? data.map((item, index) => createElement(React.Fragment, { key: index }, renderItem({ item }))) : ListEmptyComponent),
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer | undefined;
let f: ReturnType<typeof fixture>;
let statusFields: Partial<NativeStatus>;
let unsupported: UnsupportedStatus | null;
const acknowledgement = INTAKE_ACKNOWLEDGEMENT;
const workspace = { id: "workspace-1", kind: "Personal", functionalCurrency: "COP", timeZone: "America/Bogota",
  chartOfAccountsTemplate: "co-puc-personal@1", currentAccountingPeriod: { year: 2026, month: 10, status: "open" } };
const profiles = [
  { id: "account-1", workspaceId: "workspace-1", name: "Daily money", productKind: "cash", ledgerAccountId: "cash" },
  { id: "account-2", workspaceId: "workspace-1", name: "Savings", productKind: "savingsAccount", ledgerAccountId: "savings" },
];
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.uuid = 0; boundary.report.mockClear();
  boundary.query.mockReset().mockImplementation(async (ref) => getFunctionName(ref) === "accounting:openWorkspace" ? workspace : profiles);
  statusFields = {}; unsupported = null;
  f = fixture(); f.setValue(serializeState(emptyState())); f.setPages([{ captures: [], nextCursor: null }]);
  const getStatus = f.native.getStatus;
  vi.spyOn(f.native, "getStatus").mockImplementation(async () => {
    const status = await getStatus();
    if (!("epoch" in status)) throw new Error("Test status missing");
    return unsupported ?? { ...status, ...statusFields };
  });
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function tree(service = f.service, workspaceId = "workspace-1") {
  return createElement(IntakeContext.Provider, { value: service }, createElement(IntakeSetup, { workspaceId, onBack: vi.fn() }));
}
async function mount() {
  await f.service.refresh().catch(() => {});
  await act(async () => { root = create(tree()); });
}
function text() { return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? ""; }
function has(label: string) { return root?.root.findAllByType("button").some((node) => node.props.accessibilityLabel === label) ?? false; }
function button(label: string) {
  const found = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
function buttonStarting(prefix: string) {
  const found = root?.root.findAllByType("button").find((node) => String(node.props.accessibilityLabel ?? "").startsWith(prefix));
  if (!found) throw new Error(`Missing ${prefix}…`);
  return found;
}
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }
/** Acknowledge the disclosure, opening it from the hub when needed. */
async function acknowledge() {
  if (!has(acknowledgement)) await press(has("Review and turn on") ? "Review and turn on" : "Add another app");
  await press(acknowledgement);
  await press("Continue");
}
async function chooseApp(app = "Bank") {
  await press(has("Add an app") ? "Add an app" : "Add another app");
  await press(app);
}
async function choose(profile = "Daily money") {
  await chooseApp();
  await press(profile);
  await press(has("Save") ? "Save" : "Start reading Bank");
}
async function enable() { await acknowledge(); await choose(); }
const listMounted = () => root?.root.findAll((node) => node.type === FlatList) ?? [];

test("email privacy guidance is visible before consent and in the picker without blocking mail apps", async () => {
  vi.spyOn(f.native, "listSources").mockResolvedValue([{ label: "Gmail", packageName: "com.google.android.gm" }]);
  await mount();
  expect(text()).toContain("We strongly advise against selecting an email app");
  await acknowledge();
  await press("Add an app");
  expect(text()).toContain("Record email-only transactions manually");
  await press("Gmail");
  expect(text()).toContain("Where do Gmail alerts go?");
});

test("the disclosure comes first, gates OS settings and never configures or enables empty sources", async () => {
  statusFields.access = "not_granted";
  const open = vi.spyOn(f.native, "openAccessSettings");
  const configure = vi.spyOn(f.native, "configure");
  await mount();
  expect(text()).toContain("Before you turn it on");
  expect(text()).toContain("Only apps you choose");
  expect(text()).toContain("It's never uploaded.");
  expect(text()).not.toContain("The notification text is never uploaded");
  await press("Read the full disclosure");
  expect(text()).toContain("The notification text is never uploaded; only the values you confirm are posted.");
  expect(text()).toContain("deleted 15 days after their first capture");
  expect(text()).toContain("Notifications that look like security codes are not kept.");
  expect(text()).toContain("Every Candidate needs your review before it's posted.");
  expect(button("Continue").props.accessibilityState.disabled).toBe(true);
  await press("Continue");
  expect(text()).toContain("Before you turn it on");
  expect(open).not.toHaveBeenCalled();
  await press(acknowledgement); await press("Continue");
  expect(text()).toContain("Allow notification access");
  expect(has("Add an app")).toBe(false);
  await press("Allow notification access");
  expect(open).toHaveBeenCalledOnce();
  expect(configure).not.toHaveBeenCalled();
  expect(f.state().mappings).toEqual([]);
  statusFields.access = "granted"; statusFields.connection = "disconnected"; statusFields.checkedAt = now + 1234;
  await act(async () => { await f.service.refresh(); });
  expect(text()).toContain("Granted"); expect(text()).toContain("Disconnected");
  expect(text()).toContain(formatDateTime("en", now + 1234)); expect(text()).not.toContain("just now");
  expect(text()).toContain("Listener isn't connected");
  expect(button("Add an app").props.accessibilityState.disabled).toBe(false);
  const retry = vi.spyOn(f.native, "retryConnection");
  await press("Retry listener connection"); expect(retry).toHaveBeenCalledOnce();
});

test("normal public account reads require an explicit place and save the service consent version", async () => {
  const configure = vi.spyOn(f.native, "configure");
  await mount();
  expect(boundary.query.mock.calls.map(([ref, args]) => [getFunctionName(ref), args])).toEqual([
    ["accounting:openWorkspace", { workspaceId: "workspace-1" }],
    ["accounting:listFinancialAccountProfiles", { workspaceId: "workspace-1" }],
  ]);
  await acknowledge();
  expect(text()).toContain("Not reading any app yet");
  expect(text()).toContain("Personal · COP · Bogota");
  expect(text()).not.toContain("workspace-1");
  await chooseApp();
  expect(text()).toContain("Where do Bank alerts go?");
  expect(text()).toContain("Savings");
  expect(button("Start reading Bank").props.accessibilityState.disabled).toBe(true);
  await press("Start reading Bank"); expect(configure).not.toHaveBeenCalled();
  await press("Savings"); await press("Start reading Bank");
  expect(f.state().mappings).toEqual([{ ...mapping, sourceSelectionId: "11111111-1111-4111-8111-000000000001", financialAccountProfileId: "account-2" }]);
  expect(configure.mock.calls[0]?.[0].consentVersion).toBe(INTAKE_DISCLOSURE_VERSION);
  expect(text()).toContain("Reading 1 app");
  expect(text()).toContain("Adding an app doesn't prove an alert was captured.");
  expect(has("Open candidate inbox")).toBe(false);
  expect(has("Candidate inbox, nothing waiting")).toBe(false);
});

test("public permission failure is visible and refresh reloads current accounts", async () => {
  boundary.query.mockRejectedValue(new Error("permission changed"));
  await mount(); await acknowledge();
  expect(text()).toContain("Couldn't load your apps or places.");
  expect(button("Add an app").props.accessibilityState.disabled).toBe(true);
  boundary.query.mockImplementation(async (ref) => getFunctionName(ref) === "accounting:openWorkspace" ? workspace : profiles);
  await press("Refresh status"); await choose();
  expect(f.state().activeSelectionIds).toHaveLength(1);
});

test.each(["platform", "native_module_missing"] satisfies UnsupportedStatus["reason"][])("unsupported %s is distinct and never offers capture setup", async (reason) => {
  unsupported = { supported: false, reason }; await mount();
  expect(text()).toContain("Not available here");
  expect(text()).toContain(reason === "platform" ? "works only in the full Lukapp app for Android" : "This version of the app can't read notifications.");
  expect(boundary.query).not.toHaveBeenCalled();
  expect(has(acknowledgement)).toBe(false);
  expect(has("Add an app")).toBe(false); expect(has("Turn off and wipe")).toBe(false);
});

test.each(["corrupt", "key_unavailable"] satisfies NativeStatus["storageState"][])("%s storage stays blocked and offers explicit destructive recovery", async (storageState) => {
  statusFields.storageState = storageState;
  vi.spyOn(f.native, "readCandidateState").mockRejectedValue(Object.assign(new Error("CORRUPT_STATE"), { code: "CORRUPT_STATE" }));
  await mount();
  expect(text()).toContain(storageState === "corrupt" ? "Encrypted storage is corrupt" : "Encryption key unavailable");
  expect(text()).toContain("Intake is blocked");
  expect(has(acknowledgement)).toBe(false);
  expect(has("Add an app")).toBe(false); expect(has("Add another app")).toBe(false);
  expect(f.events).not.toContain("wipe");
  await press("Turn off and wipe");
  expect(text()).toContain("Turn off and wipe?");
  expect(text()).toContain("with your saved review edits and pending sends");
  expect(text()).toContain("Posted entries and the Drafts you made yourself are kept.");
  expect(f.events).not.toContain("wipe");
  await press("Keep it on"); expect(f.events).not.toContain("wipe");
});

test("identical mappings keep their ID, changed accounts get a new version, and other workspaces survive", async () => {
  const other: SourceMapping = { ...mapping, packageName: "other.bank", workspaceId: "workspace-other", financialAccountProfileId: "account-other", sourceSelectionId: "other-selection" };
  f.setValue(serializeState({ ...emptyState(), mappings: [mapping, other], activeSelectionIds: [mapping.sourceSelectionId, other.sourceSelectionId] }));
  await mount();
  expect(text()).toContain("Reading 2 apps"); expect(text()).toContain("To another workspace");
  await acknowledge(); await choose();
  expect(f.state().activeSelectionIds).toEqual([other.sourceSelectionId, mapping.sourceSelectionId]);
  await choose("Savings");
  expect(f.state().mappings).toHaveLength(3);
  expect(f.state().mappings).toContainEqual(mapping); expect(f.state().mappings).toContainEqual(other);
  const active = f.state().mappings.filter((row) => f.state().activeSelectionIds.includes(row.sourceSelectionId));
  expect(active.find((row) => row.packageName === "app.bank")).toMatchObject({ financialAccountProfileId: "account-2", sourceSelectionId: "11111111-1111-4111-8111-000000000001" });
  expect(active).toContainEqual(other);
});

test("after a time-zone change, saving the same place keeps the source's identity", async () => {
  boundary.query.mockImplementation(async (ref) => getFunctionName(ref) === "accounting:openWorkspace" ? { ...workspace, timeZone: "Pacific/Auckland" } : profiles);
  f.setValue(serializeState({ ...emptyState(), mappings: [mapping], activeSelectionIds: [mapping.sourceSelectionId] }));
  await mount();
  await acknowledge(); await choose();
  expect(f.state().mappings).toEqual([mapping]);
  expect(f.state().activeSelectionIds).toEqual([mapping.sourceSelectionId]);
});

test("unavailable saved accounts remain visible and configure rejection never claims activation", async () => {
  f.setValue(serializeState({ ...emptyState(), mappings: [{ ...mapping, financialAccountProfileId: "removed-account" }], activeSelectionIds: [mapping.sourceSelectionId] }));
  await mount(); expect(text()).toContain("Place unavailable · To an unavailable place");
  const validate = vi.spyOn(f.deps, "validateMapping").mockResolvedValue(null);
  await acknowledge(); await choose("Savings");
  expect(text()).toContain("A place or workspace is unavailable or permissions changed.");
  expect(f.events).not.toContain("configure");
  expect(f.state().activeSelectionIds).toEqual([mapping.sourceSelectionId]);
  validate.mockResolvedValue({ timeZone: mapping.timeZone });
});

test("a lost configure reply remains pending and retries the exact saved command", async () => {
  const configure = vi.spyOn(f.native, "configure");
  await mount(); f.loseConfigure(); await enable();
  const command = f.state().pendingConfigure;
  expect(command).not.toBeNull(); expect(f.state().activeSelectionIds).toEqual([]);
  expect(text()).toContain("The last change didn't finish");
  expect(has("Add an app")).toBe(false); expect(has("Add another app")).toBe(false);
  await press("Retry saved configuration");
  expect(configure.mock.calls.map(([input]) => input)).toEqual([command, command]);
  expect(f.state().pendingConfigure).toBeNull(); expect(f.state().activeSelectionIds).toHaveLength(1);
  expect(f.events.filter((event) => event === "configure")).toHaveLength(1);
});

test("active and retained mapping capacity errors preserve existing data", async () => {
  const mappings = Array.from({ length: 64 }, (_, index) => ({ ...mapping, sourceSelectionId: `retired-${index}`, packageName: `app.source${index}` }));
  f.setValue(serializeState({ ...emptyState(), mappings }));
  await mount(); await enable();
  expect(text()).toContain("Intake limit reached."); expect(f.state().mappings).toEqual(mappings);
  expect(f.events).not.toContain("configure");
});

test("observed content-free notices dismiss through the service while recovery gaps remain visible", async () => {
  const notice: NativeStatus["notices"][number] = { id: "notice-1", kind: "overflow", count: 3, firstAt: now - 4000, lastAt: now - 2000 };
  statusFields.notices = [notice]; statusFields.gap = { since: now - 5000, reason: "recovery", rejectedCount: 2 };
  const dismiss = vi.spyOn(f.native, "dismissNotices").mockImplementation(async ({ noticeIds }) => {
    statusFields.notices = statusFields.notices?.filter((row) => !noticeIds.includes(row.id));
  });
  await mount(); await acknowledge();
  expect(text()).toContain(`Intake was recovering since ${formatDateTime("en", now - 5000)}. 2 captures rejected.`);
  expect(text()).toContain("Too many alerts at once");
  expect(text()).toContain(`3 alerts · ${formatDateTime("en", now - 4000)} to ${formatDateTime("en", now - 2000)}`);
  expect(intakeWarning(f.service.getSnapshot(), createTranslator("en"))).toContain("while it was recovering");
  await press("Dismiss notice: Too many alerts at once");
  expect(dismiss).toHaveBeenCalledWith({ expectedEpoch: "a".repeat(22), noticeIds: ["notice-1"] });
  expect(text()).not.toContain("Too many alerts at once"); expect(text()).toContain("Activity may be missing");
});

test("source removal preserves a real-service Candidate and retired mapping; wipe needs a separate destructive action", async () => {
  f.setValue(serializeState({ ...emptyState(), mappings: [mapping], activeSelectionIds: [mapping.sourceSelectionId] }));
  f.setPages([{ captures: [capture], nextCursor: null }]);
  await mount();
  expect(has("Open candidate inbox · 1")).toBe(false);
  expect(has("Candidate inbox, 1 waiting")).toBe(false);
  expect(f.service.candidates().map((row) => row.id)).toEqual(["capture-1"]);
  await act(async () => { buttonStarting("Bank, To Daily money").props.onPress(); });
  expect(text()).toContain("Alerts go to");
  await press("Stop reading Bank");
  expect(has(acknowledgement)).toBe(true); expect(f.events).not.toContain("configure");
  await press(acknowledgement); await press("Continue");
  await press("Stop reading Bank");
  expect(f.state().activeSelectionIds).toEqual([]); expect(f.state().mappings).toEqual([mapping]);
  expect(f.service.candidates().map((row) => row.id)).toEqual(["capture-1"]);
  expect(text()).toContain("Not reading any app yet");
  expect(f.events).not.toContain("wipe");
  await press("Turn off and wipe"); await press("Keep it on"); expect(f.events).not.toContain("wipe");
  await press("Turn off and wipe"); expect(text()).toContain("Turn off and wipe?");
  await press("Turn off and wipe");
  expect(f.events).toContain("wipe"); expect(f.raw()).toBeNull(); expect(f.service.candidates()).toEqual([]);
});

test("failed wipe remains visibly blocked, including missing-native recovery, then retries the stored wipe", async () => {
  await mount(); await acknowledge();
  f.loseWipe(); await press("Turn off and wipe"); await press("Turn off and wipe");
  expect(text()).toContain("Wipe is pending"); expect(f.wipeIntent()).not.toBeNull();
  expect(has("Turn off and wipe")).toBe(false);
  unsupported = { supported: false, reason: "native_module_missing" };
  await press("Retry pending wipe"); expect(text()).toContain("Install the full Lukapp app for Android to finish wiping");
  expect(f.wipeIntent()).not.toBeNull();
  unsupported = null;
  await press("Retry pending wipe"); expect(f.wipeIntent()).toBeNull();
  expect(f.events.filter((event) => event === "wipe")).toHaveLength(1);
});

test("reopening after lock observes granted OS access but requires acknowledgement again before changes", async () => {
  await mount(); await enable();
  await act(async () => { root?.unmount(); }); root = undefined;
  const next = new IntakeService(f.deps); await next.refresh();
  const open = vi.spyOn(f.native, "openAccessSettings");
  await act(async () => { root = create(tree(next)); });
  expect(text()).toContain("Granted"); expect(text()).toContain("Reading 1 app");
  expect(has(acknowledgement)).toBe(false);
  await press("Android notification settings");
  expect(open).not.toHaveBeenCalled();
  expect(button(acknowledgement).props.accessibilityState.checked).toBe(false);
  await press(acknowledgement); await press("Continue");
  expect(open).toHaveBeenCalledOnce();
});

test("service projection retains saved review and frozen retry state without replacing the Candidate", async () => {
  f.setValue(serializeState({ ...emptyState(), mappings: [mapping], activeSelectionIds: [mapping.sourceSelectionId] }));
  f.setPages([{ captures: [capture], nextCursor: null }]); await mount();
  const row = f.service.read("capture-1"); if (!row) throw new Error("No Candidate");
  await act(async () => { await f.service.updateReview(row.id, row.recordRevision, { ...row.review, description: "Edited market" }); });
  const edited = f.service.read(row.id); if (!edited) throw new Error("No edited Candidate");
  await act(async () => { await f.service.beginConfirmation(row.id, edited.recordRevision); });
  const saved = f.service.read(row.id);
  await press("Refresh status");
  expect(f.service.read(row.id)).toEqual(saved);
  expect(f.service.candidates()[0]).toMatchObject({ id: "capture-1", suggestion: { description: "Edited market" }, error: "Confirmation pending. Open to retry." });
  expect(f.service.read(row.id)?.originalSuggestion.description).toBe("Market");
});

test("the app list starts closed, puts likely bank apps first, searches names and packages, and moves straight to places", async () => {
  const configure = vi.spyOn(f.native, "configure");
  vi.spyOn(f.native, "listSources").mockResolvedValue([
    ...Array.from({ length: 150 }, (_, index) => ({ packageName: `com.example.app${index}`, label: `Source ${index}` })),
    { packageName: "com.example.aguila", label: "Águila Banco" },
  ]);
  boundary.query.mockImplementation(async (ref) => getFunctionName(ref) === "accounting:openWorkspace" ? workspace : [
    ...profiles, { ...profiles[0], id: "account-3", name: "Ahorros nómina" },
  ]);
  await mount(); await acknowledge();
  expect(text()).toContain("151 apps on this phone");
  expect(listMounted()).toHaveLength(0);
  await press("Add an app");
  const list = listMounted()[0];
  expect(list?.props.initialNumToRender).toBe(12);
  expect(text()).toContain("Likely bank apps"); expect(text()).toContain("All apps");
  expect(list?.props.data.find((item: { kind: string }) => item.kind === "option")?.option.label).toBe("Águila Banco");
  const appSearch = () => root?.root.findAllByType("input").find((node) => node.props.accessibilityLabel === "Search apps");
  await act(async () => { appSearch()?.props.onChangeText("aguila"); });
  expect(text()).toContain("Águila Banco"); expect(text()).not.toContain("Source 149"); expect(text()).toContain("1 result");
  await act(async () => { appSearch()?.props.onChangeText("com.example.app149"); });
  expect(text()).toContain("Source 149"); expect(text()).not.toContain("Águila Banco");
  await press("Close"); expect(listMounted()).toHaveLength(0);
  await press("Add an app"); await press("Águila Banco");
  expect(appSearch()).toBeUndefined(); expect(text()).toContain("Where do Águila Banco alerts go?");
  expect(text()).not.toContain("account-3");
  expect(button("Start reading Águila Banco").props.accessibilityState.disabled).toBe(true);
  await press("Ahorros nómina"); expect(button("Ahorros nómina").props.accessibilityState.checked).toBe(true);
  await press("Back"); expect(configure).not.toHaveBeenCalled(); expect(f.state().mappings).toEqual([]);
  await press("Add an app"); await press("Águila Banco");
  await press("Savings"); await press("Start reading Águila Banco");
  expect(configure).toHaveBeenCalledOnce();
  expect(f.state().mappings[0]).toMatchObject({ packageName: "com.example.aguila", financialAccountProfileId: "account-2" });
  expect(listMounted()).toHaveLength(0);
  expect(text()).toContain("Apps you read from"); expect(text()).toContain("To Savings");
});

test("dev diagnostics disclosure and protected inspector show typed arrivals and support delete and clear", async () => {
  const health = { enabled: true, state: "healthy" as const, recordCount: 1, byteCount: 100, overflowCount: 2, errorCount: 0 };
  statusFields.diagnostics = health;
  const row = { id: "arrival-1", captureId: "capture-1", sourceSelectionId: "selection-1", packageName: "app.bank",
    capturedAt: now, notificationAt: now, expiresAt: now + 86_400_000, parser: { outcome: "needs_review" as const, reasons: ["no_amount"] } };
  const list = vi.spyOn(f.native, "listDiagnostics").mockResolvedValue({ health, records: [row] });
  const read = vi.spyOn(f.native, "readDiagnostic").mockResolvedValue({ ...row, snapshot: { type: "Bundle", fields: { "android.title": { type: "String", status: "complete", value: "Synthetic title" } } } });
  const remove = vi.spyOn(f.native, "deleteDiagnostic").mockResolvedValue();
  const clear = vi.spyOn(f.native, "clearDiagnostics").mockResolvedValue();
  await mount();
  expect(text()).toContain("BETA BUILD");
  await press("Read the full disclosure");
  expect(text()).toContain("including security messages");
  await acknowledge();
  expect(text()).toContain("2 overflow");
  await press("Inspect raw arrivals on this device"); expect(list).toHaveBeenCalled();
  expect(text()).toContain("needs_review");
  await press("Inspect arrival arrival-1");
  expect(read).toHaveBeenCalledWith({ expectedEpoch: "a".repeat(22), ownerScope: "o".repeat(43), id: "arrival-1" });
  expect(text()).toContain("android.title"); expect(text()).toContain("Synthetic title");
  await press("Delete this raw arrival"); expect(remove).toHaveBeenCalledOnce(); expect(text()).not.toContain("Synthetic title");
  await press("Clear all raw diagnostics"); expect(clear).toHaveBeenCalledOnce();
});

test("sources saved under an older disclosure are offered the update, re-saved with the same mappings", async () => {
  const configure = vi.spyOn(f.native, "configure");
  f.setValue(serializeState({ ...emptyState(), mappings: [mapping], activeSelectionIds: [mapping.sourceSelectionId] }));
  statusFields.consentVersion = "notification-disclosure@2";
  await mount();
  expect(text()).toContain("See each notification with its suggestion");
  await press("Review the update");
  expect(has(acknowledgement)).toBe(true); expect(configure).not.toHaveBeenCalled();
  delete statusFields.consentVersion;
  await press(acknowledgement); await press("Continue");
  expect(configure).toHaveBeenCalledOnce();
  expect(configure.mock.calls[0]?.[0]).toMatchObject({ consentVersion: INTAKE_DISCLOSURE_VERSION, sources: [{ packageName: "app.bank", sourceSelectionId: mapping.sourceSelectionId }] });
  expect(f.state().mappings).toEqual([mapping]);
  expect((await f.native.getStatus() as NativeStatus).consentVersion).toBe(INTAKE_DISCLOSURE_VERSION);
  expect(text()).not.toContain("See each notification with its suggestion");
});

async function mountSpanish() {
  const { LanguageProvider } = await import("../../i18n");
  await f.service.refresh().catch(() => {});
  await act(async () => { root = create(createElement(LanguageProvider, { initialPreference: "es" }, tree())); });
}

test("setup reads in Spanish and names Android's own Acceso a notificaciones setting", async () => {
  statusFields.access = "not_granted";
  await mountSpanish();
  expect(text()).toContain("Antes de activarla");
  expect(text()).toContain("Solo las apps que elijas");
  expect(text()).toContain("El siguiente paso es permitir el Acceso a notificaciones");
  await press("Leí el aviso de la lectura de notificaciones");
  await press("Continuar");
  const shown = text();
  for (const copy of ["Lectura de notificaciones", "ALERTAS DE COMPRAS", "Permite el Acceso a notificaciones", "Apps que Lukapp lee",
    "Este celular", "Acceso a notificaciones", "No permitido", "Personal · COP · Bogota"])
    expect(shown).toContain(copy);
  expect(has("Acceso a notificaciones, No permitido")).toBe(false);
  expect(root?.root.findAllByProps({ label: "Permitir el Acceso a notificaciones" }).length).toBeGreaterThan(0);
  expect(root?.root.findAllByProps({ label: "Abrir Acceso a notificaciones" }).length).toBeGreaterThan(0);
  for (const english of ["Notification intake", "Allow notification access", "This phone", "Not granted", "Apps you read from"])
    expect(shown).not.toContain(english);
});

test("choosing where an app's alerts go reads in Spanish around the stored app label", async () => {
  await mountSpanish();
  await press("Leí el aviso de la lectura de notificaciones");
  await press("Continuar");
  await act(async () => { root!.root.findAllByProps({ label: "Agregar una app" })[0]!.props.onPress(); });
  expect(root?.root.findByProps({ accessibilityLabel: "Buscar apps" }).props.placeholder).toBe("Buscar por nombre");
  await press("Bank");
  expect(text()).toContain("¿A dónde van las alertas de Bank?");
  expect(text()).toContain("Cuenta de ahorro");
  expect(text()).toContain("Efectivo");
  expect(text()).toContain("Puedes cambiarlo después. Los otros espacios conservan su propio lugar para Bank.");
});
