import { expect, test } from "vitest";
import {
  evaluateMonthClose,
  footerLabel,
  monthLabel,
  periodFromMonthKey,
  periodStatusOf,
} from "./model";
import { noPendingCandidates } from "./pendingCandidates";

const october = { year: 2026, month: 10 };

test("a dated draft in the month blocks close and Candidates never do", () => {
  expect(
    evaluateMonthClose({
      period: october,
      periodStatus: "open",
      draftCount: 1,
      candidateCount: 0,
    }),
  ).toEqual({
    period: october,
    monthLabel: "October",
    periodStatus: "open",
    draftCount: 1,
    candidateCount: 0,
    blocked: true,
    alreadyLocked: false,
    canLock: false,
  });
  expect(
    evaluateMonthClose({
      period: october,
      periodStatus: "not_opened",
      draftCount: 0,
      candidateCount: 3,
    }),
  ).toEqual({
    period: october,
    monthLabel: "October",
    periodStatus: "not_opened",
    draftCount: 0,
    candidateCount: 3,
    blocked: false,
    alreadyLocked: false,
    canLock: true,
  });
});

test("a locked month is already finished even when leftover drafts remain", () => {
  expect(
    evaluateMonthClose({
      period: october,
      periodStatus: "locked",
      draftCount: 2,
      candidateCount: 1,
    }),
  ).toEqual({
    period: october,
    monthLabel: "October",
    periodStatus: "locked",
    draftCount: 2,
    candidateCount: 1,
    blocked: false,
    alreadyLocked: true,
    canLock: false,
  });
});

test("the inbox footer names the workspace month and Candidates stay at zero until U08", () => {
  expect(periodFromMonthKey("2026-10")).toEqual(october);
  expect(monthLabel(october)).toBe("October");
  expect(footerLabel(october)).toBe("Complete October");
  expect(noPendingCandidates().countForMonth(october)).toBe(0);
  expect(
    periodStatusOf(october, { year: 2026, month: 10, status: "open" }),
  ).toBe("open");
  expect(
    periodStatusOf(october, { year: 2026, month: 9, status: "locked" }),
  ).toBe("not_opened");
});
