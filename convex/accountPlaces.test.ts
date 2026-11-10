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

test("rename preserves the Place, posting identity and money, including the first My money Place", async () => {
  const t = await convexAccounting(modules);
  const setup = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 100, timeZone: "America/Bogota",
  });
  const { workspace, financialAccountProfile: place } = setup;
  const snapshot = () => t.run(async ctx => ({
    profiles: await ctx.db.query("financialAccountProfiles").collect(),
    accounts: await ctx.db.query("ledgerAccounts").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    defaults: await ctx.db.query("personalDefaults").collect(),
  }));
  const before = await snapshot();
  const args = { workspaceId: workspace.id, financialAccountProfileId: place.id,
    expectedName: "My money", name: "  Everyday  " };
  const renamed = await t.action(api.accounting.renameAccount, args);
  expect(renamed).toEqual({ ...place, name: "Everyday" });
  const after = await snapshot();
  expect(after).toEqual({ ...before,
    profiles: before.profiles.map(p => ({ ...p, name: "Everyday" })),
    accounts: before.accounts.map(a => a._id === place.ledgerAccountId ? { ...a, name: "Everyday" } : a),
  });
  expect(await t.action(api.accounting.renameAccount, args)).toEqual(renamed);
  expect(await snapshot()).toEqual(after);
  expect(await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09" }))
    .toMatchObject({ accounts: [{ name: "Everyday" }] });
  expect(await t.query(api.accounting.personalDefaults, {}))
    .toMatchObject({ financialAccountProfile: { name: "Everyday" } });
  await expect(t.action(api.accounting.renameAccount, { ...args, name: "Stale" }))
    .rejects.toMatchObject({ data: { code: "account_name_stale" } });
});

test("rename trims names, rejects blanks and accent-insensitive duplicates, and isolates workspaces", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.action(api.accounting.createFinancialAccountProfile, { workspaceId: workspace.id, name: "Café", productKind: "cash" });
  const args = { workspaceId: workspace.id, financialAccountProfileId: daily.id, expectedName: "Daily", name: " CAFÉ " };
  await expect(t.action(api.accounting.renameAccount, args)).rejects.toMatchObject({ data: { code: "account_name_conflict" } });
  await expect(t.action(api.accounting.renameAccount, { ...args, name: " " })).rejects.toMatchObject({ data: { code: "name_required" } });
  for (const invisible of ["\u200B", "\u200B \u200D", "\uFEFF", "\u0301"])
    await expect(t.action(api.accounting.renameAccount, { ...args, name: invisible })).rejects.toMatchObject({ data: { code: "name_required" } });
  const other = await createOwnedWorkspace(t);
  await expect(t.action(api.accounting.renameAccount, { ...args, workspaceId: other.id })).rejects.toMatchObject({ data: { code: "financial_account_profile_not_found" } });
  expect(await t.action(api.accounting.renameAccount, { ...args, name: "Cafe", workspaceId: workspace.id }).catch(e => e.data.code)).toBe("account_name_conflict");
  expect(await t.action(api.accounting.renameAccount, { ...args, name: "Daily" })).toEqual(daily);
});

test("Place creation and rename cap trimmed names at 80 characters and creation rejects a name another Place uses", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const args = { workspaceId: workspace.id, name: "a".repeat(81), productKind: "cash" as const };
  await expect(t.action(api.accounting.createFinancialAccountProfile, args))
    .rejects.toMatchObject({ data: { code: "account_name_too_long" } });
  const place = await t.action(api.accounting.createFinancialAccountProfile, { ...args, name: ` ${"a".repeat(80)} ` });
  expect(place.name).toBe("a".repeat(80));
  for (const same of ["a".repeat(80), "A".repeat(80), `  ${"á".repeat(80)}`])
    await expect(t.action(api.accounting.createFinancialAccountProfile, { ...args, name: same }))
      .rejects.toMatchObject({ data: { code: "account_name_conflict" } });
  expect(await t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: workspace.id })).toHaveLength(1);
  const rename = { workspaceId: workspace.id, financialAccountProfileId: place.id, expectedName: place.name, name: "b".repeat(81) };
  await expect(t.action(api.accounting.renameAccount, rename)).rejects.toMatchObject({ data: { code: "account_name_too_long" } });
  expect(await t.action(api.accounting.renameAccount, { ...rename, name: "b".repeat(80) })).toMatchObject({ id: place.id, name: "b".repeat(80) });
});

test.each(["cafe   grande", "ＣＡＦÉ　ＧＲＡＮＤＥ", "cafe\t\n grande"])("rename compares collapsed whitespace and compatibility Unicode for %s", async name => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.action(api.accounting.createFinancialAccountProfile, { workspaceId: workspace.id, name: "Café Grande", productKind: "cash" });
  await expect(t.action(api.accounting.renameAccount, { workspaceId: workspace.id, financialAccountProfileId: daily.id, expectedName: daily.name, name }))
    .rejects.toMatchObject({ data: { code: "account_name_conflict" } });
  expect(await t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: workspace.id }))
    .toMatchObject(expect.arrayContaining([{ ...daily }]));
});

test("legacy long Place names can be renamed and original long-name setup receipts still replay", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const args = { workspaceId: workspace.id, name: "Original", productKind: "cash" as const,
    amount: { currency: "COP", minorUnits: 0 }, accountingDate: "2026-09-24", idempotencyKey: "legacy-setup" };
  const setup = await t.action(api.accounting.setupFinancialAccountProfile, args);
  const longName = "l".repeat(81);
  await t.run(async ctx => {
    const profileId = ctx.db.normalizeId("financialAccountProfiles", setup.financialAccountProfile.id);
    const accountId = ctx.db.normalizeId("ledgerAccounts", setup.financialAccountProfile.ledgerAccountId);
    const receipt = await ctx.db.query("financialAccountSetups").first();
    if (!profileId || !accountId || !receipt) throw Error("Missing legacy setup");
    await ctx.db.patch(profileId, { name: longName });
    await ctx.db.patch(accountId, { name: longName });
    await ctx.db.patch(receipt._id, { name: longName });
  });
  const replay = await t.action(api.accounting.setupFinancialAccountProfile, { ...args, name: longName });
  expect(replay).toMatchObject({ replay: true, financialAccountProfile: { id: setup.financialAccountProfile.id, name: longName } });
  const renamed = await t.action(api.accounting.renameAccount, { workspaceId: workspace.id,
    financialAccountProfileId: setup.financialAccountProfile.id, expectedName: longName, name: "Valid" });
  expect(renamed).toMatchObject({ id: setup.financialAccountProfile.id, name: "Valid" });
  expect(await t.action(api.accounting.setupFinancialAccountProfile, { ...args, name: longName }))
    .toMatchObject({ replay: true, financialAccountProfile: { id: renamed.id, name: "Valid" } });
});

test("rename and setup reject overlong new names before any writes", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await expect(t.action(api.accounting.renameAccount, { workspaceId: workspace.id,
    financialAccountProfileId: daily.id, expectedName: daily.name, name: "x".repeat(81) }))
    .rejects.toMatchObject({ data: { code: "account_name_too_long" } });
  await expect(t.action(api.accounting.setupFinancialAccountProfile, { workspaceId: workspace.id,
    name: "x".repeat(81), productKind: "cash", amount: { currency: "COP", minorUnits: 0 },
    accountingDate: "2026-09-24", idempotencyKey: "overlong-setup" }))
    .rejects.toMatchObject({ data: { code: "account_name_too_long" } });
  expect(await t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: workspace.id })).toEqual([daily]);
});
