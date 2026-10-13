import { chartTemplate, requireTemplateAccount } from "./chartOfAccounts";
import { classifyFinancialAccountProfile } from "./classification";
import { commandIdentity } from "./commandIdentity";
import { categorySnapshot, requireCategory } from "./categories";
import { assertCategoryAccount } from "./categoryPolicy";
import { setupFinancialAccount } from "./commands/setupFinancialAccount";
import { AccountingError } from "./errors";
import { requireWorkspace } from "./membership";
import { periodFromAccountingDate } from "./period";
import { postJournalEntry } from "./posting";
import type { AccountingClock, AccountingStore, DraftJournalLine } from "./types";
import type { ConfirmReclassificationInput, ReclassificationInput, ReclassificationBucket, ReclassificationPreview } from "./categoryTypes";

export async function previewCategoryReclassification(store: AccountingStore, input: ReclassificationInput): Promise<ReclassificationPreview> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor, "correct");
  const category = await requireCategory(store, input.workspaceId, input.categoryId);
  if (category.classification.kind !== "resolved") throw new AccountingError("category_unresolved");
  if (category.status !== "active") throw new AccountingError("category_inactive");
  const currentPeriod = periodFromAccountingDate(input.currentDate);
  if (input.target.kind === "category") assertCategoryAccount(workspace.chartOfAccountsTemplate, input.target.nature, input.target.accountCode);
  else classifyFinancialAccountProfile(chartTemplate(workspace.chartOfAccountsTemplate), input.target.setup.productKind, input.target.setup.classificationAnswers);
  const entries = (await store.listJournalEntries(input.workspaceId)).sort((a, b) => a.id.localeCompare(b.id));
  const buckets = new Map<string, ReclassificationBucket>();
  const periods = new Map<string, string>();
  const entryIds = new Set<string>();
  const lockedIds = new Set<string>();
  let lineCount = 0;
  for (const entry of entries) for (const [lineNumber, line] of entry.lines.entries()) {
    if (line.category?.categoryId !== category.id) continue;
    const periodKey = `${entry.period.year}-${String(entry.period.month).padStart(2, "0")}`;
    let status = periods.get(periodKey);
    if (!status) {
      status = (await store.getAccountingPeriod(input.workspaceId, entry.period))?.status;
      if (!status) throw new AccountingError("accounting_period_not_found");
      periods.set(periodKey, status);
    }
    const locked = status === "locked";
    if (locked && input.currentDate < entry.accountingDate) throw new AccountingError("reclassification_date_before_source");
    const date = locked ? input.currentDate : entry.accountingDate;
    const destinationPeriod = locked ? "catch-up" : periodKey;
    const key = `${destinationPeriod}:${line.ledgerAccountId}:${commandIdentity(line.category)}`;
    const bucket = buckets.get(key) ?? { accountingDate: date, ledgerAccountId: line.ledgerAccountId, signedMinorUnits: 0, sources: [], rootSources: [], priorLockedPeriods: [], snapshot: line.category };
    bucket.accountingDate = date > bucket.accountingDate ? date : bucket.accountingDate;
    const signedMinorUnits = line.debitMinorUnits - line.creditMinorUnits;
    bucket.signedMinorUnits += signedMinorUnits;
    if (!Number.isSafeInteger(bucket.signedMinorUnits)) throw new AccountingError("journal_line_invalid");
    bucket.sources.push({ entryId: entry.id, lineNumber, signedMinorUnits });
    const lineage = line.categoryCorrection
      ? line.categoryCorrection.rootSources.map(ref => ({ ...ref, signedMinorUnits: ref.signedMinorUnits *
          (line.categoryCorrection?.side === "reversing" ? -1 : 1) * (entry.reversesEntryId ? -1 : 1) }))
      : [{ entryId: entry.reversesEntryId ?? entry.id, lineNumber, signedMinorUnits }];
    for (const root of lineage) {
      const saved = bucket.rootSources.find(r => r.entryId === root.entryId && r.lineNumber === root.lineNumber);
      if (saved) {
        saved.signedMinorUnits += root.signedMinorUnits;
        if (!Number.isSafeInteger(saved.signedMinorUnits)) throw new AccountingError("journal_line_invalid");
      }
      else bucket.rootSources.push({ ...root });
    }
    if (locked && !bucket.priorLockedPeriods.includes(periodKey)) bucket.priorLockedPeriods.push(periodKey);
    buckets.set(key, bucket);
    entryIds.add(entry.id); lineCount++;
    if (locked) lockedIds.add(entry.id);
  }
  const currentStatus = await store.getAccountingPeriod(input.workspaceId, currentPeriod);
  const outstanding = [...buckets.values()].filter(b => b.rootSources.some(root => root.signedMinorUnits !== 0)).sort((a, b) => commandIdentity(a).localeCompare(commandIdentity(b)));
  if (outstanding.some(b => b.priorLockedPeriods.length) && currentStatus?.status !== "open")
    throw new AccountingError("reclassification_current_period_required");
  if (input.target.kind === "profile") {
    const openingDate = input.target.setup.accountingDate;
    if (outstanding.some(b => b.accountingDate < openingDate)) throw new AccountingError("activity_before_opening");
  }
  const total = outstanding.reduce((n, b) => n + b.rootSources.reduce((sum, root) => sum + Math.abs(root.signedMinorUnits), 0), 0);
  const lockedTotal = outstanding.filter(b => b.priorLockedPeriods.length).reduce((n, b) => n + b.rootSources.reduce((sum, root) => sum + Math.abs(root.signedMinorUnits), 0), 0);
  if (!Number.isSafeInteger(total)) throw new AccountingError("journal_line_invalid");
  const revisionToken = commandIdentity({ policy: "category-reclassification@1", category, target: input.target, currentDate: input.currentDate,
    template: workspace.chartOfAccountsTemplate, periods: [...periods.entries()].sort(), currentStatus, history: entries.filter(e => entryIds.has(e.id)) });
  return { categoryId: category.id, categoryRevision: category.revision, revisionToken, entryCount: entryIds.size, lineCount,
    amount: { currency: workspace.functionalCurrency, minorUnits: total }, lockedEntryCount: lockedIds.size,
    lockedAmount: { currency: workspace.functionalCurrency, minorUnits: lockedTotal },
    correctionDates: [...new Set(outstanding.map(b => b.accountingDate.slice(0, 7)))].sort().map(month => outstanding.filter(b => b.accountingDate.startsWith(month)).reduce((date, b) => b.accountingDate > date ? b.accountingDate : date, "")), buckets: outstanding };
}

export async function confirmCategoryReclassification(store: AccountingStore, clock: AccountingClock, input: ConfirmReclassificationInput) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor, "correct");
  await requireWorkspace(store, input.workspaceId, input.actor, "post");
  if (!input.confirmed) throw new AccountingError("category_confirmation_required");
  if (!input.idempotencyKey) throw new AccountingError("idempotency_key_required");
  const request = commandIdentity({ command: "reclassify", categoryId: input.categoryId, target: input.target, currentDate: input.currentDate, revisionToken: input.revisionToken });
  const receipt = await store.getCategoryReceipt(input.workspaceId, input.idempotencyKey);
  if (receipt) {
    if (receipt.request !== request) throw new AccountingError("idempotency_key_conflict");
    return { category: receipt.category, correctionEntryIds: receipt.correctionEntryIds,
      ...(receipt.financialAccountProfileId ? { financialAccountProfileId: receipt.financialAccountProfileId } : {}), replay: true };
  }
  const preview = await previewCategoryReclassification(store, input);
  if (preview.revisionToken !== input.revisionToken) throw new AccountingError("reclassification_stale");
  const category = await requireCategory(store, input.workspaceId, input.categoryId);
  const updated = { ...category, revision: category.revision + 1 };
  let destinationId: string;
  let profileId: string | undefined;
  if (input.target.kind === "category") {
    const target = input.target;
    const account = await requireTemplateAccount(store, workspace, target.nature === "Expense" ? "expense" : "income", target.accountCode);
    destinationId = account.id;
    updated.classification = { kind: "resolved", nature: target.nature, natureProvenance: { kind: "answered" }, account: { kind: "advanced", accountCode: target.accountCode } };
  } else {
    const result = await setupFinancialAccount(store, clock, { ...input.target.setup, actor: input.actor, workspaceId: input.workspaceId, idempotencyKey: `${input.idempotencyKey}:profile` });
    destinationId = result.profile.ledgerAccountId;
    profileId = result.profile.id;
    updated.classification = { kind: "converted", financialAccountProfileId: profileId };
    updated.status = "archived";
  }
  const correctionEntryIds: string[] = [];
  for (const date of preview.correctionDates) {
    const lines: DraftJournalLine[] = [];
    const expenseEffects = new Map<string, number>();
    for (const bucket of preview.buckets.filter(b => b.accountingDate.slice(0, 7) === date.slice(0, 7))) {
      if (bucket.ledgerAccountId === destinationId && input.target.kind === "category" && bucket.snapshot.nature === input.target.nature) continue;
      const expenseFactor = (input.target.kind === "category" && input.target.nature === "Expense" ? 1 : 0) - (bucket.snapshot.nature === "Expense" ? 1 : 0);
      for (const root of bucket.rootSources.filter(root => root.signedMinorUnits !== 0)) {
        const amount = Math.abs(root.signedMinorUnits);
        const positive = root.signedMinorUnits > 0;
        const correction = { reclassificationKey: input.idempotencyKey, sources: bucket.sources,
          rootSources: [root], priorLockedPeriods: bucket.priorLockedPeriods.sort() };
        expenseEffects.set(root.entryId, (expenseEffects.get(root.entryId) ?? 0) + expenseFactor * root.signedMinorUnits);
        lines.push({ ledgerAccountId: bucket.ledgerAccountId, debitMinorUnits: positive ? 0 : amount, creditMinorUnits: positive ? amount : 0,
          category: bucket.snapshot, categoryCorrection: { ...correction, side: "reversing" } });
        lines.push({ ledgerAccountId: destinationId, debitMinorUnits: positive ? amount : 0, creditMinorUnits: positive ? 0 : amount,
          ...(input.target.kind === "category" ? { category: categorySnapshot(updated) } : {}), categoryCorrection: { ...correction, side: "replacement" } });
      }
    }
    if (!lines.length) continue;
    const catchUp = lines.some(line => line.categoryCorrection?.priorLockedPeriods.length);
    const { entry } = await postJournalEntry(store, clock, { actor: input.actor, workspaceId: input.workspaceId,
      draft: { accountingDate: date, description: `${catchUp ? "Prior-period category correction" : "Category correction"}: ${category.name}`,
        idempotencyKey: `${input.idempotencyKey}:correction:${date.slice(0, 7)}`, policy: "category-reclassification@1", lines,
        sourceExpenseEffects: [...expenseEffects.entries()].filter(([, delta]) => delta !== 0).sort(([a], [b]) => a.localeCompare(b)).map(([sourceEntryId, expenseDeltaMinorUnits]) => ({ sourceEntryId, expenseDeltaMinorUnits })) } });
    correctionEntryIds.push(entry.id);
  }
  await store.saveCategory(updated);
  await store.saveCategoryReceipt({ workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey, request, category: updated, correctionEntryIds,
    ...(profileId ? { financialAccountProfileId: profileId } : {}) });
  return { category: updated, correctionEntryIds, ...(profileId ? { financialAccountProfileId: profileId } : {}), replay: false };
}
