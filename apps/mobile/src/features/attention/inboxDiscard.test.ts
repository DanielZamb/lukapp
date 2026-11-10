import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, string>());
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
const back = await vi.hoisted(async () => (await import("../../ui/bottomSheet.testSupport")).backHandlers());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => memory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { memory.set(key, value); },
  deleteItemAsync: async (key: string) => { memory.delete(key); },
}));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
vi.mock("@gorhom/bottom-sheet", () => import("../../ui/bottomSheet.testSupport"));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    useLocalSearchParams: () => ({ segment: "wait" }), router, Redirect: "redirect",
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
vi.mock("convex/react", () => ({ useAction: () => vi.fn(), useQuery: () => [{ id: "account-1", name: "Bank" }] }));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace-1", functionalCurrency: "COP", currentAccountingPeriod: { year: 2026, month: 10 }, timeZone: "America/Bogota" },
  financialAccountProfile: { id: "account-1" },
}) }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native", () => ({
  BackHandler: back.BackHandler,
  KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  Platform: { OS: "android" },
  Easing: { out: vi.fn(), in: vi.fn(), quad: vi.fn() },
  Animated: {
    View: "animated-view", Value: class { interpolate() { return 0; } },
    timing: vi.fn(), sequence: vi.fn(), loop: () => ({ start: vi.fn(), stop: vi.fn() }),
  },
}));

import DraftsRoute from "../../../app/drafts";
import { LocalInput } from "../../local-auth/localInput";
import { IntakeContext } from "../intake/IntakeProvider";
import { capture, fixture, now } from "../intake/service.testSupport";
import { beginPostIn, keepIn, parseLocalEntryDocument, readRaw, storageKey, writeDocument, type LocalEntryFacts } from "../localEntryDrafts";

let root: ReactTestRenderer | undefined;
let f: ReturnType<typeof fixture>;
const facts: LocalEntryFacts = {
  workspaceId: "workspace-1", currency: "COP", entryType: "normal", amountText: "-12.000", amountFormat: "pre-currency", accountingDate: "2026-10-23",
  description: "Taxi", profileId: "account-1", destinationId: null, categories: { ids: [], primaryId: null },
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  memory.clear();
  router.back.mockClear();
  router.push.mockClear();
  f = fixture();
  f.setPages([{ captures: [capture, { ...capture, captureId: "capture-2", description: "Bakery" }], nextCursor: null }]);
  await f.service.refresh();
  const taxi = keepIn({ v: 2, drafts: [] }, { facts }, now, () => "taxi");
  const lunch = keepIn(taxi.document, { facts: { ...facts, description: "Lunch" } }, now, () => "lunch");
  const posting = beginPostIn(lunch.document, { command: { kind: "expense", payload: {
    workspaceId: "workspace-1", financialAccountProfileId: "account-1", amount: { currency: "COP", minorUnits: 900000 },
    accountingDate: "2026-10-23", description: "Rent", idempotencyKey: "rent-key",
  } } }, now, () => "rent");
  await writeDocument("owner", posting.document);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => {
    root = create(createElement(LocalInput.Provider, { value: f.lease },
      createElement(IntakeContext.Provider, { value: f.service }, createElement(DraftsRoute))));
  });
}
function buttons() {
  return root?.root.findAllByType("button") ?? [];
}
function button(label: string) {
  const found = buttons().find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
function has(label: string) {
  return buttons().some((node) => node.props.accessibilityLabel === label);
}
function text() {
  return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? "";
}
function sheet() {
  return root?.root.findAll((node) => String(node.type) === "sheet")[0] ?? null;
}
async function storedDrafts() {
  return parseLocalEntryDocument(await readRaw("owner"), Date.now()).document.drafts.map((draft) => draft.id);
}

test("discarding one Candidate from its row leaves the other Candidate, the Drafts and the count", async () => {
  await mount();
  const draftsBefore = memory.get(storageKey("owner"));
  expect(button("Can wait, 4").props.accessibilityState).toEqual({ selected: true, checked: true });
  await act(async () => button("Discard Market").props.onPress());
  expect(sheet()?.props.accessibilityLabel).toBe("Discard this Candidate?");
  expect(text()).toContain("Market · COP 450,00");
  expect(text()).toContain("It's removed from this phone with its notification text. Nothing posted changes, and the same notification won't come back.");
  await act(async () => button("Discard").props.onPress());
  expect(sheet()).toBeNull();
  expect(has("Review Market")).toBe(false);
  expect(has("Review Bakery")).toBe(true);
  expect(button("Can wait, 3").props.accessibilityState).toEqual({ selected: true, checked: true });
  expect(text()).toContain("Taxi");
  expect(text()).toContain("Lunch");
  expect(f.state().records.find((row) => row.id === "capture-1")).toMatchObject({ kind: "terminal", reason: "deleted" });
  expect(memory.get(storageKey("owner"))).toBe(draftsBefore);
  expect(router.push).not.toHaveBeenCalled();
});

test("Cancel and Android Back close the confirmation without discarding anything", async () => {
  await mount();
  await act(async () => button("Discard Market").props.onPress());
  await act(async () => button("Cancel").props.onPress());
  expect(sheet()).toBeNull();
  await act(async () => button("Discard Market").props.onPress());
  let consumed = false;
  await act(async () => { consumed = back.press(); });
  expect(consumed).toBe(true);
  expect(sheet()).toBeNull();
  expect(router.back).not.toHaveBeenCalled();
  expect(f.service.read("capture-1")?.recordRevision).toBe(0);
  expect(has("Review Market")).toBe(true);
});

test("a Candidate that changed after its confirmation opened is refused and shown again", async () => {
  await mount();
  await act(async () => button("Discard Market").props.onPress());
  const row = f.service.read("capture-1");
  if (!row) throw new Error("missing Candidate");
  await act(async () => { await f.service.updateReview(row.id, 0, { ...row.review, description: "Edited market" }); });
  await act(async () => button("Discard").props.onPress());
  expect(sheet()).toBeNull();
  expect(text()).toContain("This Candidate changed since you opened it. Check it and try again.");
  expect(has("Review Edited market")).toBe(true);
  expect(f.service.read("capture-1")?.review.description).toBe("Edited market");
});

test("a Candidate or Draft whose command was dispatched offers no discard", async () => {
  await mount();
  await act(async () => { await f.service.beginConfirmation("capture-2", 0); });
  await act(async () => button("Needs you now, 2").props.onPress());
  expect(has("Review Bakery")).toBe(true);
  expect(has("Discard Bakery")).toBe(false);
  expect(text()).toContain("Rent");
  expect(has("Discard draft Rent")).toBe(false);
});

test("discarding one of two Drafts keeps the other through a restart and leaves the Candidates", async () => {
  await mount();
  await act(async () => button("Discard draft Taxi").props.onPress());
  expect(sheet()?.props.accessibilityLabel).toBe("Discard this draft?");
  expect(text()).toContain("It's removed from this phone only. Nothing posted changes.");
  await act(async () => button("Discard").props.onPress());
  expect(await storedDrafts()).toEqual(["lunch", "rent"]);
  expect(text()).not.toContain("Taxi");
  await act(async () => root?.unmount());
  await mount();
  expect(text()).toContain("Lunch");
  expect(text()).not.toContain("Taxi");
  expect(f.service.candidates().map((row) => row.id)).toEqual(["capture-1", "capture-2"]);
});
