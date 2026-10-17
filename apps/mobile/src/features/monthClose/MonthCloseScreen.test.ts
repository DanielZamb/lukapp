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
    onRequest: vi.fn(),
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  },
) {
  await act(async () => {
    root = create(
      createElement(MonthCloseScreen, { readiness, phase, ...handlers }),
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
  expect(text()).toContain("None pending");
  await act(async () => button("Review Drafts first").props.onPress());
  expect(handlers.onReviewDrafts).toHaveBeenCalledOnce();
  expect(handlers.onRequest).not.toHaveBeenCalled();
  expect(handlers.onConfirm).not.toHaveBeenCalled();
});

test("Candidates stay a warning and the finished state uses ConfirmationScreen", async () => {
  const warned = evaluateMonthClose({
    period: { year: 2026, month: 10 },
    periodStatus: "open",
    draftCount: 0,
    candidateCount: 3,
  });
  const handlers = await show(warned, { kind: "review" });
  expect(text()).toContain("READY TO REVIEW");
  expect(text()).toContain("3 still pending");
  expect(text()).toContain("Later");
  await act(async () => button("Complete and lock October").props.onPress());
  expect(handlers.onRequest).toHaveBeenCalledOnce();
  await act(async () => {
    root?.update(
      createElement(MonthCloseScreen, {
        readiness: warned,
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
        phase: { kind: "closed", period: { year: 2026, month: 10 } },
        ...handlers,
      }),
    );
  });
  expect(text()).toContain("October is complete");
  expect(text()).toContain(
    "The month is locked. Balances and posted activity did not change because of the close itself.",
  );
  await act(async () => button("Back to Drafts").props.onPress());
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
});
