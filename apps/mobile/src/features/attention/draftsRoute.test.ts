import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import DraftsRoute from "../../../app/drafts";
import type { IntakeCandidate } from "../intake/candidates";
import type { ConfirmCandidateInput } from "../../../../../src/notificationIntake/types";

const route = vi.hoisted((): {
  segment: string | string[] | undefined;
  push: ReturnType<typeof vi.fn>;
  replace: ReturnType<typeof vi.fn>;
} => ({ segment: "wait", push: vi.fn(), replace: vi.fn() }));
const intakeState = vi.hoisted(() => ({
  now: [] as IntakeCandidate[],
  wait: [] as IntakeCandidate[],
  confirm: vi.fn(), consume: vi.fn(), fail: vi.fn(), refresh: vi.fn(), report: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ segment: route.segment }),
  router: { push: route.push, replace: route.replace, back: vi.fn() }, Redirect: "redirect",
}));
vi.mock("convex/react", () => ({ useAction: () => intakeState.confirm, useQuery: () => [] }));
vi.mock("expo-secure-store", () => ({}));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace", functionalCurrency: "COP", currentAccountingPeriod: { year: 2026, month: 10 } },
  financialAccountProfile: { id: "daily" },
}) }));
vi.mock("../useLocalEntryDrafts", () => ({ useLocalEntryDrafts: () => ({ items: [], count: 0, error: "" }) }));
vi.mock("../useIntakeCandidates", () => ({ useIntakeCandidates: () => ({
  now: intakeState.now, wait: intakeState.wait,
  ready: [...intakeState.now, ...intakeState.wait].filter((row) => !row.error),
  count: intakeState.now.length + intakeState.wait.length, error: "", accept: vi.fn(),
  consume: intakeState.consume, fail: intakeState.fail, refresh: intakeState.refresh,
}) }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => intakeState.report }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
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
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DEV__", false);
  route.segment = "wait";
  route.push.mockClear();
  route.replace.mockClear();
  intakeState.now = [];
  intakeState.wait = [];
  intakeState.consume.mockReset().mockImplementation(async (id: string) => {
    intakeState.now = intakeState.now.filter((row) => row.id !== id);
    intakeState.wait = intakeState.wait.filter((row) => row.id !== id);
  });
  intakeState.fail.mockReset().mockImplementation(async (id: string, error: string) => {
    intakeState.now = intakeState.now.map((row) => row.id === id ? { ...row, error } : row);
    intakeState.wait = intakeState.wait.map((row) => row.id === id ? { ...row, error } : row);
  });
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
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
test("Drafts can open Can wait, then Needs you now, while Month Close remains in the footer", async () => {
  route.segment = ["wait"];
  intakeState.wait = [candidate("later")];
  await act(async () => { root = create(createElement(DraftsRoute)); });
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
    id, createdAt: 1, expiresAt: 2, workspaceId: "workspace", currency: "COP",
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
  await act(async () => { root = create(createElement(DraftsRoute)); });
  expect(text()).toContain("Review complete");
  expect(text()).toContain("Nothing waiting");
  expect(text()).toContain("Continue to Month Close");
  expect(text()).not.toContain("Nothing needs you now");
  expect(root.root.findAllByType("button").some((node) => node.props.accessibilityRole === "tab")).toBe(false);
  expect(root.root.findAllByType("button").some((node) => node.props.accessibilityLabel === "Preview Month Close warning")).toBe(false);
});

test("later Candidates without a segment open Can wait when nothing needs you now", async () => {
  route.segment = undefined;
  intakeState.wait = [candidate("later")];
  await act(async () => { root = create(createElement(DraftsRoute)); });
  expect(button("Can wait, 1").props.accessibilityState).toEqual({ selected: true, checked: true });
  expect(text()).toContain("Groceries");
});

test("a priority Candidate without a segment opens Needs you now", async () => {
  route.segment = undefined;
  intakeState.now = [candidate("c1")];
  await act(async () => { root = create(createElement(DraftsRoute)); });
  expect(button("Needs you now, 1").props.accessibilityState).toEqual({ selected: true, checked: true });
});

test("a manual segment choice is kept when the inbox still has no priority rows", async () => {
  route.segment = undefined;
  intakeState.wait = [candidate("later")];
  await act(async () => { root = create(createElement(DraftsRoute)); });
  expect(button("Can wait, 1").props.accessibilityState).toEqual({ selected: true, checked: true });
  await act(async () => button("Needs you now, 0").props.onPress());
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: true, checked: true });
  await act(async () => { root.update(createElement(DraftsRoute)); });
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: true, checked: true });
});

test("a manual Can wait choice survives when the priority count changes", async () => {
  route.segment = undefined;
  intakeState.now = [candidate("c1")];
  await act(async () => { root = create(createElement(DraftsRoute)); });
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
  intakeState.consume.mockImplementation(async () => {
    await acknowledgement;
    intakeState.now = [];
    intakeState.wait = [];
  });
  await act(async () => { root = create(createElement(DraftsRoute)); });
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
  expect(intakeState.consume).toHaveBeenCalledExactlyOnceWith("c1");
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
  await act(async () => { root = create(createElement(DraftsRoute)); });
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(text()).toContain("Record added");
  expect(text()).not.toContain("2 records added");
  expect(intakeState.fail).toHaveBeenCalledExactlyOnceWith("c2", "Locked Period");
  await act(async () => button("Back to Candidates").props.onPress());
  expect(text()).toContain("Candidates");
  await act(async () => button("Needs you now, 1").props.onPress());
  expect(text()).toContain("Locked Period");
});

test("confirmation counts successful records across Convex batches", async () => {
  intakeState.now = Array.from({ length: 51 }, (_, i) => candidate(`c${i}`));
  await act(async () => { root = create(createElement(DraftsRoute)); });
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(intakeState.confirm.mock.calls.map(([input]) => input.items.length)).toEqual([50, 1]);
  expect(text()).toContain("51 records added");
});

test("a failed server request refreshes the inbox without showing confirmation", async () => {
  intakeState.now = [candidate("c1")];
  intakeState.confirm.mockRejectedValue(new Error("offline"));
  await act(async () => { root = create(createElement(DraftsRoute)); });
  await act(async () => button("Confirm all Ready").props.onPress());
  expect(intakeState.consume).not.toHaveBeenCalled();
  expect(intakeState.refresh).toHaveBeenCalledOnce();
  expect(text()).not.toContain("Record added");
  expect(button("Confirm all Ready").props.disabled).toBe(false);
});
