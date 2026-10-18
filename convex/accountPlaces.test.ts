import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, createDaily, createOwnedWorkspace, reverse } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
test.each([
  { productKind: "bankAccount", emoji: "💰", amount: 1234500 },
  { productKind: "savingsAccount", emoji: "🏦", amount: 0 },
  { productKind: "cash", emoji: "👛", amount: 100 },
] as const)("$productKind creates a real account with its look and opening date, and retries once", async ({ productKind, emoji, amount }) => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const payload = { workspaceId: workspace.id, name: "New account", productKind, emoji,
    amount: { currency: "COP", minorUnits: amount }, accountingDate: "2026-09-24", idempotencyKey: "add-place" };
  const first = await t.action(api.accounting.setupFinancialAccountProfile, payload);
  const retry = await t.action(api.accounting.setupFinancialAccountProfile, payload);
  expect(retry.replay).toBe(true);
  expect(retry.financialAccountProfile.id).toBe(first.financialAccountProfile.id);
  const activity = await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09" });
  expect(activity.accounts).toEqual([{
    financialAccountProfileId: first.financialAccountProfile.id, name: "New account", productKind, emoji,
    nature: "Asset", trackingFrom: "2026-09-24", balance: payload.amount,
  }]);
  expect(activity.rows).toHaveLength(amount === 0 ? 0 : 1);
  await expect(t.action(api.accounting.setupFinancialAccountProfile, { ...payload, emoji: "🐷" }))
    .rejects.toThrow("account_setup_conflict");
  await t.action(api.accounting.changeAccountLook, { workspaceId: workspace.id,
    financialAccountProfileId: first.financialAccountProfile.id, emoji: "🐷" });
  const after = await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09" });
  expect(after.accounts[0]).toEqual({ ...activity.accounts[0], emoji: "🐷" });
  expect(after.rows).toEqual(activity.rows);
  // Retrying the original setup after a restyle must not overwrite the new look.
  await t.action(api.accounting.setupFinancialAccountProfile, payload);
  const profiles = await t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: workspace.id });
  expect(profiles).toHaveLength(1);
  expect(profiles[0]).toMatchObject({ emoji: "🐷", productKind });
});

test("Change look rejects an account from another workspace and an empty look", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const other = await createOwnedWorkspace(t);
  const daily = await createDaily(t, other.id);
  await expect(t.action(api.accounting.changeAccountLook, { workspaceId: workspace.id,
    financialAccountProfileId: daily.id, emoji: "🐷" })).rejects.toThrow("financial_account_profile_not_found");
  await expect(t.action(api.accounting.changeAccountLook, { workspaceId: other.id,
    financialAccountProfileId: daily.id, emoji: " " })).rejects.toThrow("account_emoji_required");
});

test("a legacy account without an opening uses its real creation date in the workspace timezone", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const createdAt = await t.run(async (ctx) => {
    const id = ctx.db.normalizeId("financialAccountProfiles", daily.id);
    if (!id) throw new Error("Missing profile ID");
    return (await ctx.db.get(id))?._creationTime;
  });
  const activity = await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09" });
  const expected = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota" }).format(new Date(createdAt ?? 0));
  expect(activity.accounts[0]?.trackingFrom).toBe(expected);
});

test("tracking starts at the active opening after correcting its date", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const input = { workspaceId: workspace.id, financialAccountProfileId: daily.id, description: "Opening balance",
    amount: { currency: "COP", minorUnits: 10000 }, accountingDate: "2026-09-01", idempotencyKey: "original-opening" };
  const original = await t.action(api.accounting.recordOpeningPosition, input);
  if (!original) throw new Error("Missing opening");
  const before = await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09" });
  expect(before.accounts[0]?.trackingFrom).toBe("2026-09-01");
  await reverse(t, workspace.id, original.id);
  await t.action(api.accounting.recordOpeningPosition, {
    ...input, accountingDate: "2026-09-10", idempotencyKey: "corrected-opening",
  });
  const after = await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09" });
  expect(after.accounts[0]?.trackingFrom).toBe("2026-09-10");
});


test("an empty setup look is rejected before creating any account", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  await expect(t.action(api.accounting.setupFinancialAccountProfile, {
    workspaceId: workspace.id, name: "Savings", productKind: "savingsAccount", emoji: " ",
    amount: { currency: "COP", minorUnits: 0 }, accountingDate: "2026-09-24", idempotencyKey: "empty-look",
  })).rejects.toThrow("account_emoji_required");
  expect(await t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: workspace.id })).toEqual([]);
});
