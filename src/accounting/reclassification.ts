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
import type {
  AccountingClock, AccountingPeriod, AccountingStore, DraftJournalLine,
  JournalEntryDraft, StoredJournalEntry, StoredWorkspace,
} from "./types";
import type {
  CategoryNature, CategorySnapshot, ConfirmReclassificationInput, CorrectionSource,
  ReclassificationInput, ReclassificationBucket, ReclassificationPreview, UserCategory,
} from "./categoryTypes";

type ResolvedTarget =
  | { kind: "category"; accountId: string | undefined; nature: CategoryNature }
  | { kind: "profile" };

type CorrectionHistory = {
  buckets: Map<string, ReclassificationBucket>;
  periods: Map<string, string>;
  lockedIds: Set<string>;
};

type CorrectionDestination = {
  category: UserCategory;
  ledgerAccountId: string;
} & ({ kind: "category" } | { kind: "profile"; financialAccountProfileId: string });

export async function previewCategoryReclassification(
  store: AccountingStore,
  input: ReclassificationInput,
): Promise<ReclassificationPreview> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor, "correct");
  const category = await requireCategory(store, input.workspaceId, input.categoryId);
  if (category.classification.kind !== "resolved") throw new AccountingError("category_unresolved");
  if (category.status !== "active") throw new AccountingError("category_inactive");
  const currentPeriod = periodFromAccountingDate(input.currentDate);
  const target = await resolveReclassificationTarget(store, workspace, input);
  const entries = (await store.listJournalEntries(input.workspaceId))
    .sort((a, b) => a.id.localeCompare(b.id));
  const history = await readCorrectionHistory(store, { input, target, entries, categoryId: category.id });
  const currentStatus = await store.getAccountingPeriod(input.workspaceId, currentPeriod);
  const outstanding = [...history.buckets.values()]
    .filter(bucket => bucket.rootSources.some(root => root.signedMinorUnits !== 0))
    .sort((a, b) => commandIdentity(a).localeCompare(commandIdentity(b)));
  const selectedSources = outstanding.flatMap(bucket => bucket.sources);
  const lockedEntryIds = new Set(selectedSources.filter(source => history.lockedIds.has(source.entryId)).map(source => source.entryId));
  validateCorrectionDates({ input, entries, outstanding, lockedEntryIds, currentStatus });
  const impact = correctionImpact({ outstanding, selectedSources, lockedEntryIds });
  const revisionToken = commandIdentity({
    policy: "category-reclassification@1", category, target: input.target,
    currentDate: input.currentDate, template: workspace.chartOfAccountsTemplate,
    periods: [...history.periods.entries()].sort(), currentStatus,
    history: entries.filter(entry => entry.lines.some(line => line.category?.categoryId === category.id)),
  });
  return {
    categoryId: category.id, categoryRevision: category.revision, revisionToken,
    entryCount: impact.entryCount, lineCount: impact.lineCount,
    amount: { currency: workspace.functionalCurrency, minorUnits: impact.total },
    lockedEntryCount: impact.lockedEntryCount,
    lockedAmount: { currency: workspace.functionalCurrency, minorUnits: impact.lockedTotal },
    correctionDates: impact.correctionDates, buckets: outstanding,
  };
}

async function resolveReclassificationTarget(
  store: AccountingStore,
  workspace: StoredWorkspace,
  input: ReclassificationInput,
): Promise<ResolvedTarget> {
  const target = input.target;
  if (target.kind === "category") {
    assertCategoryAccount(workspace.chartOfAccountsTemplate, target.nature, target.accountCode);
    const account = await store.findLedgerAccountByCode(input.workspaceId, target.accountCode);
    return { kind: "category", accountId: account?.id, nature: target.nature };
  }
  classifyFinancialAccountProfile(
    chartTemplate(workspace.chartOfAccountsTemplate),
    target.setup.productKind,
    target.setup.classificationAnswers,
  );
  return { kind: "profile" };
}

async function readCorrectionHistory(
  store: AccountingStore,
  args: { input: ReclassificationInput; target: ResolvedTarget; entries: StoredJournalEntry[]; categoryId: string },
): Promise<CorrectionHistory> {
  const { input, target, entries, categoryId } = args;
  const history: CorrectionHistory = {
    buckets: new Map(), periods: new Map(), lockedIds: new Set(),
  };
  for (const entry of entries) for (const [lineNumber, line] of entry.lines.entries()) {
    if (line.category?.categoryId !== categoryId) continue;
    if (target.kind === "category" && line.ledgerAccountId === target.accountId &&
        line.category.nature === target.nature) continue;
    const periodKey = `${entry.period.year}-${String(entry.period.month).padStart(2, "0")}`;
    const status = await readCorrectionPeriod(store, input.workspaceId, entry, periodKey, history.periods);
    const locked = status === "locked";
    accumulateCorrectionBucket(history.buckets, {
      entry, line, category: line.category, lineNumber, periodKey, locked,
      currentDate: input.currentDate,
    });
    if (locked) history.lockedIds.add(entry.id);
  }
  return history;
}

async function readCorrectionPeriod(
  store: AccountingStore,
  workspaceId: string,
  entry: StoredJournalEntry,
  periodKey: string,
  periods: Map<string, string>,
): Promise<string> {
  let status = periods.get(periodKey);
  if (!status) {
    status = (await store.getAccountingPeriod(workspaceId, entry.period))?.status;
    if (!status) throw new AccountingError("accounting_period_not_found");
    periods.set(periodKey, status);
  }
  return status;
}

function accumulateCorrectionBucket(
  buckets: Map<string, ReclassificationBucket>,
  input: {
    entry: StoredJournalEntry;
    line: DraftJournalLine;
    category: CategorySnapshot;
    lineNumber: number;
    periodKey: string;
    locked: boolean;
    currentDate: string;
  },
): void {
  const { entry, line, category, lineNumber, periodKey, locked } = input;
  const date = locked ? input.currentDate : entry.accountingDate;
  const destinationPeriod = locked ? "catch-up" : periodKey;
  const key = `${destinationPeriod}:${line.ledgerAccountId}:${commandIdentity(category)}`;
  const bucket = buckets.get(key) ?? {
    accountingDate: date, ledgerAccountId: line.ledgerAccountId, signedMinorUnits: 0,
    sources: [], rootSources: [], priorLockedPeriods: [], snapshot: category,
  };
  bucket.accountingDate = date > bucket.accountingDate ? date : bucket.accountingDate;
  const signedMinorUnits = line.debitMinorUnits - line.creditMinorUnits;
  bucket.signedMinorUnits += signedMinorUnits;
  if (!Number.isSafeInteger(bucket.signedMinorUnits)) throw new AccountingError("journal_line_invalid");
  bucket.sources.push({ entryId: entry.id, lineNumber, signedMinorUnits });
  accumulateOriginalSources(bucket.rootSources, originalSources(entry, line, lineNumber, signedMinorUnits));
  if (locked && !bucket.priorLockedPeriods.includes(periodKey)) bucket.priorLockedPeriods.push(periodKey);
  buckets.set(key, bucket);
}

function originalSources(
  entry: StoredJournalEntry,
  line: DraftJournalLine,
  lineNumber: number,
  signedMinorUnits: number,
): CorrectionSource[] {
  const correction = line.categoryCorrection;
  if (!correction) return [{ entryId: entry.reversesEntryId ?? entry.id, lineNumber, signedMinorUnits }];
  const correctionSign = correction.side === "reversing" ? -1 : 1;
  const reversalSign = entry.reversesEntryId ? -1 : 1;
  return correction.rootSources.map(ref => ({
    ...ref, signedMinorUnits: ref.signedMinorUnits * correctionSign * reversalSign,
  }));
}

function accumulateOriginalSources(savedSources: CorrectionSource[], sources: CorrectionSource[]): void {
  for (const root of sources) {
    const saved = savedSources.find(ref => ref.entryId === root.entryId && ref.lineNumber === root.lineNumber);
    if (saved) {
      saved.signedMinorUnits += root.signedMinorUnits;
      if (!Number.isSafeInteger(saved.signedMinorUnits)) throw new AccountingError("journal_line_invalid");
    } else savedSources.push({ ...root });
  }
}

function validateCorrectionDates(input: {
  input: ReclassificationInput;
  entries: StoredJournalEntry[];
  outstanding: ReclassificationBucket[];
  lockedEntryIds: Set<string>;
  currentStatus: AccountingPeriod | undefined;
}): void {
  const { input: request, entries, outstanding, lockedEntryIds, currentStatus } = input;
  if (entries.some(entry => lockedEntryIds.has(entry.id) && request.currentDate < entry.accountingDate))
    throw new AccountingError("reclassification_date_before_source");
  if (outstanding.some(bucket => bucket.priorLockedPeriods.length) && currentStatus?.status !== "open")
    throw new AccountingError("reclassification_current_period_required");
  if (request.target.kind === "profile") {
    const openingDate = request.target.setup.accountingDate;
    if (outstanding.some(bucket => bucket.accountingDate < openingDate)) throw new AccountingError("activity_before_opening");
  }
}

function grossOriginalAmount(bucket: ReclassificationBucket): number {
  return bucket.rootSources.reduce((sum, root) => sum + Math.abs(root.signedMinorUnits), 0);
}

function correctionImpact(input: {
  outstanding: ReclassificationBucket[];
  selectedSources: CorrectionSource[];
  lockedEntryIds: Set<string>;
}) {
  const { outstanding, selectedSources, lockedEntryIds } = input;
  const entryIds = new Set(selectedSources.map(source => source.entryId));
  const total = outstanding.reduce((sum, bucket) => sum + grossOriginalAmount(bucket), 0);
  const lockedTotal = outstanding.filter(bucket => bucket.priorLockedPeriods.length)
    .reduce((sum, bucket) => sum + grossOriginalAmount(bucket), 0);
  if (!Number.isSafeInteger(total)) throw new AccountingError("journal_line_invalid");
  const correctionDates = [...new Set(outstanding.map(bucket => bucket.accountingDate.slice(0, 7)))].sort()
    .map(month => outstanding.filter(bucket => bucket.accountingDate.startsWith(month))
      .reduce((date, bucket) => bucket.accountingDate > date ? bucket.accountingDate : date, ""));
  return {
    entryCount: entryIds.size, lineCount: selectedSources.length,
    lockedEntryCount: lockedEntryIds.size, total, lockedTotal, correctionDates,
  };
}

export async function confirmCategoryReclassification(
  store: AccountingStore,
  clock: AccountingClock,
  input: ConfirmReclassificationInput,
) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor, "correct");
  await requireWorkspace(store, input.workspaceId, input.actor, "post");
  if (!input.confirmed) throw new AccountingError("category_confirmation_required");
  if (!input.idempotencyKey) throw new AccountingError("idempotency_key_required");
  const request = commandIdentity({
    command: "reclassify", categoryId: input.categoryId, target: input.target,
    currentDate: input.currentDate, revisionToken: input.revisionToken,
  });
  const receipt = await store.getCategoryReceipt(input.workspaceId, input.idempotencyKey);
  if (receipt) {
    if (receipt.request !== request) throw new AccountingError("idempotency_key_conflict");
    return {
      category: receipt.category, correctionEntryIds: receipt.correctionEntryIds,
      ...(receipt.financialAccountProfileId ? { financialAccountProfileId: receipt.financialAccountProfileId } : {}),
      replay: true,
    };
  }
  const preview = await previewCategoryReclassification(store, input);
  if (preview.revisionToken !== input.revisionToken) throw new AccountingError("reclassification_stale");
  const category = await requireCategory(store, input.workspaceId, input.categoryId);
  const destination = await resolveCorrectionDestination(store, clock, workspace, category, input);
  const profileId = destination.kind === "profile" ? destination.financialAccountProfileId : undefined;
  const correctionEntryIds: string[] = [];
  for (const date of preview.correctionDates) {
    const draft = draftCategoryCorrection({ date, preview, destination, input, categoryName: category.name });
    if (!draft.lines.length) continue;
    const { entry } = await postJournalEntry(store, clock, {
      actor: input.actor, workspaceId: input.workspaceId, draft,
    });
    correctionEntryIds.push(entry.id);
  }
  await store.saveCategory(destination.category);
  await store.saveCategoryReceipt({
    workspaceId: input.workspaceId, idempotencyKey: input.idempotencyKey,
    request, category: destination.category, correctionEntryIds,
    ...(profileId ? { financialAccountProfileId: profileId } : {}),
  });
  return {
    category: destination.category, correctionEntryIds,
    ...(profileId ? { financialAccountProfileId: profileId } : {}), replay: false,
  };
}

async function resolveCorrectionDestination(
  store: AccountingStore,
  clock: AccountingClock,
  workspace: StoredWorkspace,
  category: UserCategory,
  input: ConfirmReclassificationInput,
): Promise<CorrectionDestination> {
  const updated = { ...category, revision: category.revision + 1 };
  const target = input.target;
  if (target.kind === "category") {
    const account = await requireTemplateAccount(
      store, workspace, target.nature === "Expense" ? "expense" : "income", target.accountCode,
    );
    updated.classification = {
      kind: "resolved", nature: target.nature, natureProvenance: { kind: "answered" },
      account: { kind: "advanced", accountCode: target.accountCode },
    };
    return { kind: "category", category: updated, ledgerAccountId: account.id };
  }
  const result = await setupFinancialAccount(store, clock, {
    ...target.setup, actor: input.actor, workspaceId: input.workspaceId,
    idempotencyKey: `${input.idempotencyKey}:profile`,
  });
  updated.classification = { kind: "converted", financialAccountProfileId: result.profile.id };
  updated.status = "archived";
  return {
    kind: "profile", category: updated, ledgerAccountId: result.profile.ledgerAccountId,
    financialAccountProfileId: result.profile.id,
  };
}

function draftCategoryCorrection(args: {
  date: string;
  preview: ReclassificationPreview;
  destination: CorrectionDestination;
  input: ConfirmReclassificationInput;
  categoryName: string;
}): JournalEntryDraft {
  const { date, preview, destination, input, categoryName } = args;
  const lines: DraftJournalLine[] = [];
  const expenseEffects = new Map<string, number>();
  for (const bucket of preview.buckets.filter(bucket => bucket.accountingDate.slice(0, 7) === date.slice(0, 7))) {
    const expenseFactor = (input.target.kind === "category" && input.target.nature === "Expense" ? 1 : 0)
      - (bucket.snapshot.nature === "Expense" ? 1 : 0);
    for (const root of bucket.rootSources.filter(root => root.signedMinorUnits !== 0)) {
      const amount = Math.abs(root.signedMinorUnits);
      const positive = root.signedMinorUnits > 0;
      const correction = {
        reclassificationKey: input.idempotencyKey, sources: bucket.sources,
        rootSources: [root], priorLockedPeriods: bucket.priorLockedPeriods.sort(),
      };
      expenseEffects.set(root.entryId, (expenseEffects.get(root.entryId) ?? 0) + expenseFactor * root.signedMinorUnits);
      lines.push({
        ledgerAccountId: bucket.ledgerAccountId, debitMinorUnits: positive ? 0 : amount,
        creditMinorUnits: positive ? amount : 0, category: bucket.snapshot,
        categoryCorrection: { ...correction, side: "reversing" },
      });
      lines.push({
        ledgerAccountId: destination.ledgerAccountId, debitMinorUnits: positive ? amount : 0,
        creditMinorUnits: positive ? 0 : amount,
        ...(input.target.kind === "category" ? { category: categorySnapshot(destination.category) } : {}),
        categoryCorrection: { ...correction, side: "replacement" },
      });
    }
  }
  const catchUp = lines.some(line => line.categoryCorrection?.priorLockedPeriods.length);
  return {
    accountingDate: date,
    description: `${catchUp ? "Prior-period category correction" : "Category correction"}: ${categoryName}`,
    idempotencyKey: `${input.idempotencyKey}:correction:${date.slice(0, 7)}`,
    policy: "category-reclassification@1", lines,
    sourceExpenseEffects: [...expenseEffects.entries()].filter(([, delta]) => delta !== 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sourceEntryId, expenseDeltaMinorUnits]) => ({ sourceEntryId, expenseDeltaMinorUnits })),
  };
}
