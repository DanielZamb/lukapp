import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const bogotaMonthEnd = new Date("2026-10-31T23:30:00-05:00");

test("Start Tracking and Budget stay in October at 23:30 Bogotá on 31 October", async () => {
  vi.setSystemTime(bogotaMonthEnd);
  expect(bogotaMonthEnd.toISOString().slice(0, 10)).toBe("2026-11-01");
  const t = await convexAccounting(modules);
  vi.setSystemTime(bogotaMonthEnd);
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 250000,
    timeZone: "America/Bogota",
  });
  expect(defaults.workspace.timeZone).toBe("America/Bogota");
  expect(defaults.workspace.currentAccountingPeriod).toMatchObject({
    year: 2026,
    month: 10,
  });
  const entries = await t.query(api.accounting.listJournalEntries, {
    workspaceId: defaults.workspace.id,
  });
  expect(entries).toMatchObject([{ accountingDate: "2026-10-31" }]);
  expect(await t.query(api.budget.evaluate, { workspaceId: defaults.workspace.id }))
    .toMatchObject({ currentMonth: "2026-10", month: "2026-10" });
});

test("the same instant is November in Auckland", async () => {
  vi.setSystemTime(bogotaMonthEnd);
  const t = await convexAccounting(modules);
  vi.setSystemTime(bogotaMonthEnd);
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 250000,
    timeZone: "Pacific/Auckland",
  });
  expect(defaults.workspace.timeZone).toBe("Pacific/Auckland");
  expect(defaults.workspace.currentAccountingPeriod).toMatchObject({
    year: 2026,
    month: 11,
  });
  const entries = await t.query(api.accounting.listJournalEntries, {
    workspaceId: defaults.workspace.id,
  });
  expect(entries).toMatchObject([{ accountingDate: "2026-11-01" }]);
  expect(await t.query(api.budget.evaluate, { workspaceId: defaults.workspace.id }))
    .toMatchObject({ currentMonth: "2026-11", month: "2026-11" });
});
