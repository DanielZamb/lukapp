import * as React from "react";
import { createElement, useSyncExternalStore } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import DraftsRoute from "../../../app/drafts";
import { fixture, now } from "../intake/service.testSupport";
const now0 = now;
import { viewInbox, type IntakeCandidate } from "../intake/candidates";
import { confirmReadyCandidates } from "../intake/confirmReady";
import { createCandidateBinding } from "../intake/postingBinding";
import { createTranslator } from "../../../../../src/i18n";
import type { ConfirmCandidateInput } from "../../../../../src/notificationIntake/types";

const route = vi.hoisted((): {
  segment: string | string[] | undefined;
  push: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
} => ({ segment: "wait", push: vi.fn(), replace: vi.fn() }));
const intakeState = vi.hoisted(() => ({
  now: [] as IntakeCandidate[],
  wait: [] as IntakeCandidate[],
  confirm: vi.fn(), refresh: vi.fn(), report: vi.fn(),
  places: [] as Array<{ id: string; name: string; status: string }>,
}));
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ segment: route.segment }),
  router: { push: route.push, replace: route.replace, back: vi.fn() }, Redirect: "redirect",
}));
vi.mock("convex/react", () => ({ useAction: () => intakeState.confirm, useQuery: () => intakeState.places }));
vi.mock("expo-secure-store", () => ({}));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace", functionalCurrency: "COP", currentAccountingPeriod: { year: 2026, month: 10 } },
  financialAccountProfile: { id: "daily" },
}) }));
vi.mock("../useLocalEntryDrafts", () => ({ useLocalEntryDrafts: () => ({ items: [], count: 0, error: "" }) }));
vi.mock("../useIntakeCandidates", () => ({ useIntakeCandidates: () => {
  useSyncExternalStore(f.service.subscribe, f.service.getSnapshot);
  const projected = f.service.candidates();
  const project = (rows: IntakeCandidate[]) => rows.flatMap((row) => {
    const saved = f.service.getSnapshot().state.records.find((record) => record.id === row.id);
    return saved?.kind === "terminal" ? [] : [projected.find((candidate) => candidate.id === row.id) ?? row];
  });
  const now = project(intakeState.now), wait = project(intakeState.wait);
  return { now, wait, ready: viewInbox({ v: 1, candidates: [...now, ...wait] }, "workspace", now0, "COP").ready,
    count: now.length + wait.length, error: "", notices: [], dismissNotices: vi.fn(), service: f.service,
    refresh: async () => { intakeState.refresh(); await f.service.refresh(); },
  };
} }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => intakeState.report }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
const back = await vi.hoisted(async () => (await import("../../ui/bottomSheet.testSupport")).backHandlers());
vi.mock("@gorhom/bottom-sheet", () => import("../../ui/bottomSheet.testSupport"));
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
let root: ReactTestRenderer;
let f: ReturnType<typeof fixture>;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DEV__", false);
  route.segment = "wait";
  route.push.mockClear();
  route.replace.mockClear();
  intakeState.now = [];
  intakeState.wait = [];
  intakeState.places = [];
  f = fixture();
  f.setValue(null, 0);
  f.setPages([{ captures: [], nextCursor: null }]);
  intakeState.refresh.mockReset();
  intakeState.report.mockReset().mockReturnValue(false);
  intakeState.confirm.mockReset().mockImplementation(async ({ items }: { items: ConfirmCandidateInput[] }) => ({
    results: items.map((item) => ({
      candidateId: item.candidateId,
      ok: true,
      result: {
        posted: { id: `je-${item.candidateId}`, description: item.confirmed.description, amount: item.confirmed.amount, replay: false },
        receipt: {
          id: `r-${item.candidateId}`, workspaceId: item.workspaceId,
          journalEntryId: `je-${item.candidateId}`, idempotencyKey: `intake:${item.candidateId}`,
          suggestion: item.suggestion, changedFields: [], parserVersion: item.parserVersion,
          consentVersion: item.consentVersion, actorId: "owner", confirmedAt: 1,
        },
        replay: false,
      },
    })),
  }));
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});
async function mount() {
  f.setLegacy({ v: 1, candidates: [...intakeState.now, ...intakeState.wait] });
  await f.service.refresh();
  await act(async () => { root = create(createElement(DraftsRoute)); });
}
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
test("Drafts can open Can wait, then Needs you now, while Month Close remains in the footer", async () => {
  route.segment = ["wait"];
  intakeState.wait = [candidate("later")];
  await mount();
  expect(button("Can wait, 1").props.accessibilityState).toEqual({ selected: true, checked: true });
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: false, checked: false });
  route.segment = "now";
  await act(async () => { root.update(createElement(DraftsRoute)); });
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: true, checked: true });
  await act(async () => button("Preview Month Close warning").props.onPress());
  expect(route.replace).not.toHaveBeenCalled();
  await act(async () => button("Review Candidates").props.onPress());
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: true, checked: true });
  await act(async () => button("Preview Month Close warning").props.onPress());
  await act(async () => button("Continue Month Close anyway").props.onPress());
  expect(route.replace).toHaveBeenCalledExactlyOnceWith("/month-close");
  expect(route.push).not.toHaveBeenCalled();
});


function candidate(id: string): IntakeCandidate {
  return {
    id, createdAt: now - 100, expiresAt: now + 1000000, workspaceId: "workspace", currency: "COP",
    suggestion: {
      direction: "out", description: "Groceries", amountMinorUnits: 126400,
      accountingDate: "2026-10-17", financialAccountProfileId: "daily",
      userCategoryIds: ["food"], primaryUserCategoryId: null,
    },
    parserVersion: "parser@1", consentVersion: "consent@1",
  };
}
function text() {
  return root.root.findAllByType("text").map((node) => node.children.join("")).join("\n");
}

test("a cleared inbox hides segment controls and Month Close preview", async () => {
  route.segment = undefined;
  await mount();
  expect(text()).toContain("Candidate inbox");
  expect(text()).toContain("Nothing waiting");
  expect(text()).toContain("Continue to Month Close");
  expect(text()).not.toContain("Nothing needs you now");
  expect(root.root.findAllByType("button").some((node) => node.props.accessibilityRole === "tab")).toBe(false);
  expect(root.root.findAllByType("button").some((node) => node.props.accessibilityLabel === "Preview Month Close warning")).toBe(false);
});

test("later Candidates without a segment open Can wait when nothing needs you now", async () => {
  route.segment = undefined;
  intakeState.wait = [candidate("later")];
  await mount();
  expect(button("Can wait, 1").props.accessibilityState).toEqual({ selected: true, checked: true });
  expect(text()).toContain("Groceries");
});

test("a priority Candidate without a segment opens Needs you now", async () => {
  route.segment = undefined;
  intakeState.now = [candidate("c1")];
  await mount();
  expect(button("Needs you now, 1").props.accessibilityState).toEqual({ selected: true, checked: true });
});

test("a manual segment choice is kept when the inbox still has no priority rows", async () => {
  route.segment = undefined;
  intakeState.wait = [candidate("later")];
  await mount();
  expect(button("Can wait, 1").props.accessibilityState).toEqual({ selected: true, checked: true });
  await act(async () => button("Needs you now, 0").props.onPress());
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: true, checked: true });
  await act(async () => { root.update(createElement(DraftsRoute)); });
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: true, checked: true });
});

test("a manual Can wait choice survives when the priority count changes", async () => {
  route.segment = undefined;
  intakeState.now = [candidate("c1")];
  await mount();
  expect(button("Needs you now, 1").props.accessibilityState).toEqual({ selected: true, checked: true });
  await act(async () => button("Can wait, 0").props.onPress());
  expect(button("Can wait, 0").props.accessibilityState).toEqual({ selected: true, checked: true });
  intakeState.now = [candidate("c1"), candidate("c2")];
  await act(async () => { root.update(createElement(DraftsRoute)); });
  expect(button("Can wait, 0").props.accessibilityState).toEqual({ selected: true, checked: true });
  expect(button("Needs you now, 2").props.accessibilityState).toEqual({ selected: false, checked: false });
});

test("Confirm all Ready retains the Convex payload and waits for local acknowledgement before success", async () => {
  route.segment = "now";
  intakeState.now = [candidate("c1")];
  let acknowledge = () => {};
  const acknowledgement = new Promise<void>((resolve) => { acknowledge = resolve; });
  await mount();
  const apply = f.service.applyRecordedOutcomes.bind(f.service);
  const applyOutcomes = vi.spyOn(f.service, "applyRecordedOutcomes").mockImplementation(async () => {
    await acknowledgement;
    await apply();
  });
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(text()).not.toContain("Record added");
  expect(button("Confirm all Ready").props.disabled).toBe(true);
  expect(intakeState.confirm).toHaveBeenCalledExactlyOnceWith({
    workspaceId: "workspace",
    items: [{
      workspaceId: "workspace", candidateId: "c1",
      confirmed: {
        direction: "out", description: "Groceries", amount: { currency: "COP", minorUnits: 126400 },
        accountingDate: "2026-10-17", financialAccountProfileId: "daily",
        userCategoryIds: ["food"], primaryUserCategoryId: null,
      },
      suggestion: {
        direction: "out", description: "Groceries", amount: { currency: "COP", minorUnits: 126400 },
        accountingDate: "2026-10-17", financialAccountProfileId: "daily",
        userCategoryIds: ["food"], primaryUserCategoryId: null,
      },
      parserVersion: "parser@1", consentVersion: "consent@1",
    }],
  });
  await act(async () => acknowledge());
  expect(applyOutcomes).toHaveBeenCalledOnce();
  expect(f.service.getSnapshot().state.records[0]).toMatchObject({ id: "c1", kind: "terminal", reason: "confirmed" });
  expect(text()).toContain("Record added");
  await act(async () => button("Continue to Month Close").props.onPress());
  expect(route.replace).toHaveBeenCalledExactlyOnceWith("/month-close");
});

test("a partial batch reports only acknowledged records and keeps the failed Candidate for review", async () => {
  intakeState.now = [candidate("c1"), candidate("c2")];
  const confirm = intakeState.confirm.getMockImplementation();
  intakeState.confirm.mockImplementation(async (input) => {
    const batch = await confirm?.(input);
    return { results: [batch.results[0], { candidateId: "c2", ok: false, error: "Locked Period" }] };
  });
  await mount();
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(text()).toContain("Record added");
  expect(text()).not.toContain("2 records added");
  expect(f.service.read("c2")?.status).toEqual({ kind: "review", currencyReviewed: true, error: "Locked Period" });
  await act(async () => button("Back to Candidates").props.onPress());
  expect(text()).toContain("Candidates");
  await act(async () => button("Needs you now, 1").props.onPress());
  expect(text()).toContain("That month is already closed");
});

test("confirmation counts successful records across Convex batches", async () => {
  intakeState.now = Array.from({ length: 51 }, (_, i) => candidate(`c${i}`));
  await mount();
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(intakeState.confirm.mock.calls.map(([input]) => input.items.length)).toEqual([50, 1]);
  expect(text()).toContain("51 records added");
});

test("a failed server request refreshes the inbox without showing confirmation", async () => {
  intakeState.now = [candidate("c1")];
  intakeState.confirm.mockRejectedValue(new Error("offline"));
  await mount();
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(f.service.read("c1")?.status.kind).toBe("submitting");
  expect(intakeState.refresh).toHaveBeenCalledOnce();
  expect(text()).not.toContain("Record added");
  expect(button("Confirm all Ready").props.disabled).toBe(false);
});

test("Confirm all Ready retries a dropped batch with the same frozen command and settles it once", async () => {
  route.segment = "now";
  intakeState.now = [candidate("c1")];
  const succeed = intakeState.confirm.getMockImplementation();
  intakeState.confirm.mockRejectedValueOnce(new Error("offline"));
  await mount();
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(f.service.read("c1")?.status.kind).toBe("submitting");
  expect(text()).toContain("Confirmation pending. Open to retry.");
  intakeState.confirm.mockImplementation(succeed ?? (async () => ({ results: [] })));
  await act(async () => button("Confirm all Ready").props.onPress());
  const [first, second] = intakeState.confirm.mock.calls.map(([input]) => input);
  expect(second).toEqual(first);
  expect(second.items.map((item: ConfirmCandidateInput) => [item.candidateId, item.confirmed.amount.minorUnits])).toEqual([["c1", 126400]]);
  expect(f.service.getSnapshot().state.records[0]).toMatchObject({ id: "c1", kind: "terminal", reason: "confirmed" });
  expect(text()).toContain("Record added");
});


test("Sources navigates to the canonical intake route and Candidate review keeps the existing posting route", async () => {
  route.segment = "now"; intakeState.now = [candidate("c1")]; await mount();
  await act(async () => button("Sources").props.onPress());
  await act(async () => button("Review Groceries").props.onPress());
  expect(route.push.mock.calls).toEqual([["/intake"], [{ pathname: "/post", params: { candidateId: "c1" } }]]);
});


test("a Candidate naming a closed Place says so and is left out of Confirm all Ready, without being changed or deleted", async () => {
  route.segment = "now";
  intakeState.places = [{ id: "daily", name: "Daily", status: "open" }, { id: "wallet", name: "Wallet", status: "closed" }];
  const onWallet = candidate("c2");
  onWallet.suggestion = { ...onWallet.suggestion, description: "Taxi", financialAccountProfileId: "wallet" };
  intakeState.now = [candidate("c1"), onWallet];
  await mount();
  expect(text()).toContain("Wallet is closed. Choose another place.");
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(intakeState.confirm.mock.calls.map(([input]) => input.items.map((item: ConfirmCandidateInput) => item.candidateId))).toEqual([["c1"]]);
  expect(f.service.read("c2")?.review.financialAccountProfileId).toBe("wallet");
});

test("third review, finding 1: a Candidate whose amount awaits confirmation says so and is left out of Confirm all Ready until confirmed", async () => {
  route.segment = "now";
  intakeState.now = [candidate("c1"), candidate("c2")];
  await mount();
  const binding = createCandidateBinding({ service: f.service, candidateId: "c2", workspaceId: "workspace",
    dispatch: vi.fn(), translator: createTranslator("en") });
  await act(async () => binding.persistReview({ ...binding.facts, description: "Taxi", amountText: "-1.234", amountFormat: "cop/1",
    amountReview: { reason: "pasted", previous: null } }));
  expect(text()).toContain("Confirm the amount before you continue.");
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(intakeState.confirm.mock.calls.map(([input]) => input.items.map((item: ConfirmCandidateInput) => item.candidateId))).toEqual([["c1"]]);
  await act(async () => button("Back to Candidates").props.onPress());
  expect(text()).toContain("Confirm the amount before you continue.");
  expect(f.service.read("c2")).toMatchObject({ status: { kind: "review" }, reviewAmountReview: { reason: "pasted", previous: null } });

  const stale = f.service.candidates().filter((row) => row.id === "c2");
  await act(async () => { await confirmReadyCandidates(f.service, stale, intakeState.confirm); });
  expect(intakeState.confirm).toHaveBeenCalledTimes(1);
  await expect(f.service.beginConfirmation("c2", f.service.read("c2")!.recordRevision)).rejects.toThrow();
  expect(f.service.read("c2")).toMatchObject({ status: { kind: "review" } });

  const confirming = createCandidateBinding({ service: f.service, candidateId: "c2", workspaceId: "workspace",
    dispatch: vi.fn(), translator: createTranslator("en") });
  await act(async () => confirming.persistReview({ ...confirming.facts, amountReview: undefined }));
  expect(text()).not.toContain("Confirm the amount before you continue.");
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(intakeState.confirm.mock.calls.at(-1)?.[0].items.map((item: ConfirmCandidateInput) => [item.candidateId, item.confirmed.amount]))
    .toEqual([["c2", { currency: "COP", minorUnits: 123400 }]]);
});
