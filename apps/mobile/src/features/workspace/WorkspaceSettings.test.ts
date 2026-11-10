import * as React from "react";
import { createElement } from "react";
import { ConvexError } from "convex/values";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, string>());
const state = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  profiles: [] as Record<string, unknown>[],
  defaultPlace: vi.fn(),
  timeZone: vi.fn(),
  currency: vi.fn(),
  reportFailure: vi.fn((_error: unknown) => false),
  keys: 0,
  router: { back: vi.fn(), replace: vi.fn(), push: vi.fn(), canGoBack: vi.fn(() => true) },
}));
const back = await vi.hoisted(async () => (await import("../../ui/bottomSheet.testSupport")).backHandlers());
vi.mock("@gorhom/bottom-sheet", () => import("../../ui/bottomSheet.testSupport"));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => memory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { memory.set(key, value); },
  deleteItemAsync: async (key: string) => { memory.delete(key); },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => `key-${++state.keys}` }));
vi.mock("expo-router", () => ({ router: state.router, Redirect: "redirect" }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const actions: Record<string, unknown> = {
    "accounting:changeDefaultPlace": state.defaultPlace,
    "accounting:changeWorkspaceTimeZone": state.timeZone,
    "accounting:changeFunctionalCurrency": state.currency,
  };
  return {
    useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(reference);
      if (name === "accounting:personalDefaults") return { workspace: { id: "ws" } };
      if (name === "accounting:workspaceSettings") return state.settings;
      if (name === "accounting:listFinancialAccountProfiles") return state.profiles;
      throw new Error(`Unexpected query ${name}`);
    },
    useAction: (reference: Parameters<typeof getFunctionName>[0]) => actions[getFunctionName(reference)],
  };
});
vi.mock("react-native", () => ({
  BackHandler: back.BackHandler,
  Platform: { OS: "android" },
  KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => state.reportFailure }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));

import WorkspaceRoute from "../../../app/workspace";
import { LanguageProvider } from "../../i18n";
import { LocalInput, LocalInputLease } from "../../local-auth/localInput";
import { ListRow } from "../../ui/core";
import {
  beginPostIn, dropUnsentInCurrency, keepIn, parseLocalEntryDocument, readRaw, rejectPostIn, writeDocument,
  type LocalEntryDocument, type LocalEntryFacts, type PostableCommand,
} from "../localEntryDrafts";

type Language = "en" | "es";
const read = (patch: Record<string, unknown> = {}) => ({
  workspaceId: "ws", defaultFinancialAccountProfileId: "daily", timeZone: "America/Bogota", functionalCurrency: "COP",
  today: "2026-11-10", canChangeFunctionalCurrency: true, currencyChangeBlockedReason: null, ...patch,
});
const daily = { id: "daily", workspaceId: "ws", name: "Daily", productKind: "bankAccount", ledgerAccountId: "ledger-daily" };
const savings = { id: "savings", workspaceId: "ws", name: "Savings", productKind: "savingsAccount", ledgerAccountId: "ledger-savings" };
const receipt = (setting: string, previousValue: string, value: string, idempotencyKey: string) => ({
  id: "receipt", workspaceId: "ws", setting, previousValue, value, requestedValue: value, expectedValue: previousValue,
  changed: true, idempotencyKey, changedBy: "owner", changedAt: 1,
});

let root: ReactTestRenderer | undefined;
let language: Language = "en";
let lease = new LocalInputLease("owner", "session");
let popped = 0;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.reportFailure.mockImplementation(() => false);
  state.router.canGoBack.mockImplementation(() => true);
  state.settings = read();
  state.profiles = [daily, savings];
  state.keys = 0;
  memory.clear();
  back.reset();
  lease = new LocalInputLease("owner", "session");
  language = "en";
  popped = 0;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const page = () => createElement(LanguageProvider, { initialPreference: language },
  createElement(LocalInput.Provider, { value: lease }, createElement(WorkspaceRoute)));
async function render() {
  await act(async () => { root = create(page()); });
  await act(async () => {});
}
async function refresh(patch: Record<string, unknown>) {
  state.settings = read(patch);
  await act(async () => root?.update(page()));
}
function tree() { if (!root) throw new Error("Workspace not mounted"); return root.root; }
function texts() { return tree().findAllByType("text" as never).map((node) => node.children.join("")); }
function alerts() {
  return tree().findAll((node) => node.type === ("text" as never) && node.props.accessibilityRole === "alert")
    .map((node) => node.children.join(""));
}
function row(title: string) {
  const found = tree().findAllByType(ListRow).find((node) => node.props.title === title);
  if (!found) throw new Error(`Missing row ${title}`);
  return found.props as { title: string; value?: string; detail?: string; onPress?: () => void };
}
function sheets() {
  return tree().findAll((node) => node.type === ("sheet" as never)).map((node) => node.props.accessibilityLabel ?? "search");
}
function control(role: "button" | "radio", label: string | RegExp): ReactTestInstance {
  const found = tree().findAll((node) => node.type === ("button" as never) && node.props.accessibilityRole === role)
    .find((node) => typeof label === "string" ? node.props.accessibilityLabel === label : label.test(node.props.accessibilityLabel));
  if (!found) throw new Error(`Missing ${role} ${label}`);
  return found;
}
function maybeButton(label: string) {
  return tree().findAll((node) => node.type === ("button" as never) && node.props.accessibilityLabel === label)[0];
}
async function press(node: ReactTestInstance | { onPress?: () => void }) {
  const onPress = "props" in node ? node.props.onPress : node.onPress;
  if (typeof onPress !== "function") throw new Error("Not pressable");
  await act(async () => { onPress(); });
  await act(async () => {});
}
async function systemBack() {
  await act(async () => { if (!back.press()) popped += 1; });
}

const copy = {
  en: { place: "Default place", zone: "Time zone", currency: "Currency", madrid: /^Europe\/Madrid, /, usd: "USD, US Dollar",
    changeZone: "Change time zone", useUsd: "Use USD", cancel: "Cancel", retry: "Retry the same change" },
  es: { place: "Lugar por defecto", zone: "Zona horaria", currency: "Moneda", madrid: /^Europe\/Madrid, /,
    usd: "USD, Dólar estadounidense", changeZone: "Cambiar zona horaria", useUsd: "Usar USD", cancel: "Cancelar",
    retry: "Reintentar el mismo cambio" },
};
type Setting = "defaultPlace" | "timeZone" | "functionalCurrency";
async function attempt(setting: Setting) {
  const words = copy[language];
  if (setting === "defaultPlace") {
    await press(row(words.place));
    return press(control("radio", "Savings"));
  }
  if (setting === "timeZone") {
    await press(row(words.zone));
    await press(control("radio", words.madrid));
    return press(control("button", words.changeZone));
  }
  await press(row(words.currency));
  await press(control("radio", words.usd));
  return press(control("button", words.useUsd));
}

test.each([
  { lang: "en" as const, copy: ["SETTINGS", "Workspace"], rows: [
    ["Default place", "Daily", "Only decides which place is already chosen when you record money."],
    ["Time zone", "Bogotá", undefined],
    ["Currency", "COP", "You can change it once, before your first movement."],
  ] },
  { lang: "es" as const, copy: ["AJUSTES", "Espacio"], rows: [
    ["Lugar por defecto", "Daily", "Solo decide qué lugar aparece ya elegido cuando registras plata."],
    ["Zona horaria", "Bogotá", undefined],
    ["Moneda", "COP", "Puedes cambiarla una vez, antes de tu primer movimiento."],
  ] },
])("the screen shows the current default place, time zone and currency in $lang", async ({ lang, copy: heading, rows }) => {
  language = lang;
  await render();
  expect(texts().slice(0, 2)).toEqual(heading);
  for (const [title, value, detail] of rows) {
    const shown = row(title!);
    expect({ value: shown.value, detail: shown.detail }).toEqual({ value, detail });
  }
});

test("choosing another place sends it against the last-read default and the screen then shows it in both languages", async () => {
  state.defaultPlace.mockResolvedValue(receipt("defaultPlace", "daily", "savings", "key-1"));
  await render();
  await press(row("Default place"));
  expect(sheets()).toEqual(["Choose your default place"]);
  expect(control("radio", "Daily").props.accessibilityState).toEqual({ checked: true, disabled: false });
  await press(control("radio", "Savings"));
  expect(state.defaultPlace.mock.calls).toEqual([[{
    workspaceId: "ws", financialAccountProfileId: "savings", expectedFinancialAccountProfileId: "daily", idempotencyKey: "key-1",
  }]]);
  expect(sheets()).toEqual([]);
  await refresh({ defaultFinancialAccountProfileId: "savings" });
  expect(row("Default place").value).toBe("Savings");
  await act(async () => root?.unmount());
  language = "es";
  await render();
  expect(row("Lugar por defecto").value).toBe("Savings");
});

test("a sole place is shown without a picker", async () => {
  state.profiles = [{ ...daily, name: "My money" }];
  await render();
  expect(row("Default place")).toMatchObject({ value: "My money", onPress: undefined });
});

test("choosing the current place and system Back send nothing and return to the same screen twice", async () => {
  await render();
  for (const close of ["current", "back"] as const) {
    await press(row("Default place"));
    expect(sheets()).toEqual(["Choose your default place"]);
    if (close === "current") await press(control("radio", "Daily"));
    else await systemBack();
    expect(sheets()).toEqual([]);
    expect(popped).toBe(0);
  }
  expect(state.defaultPlace).not.toHaveBeenCalled();
  expect(row("Default place").value).toBe("Daily");
  await systemBack();
  expect(popped).toBe(1);
});

test("a stale default shows the default chosen elsewhere and the next choice uses it as the expectation", async () => {
  state.defaultPlace.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "default_place_stale", message: "x" }))
    .mockResolvedValueOnce(receipt("defaultPlace", "savings", "daily", "key-2"));
  await render();
  await attempt("defaultPlace");
  await refresh({ defaultFinancialAccountProfileId: "savings" });
  expect(alerts()).toEqual(["Your default place was changed somewhere else. It’s now Savings."]);
  expect(control("radio", "Savings").props.accessibilityState).toEqual({ checked: true, disabled: false });
  await press(control("radio", "Daily"));
  expect(state.defaultPlace.mock.calls.map(([request]) => request)).toEqual([
    { workspaceId: "ws", financialAccountProfileId: "savings", expectedFinancialAccountProfileId: "daily", idempotencyKey: "key-1" },
    { workspaceId: "ws", financialAccountProfileId: "daily", expectedFinancialAccountProfileId: "savings", idempotencyKey: "key-2" },
  ]);
  expect(sheets()).toEqual([]);
});

test("an unconfirmed default locks the choice, survives system Back and retries the identical request", async () => {
  state.defaultPlace.mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(receipt("defaultPlace", "daily", "savings", "key-1"));
  await render();
  await attempt("defaultPlace");
  expect(alerts()).toEqual(["We couldn’t confirm this change. Retry to check the same change safely; it won’t be applied twice."]);
  expect(control("radio", "Savings").props.accessibilityState).toEqual({ checked: true, disabled: true });
  await press(control("radio", "Daily"));
  await systemBack();
  expect(sheets()).toEqual(["Choose your default place"]);
  expect(popped).toBe(0);
  await press(control("button", "Retry the same change"));
  const first = { workspaceId: "ws", financialAccountProfileId: "savings", expectedFinancialAccountProfileId: "daily", idempotencyKey: "key-1" };
  expect(state.defaultPlace.mock.calls.map(([request]) => request)).toEqual([first, first]);
  expect(sheets()).toEqual([]);
});

test("an access failure goes to the device handler and the retry repeats the identical request", async () => {
  const revoked = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  state.reportFailure.mockImplementation((error) => error === revoked);
  state.defaultPlace.mockRejectedValueOnce(revoked).mockResolvedValueOnce(receipt("defaultPlace", "daily", "savings", "key-1"));
  await render();
  await attempt("defaultPlace");
  expect(state.reportFailure).toHaveBeenCalledWith(revoked);
  expect(control("radio", "Savings").props.accessibilityState.disabled).toBe(true);
  await press(control("button", "Retry the same change"));
  expect(state.defaultPlace.mock.calls[1]).toEqual(state.defaultPlace.mock.calls[0]);
  expect(state.defaultPlace.mock.calls[0][0]).toEqual({
    workspaceId: "ws", financialAccountProfileId: "savings", expectedFinancialAccountProfileId: "daily", idempotencyKey: "key-1",
  });
});

const sessionRefused = "We couldn’t confirm your session. Sign in again, then retry.";
const deviceRefused = "We couldn’t confirm this phone’s access. Open Lukapp again, then retry.";
const accessRefused = "This account can’t change this workspace’s settings.";
const rejected = "We couldn’t save this change. Try again.";
test.each([
  { setting: "defaultPlace", code: "default_place_stale", message: "Your default place was changed somewhere else. It’s now Daily." },
  { setting: "defaultPlace", code: "financial_account_profile_not_found", message: "That place is no longer available. Choose another one." },
  { setting: "timeZone", code: "time_zone_stale", message: "The time zone was changed somewhere else. It’s now Bogotá." },
  { setting: "timeZone", code: "time_zone_invalid", message: "Lukapp doesn’t recognize that time zone. Choose another one." },
  { setting: "functionalCurrency", code: "functional_currency_stale", message: "The currency was changed somewhere else. It’s now COP." },
  { setting: "functionalCurrency", code: "functional_currency_invalid", message: "Lukapp can’t use that currency. Choose another one." },
  { setting: "functionalCurrency", code: "functional_currency_has_entries", message: "It can’t change anymore because this workspace already has movements." },
  { setting: "functionalCurrency", code: "functional_currency_has_records",
    message: "It can’t change anymore because amounts in COP are already saved, like a Budget limit or a starting balance." },
  { setting: "functionalCurrency", code: "functional_currency_already_changed", message: "It can’t change again because you already changed it once." },
  { setting: "timeZone", code: "defaults_unavailable", message: "Your workspace isn’t ready yet. Finish setup first." },
  { setting: "defaultPlace", code: "idempotency_key_required", message: rejected },
  { setting: "timeZone", code: "idempotency_key_conflict", message: rejected },
  { setting: "defaultPlace", code: "workspace_membership_required", message: accessRefused },
  { setting: "defaultPlace", code: "authentication_required", message: sessionRefused, auth: true },
  { setting: "timeZone", code: "session_required", message: sessionRefused, auth: true },
  { setting: "functionalCurrency", code: "session_inactive", message: sessionRefused, auth: true },
  { setting: "defaultPlace", code: "session_verification_required", message: sessionRefused, auth: true },
  { setting: "timeZone", code: "device_registration_required", message: deviceRefused, auth: true },
  { setting: "functionalCurrency", code: "device_revoked", message: deviceRefused, auth: true },
  { setting: "defaultPlace", code: "membership_required", message: accessRefused, auth: true },
  { setting: "timeZone", code: "permission_denied", message: accessRefused, auth: true },
  { setting: "functionalCurrency", code: "a_future_code", message: rejected },
] as { setting: Setting; code: string; message: string; auth?: boolean }[])(
  "$code on $setting reads as catalog copy, never the code, and unlocks the choice",
  async ({ setting, code, message, auth }) => {
    const error = new ConvexError(auth ? { code } : { kind: "accounting", code, message: "internal wording" });
    ({ defaultPlace: state.defaultPlace, timeZone: state.timeZone, functionalCurrency: state.currency })[setting]
      .mockRejectedValueOnce(error);
    await render();
    await attempt(setting);
    expect(alerts()).toEqual([message]);
    expect(JSON.stringify(root?.toJSON())).not.toContain(code);
    expect(maybeButton("Retry the same change")).toBeUndefined();
    await systemBack();
    expect(sheets()).toEqual([]);
  },
);

test("Spanish refusals and the unconfirmed state read in Colombian Spanish", async () => {
  language = "es";
  state.timeZone.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "time_zone_stale" }))
    .mockRejectedValueOnce(new Error("offline"));
  await render();
  await attempt("timeZone");
  expect(alerts()).toEqual(["La zona horaria se cambió desde otro lado. Ahora es Bogotá."]);
  await press(control("button", "Cambiar zona horaria"));
  expect(alerts()).toEqual(["No pudimos confirmar este cambio. Reintenta: revisamos el mismo cambio sin aplicarlo dos veces."]);
  expect(control("button", "Reintentar el mismo cambio")).toBeDefined();
});

test.each([
  { lang: "en" as const, title: "Change the time zone to Madrid?", lines: [
    "From now on, “today” and the current month follow Madrid. Everything you already recorded keeps its date, closed months stay closed, and your Budget history doesn’t move.",
    "With this time zone, today is November 11, 2026.",
  ] },
  { lang: "es" as const, title: "¿Cambiar la zona horaria a Madrid?", lines: [
    "Desde ahora, “hoy” y el mes actual siguen la hora de Madrid. Todo lo que ya registraste conserva su fecha, los meses cerrados siguen cerrados y el historial de tu Presupuesto no se mueve.",
    "Con esta zona horaria, hoy es 11 de noviembre de 2026.",
  ] },
])("a new time zone is confirmed with its consequence and today's date there in $lang", async ({ lang, title, lines }) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T20:00:00-05:00"));
  language = lang;
  state.timeZone.mockResolvedValue(receipt("timeZone", "America/Bogota", "Europe/Madrid", "key-1"));
  await render();
  await press(row(copy[lang].zone));
  expect(sheets()).toEqual(["search"]);
  await press(control("radio", copy[lang].madrid));
  expect(sheets()).toEqual([title]);
  expect(texts()).toEqual(expect.arrayContaining([title, ...lines]));
  expect(state.timeZone).not.toHaveBeenCalled();
  await press(control("button", copy[lang].changeZone));
  expect(state.timeZone.mock.calls).toEqual([[{
    workspaceId: "ws", timeZone: "Europe/Madrid", expectedTimeZone: "America/Bogota", idempotencyKey: "key-1",
  }]]);
  expect(sheets()).toEqual([]);
  await refresh({ timeZone: "Europe/Madrid" });
  expect(row(copy[lang].zone).value).toBe("Madrid");
});

test("a zone with the same date today says nothing about today", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T12:00:00-05:00"));
  await render();
  await press(row("Time zone"));
  await press(control("radio", /^America\/Lima, /));
  expect(texts()).not.toContain("With this time zone, today is November 10, 2026.");
  expect(texts().filter((line) => line.startsWith("With this time zone"))).toEqual([]);
  expect(texts()).toContain("Change the time zone to Lima?");
});

test("picking the current zone, Back on the picker, Back on the confirmation and Cancel send nothing, twice", async () => {
  await render();
  for (let round = 0; round < 2; round += 1) {
    await press(row("Time zone"));
    await press(control("radio", /^America\/Bogota, /));
    expect(sheets()).toEqual([]);
    await press(row("Time zone"));
    await systemBack();
    expect(sheets()).toEqual([]);
    await press(row("Time zone"));
    await press(control("radio", /^Europe\/Madrid, /));
    await systemBack();
    expect(sheets()).toEqual([]);
    await press(row("Time zone"));
    await press(control("radio", /^Europe\/Madrid, /));
    await press(control("button", "Cancel"));
    expect(sheets()).toEqual([]);
  }
  expect(popped).toBe(0);
  expect(state.timeZone).not.toHaveBeenCalled();
  expect(row("Time zone").value).toBe("Bogotá");
  await systemBack();
  expect(popped).toBe(1);
});

test("an unconfirmed time zone change cannot be cancelled and retries the identical request", async () => {
  state.timeZone.mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(receipt("timeZone", "America/Bogota", "Europe/Madrid", "key-1"));
  await render();
  await attempt("timeZone");
  expect(maybeButton("Cancel")).toBeUndefined();
  await systemBack();
  expect(sheets()).toEqual(["Change the time zone to Madrid?"]);
  await press(control("button", "Retry the same change"));
  const first = { workspaceId: "ws", timeZone: "Europe/Madrid", expectedTimeZone: "America/Bogota", idempotencyKey: "key-1" };
  expect(state.timeZone.mock.calls.map(([request]) => request)).toEqual([first, first]);
  expect(sheets()).toEqual([]);
});

const facts = (patch: Partial<LocalEntryFacts>): LocalEntryFacts => ({
  workspaceId: "ws", currency: "COP", entryType: "normal", amountText: "-12.000", accountingDate: "2026-11-10",
  description: "Taxi", profileId: "daily", destinationId: null, categories: { ids: [], primaryId: null }, ...patch,
});
const expense = (idempotencyKey: string, currency = "COP"): PostableCommand => ({ kind: "expense", payload: {
  workspaceId: "ws", financialAccountProfileId: "daily", amount: { currency, minorUnits: 1200000 },
  accountingDate: "2026-11-10", description: "Lunch", idempotencyKey,
} });
async function storeDeviceInput() {
  const now = Date.now();
  let document: LocalEntryDocument = { v: 1, drafts: [] };
  document = keepIn(document, { facts: facts({}) }, now, () => "taxi").document;
  document = keepIn(document, { facts: facts({ workspaceId: "other", description: "Elsewhere" }) }, now, () => "elsewhere").document;
  document = beginPostIn(document, { command: expense("sent") }, now, () => "sent").document;
  document = { ...document, postingBatches: { ws: { receipts: { count: 0, net: 0 },
    queue: [{ id: "queued", command: expense("queued") }, { id: "dispatched", command: expense("sent") }] } } };
  await writeDocument("owner", document);
}
async function storedInput() {
  const { document } = parseLocalEntryDocument(await readRaw("owner"), Date.now());
  return { drafts: document.drafts.map((draft) => draft.id), queue: document.postingBatches?.ws?.queue.map((row) => row.id) };
}

test.each([
  { lang: "en" as const, title: "Use USD for this workspace?", lines: [
    "You can change the currency only once, and never after you record your first movement.",
    "This phone has 2 drafts in COP that weren’t recorded. Changing the currency deletes them.",
  ], after: "It can’t change again because you already changed it once." },
  { lang: "es" as const, title: "¿Usar USD en este espacio?", lines: [
    "Solo puedes cambiar la moneda una vez, y nunca después de registrar tu primer movimiento.",
    "Este celular tiene 2 borradores en COP sin registrar. Si cambias la moneda, se borran.",
  ], after: "Ya no se puede cambiar porque ya la cambiaste una vez." },
])("a currency change says it is once only, deletes unsent input in the old currency and then reads $lang",
  async ({ lang, title, lines, after }) => {
    language = lang;
    await storeDeviceInput();
    state.currency.mockResolvedValue(receipt("functionalCurrency", "COP", "USD", "key-1"));
    await render();
    await press(row(copy[lang].currency));
    await press(control("radio", copy[lang].usd));
    expect(sheets()).toEqual([title]);
    expect(texts()).toEqual(expect.arrayContaining([title, ...lines]));
    expect(await storedInput()).toEqual({ drafts: ["taxi", "elsewhere", "sent"], queue: ["queued", "dispatched"] });
    await press(control("button", copy[lang].useUsd));
    expect(state.currency.mock.calls).toEqual([[{
      workspaceId: "ws", functionalCurrency: "USD", expectedFunctionalCurrency: "COP", idempotencyKey: "key-1",
    }]]);
    expect(sheets()).toEqual([]);
    expect(await storedInput()).toEqual({ drafts: ["elsewhere", "sent"], queue: ["dispatched"] });
    await refresh({ functionalCurrency: "USD", canChangeFunctionalCurrency: false,
      currencyChangeBlockedReason: "functional_currency_already_changed" });
    expect(row(copy[lang].currency)).toMatchObject({ value: "USD", detail: after, onPress: undefined });
  });

test("without unsent input the currency confirmation does not mention drafts", async () => {
  await render();
  await press(row("Currency"));
  await press(control("radio", "USD, US Dollar"));
  expect(texts().filter((line) => line.includes("draft"))).toEqual([]);
  expect(control("button", "Use USD").props.accessibilityState.disabled).toBe(false);
});

test.each([
  { reason: "functional_currency_has_entries", en: "It can’t change anymore because this workspace already has movements.",
    es: "Ya no se puede cambiar porque este espacio ya tiene movimientos." },
  { reason: "functional_currency_has_records",
    en: "It can’t change anymore because amounts in COP are already saved, like a Budget limit or a starting balance.",
    es: "Ya no se puede cambiar porque ya hay montos guardados en COP, como un tope del Presupuesto o un saldo inicial." },
  { reason: "functional_currency_already_changed", en: "It can’t change again because you already changed it once.",
    es: "Ya no se puede cambiar porque ya la cambiaste una vez." },
  { reason: null, en: "It can’t change anymore.", es: "Ya no se puede cambiar." },
])("a currency blocked by $reason is read-only with one sentence in both languages", async ({ reason, en, es }) => {
  state.settings = read({ canChangeFunctionalCurrency: false, currencyChangeBlockedReason: reason });
  for (const [lang, detail] of [["en", en], ["es", es]] as const) {
    language = lang;
    await render();
    expect(row(copy[lang].currency)).toMatchObject({ value: "COP", detail, onPress: undefined });
    if (reason) expect(JSON.stringify(root?.toJSON())).not.toContain(reason);
    await act(async () => root?.unmount());
  }
  root = undefined;
});

test("the currency picker and confirmation close on Back and Cancel without sending, twice", async () => {
  await storeDeviceInput();
  await render();
  for (let round = 0; round < 2; round += 1) {
    await press(row("Currency"));
    await press(control("radio", /^COP, /));
    expect(sheets()).toEqual([]);
    await press(row("Currency"));
    await systemBack();
    await press(row("Currency"));
    await press(control("radio", "USD, US Dollar"));
    await systemBack();
    await press(row("Currency"));
    await press(control("radio", "USD, US Dollar"));
    await press(control("button", "Cancel"));
    expect(sheets()).toEqual([]);
  }
  expect(popped).toBe(0);
  expect(state.currency).not.toHaveBeenCalled();
  expect(await storedInput()).toEqual({ drafts: ["taxi", "elsewhere", "sent"], queue: ["queued", "dispatched"] });
});

test("an unconfirmed currency change stays locked, retries the identical request and keeps input until confirmed", async () => {
  await storeDeviceInput();
  state.currency.mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(receipt("functionalCurrency", "COP", "USD", "key-1"));
  await render();
  await attempt("functionalCurrency");
  expect(sheets()).toEqual(["Use USD for this workspace?"]);
  await systemBack();
  expect(sheets()).toEqual(["Use USD for this workspace?"]);
  expect(await storedInput()).toEqual({ drafts: ["taxi", "elsewhere", "sent"], queue: ["queued", "dispatched"] });
  await press(control("button", "Retry the same change"));
  const first = { workspaceId: "ws", functionalCurrency: "USD", expectedFunctionalCurrency: "COP", idempotencyKey: "key-1" };
  expect(state.currency.mock.calls.map(([request]) => request)).toEqual([first, first]);
  expect(await storedInput()).toEqual({ drafts: ["elsewhere", "sent"], queue: ["dispatched"] });
});

test("a refused currency change keeps every draft on the phone", async () => {
  await storeDeviceInput();
  state.currency.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "functional_currency_has_entries" }));
  await render();
  await attempt("functionalCurrency");
  await refresh({ canChangeFunctionalCurrency: false, currencyChangeBlockedReason: "functional_currency_has_entries" });
  expect(alerts()).toEqual(["It can’t change anymore because this workspace already has movements."]);
  expect(control("button", "Use USD").props.accessibilityState.disabled).toBe(true);
  expect(await storedInput()).toEqual({ drafts: ["taxi", "elsewhere", "sent"], queue: ["queued", "dispatched"] });
});

test("unsent input counts once when a rejected batch row reopened its draft, and other currencies stay", () => {
  const now = Date.now();
  const sent = beginPostIn({ v: 1, drafts: [] }, { command: expense("row") }, now, () => "row-draft");
  const reopened = rejectPostIn(sent.document, "row-draft");
  const document: LocalEntryDocument = {
    ...keepIn(reopened, { facts: facts({ currency: "EUR" }) }, now, () => "euro").document,
    postingBatches: { ws: { receipts: { count: 0, net: 0 }, queue: [{ id: "row", command: expense("row"), draftId: "row-draft" }] } },
  };
  const result = dropUnsentInCurrency(document, "ws", "COP");
  expect(result.dropped).toBe(1);
  expect(result.document.drafts.map((draft) => draft.id)).toEqual(["euro"]);
  expect(result.document.postingBatches?.ws?.queue).toEqual([]);
});

test("Back from the screen returns to the existing caller, and a direct link falls back to Settings", async () => {
  await render();
  await press(tree().findAll((node) => node.type === ("button" as never) && node.props.accessibilityLabel === "Back")[0]!);
  expect(state.router.back).toHaveBeenCalledOnce();
  state.router.canGoBack.mockImplementation(() => false);
  await press(tree().findAll((node) => node.type === ("button" as never) && node.props.accessibilityLabel === "Back")[0]!);
  expect(state.router.back).toHaveBeenCalledOnce();
  expect(state.router.replace.mock.calls).toEqual([["/settings"]]);
  expect(state.router.push).not.toHaveBeenCalled();
});
