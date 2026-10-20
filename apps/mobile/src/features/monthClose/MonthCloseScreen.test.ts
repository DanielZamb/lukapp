import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { evaluateMonthClose } from "./model";
import { MonthCloseScreen } from "./MonthCloseScreen";
import type { MonthClosePhase } from "./useMonthClose";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  TextInput: "input",
  ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

const october = evaluateMonthClose({
  period: { year: 2026, month: 10 },
  periodStatus: "open",
  draftCount: 0,
  candidateCount: 0,
});
const summary = {
  currency: "COP",
  spendMinorUnits: 125_050,
  accountCount: 3,
  recoveryDueMinorUnits: 23_000,
};
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function text() {
  return (
    root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ??
    ""
  );
}
function button(label: string) {
  const found = root?.root
    .findAllByType("button")
    .find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
async function show(
  readiness: typeof october,
  phase: MonthClosePhase,
  handlers = {
    onBack: vi.fn(),
    onReviewDrafts: vi.fn(),
    onAccountBalances: vi.fn(),
    onOverview: vi.fn(),
    onRecovery: vi.fn(),
    onHome: vi.fn(),
    onRequest: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  },
) {
  await act(async () => {
    root = create(
      createElement(MonthCloseScreen, { readiness, summary, phase, ...handlers }),
    );
  });
  return handlers;
}

test("a dated draft blocks close and sending the user back to Drafts", async () => {
  const handlers = await show(
    evaluateMonthClose({
      period: { year: 2026, month: 10 },
      periodStatus: "open",
      draftCount: 2,
      candidateCount: 0,
    }),
    { kind: "review" },
  );
  expect(text()).toContain("1 STEP NEEDS ATTENTION");
  expect(text()).toContain("2 still need review");
  expect(text()).toContain("Required");
  expect(text()).toContain("None waiting");
  await act(async () => button("Review Drafts first").props.onPress());
  expect(handlers.onReviewDrafts).toHaveBeenCalledOnce();
  expect(handlers.onRequest).not.toHaveBeenCalled();
  expect(handlers.onConfirm).not.toHaveBeenCalled();
});

test("Candidates warn without blocking confirmation and completion opens overview or home", async () => {
  const warned = evaluateMonthClose({
    period: { year: 2026, month: 10 },
    periodStatus: "open",
    draftCount: 0,
    candidateCount: 3,
  });
  const handlers = await show(warned, { kind: "review" });
  expect(text()).toContain("CANDIDATES STILL LOCAL");
  expect(text()).toContain("3 still local. Intake is not a statement.");
  expect(text()).toContain("Warns");
  const candidates = root?.root.findAllByType("button").find((node) =>
    node.findAllByType("text").some((label) => label.children.join("") === "Notification Candidates"),
  );
  await act(async () => candidates?.props.onPress());
  expect(handlers.onReviewDrafts).toHaveBeenCalledOnce();
  await act(async () => button("Complete and lock October").props.onPress());
  expect(handlers.onRequest).toHaveBeenCalledOnce();
  await act(async () => {
    root?.update(
      createElement(MonthCloseScreen, {
        readiness: warned,
        summary,
        phase: { kind: "confirm", period: { year: 2026, month: 10 } },
        ...handlers,
      }),
    );
  });
  expect(text()).toContain("Candidates will stay for later review.");
  await act(async () => button("Keep reviewing").props.onPress());
  expect(handlers.onCancel).toHaveBeenCalledOnce();
  await act(async () => button("Complete and lock October").props.onPress());
  expect(handlers.onConfirm).toHaveBeenCalledOnce();
  await act(async () => {
    root?.update(
      createElement(MonthCloseScreen, {
        readiness: warned,
        summary,
        phase: { kind: "closed", period: { year: 2026, month: 10 } },
        ...handlers,
      }),
    );
  });
  expect(text()).toContain("October is complete");
  expect(text()).toContain(
    "The month is locked. Balances and posted activity did not change because of the close itself.",
  );
  const lockIcon = root?.root.find((node) =>
    String(node.type) === "icon" && node.props.name === "lock-closed",
  );
  expect(lockIcon?.props.size).toBe(28);
  await act(async () => button("View October overview").props.onPress());
  await act(async () => button("Back home").props.onPress());
  expect(handlers.onOverview).toHaveBeenCalledOnce();
  expect(handlers.onHome).toHaveBeenCalledOnce();
  expect(handlers.onReviewDrafts).toHaveBeenCalledOnce();
});

test("the finished title keeps the month that was locked after the calendar rolls", async () => {
  const november = evaluateMonthClose({
    period: { year: 2026, month: 11 },
    periodStatus: "open",
    draftCount: 0,
    candidateCount: 0,
  });
  await show(november, { kind: "closed", period: { year: 2026, month: 10 } });
  expect(text()).toContain("October is complete");
  expect(text()).not.toContain("November is complete");
  expect(button("View October overview")).toBeDefined();
});

test("the review shows spending, checked accounts, recovery due and the exact footnote", async () => {
  const handlers = await show(october, { kind: "review" });
  expect(text()).toContain("READY TO REVIEW");
  expect(text()).toContain("October spending\nCOP 1.250,50");
  expect(text()).toContain("This review locks the month; it does not move money or change balances.");
  expect(text()).toContain("Notification Candidates\nNone waiting\nDone");
  expect(text()).toContain("Account balances\n3 Financial Accounts checked\nReviewed");
  expect(text()).toContain("Savings recovery\nCOP 230,00 due this month\nReview");
  expect(text()).toContain("Remaining Candidates warn. They do not block Month Close. If recovery is not funded, the close records a planning shortfall; it never fabricates a transfer.");
  const rows = root?.root.findAllByType("button").filter((node) => !node.props.accessibilityLabel) ?? [];
  expect(rows).toHaveLength(2);
  await act(async () => rows[0].props.onPress());
  await act(async () => rows[1].props.onPress());
  expect(handlers.onAccountBalances).toHaveBeenCalledOnce();
  expect(handlers.onRecovery).toHaveBeenCalledOnce();
  expect(handlers.onReviewDrafts).not.toHaveBeenCalled();
});

test("no recovery due is explicit and the mismatch screen still prevents completion", async () => {
  const handlers = await show(october, { kind: "review" });
  await act(async () => root?.update(createElement(MonthCloseScreen, {
    readiness: october,
    summary: { ...summary, recoveryDueMinorUnits: 0 },
    phase: { kind: "review" },
    ...handlers,
  })));
  expect(text()).toContain("Nothing due this month");
  await act(async () => root?.update(createElement(MonthCloseScreen, {
    readiness: { ...october, periodStatus: "mismatch", canLock: false },
    summary,
    phase: { kind: "review" },
    ...handlers,
  })));
  expect(text()).toContain("This device and the workspace do not agree on the current month yet.");
  expect(root?.root.findAllByType("button")).toHaveLength(1);
  expect(handlers.onRequest).not.toHaveBeenCalled();
});

test("failure offers retry and locking disables the action", async () => {
  const handlers = await show(october, {
    kind: "failed", period: october.period, message: "Connection lost",
  });
  expect(text()).toContain("Connection lost");
  await act(async () => button("Retry close").props.onPress());
  expect(handlers.onConfirm).toHaveBeenCalledOnce();
  await act(async () => root?.update(createElement(MonthCloseScreen, {
    readiness: october,
    summary,
    phase: { kind: "locking", period: october.period },
    ...handlers,
  })));
  expect(button("Completing…").props.disabled).toBe(true);
  expect(button("Completing…").props.accessibilityState.busy).toBe(true);
});
