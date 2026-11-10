import type { Infer } from "convex/values";
import type { closePlaceInput, placeClosure as closureValue } from "../../../convex/accountingPlaceValues";
import { optionalDescription } from "../descriptions";
import { hasVisibleText } from "../names";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { placeStatus, requireOpenPlace } from "../placeState";
import { calendarDate, workspaceTimeZone } from "../timeZone";
import { balances } from "../queries/balances";
import { requireFunctionalAmount } from "../money";
import { closingAdjustmentCategory } from "../categories/closingAdjustment";
import { recordAccountTransfer } from "./recordAccountTransfer";
import { recordCashExpense } from "./recordCashExpense";
import { recordCashIncome } from "./recordCashIncome";
import { requireSelectableDefaultPlace } from "./chooseDefaultPlace";
import type { AccountingStore, AccountingClock, Actor, PostedJournalEntry } from "../types";

type CloseInput = Infer<typeof closePlaceInput>;
export type PlaceClosureServices = {
  endingBlockers: (profileId: string, today: string) => Promise<Infer<typeof closureValue>["blockers"]>;
  defaultPlace: () => Promise<string | undefined>;
  unfinishedDestinationPlans: (profileId: string) => Promise<Array<{ id: string; title: string }>>;
};
export type PlaceClosingServices = PlaceClosureServices & {
  replaceDefault: (profileId: string, key: string) => Promise<void>;
};

export async function placeClosure(store: AccountingStore, clock: AccountingClock, services: PlaceClosureServices,
  input: { actor: Actor; workspaceId: string; financialAccountProfileId: string }): Promise<Infer<typeof closureValue>> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const profile = await store.getProfile(input.financialAccountProfileId);
  if (!profile || profile.workspaceId !== workspace.id) throw new AccountingError("financial_account_profile_not_found");
  const [profiles, allBalances, plans, defaultId] = await Promise.all([
    store.listProfiles(workspace.id), balances(store, input), services.unfinishedDestinationPlans(profile.id), services.defaultPlace(),
  ]);
  const balance = allBalances.find(item => item.financialAccountProfileId === profile.id);
  if (!balance) throw new AccountingError("financial_account_profile_not_found");
  const openPlaceCount = profiles.filter(item => placeStatus(item) === "open").length;
  const blockers: Infer<typeof closureValue>["blockers"] = [];
  if (profile.ending) blockers.push({ code: "financial_account_profile_ended" });
  if (profile.undoOperationId) blockers.push({ code: "place_undo_in_progress" });
  if (openPlaceCount <= 1) blockers.push({ code: "place_last_open" });
  if (plans.length) blockers.push({ code: "place_recovery_destination", plans });
  const accountingDate = calendarDate(clock.now(), workspaceTimeZone(workspace));
  blockers.push(...await services.endingBlockers(profile.id, accountingDate));
  const isDefault = defaultId === profile.id;
  return {
    financialAccountProfileId: profile.id, status: placeStatus(profile), canClose: blockers.length === 0,
    blockers, isDefault, requiresReplacementDefault: isDefault, openPlaceCount,
    balance: balance.balance, nature: balance.nature, accountingDate,
  };
}

export async function closePlace(store: AccountingStore, clock: AccountingClock, services: PlaceClosingServices,
  input: CloseInput & { actor: Actor }) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  if (!input.idempotencyKey.trim()) throw new AccountingError("idempotency_key_required");
  const names = { expense: input.closingAdjustmentExpenseName?.trim(), income: input.closingAdjustmentIncomeName?.trim() };
  for (const name of Object.values(names)) {
    if (name !== undefined && !hasVisibleText(name)) throw new AccountingError("name_required");
    if (name !== undefined && name.length > 80) throw new AccountingError("category_name_too_long");
  }
  const lines = input.lines.map(line => ({ ...line, description: optionalDescription(line.description) }));
  const request = JSON.stringify({
    ...(names.expense !== undefined ? { closingAdjustmentExpenseName: names.expense } : {}),
    ...(names.income !== undefined ? { closingAdjustmentIncomeName: names.income } : {}),
    act: "close", financialAccountProfileId: input.financialAccountProfileId,
    replacementDefaultFinancialAccountProfileId: input.replacementDefaultFinancialAccountProfileId ?? null,
    lines: lines.map(line => ({ ...(line.description !== undefined ? { description: line.description } : {}), ...(line.kind === "transfer"
      ? { kind: line.kind, otherFinancialAccountProfileId: line.otherFinancialAccountProfileId, amount: { currency: line.amount.currency, minorUnits: line.amount.minorUnits } }
      : line.kind === "expense" ? { kind: line.kind, userCategoryId: line.userCategoryId, amount: { currency: line.amount.currency, minorUnits: line.amount.minorUnits } }
      : { kind: line.kind, amount: { currency: line.amount.currency, minorUnits: line.amount.minorUnits } }) })),
  });
  const prior = await store.findPlaceEnding(workspace.id, input.idempotencyKey);
  if (prior) {
    if (prior.request !== request) throw new AccountingError("idempotency_key_conflict");
    return { ending: prior, replay: true };
  }
  const closure = await placeClosure(store, clock, services, input);
  const blocker = closure.blockers[0];
  if (blocker) throw new AccountingError(blocker.code, blocker);
  const replacement = input.replacementDefaultFinancialAccountProfileId;
  if (closure.isDefault && !replacement) throw new AccountingError("place_default_replacement_required");
  if (replacement !== undefined) {
    if (!closure.isDefault || replacement === input.financialAccountProfileId)
      throw new AccountingError("place_default_replacement_invalid");
    await requireSelectableDefaultPlace(store, { ...input, financialAccountProfileId: replacement });
  }
  const credit = (closure.nature === "Asset") === (closure.balance.minorUnits > 0);
  let sum = 0n;
  for (const line of input.lines) {
    sum += BigInt(requireFunctionalAmount(workspace, line.amount));
    if (line.kind === "expense" && !(closure.nature === "Asset" && closure.balance.minorUnits > 0))
      throw new AccountingError("place_close_line_invalid");
    if (line.kind === "transfer") {
      if (line.otherFinancialAccountProfileId === input.financialAccountProfileId)
        throw new AccountingError("transfer_profiles_must_differ");
      const other = await store.getProfile(line.otherFinancialAccountProfileId);
      if (!other || other.workspaceId !== workspace.id) throw new AccountingError("financial_account_profile_not_found");
      requireOpenPlace(other);
    }
  }
  if (sum !== BigInt(Math.abs(closure.balance.minorUnits))) throw new AccountingError("place_close_balance_mismatch");
  const entries: PostedJournalEntry[] = [];
  for (const [index, line] of lines.entries()) {
    const common = { actor: input.actor, workspaceId: workspace.id, amount: line.amount,
      accountingDate: closure.accountingDate, description: line.description ?? (line.kind === "adjustment" ? "Closing Adjustment" : "Closing a Place"), idempotencyKey: `place-close:${JSON.stringify([input.idempotencyKey, index])}` };
    // Internal keys must never adopt a journal submitted independently of this close.
    if (await store.findJournalEntryByIdempotencyKey(workspace.id, common.idempotencyKey)
      || await store.findOpeningMarkerByIdempotencyKey(workspace.id, common.idempotencyKey))
      throw new AccountingError("idempotency_key_conflict");
    if (line.kind === "transfer") {
      entries.push(await recordAccountTransfer(store, clock, { ...common,
        sourceFinancialAccountProfileId: credit ? input.financialAccountProfileId : line.otherFinancialAccountProfileId,
        destinationFinancialAccountProfileId: credit ? line.otherFinancialAccountProfileId : input.financialAccountProfileId,
      }));
    } else {
      const categoryId = line.kind === "expense" ? line.userCategoryId
        : (await closingAdjustmentCategory(store, workspace, credit ? "Expense" : "Income", credit ? names.expense : names.income)).id;
      const post = credit ? recordCashExpense : recordCashIncome;
      entries.push(await post(store, clock, { ...common, financialAccountProfileId: input.financialAccountProfileId,
        userCategoryId: categoryId }));
    }
  }
  const final = (await balances(store, input)).find(item => item.financialAccountProfileId === input.financialAccountProfileId);
  if (final?.balance.minorUnits !== 0) throw new AccountingError("place_close_balance_mismatch");
  if (replacement) await services.replaceDefault(replacement, `place-close-default:${input.idempotencyKey}`);
  const now = clock.now().getTime();
  const ending = await store.insertPlaceEnding({
    act: "close", workspaceId: workspace.id, financialAccountProfileId: input.financialAccountProfileId,
    occurredAt: now, recordedAt: now, endedBy: input.actor.userId, idempotencyKey: input.idempotencyKey,
    request, entries, ...(replacement ? { replacementDefaultFinancialAccountProfileId: replacement } : {}),
  });
  return { ending, replay: false };
}
