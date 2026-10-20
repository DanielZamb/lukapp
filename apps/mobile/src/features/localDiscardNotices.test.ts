import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import DraftsRoute from "../../app/drafts";
import type { DraftListItem } from "./localEntryDrafts";
import {
  addDiscardNotice,
  clearDiscardNotices,
  DISCARD_NOTICE_TTL_MS,
  discardNoticesStorageKey,
  readDiscardNotices,
} from "./localDiscardNotices";
import { clearLocalInput } from "./clearLocalInput";

const state = vi.hoisted(() => ({
  memory: new Map<string, string>(),
  drafts: [] as DraftListItem[],
  failDelete: false,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => state.memory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { state.memory.set(key, value); },
  deleteItemAsync: async (key: string) => {
    if (state.failDelete) throw new Error("Storage unavailable");
    state.memory.delete(key);
  },
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn() }, Redirect: "redirect",
}));
vi.mock("convex/react", () => ({ useAction: () => vi.fn(), useQuery: () => [] }));
vi.mock("./activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace", functionalCurrency: "COP", currentAccountingPeriod: { year: 2026, month: 10 } },
  financialAccountProfile: { id: "daily" },
}) }));
vi.mock("./useLocalEntryDrafts", () => ({ useLocalEntryDrafts: () => ({ items: state.drafts, count: state.drafts.length, error: "" }) }));
vi.mock("./useIntakeCandidates", () => ({ useIntakeCandidates: () => ({
  now: [], wait: [], ready: [], count: 0, error: "", accept: vi.fn(),
}) }));
vi.mock("../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => vi.fn() }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  Platform: { OS: "android" },
  Easing: { out: vi.fn(), in: vi.fn(), quad: vi.fn() },
  Animated: {
    View: "animated-view", Value: class { interpolate() { return 0; } },
    timing: vi.fn(), sequence: vi.fn(), loop: () => ({ start: vi.fn(), stop: vi.fn() }),
  },
}));

const now = Date.UTC(2026, 9, 18, 12);
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  state.memory.clear();
  state.failDelete = false;
  state.drafts = [{
    id: "draft", status: "open", kind: "normal", description: "Private draft",
    workspaceId: "workspace", expiresAt: now + DISCARD_NOTICE_TTL_MS,
  }];
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DEV__", false);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function text() {
  return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? "";
}
function buttons() {
  return root?.root.findAllByType("button") ?? [];
}
async function press(label: string) {
  const button = buttons().find((node) => node.props.accessibilityLabel === label);
  if (!button) throw new Error(`Missing ${label}`);
  await act(async () => { button.props.onPress(); });
}
async function mount() {
  await act(async () => { root = create(createElement(DraftsRoute)); });
}

test("an empty notice store is empty and uses a separate per-user key", async () => {
  expect(await readDiscardNotices("owner")).toEqual([]);
  await addDiscardNotice("owner", { reason: "Security alert", time: now });
  expect(state.memory.get("u08.discard-notices.owner")).toBe(JSON.stringify([{ reason: "Security alert", time: now }]));
  expect(await readDiscardNotices("other")).toEqual([]);
  expect(state.memory.has("u01.expense.owner")).toBe(false);
  expect(state.memory.has("u08.intake.owner")).toBe(false);
});

test("writes retain only a fixed reason and time, even with extra notification fields", async () => {
  const input = {
    reason: "Security alert" as const, time: now,
    body: "Private notification", amount: 90000, sourceApplication: "Private bank",
  };
  await addDiscardNotice("owner", input);
  expect(JSON.parse(state.memory.get(discardNoticesStorageKey("owner")) ?? "null")).toEqual([
    { reason: "Security alert", time: now },
  ]);
});

test("reads strip and purge unexpected notification content from storage", async () => {
  state.memory.set(discardNoticesStorageKey("owner"), JSON.stringify([
    { reason: "Security alert", time: now, body: "Private notification", bank: "Private bank", amount: 90000 },
  ]));
  expect(await readDiscardNotices("owner")).toEqual([{ reason: "Security alert", time: now }]);
  expect(state.memory.get(discardNoticesStorageKey("owner"))).toBe(JSON.stringify([{ reason: "Security alert", time: now }]));
});

test("the store rejects freeform reasons", async () => {
  state.memory.set(discardNoticesStorageKey("owner"), JSON.stringify([{ reason: "Bank paid 90000", time: now }]));
  await expect(readDiscardNotices("owner")).rejects.toThrow();
});

test("notices expire at exactly 15 days and expired notices are removed from SecureStore", async () => {
  await addDiscardNotice("owner", { reason: "Security alert", time: now - DISCARD_NOTICE_TTL_MS + 1 });
  await addDiscardNotice("owner", { reason: "Missing amount or direction", time: now });
  vi.setSystemTime(now + 1);
  expect(await readDiscardNotices("owner")).toEqual([{ reason: "Missing amount or direction", time: now }]);
  vi.setSystemTime(now + DISCARD_NOTICE_TTL_MS);
  expect(await readDiscardNotices("owner")).toEqual([]);
  expect(state.memory.has(discardNoticesStorageKey("owner"))).toBe(false);
});

test("already expired notices are never stored", async () => {
  await addDiscardNotice("owner", { reason: "Security alert", time: now - DISCARD_NOTICE_TTL_MS });
  expect(await readDiscardNotices("owner")).toEqual([]);
  expect(state.memory.size).toBe(0);
});

test("clearing notices leaves other users, drafts, and candidates intact", async () => {
  await addDiscardNotice("owner", { reason: "Security alert", time: now });
  await addDiscardNotice("other", { reason: "Security alert", time: now });
  state.memory.set("u01.expense.owner", "draft");
  state.memory.set("u08.intake.owner", "candidate");
  await clearDiscardNotices("owner");
  expect(await readDiscardNotices("owner")).toEqual([]);
  expect(await readDiscardNotices("other")).toEqual([{ reason: "Security alert", time: now }]);
  expect(state.memory.get("u01.expense.owner")).toBe("draft");
  expect(state.memory.get("u08.intake.owner")).toBe("candidate");
});

test("the existing local input wipe also removes discard notices", async () => {
  await addDiscardNotice("owner", { reason: "Security alert", time: now });
  await clearLocalInput("owner");
  expect(await readDiscardNotices("owner")).toEqual([]);
});

test("concurrent additions retain both notices", async () => {
  await Promise.all([
    addDiscardNotice("owner", { reason: "Security alert", time: now }),
    addDiscardNotice("owner", { reason: "Missing amount or direction", time: now }),
  ]);
  expect(await readDiscardNotices("owner")).toEqual([
    { reason: "Security alert", time: now },
    { reason: "Missing amount or direction", time: now },
  ]);
});

test("OK cannot race expiry cleanup and restore a dismissed notice", async () => {
  await addDiscardNotice("owner", { reason: "Security alert", time: now - DISCARD_NOTICE_TTL_MS + 1 });
  await addDiscardNotice("owner", { reason: "Missing amount or direction", time: now });
  vi.setSystemTime(now + 1);
  await Promise.all([readDiscardNotices("owner"), clearDiscardNotices("owner")]);
  expect(await readDiscardNotices("owner")).toEqual([]);
  expect(state.memory.has(discardNoticesStorageKey("owner"))).toBe(false);
});

test("the route places the notice below the list and above Month Close, with full-screen reason and time detail", async () => {
  await addDiscardNotice("owner", { reason: "Missing amount or direction", time: now });
  await addDiscardNotice("owner", { reason: "Security alert", time: now - 1000 });
  await mount();
  const inbox = text();
  expect(inbox.indexOf("Private draft")).toBeLessThan(inbox.indexOf("Notifications discarded"));
  expect(inbox.indexOf("Notifications discarded")).toBeLessThan(inbox.indexOf("Preview Month Close warning"));
  await press("Notifications discarded");
  expect(text()).toContain("Discarded notifications");
  expect(text()).toContain("NOT SAVED AS CANDIDATES");
  expect(text()).toContain("These notices contain no notification text. They disappear after 15 days.");
  expect(text()).toContain("Missing amount or direction");
  expect(text()).toContain("Security alert");
  expect(text()).toContain(new Date(now).toLocaleString());
  expect(text()).toContain(new Date(now - 1000).toLocaleString());
  expect(text()).not.toContain("Private draft");
  expect(text()).not.toContain("COP");
  expect(text()).not.toContain("Preview Month Close warning");
  await press("Back");
  expect(text()).toContain("Notifications discarded");
  expect(await readDiscardNotices("owner")).toHaveLength(2);
  await press("Notifications discarded");
  await press("OK");
  expect(await readDiscardNotices("owner")).toEqual([]);
  expect(text()).toContain("Candidates");
  expect(text()).not.toContain("Notifications discarded");
  await act(async () => { root?.unmount(); });
  root = undefined;
  await mount();
  expect(text()).not.toContain("Notifications discarded");
});

test("OK retains notices and offers retry when removal fails", async () => {
  await addDiscardNotice("owner", { reason: "Security alert", time: now });
  await mount();
  await press("Notifications discarded");
  state.failDelete = true;
  await press("OK");
  expect(text()).toContain("Could not remove discarded notification notices. Try again.");
  expect(text()).toContain("Discarded notifications");
  expect(await readDiscardNotices("owner")).toHaveLength(1);
  state.failDelete = false;
  await press("OK");
  expect(await readDiscardNotices("owner")).toEqual([]);
  expect(text()).not.toContain("Notifications discarded");
});

test("Review complete hides the notice even when unexpired notices exist", async () => {
  state.drafts = [];
  await addDiscardNotice("owner", { reason: "Security alert", time: now });
  await mount();
  expect(text()).toContain("Review complete");
  expect(text()).not.toContain("Notifications discarded");
  expect(await readDiscardNotices("owner")).toHaveLength(1);
});

test("the inbox hides the button without notices and when the last notice expires on screen", async () => {
  await mount();
  expect(text()).not.toContain("Notifications discarded");
  await act(async () => { root?.unmount(); });
  root = undefined;
  await addDiscardNotice("owner", { reason: "Security alert", time: now - DISCARD_NOTICE_TTL_MS + 1000 });
  await mount();
  expect(text()).toContain("Notifications discarded");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(text()).not.toContain("Notifications discarded");
  expect(await readDiscardNotices("owner")).toEqual([]);
});
