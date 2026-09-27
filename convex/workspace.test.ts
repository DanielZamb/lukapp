/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  owner,
  septNow,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function testdb() {
  return convexAccounting(modules);
}

test("owner can create a Personal Workspace and open it", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const opened = await t.query(api.accounting.openWorkspace, {
    userId: owner.userId,
    workspaceId: workspace.id,
    now: septNow,
  });

  expect(opened.id).toBe(workspace.id);
  expect(opened.kind).toBe("Personal");
  expect(opened.functionalCurrency).toBe("COP");
});

test("a Personal Workspace opens with the current Accounting Period", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const opened = await t.query(api.accounting.openWorkspace, {
    userId: owner.userId,
    workspaceId: workspace.id,
    now: septNow,
  });

  expect(workspace.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 9,
    status: "open",
  });
  expect(opened.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 9,
    status: "open",
  });
});

test("a stranger cannot open another person's Workspace", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);

  const error = await t
    .query(api.accounting.openWorkspace, {
      userId: "stranger-2",
      workspaceId: workspace.id,
      now: septNow,
    })
    .catch((caught: unknown) => caught);

  expect(error).toMatchObject({
    data: { code: "workspace_membership_required" },
  });
});

test("owner can create and list a Financial Account Profile", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const profile = await createDaily(t, workspace.id);
  const profiles = await t.query(api.accounting.listFinancialAccountProfiles, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });

  expect(profile.name).toBe("Daily");
  expect(profile.workspaceId).toBe(workspace.id);
  expect(profiles).toEqual([profile]);
});
