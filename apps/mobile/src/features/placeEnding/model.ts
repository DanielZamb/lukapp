import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { formatDateTime, formatList, formatLongDate, type MessageKey, type Translator } from "../../i18n";
import { amountSendable, displayedMinorUnits, sendableMinorUnits, type AmountSession } from "../amount/session";
import type { AtPress } from "../amount/useAmountState";
import { formatMoney } from "../money";
import type { api } from "../api";
import { attemptRefusals } from "../useFrozenCommand";

export type Closure = FunctionReturnType<typeof api.accounting.placeClosure>;
export type UndoPreview = FunctionReturnType<typeof api.accounting.previewUndoPlace>;
export type UndoOperation = NonNullable<FunctionReturnType<typeof api.accounting.placeUndoStatus>>;
export type CloseRequest = FunctionArgs<typeof api.accounting.closePlace>;
export type CloseReceipt = FunctionReturnType<typeof api.accounting.closePlace>;
export type UndoRequest = FunctionArgs<typeof api.accounting.startUndoPlace>;
export type UndoReceipt = FunctionReturnType<typeof api.accounting.startUndoPlace>;
export type UndoBlocker = UndoPreview["blockers"][number];
/** The whole bounded Undo preview of one consistent read, with the fingerprint Start binds. */
export type UndoSnapshot = NonNullable<UndoPreview["snapshot"]>;
export type PlaceProfile = FunctionReturnType<typeof api.accounting.listFinancialAccountProfiles>[number];
export type PlaceStatus = PlaceProfile["status"];
type Money = Closure["balance"];

/** The device-only blocker: notification sources whose alerts land in this Place. */
export type SourceBlocker = { code: "notification_sources"; apps: string[] } | { code: "notification_sources_unread" };
export type Blocker = UndoBlocker | SourceBlocker;
export type Act = "close" | "undo";

/** The Place list filter for readers that must also see ended and undoing Places; pickers keep the default, open. */
export const everyPlace = { status: "all" } as const;

export function isEnded(status: PlaceStatus) {
  return status === "closed" || status === "undone";
}

/** A stored Place name as it reads on history, pickers and drafts once the Place is no longer open. */
export function placeLabel(place: Pick<PlaceProfile, "name" | "status">, t: Translator["t"]) {
  return isEnded(place.status) ? t("placeEnding.closedName", { name: place.name })
    : place.status === "undoing" ? t("placeEnding.undoingName", { name: place.name }) : place.name;
}

/** Why a selected Place cannot take new activity, or null while it is open or unknown. */
export function unavailablePlaceReason(place: Pick<PlaceProfile, "name" | "status"> | undefined, t: Translator["t"]) {
  if (place?.status === "undoing") return t("placeEnding.postingPlaceUndoing", { name: place.name });
  return place && isEnded(place.status) ? t("placeEnding.postingPlaceEnded", { name: place.name }) : null;
}

export type BalanceCase = "zero" | "money" | "overdrawn" | "debtOwed" | "debtOverpaid";

export function balanceCase({ nature, balance }: Pick<Closure, "nature" | "balance">): BalanceCase {
  if (balance.minorUnits === 0) return "zero";
  if (nature === "Liability") return balance.minorUnits > 0 ? "debtOwed" : "debtOverpaid";
  return balance.minorUnits > 0 ? "money" : "overdrawn";
}

export type Answer = "moved" | "spent" | "unknown" | "covered" | "waived" | "paid" | "forgiven" | "refunded";
type LineKind = CloseRequest["lines"][number]["kind"];
export type AnswerSpec = {
  answer: Answer;
  kind: LineKind;
  label: MessageKey;
  detail: MessageKey;
  /** The line as the final confirmation lists it, with `{target}` for the other Place or the category. */
  review: MessageKey;
  /** The title of the list that picks the other Place or the category. */
  pick?: MessageKey;
};

export const answers: Record<Answer, AnswerSpec> = {
  moved: { answer: "moved", kind: "transfer", label: "placeEnding.answerMoved", detail: "placeEnding.answerMovedDetail",
    review: "placeEnding.reviewTransferTo", pick: "placeEnding.pickMoved" },
  spent: { answer: "spent", kind: "expense", label: "placeEnding.answerSpent", detail: "placeEnding.answerSpentDetail",
    review: "placeEnding.reviewExpense", pick: "placeEnding.pickSpent" },
  unknown: { answer: "unknown", kind: "adjustment", label: "placeEnding.answerUnknown", detail: "placeEnding.answerUnknownDetail",
    review: "placeEnding.reviewAdjustmentExpense" },
  covered: { answer: "covered", kind: "transfer", label: "placeEnding.answerCovered", detail: "placeEnding.answerCoveredDetail",
    review: "placeEnding.reviewTransferFrom", pick: "placeEnding.pickCovered" },
  waived: { answer: "waived", kind: "adjustment", label: "placeEnding.answerWaived", detail: "placeEnding.answerWaivedDetail",
    review: "placeEnding.reviewAdjustmentIncome" },
  paid: { answer: "paid", kind: "transfer", label: "placeEnding.answerPaid", detail: "placeEnding.answerPaidDetail",
    review: "placeEnding.reviewTransferFrom", pick: "placeEnding.pickPaid" },
  forgiven: { answer: "forgiven", kind: "adjustment", label: "placeEnding.answerForgiven", detail: "placeEnding.answerForgivenDetail",
    review: "placeEnding.reviewAdjustmentIncome" },
  refunded: { answer: "refunded", kind: "transfer", label: "placeEnding.answerRefunded", detail: "placeEnding.answerRefundedDetail",
    review: "placeEnding.reviewTransferTo", pick: "placeEnding.pickRefunded" },
};

/**
 * The answers each balance allows, from the contract's sign rules: a picked expense only settles money in an asset,
 * a transfer runs out of the Place when it holds money or was overpaid and into it otherwise, and an adjustment is
 * an expense for money that is gone or income for a debt that no longer exists.
 */
export const answersFor: Record<BalanceCase, readonly Answer[]> = {
  zero: [],
  money: ["moved", "spent", "unknown"],
  overdrawn: ["covered", "waived"],
  debtOwed: ["paid", "forgiven"],
  debtOverpaid: ["refunded", "unknown"],
};

export const situationCopy: Record<Exclude<BalanceCase, "zero">, { title: MessageKey; intro: MessageKey }> = {
  money: { title: "placeEnding.linesTitleMoney", intro: "placeEnding.linesIntroMoney" },
  overdrawn: { title: "placeEnding.linesTitleOverdrawn", intro: "placeEnding.linesIntroOverdrawn" },
  debtOwed: { title: "placeEnding.linesTitleDebtOwed", intro: "placeEnding.linesIntroDebtOwed" },
  debtOverpaid: { title: "placeEnding.linesTitleDebtOverpaid", intro: "placeEnding.linesIntroDebtOverpaid" },
};

export function answerSpec(answer: Answer) {
  return answers[answer];
}

/**
 * One answer to "where did the money go?". `target` is the other Place for a transfer and the category for an
 * expense, with the name the person picked it by: a category that is deleted later leaves the live list, and its
 * name is still needed to show it as unavailable.
 */
export type LineDraft = { id: string; answer: Answer; target: { id: string; name: string } | null; amount: AmountSession };

/** The facts a Close confirmation binds: the balance its answers settle and the day they are recorded on. */
export type Reviewed = { balance: Money; nature: Closure["nature"]; accountingDate: string };

/** What changed under a Close the person was building or reviewing; either part, or both. */
export type StaleNotice = { balance: { from: Money; to: Money } | null; date: string | null };

export function sameMoney(a: Money, b: Money) {
  return a.currency === b.currency && a.minorUnits === b.minorUnits;
}

/**
 * Today in the workspace, from the later of the server's reading and the phone's workspace calendar. A query's date
 * is read when the query runs and a query is not re-run because time passed, so after midnight only the phone's
 * calendar moves; it never moves the day backwards.
 */
export function workspaceDay(closureDate: string, phoneDay: string) {
  return phoneDay > closureDate ? phoneDay : closureDate;
}

/** The changes between what was reviewed and what is true now, added to any earlier notice, or null when nothing changed. */
export function staleNotice(reviewed: Reviewed, live: Reviewed, earlier: StaleNotice | null): StaleNotice | null {
  const balanceChanged = !sameMoney(reviewed.balance, live.balance);
  const dateChanged = reviewed.accountingDate !== live.accountingDate;
  if (!balanceChanged && !dateChanged) return null;
  const from = earlier?.balance?.from ?? reviewed.balance;
  return {
    balance: balanceChanged ? { from, to: live.balance } : earlier?.balance ?? null,
    date: dateChanged ? live.accountingDate : earlier?.date ?? null,
  };
}

/** The answers a new balance still allows, with their picks and amounts; the sign rules decide which answers exist. */
export function keepAllowed(lines: readonly LineDraft[], situation: BalanceCase) {
  return lines.filter((line) => answersFor[situation].includes(line.answer));
}

/** A chosen Place or category as the flow shows it: its live name, or its last name marked once it can't be used. */
export type ChoiceView = { label: string; unavailable: boolean };

export function placeChoice(id: string, places: readonly Pick<PlaceProfile, "id" | "name" | "status">[], t: Translator["t"], fallback = ""): ChoiceView {
  const place = places.find((item) => item.id === id);
  if (!place) return { label: t("placeEnding.placeUnavailable", { name: fallback }), unavailable: true };
  return { label: placeLabel(place, t), unavailable: place.status !== "open" };
}

export function categoryChoice(target: { id: string; name: string }, categories: readonly { id: string; name: string; nature?: string }[], t: Translator["t"]): ChoiceView {
  const category = categories.find((item) => item.id === target.id && item.nature === "Expense");
  return category ? { label: category.name, unavailable: false } : { label: t("placeEnding.categoryDeleted", { name: target.name }), unavailable: true };
}

/** The positive amount a line explains, or null while it is incomplete, unconfirmed or not positive. */
export function lineMinorUnits(line: LineDraft) {
  const minorUnits = amountSendable(line.amount) ? displayedMinorUnits(line.amount) : null;
  return minorUnits !== null && minorUnits > 0 ? minorUnits : null;
}

/** True when every amount is filled and every answer that needs a Place or category has one; availability is checked apart. */
export function lineComplete(line: LineDraft) {
  return lineMinorUnits(line) !== null && (answerSpec(line.answer).kind === "adjustment" || line.target !== null);
}

/** What is still unexplained: the whole balance less every complete amount. Negative means too much was explained. */
export function remainingMinorUnits(balance: Money, lines: readonly LineDraft[]) {
  return Math.abs(balance.minorUnits) - lines.reduce((sum, line) => sum + (lineMinorUnits(line) ?? 0), 0);
}

export function canReview(balance: Money, lines: readonly LineDraft[]) {
  return balance.minorUnits === 0
    ? lines.length === 0
    : lines.length > 0 && lines.every(lineComplete) && remainingMinorUnits(balance, lines) === 0;
}

/**
 * The exact Close command. Its stored descriptions and adjustment category names are written in the person's
 * language now, because stored text is never translated later.
 */
export function closeRequest(input: {
  workspaceId: string;
  place: { id: string; name: string };
  reviewed: Pick<Reviewed, "balance" | "accountingDate">;
  lines: readonly AtPress<LineDraft>[];
  replacement: string | null;
  idempotencyKey: string;
}, t: Translator["t"]): CloseRequest | null {
  const { balance, accountingDate } = input.reviewed;
  if (!canReview(balance, input.lines)) return null;
  const description = t("placeEnding.closingDescription", { place: input.place.name });
  const adjustment = t("placeEnding.adjustmentDescription", { place: input.place.name });
  const lines = input.lines.map((line): CloseRequest["lines"][number] => {
    const amount = { currency: balance.currency, minorUnits: sendableMinorUnits(line.amount, balance.currency)! };
    const { kind } = answerSpec(line.answer);
    if (kind === "transfer") return { kind, otherFinancialAccountProfileId: line.target!.id, amount, description };
    if (kind === "expense") return { kind, userCategoryId: line.target!.id, amount, description };
    return { kind, amount, description: adjustment };
  });
  return {
    workspaceId: input.workspaceId,
    financialAccountProfileId: input.place.id,
    reviewedBalance: balance, reviewedAccountingDate: accountingDate,
    idempotencyKey: input.idempotencyKey,
    ...(input.replacement ? { replacementDefaultFinancialAccountProfileId: input.replacement } : {}),
    ...(lines.some((line) => line.kind === "adjustment") ? {
      closingAdjustmentExpenseName: t("placeEnding.adjustmentExpenseName"),
      closingAdjustmentIncomeName: t("placeEnding.adjustmentIncomeName"),
    } : {}),
    lines,
  };
}

/** The confirmation label of a sent closing line: its direction follows the reviewed balance's sign, as when it was built. */
export function closingLineReview(kind: LineKind, situation: BalanceCase): MessageKey {
  const answer = answersFor[situation].find((item) => answers[item].kind === kind);
  return answer ? answers[answer].review : kind === "transfer" ? "placeEnding.reviewTransferTo"
    : kind === "expense" ? "placeEnding.reviewExpense" : "placeEnding.reviewAdjustmentExpense";
}

export function undoRequest(input: {
  workspaceId: string; placeId: string; replacement: string | null; idempotencyKey: string; previewFingerprint: string;
}, t: Translator["t"]): UndoRequest {
  return {
    workspaceId: input.workspaceId,
    financialAccountProfileId: input.placeId,
    idempotencyKey: input.idempotencyKey,
    previewFingerprint: input.previewFingerprint,
    reversalDescriptionPrefix: t("placeEnding.reversalPrefix"),
    ...(input.replacement ? { replacementDefaultFinancialAccountProfileId: input.replacement } : {}),
  };
}

/** Typing the Place's name is the deliberate confirmation for Undo. Spacing and letter case do not matter. */
export function typedNameMatches(typed: string, name: string) {
  const normal = (text: string) => text.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return normal(typed) !== "" && normal(typed) === normal(name);
}

export function signedMoney(money: Money) {
  return `${money.minorUnits > 0 ? "+" : ""}${formatMoney(money, { hideZeroDecimals: true })}`;
}

const invalidEntryReasons: Record<string, MessageKey> = {
  category_not_found: "placeEnding.invalidCategory",
  category_nature_required: "placeEnding.invalidCategory",
  category_selection_invalid: "placeEnding.invalidCategory",
  category_limit_exceeded: "placeEnding.invalidCategory",
  category_primary_invalid: "placeEnding.invalidCategory",
  activity_before_opening: "placeEnding.invalidOpening",
  ledger_totals_out_of_range: "placeEnding.invalidTotals",
};

export type BlockerView = { title: string; detail: string; action?: "sources" | "close" };

function dateOf(date: string, language: Translator["language"]) {
  return formatLongDate(language, Date.parse(`${date}T12:00:00Z`), "UTC");
}

/** Each blocker as a plain sentence and what to do about it. Close and Undo explain the same blocker differently. */
export function blockerView(blocker: Blocker, act: Act, { t, language }: Translator): BlockerView {
  const plans = (items: { title: string }[]) => formatList(language, items.map((item) => `“${item.title}”`));
  const places = (items: { name: string }[]) => formatList(language, items.map((item) => item.name));
  switch (blocker.code) {
    case "notification_sources":
      return { title: t("placeEnding.blockSourcesTitle"),
        detail: t("placeEnding.blockSourcesDetail", { apps: formatList(language, blocker.apps) }), action: "sources" };
    case "notification_sources_unread":
      return { title: t("placeEnding.blockSourcesUnreadTitle"), detail: t("placeEnding.blockSourcesUnreadDetail"), action: "sources" };
    case "financial_account_profile_ended":
      return { title: t("placeEnding.blockEndedTitle"), detail: t("placeEnding.blockEndedDetail") };
    case "place_undo_in_progress":
      return { title: t("placeEnding.blockUndoingTitle"), detail: t("placeEnding.blockUndoingDetail") };
    case "place_last_open":
      return { title: t("placeEnding.blockLastTitle"), detail: t("placeEnding.blockLastDetail") };
    case "place_recovery_destination":
      return { title: t("placeEnding.blockRecoveryTitle"),
        detail: t(act === "close" ? "placeEnding.blockRecoveryCloseDetail" : "placeEnding.blockRecoveryUndoDetail", { plans: plans(blocker.plans) }) };
    case "place_recovery_contributed_destination":
      return { title: t("placeEnding.blockContributedTitle"),
        detail: t("placeEnding.blockContributedDetail", { plans: plans(blocker.plans) }), action: "close" };
    case "place_recovery_covered_expenses":
      return { title: t("placeEnding.blockCoveredTitle"),
        detail: t("placeEnding.blockCoveredDetail", { plans: plans(blocker.plans) }), action: "close" };
    case "place_undo_ended_counterparty":
      return { title: t("placeEnding.blockEndedOtherTitle"),
        detail: t("placeEnding.blockEndedOtherDetail", { places: places(blocker.places) }), action: "close" };
    case "place_future_entries":
      return { title: t("placeEnding.blockFutureTitle"),
        detail: t("placeEnding.blockFutureDetail", { date: dateOf(blocker.latestAccountingDate, language) }) };
    case "place_undo_invalid_entry":
      return { title: t("placeEnding.blockInvalidTitle"),
        detail: t(invalidEntryReasons[blocker.reason] ?? "placeEnding.invalidOther", { entry: blocker.journalEntryId }), action: "close" };
    case "place_ending_scan_limit":
      return act === "undo"
        ? { title: t("placeEnding.blockScanTitle"), detail: t("placeEnding.blockScanUndoDetail"), action: "close" }
        : { title: t("placeEnding.blockScanTitle"), detail: t("placeEnding.blockScanCloseDetail") };
    case "place_undo_dependency":
      return { title: t("placeEnding.blockDependencyTitle"),
        detail: t("placeEnding.blockDependencyDetail", { places: places(blocker.places) }) };
    case "place_undo_current_period_locked":
      return { title: t("placeEnding.blockMonthLockedTitle"), detail: t("placeEnding.blockMonthLockedDetail") };
  }
}

const refusals: Record<string, MessageKey> = {
  place_default_replacement_required: "placeEnding.refuseReplacementRequired",
  place_default_replacement_invalid: "placeEnding.refuseReplacementInvalid",
  default_place_stale: "placeEnding.refuseDefaultStale",
  defaults_unavailable: "placeEnding.refuseDefaultStale",
  financial_account_profile_not_found: "placeEnding.refuseNotFound",
  idempotency_key_required: "placeEnding.refuseRequest",
  idempotency_key_conflict: "placeEnding.refuseRequest",
  description_invalid: "placeEnding.refuseRequest",
  name_required: "placeEnding.refuseRequest",
  category_name_too_long: "placeEnding.refuseRequest",
  place_close_line_invalid: "placeEnding.refuseLineInvalid",
  place_close_balance_mismatch: "placeEnding.refuseBalanceChanged",
  place_close_balance_stale: "placeEnding.refuseBalanceStale",
  place_undo_preview_stale: "placeEnding.refuseUndoStale",
  transfer_profiles_must_differ: "placeEnding.refuseSamePlace",
  amount_must_be_positive: "placeEnding.refuseAmount",
  currency_mismatch: "placeEnding.refuseCurrency",
  category_not_found: "placeEnding.refuseCategory",
  category_nature_required: "placeEnding.refuseCategory",
  category_nature_mismatch: "placeEnding.refuseCategory",
  activity_before_opening: "placeEnding.refuseBeforeOpening",
  locked_period: "placeEnding.refuseLockedMonth",
  ledger_summary_not_ready: "placeEnding.refuseNotReady",
  ledger_totals_out_of_range: "placeEnding.refuseTotals",
  place_undo_operation_not_found: "placeEnding.refuseRequest",
  place_undo_originals_remain: "placeEnding.refuseRequest",
  place_undo_balance_not_zero: "placeEnding.refuseRequest",
  place_future_entries: "placeEnding.blockFutureTitle",
  place_undo_invalid_entry: "placeEnding.blockInvalidTitle",
  authentication_required: "placeEnding.refuseSession",
  session_required: "placeEnding.refuseSession",
  session_inactive: "placeEnding.refuseSession",
  session_verification_required: "placeEnding.refuseSession",
  provider_unavailable: "placeEnding.refuseProvider",
  device_registration_required: "placeEnding.refuseDevice",
  device_revoked: "placeEnding.refuseDevice",
  membership_required: "placeEnding.refuseAccess",
  workspace_membership_required: "placeEnding.refuseAccess",
  permission_denied: "placeEnding.refuseAccess",
};

const blockerCodes: ReadonlySet<string> = new Set<UndoBlocker["code"]>([
  "financial_account_profile_ended", "place_undo_in_progress", "place_last_open", "place_recovery_destination",
  "place_future_entries", "place_ending_scan_limit", "place_undo_dependency", "place_undo_ended_counterparty",
  "place_undo_invalid_entry", "place_recovery_contributed_destination", "place_recovery_covered_expenses",
  "place_undo_current_period_locked",
]);

/** A structured server error is a definite refusal: the mutation rolled back, or never ran. */
export function refusalOf(error: unknown): { code: string; blocker: UndoBlocker | null } | null {
  const data: unknown = error instanceof ConvexError ? error.data : null;
  if (data === null || typeof data !== "object" || !("code" in data) || typeof data.code !== "string") return null;
  const context = "context" in data ? data.context : null;
  const blocker = blockerCodes.has(data.code) && context !== null && typeof context === "object" && "code" in context
    && context.code === data.code ? context as UndoBlocker : blockerCodes.has(data.code) ? fallbackBlocker(data.code) : null;
  return { code: data.code, blocker };
}

function fallbackBlocker(code: string): UndoBlocker | null {
  if (code === "place_recovery_destination" || code === "place_recovery_contributed_destination" || code === "place_recovery_covered_expenses")
    return { code, plans: [] };
  if (code === "place_undo_dependency" || code === "place_undo_ended_counterparty") return { code, places: [] };
  if (code === "place_future_entries" || code === "place_undo_invalid_entry") return null;
  return { code } as UndoBlocker;
}

/**
 * Refusals that answer a Close or Undo Start sent earlier whose outcome is unknown. Each is raised only after the
 * command looked for a receipt under the request's key and found none (src/accounting/commands/closePlace.ts after
 * line 76, convex/accountingUndo.ts after line 100), or depends on the request alone and so refused the first send too
 * (idempotency_key_required, name_required, category_name_too_long, description_invalid). Not here on purpose:
 * workspace_membership_required, checked before the lookup; idempotency_key_conflict, which means a receipt exists
 * under the key; and any code this app doesn't know.
 */
const settlingRefusals: ReadonlySet<string> = new Set([
  "place_close_balance_stale", "place_close_date_stale", "place_undo_preview_stale",
  "place_default_replacement_required", "place_default_replacement_invalid", "default_place_stale", "defaults_unavailable",
  "place_close_line_invalid", "place_close_balance_mismatch", "transfer_profiles_must_differ", "financial_account_profile_not_found",
  "amount_must_be_positive", "currency_mismatch", "category_not_found", "category_nature_required", "category_nature_mismatch",
  "activity_before_opening", "locked_period", "ledger_summary_not_ready", "ledger_totals_out_of_range", ...blockerCodes,
  "idempotency_key_required", "name_required", "category_name_too_long", "description_invalid",
]);

/** Whether a refusal of a resent Close or Start answers the earlier send. A blocker sent as context is thrown only after the lookup. */
export function settlesEnding(code: string, error: unknown) {
  if (settlingRefusals.has(code)) return true;
  const data: unknown = error instanceof ConvexError ? error.data : null;
  const context = data !== null && typeof data === "object" && "context" in data ? data.context : null;
  return context !== null && typeof context === "object" && "code" in context && context.code === code;
}

/** Why a resend was turned away while its request stays held: the attempt's own reason, or the code for support. */
export function heldReason(code: string, translator: Translator) {
  const known = attemptRefusals.has(code) || code === "workspace_membership_required" ? refusals[code] : undefined;
  return translator.t(known ?? "placeEnding.refuseOther", { code });
}

export function refusalMessage(refusal: { code: string; blocker: UndoBlocker | null }, act: Act, translator: Translator) {
  if (refusal.blocker) {
    const view = blockerView(refusal.blocker, act, translator);
    return `${view.title} ${view.detail}`;
  }
  return translator.t(refusals[refusal.code] ?? "placeEnding.refuseOther", { code: refusal.code });
}

/** Why an Undo paused or needs attention, by the backend's machine-readable reason. Unknown reasons keep a general message. */
const undoReasons: Record<string, MessageKey> = {
  place_undo_current_period_locked: "placeEnding.reasonMonthLocked",
  locked_period: "placeEnding.reasonMonthLocked",
  ledger_summary_not_ready: "placeEnding.reasonNotReady",
  reversal_date_before_original: "placeEnding.reasonDate",
  activity_before_opening: "placeEnding.reasonDate",
  place_undo_stalled: "placeEnding.reasonStalled",
  place_undo_unexpected_failure: "placeEnding.reasonUnexpected",
  financial_account_profile_ended: "placeEnding.reasonPlaceEnded",
  place_undo_in_progress: "placeEnding.reasonPlaceUndoing",
  ledger_totals_out_of_range: "placeEnding.reasonTotals",
  category_not_found: "placeEnding.reasonCategory",
  category_nature_required: "placeEnding.reasonCategory",
  category_nature_mismatch: "placeEnding.reasonCategory",
  category_selection_invalid: "placeEnding.reasonCategory",
  category_limit_exceeded: "placeEnding.reasonCategory",
  category_primary_invalid: "placeEnding.reasonCategory",
  journal_entry_not_found: "placeEnding.reasonRecords",
  journal_entry_incomplete: "placeEnding.reasonRecords",
  journal_line_invalid: "placeEnding.reasonRecords",
  posted_journal_entry_unbalanced: "placeEnding.reasonRecords",
  ledger_account_not_found: "placeEnding.reasonRecords",
  financial_account_profile_not_found: "placeEnding.reasonRecords",
  accounting_period_not_found: "placeEnding.reasonRecords",
  accounting_period_invalid: "placeEnding.reasonRecords",
  place_undo_originals_remain: "placeEnding.reasonRemaining",
  place_undo_balance_not_zero: "placeEnding.reasonRemaining",
  expense_not_recoverable: "placeEnding.reasonRecovery",
  plan_cancelled: "placeEnding.reasonRecovery",
  plan_already_complete: "placeEnding.reasonRecovery",
  plan_not_found: "placeEnding.reasonRecovery",
};

export function undoReason(code: string, t: Translator["t"]) {
  return t(undoReasons[code] ?? "placeEnding.reasonOther");
}

/** How far an Undo is: a fraction of what it started with, or only the count for an operation that predates its total. */
export function undoProgress(operation: UndoOperation, tn: Translator["tn"]) {
  return operation.totalEntriesToReverse === undefined ? tn("placeEnding.statusReversed", operation.reversedCount)
    : tn("placeEnding.statusProgress", operation.totalEntriesToReverse, { reversed: operation.reversedCount });
}

/** Cancelling is only for an Undo that stopped for attention before reversing anything. */
export function undoAbortable(operation: UndoOperation) {
  return operation.state.kind === "needs_attention" && operation.reversedCount === 0 && !operation.hasReversedEntries;
}

export type UndoStatusView = { tone: "progress" | "warning" | "done"; title: string; lines: string[]; support: string[] };

/** What the person reads about an Undo, from the status the backend keeps. It never calls a partial Undo finished. */
export function undoStatusView(operation: UndoOperation, name: string, { t, tn, language }: Translator, timeZone: string): UndoStatusView {
  const progress = undoProgress(operation, tn);
  const { state } = operation;
  const support = (code: string, detail?: string, entry?: string) => [
    detail ? t("placeEnding.statusSupport", { code, detail }) : t("placeEnding.statusSupportCode", { code }),
    ...(entry ? [t("placeEnding.statusAttentionEntry", { entry })] : []),
  ];
  switch (state.kind) {
    case "pending":
    case "running":
      return { tone: "progress", title: t("placeEnding.statusRunningTitle"), lines: [progress, t("placeEnding.statusRunningDetail")], support: [] };
    case "paused":
      return { tone: "warning", title: t("placeEnding.statusPausedTitle"), lines: [
        undoReason(state.code, t),
        t("placeEnding.statusPausedRetry", { time: formatDateTime(language, state.retryAt, timeZone) }),
        progress,
      ], support: support(state.code, state.detail) };
    case "needs_attention":
      return { tone: "warning", title: t("placeEnding.statusAttentionTitle"), lines: [
        undoReason(state.code, t),
        operation.hasReversedEntries ? progress : t("placeEnding.statusAttentionNothing"),
        t(operation.hasReversedEntries ? "placeEnding.statusAttentionPartial" : "placeEnding.statusAttentionUntouched"),
      ], support: support(state.code, state.detail, state.journalEntryId) };
    case "aborted":
      return { tone: "done", title: t("placeEnding.statusAbortedTitle"), lines: [
        t("placeEnding.statusAbortedDetail", { date: formatLongDate(language, state.abortedAt, timeZone) }),
        ...(state.defaultRestored ? [t("placeEnding.abortDefaultRestored", { name })]
          : operation.replacementDefaultFinancialAccountProfileId ? [t("placeEnding.abortDefaultKept")] : []),
      ], support: [] };
    case "done":
      return { tone: "done", title: t("placeEnding.statusDoneTitle"),
        lines: [t("placeEnding.statusDoneDetail", { date: formatLongDate(language, state.completedAt, timeZone) }), progress], support: [] };
  }
}

/** What the Undo began with, from its own receipt rather than a preview of a ledger it is already changing. */
export function undoStartedLines(operation: UndoOperation, { t, tn, language }: Translator, timeZone: string) {
  const date = formatLongDate(language, operation.startedAt, timeZone);
  const started = operation.startedPreview;
  if (!started || operation.totalEntriesToReverse === undefined) return { lines: [t("placeEnding.startedLegacy", { date })], places: [] };
  const month = started.currentMonthExpenseChange.minorUnits !== 0 || started.currentMonthIncomeChange.minorUnits !== 0;
  return {
    lines: [
      tn("placeEnding.startedSummary", operation.totalEntriesToReverse, { date }),
      ...(month ? [t("placeEnding.undoMonth", { expense: signedMoney(started.currentMonthExpenseChange), income: signedMoney(started.currentMonthIncomeChange) })] : []),
    ],
    places: started.otherPlaces.map((place) => ({ id: place.financialAccountProfileId, name: place.name, change: signedMoney(place.balanceChange) })),
  };
}

type PostedEntry = FunctionReturnType<typeof api.accounting.postedEntry>;

/** Every Place a posted entry touches: its own Place, both ends of a transfer and each movement's Place. */
export function entryPlaceIds({ entry, row }: PostedEntry) {
  return [...new Set([entry.financialAccountProfileId, row.financialAccountProfileId, ...(row.financialAccountProfileIds ?? []),
    row.transfer?.from.id, row.transfer?.to.id].filter((id): id is string => !!id))];
}

/** Why an entry cannot be reversed because a Place it touches has ended or is being undone, or null. */
export function entryReversalBlock(detail: PostedEntry, places: readonly Pick<PlaceProfile, "id" | "name" | "status">[] | undefined, t: Translator["t"]) {
  const touched = entryPlaceIds(detail).map((id) => places?.find((place) => place.id === id)).filter((place) => !!place);
  const ended = touched.find((place) => isEnded(place.status));
  if (ended) return t("placeEnding.reverseEnded", { name: ended.name });
  const undoing = touched.find((place) => place.status === "undoing");
  return undoing ? t("placeEnding.reverseUndoing", { name: undoing.name }) : null;
}

/** A stored Place name on an entry, marked when that Place is no longer open. */
export function entryPlaceName(id: string | undefined, stored: string, places: readonly Pick<PlaceProfile, "id" | "name" | "status">[] | undefined, t: Translator["t"]) {
  const place = id ? places?.find((item) => item.id === id) : undefined;
  return place ? placeLabel({ name: stored, status: place.status }, t) : stored;
}
