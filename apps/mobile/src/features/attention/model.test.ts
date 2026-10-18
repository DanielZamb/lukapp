import { expect, test } from "vitest";
import { evaluateMonthClose } from "../monthClose/model";
import { attentionRows, updatesDetail } from "./model";

const period = { year: 2026, month: 10 };
const base = {
  draftCount: 0,
  draftSegment: "wait" as const,
  candidateNowCount: 0,
  candidateWaitCount: 0,
  plans: [],
  currency: "COP",
  readiness: evaluateMonthClose({ period, periodStatus: "open", draftCount: 0, candidateCount: 0 }),
};

test("alerts order live workflow summaries and preserve their exact destinations", () => {
  const rows = attentionRows({
    ...base,
    draftCount: 2,
    candidateNowCount: 1,
    candidateWaitCount: 4,
    plans: [{ dueMinorUnits: 150_000 }, { dueMinorUnits: 0 }, { dueMinorUnits: 200_000 }],
    readiness: evaluateMonthClose({ period, periodStatus: "open", draftCount: 1, candidateCount: 3 }),
  });
  expect(rows.map((row) => [row.title, row.detail, row.destination])).toEqual([
    ["Review Drafts", "2 on this device", { pathname: "/drafts", params: { segment: "wait" } }],
    ["Candidates need you", "1 to review now", { pathname: "/drafts", params: { segment: "now" } }],
    ["Candidates can wait", "4 for later review", { pathname: "/drafts", params: { segment: "wait" } }],
    ["Recovery due", "COP 3.500,00 across 2 plans", { pathname: "/recovery" }],
    ["Complete October", "1 dated Drafts need review first", { pathname: "/month-close", params: { month: "2026-10" } }],
  ]);
  expect(updatesDetail({ kind: "ready", rows })).toBe("5 updates");
});

test("Candidates warn without blocking a clear month, and locked months leave no close alert", () => {
  const rows = attentionRows({
    ...base,
    candidateWaitCount: 3,
    readiness: evaluateMonthClose({ period, periodStatus: "not_opened", draftCount: 0, candidateCount: 3 }),
  });
  expect(rows.map((row) => row.detail)).toEqual([
    "3 for later review",
    "Ready to review. 3 Candidates can stay for later.",
  ]);
  const cleared = attentionRows({
    ...base,
    plans: [{ dueMinorUnits: 0 }],
    readiness: evaluateMonthClose({ period, periodStatus: "locked", draftCount: 0, candidateCount: 0 }),
  });
  expect(cleared).toEqual([]);
  expect(updatesDetail({ kind: "ready", rows: cleared })).toBe("All caught up");
});

test("loading and errors never claim an empty alert count", () => {
  expect(updatesDetail({ kind: "loading" })).toBe("Loading updates");
  expect(updatesDetail({ kind: "error", message: "Cannot read Drafts" })).toBe("Review updates");
  expect(updatesDetail({ kind: "ready", rows: attentionRows(base) })).toBe("1 update");
});
