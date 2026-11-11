import { useLayoutEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { z } from "zod";
import { useT, type MessageKey } from "../../i18n";
import { admissionFailure } from "../../device-admission/failure";
import { api } from "../api";
import { amountOfMinorUnits, amountSendable, displayedMinorUnits, openAmount, sendableMinorUnits, type AmountAtPress, type AmountSession } from "../amount/session";
import { useFormState, withFields, type ReadAtPress } from "../amount/useAmountState";
import type { BudgetJar, RemovedLimit } from "./model";

type AmountArgs = FunctionArgs<typeof api.budget.setCategoryLimit>;
type TargetArgs = FunctionArgs<typeof api.budget.removeCategoryLimit>;
type Receipt = FunctionReturnType<typeof api.budget.setCategoryLimit>;
export type LimitCommand =
  | { kind: "amount"; args: AmountArgs }
  | { kind: "spendNothing"; args: TargetArgs }
  | { kind: "remove"; args: TargetArgs };
export type LimitAct = LimitCommand["kind"];
export type BudgetEditorSeed = {
  workspaceId: string;
  month: string;
  currency: string;
  initialCategoryId?: string;
  jar: (BudgetJar & { revisionId: string }) | null;
  removedLimits: RemovedLimit[];
};
export type BudgetTransport = {
  send: (command: LimitCommand) => Promise<Receipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onSaved: (receipt: Receipt) => void;
};
export type AmountIssue = "empty" | "invalid" | "zero" | "notPositive" | "unchanged";

const budgetRefusal = z.object({ kind: z.literal("budget"), code: z.string() });
const accessRefusal = z.object({ code: z.string() });
const refusals: Record<string, { message: MessageKey; closes: boolean }> = {
  limit_changed: { message: "budget.errorStale", closes: true },
  month_changed: { message: "budget.errorStale", closes: true },
  month_invalid: { message: "budget.errorMonthInvalid", closes: true },
  limit_not_set: { message: "budget.errorLimitNotSet", closes: true },
  category_not_found: { message: "budget.errorCategoryGone", closes: true },
  expense_category_required: { message: "budget.errorNotExpense", closes: true },
  currency_mismatch: { message: "budget.errorCurrency", closes: true },
  workspace_not_found: { message: "budget.errorWorkspace", closes: true },
  limit_must_be_positive: { message: "lifecycle.limitNotPositive", closes: false },
  amount_out_of_range: { message: "budget.errorOutOfRange", closes: false },
  idempotency_key_conflict: { message: "budget.errorKeyConflict", closes: false },
  idempotency_key_invalid: { message: "budget.errorRejected", closes: false },
};

function limitIssue(amount: AmountSession, currentMinorUnits: number | undefined):
  { minorUnits: number; issue: AmountIssue | null } {
  if (!amount.editor.text.trim()) return { minorUnits: 0, issue: "empty" };
  const minorUnits = displayedMinorUnits(amount);
  if (minorUnits === null) return { minorUnits: 0, issue: "invalid" };
  if (minorUnits === 0) return { minorUnits, issue: "zero" };
  if (minorUnits < 0) return { minorUnits, issue: "notPositive" };
  return { minorUnits, issue: minorUnits === currentMinorUnits ? "unchanged" : null };
}

/** Whether `act` may be sent for this category and limit amount. */
function readyFor(act: LimitAct, categoryId: string | null, amount: AmountSession, seed: BudgetEditorSeed) {
  if (act === "amount") return !!categoryId && !limitIssue(amount, seed.jar?.limitMinorUnits).issue && amountSendable(amount);
  if (act === "spendNothing") return !!categoryId && seed.jar?.limitMinorUnits !== 0;
  return !!seed.jar;
}

function startingAmount(seed: BudgetEditorSeed) {
  return seed.jar && seed.jar.limitMinorUnits > 0
    ? amountOfMinorUnits(seed.currency, seed.jar.limitMinorUnits)
    : openAmount(seed.currency);
}

export function useSendLimitCommand(): BudgetTransport["send"] {
  const amount = useAction(api.budget.setCategoryLimit);
  const spendNothing = useAction(api.budget.setCategorySpendNothing);
  const remove = useAction(api.budget.removeCategoryLimit);
  return (command) => command.kind === "amount" ? amount(command.args)
    : command.kind === "spendNothing" ? spendNothing(command.args) : remove(command.args);
}

/** The person's answers and the editor state that decides whether a press may send; a press reads it once. */
type BudgetForm = {
  categoryId: string | null;
  amount: AmountSession;
  search: string;
  busy: boolean;
  pendingAct: LimitAct | null;
  /** A refusal closed this editor; it sends nothing more. */
  blocked: boolean;
};

export function useBudgetEditor(seed: BudgetEditorSeed, transport: BudgetTransport) {
  const translator = useT();
  const { t } = translator;
  const [form, setForm, readForm] = useFormState<BudgetForm>(() => ({
    categoryId: seed.jar?.category.id ?? seed.initialCategoryId ?? null, amount: startingAmount(seed), search: "",
    busy: false, pendingAct: null, blocked: false,
  }));
  const change = (patch: Partial<BudgetForm>) => setForm((now) => withFields(now, patch));
  if (form.amount.currency !== seed.currency) change({ amount: startingAmount(seed) });
  const [error, setError] = useState("");
  const command = useRef<LimitCommand | null>(null);
  const uncertain = useRef(false);
  const submitting = useRef(false);
  const lifetime = useRef({ active: false });
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    return () => { mounted.active = false; };
  }, []);
  const { minorUnits, issue } = limitIssue(form.amount, seed.jar?.limitMinorUnits);
  /** Whether `act` may be sent; rendering asks with the form, a press with what it reads. */
  const sendable = (act: LimitAct, now: BudgetForm | ReadAtPress<BudgetForm>) =>
    !now.busy && !now.blocked && (now.pendingAct ? now.pendingAct === act : readyFor(act, now.categoryId, now.amount, seed));

  function build(act: LimitAct, selectedCategoryId: string, pressed: AmountAtPress): LimitCommand {
    const target = {
      workspaceId: seed.workspaceId, categoryId: selectedCategoryId, effectiveMonth: seed.month,
      expectedRevisionId: seed.jar?.revisionId
        ?? seed.removedLimits.find((removed) => removed.categoryId === selectedCategoryId)?.revisionId ?? null,
      idempotencyKey: transport.newKey(),
    };
    if (act !== "amount") return { kind: act, args: target };
    const limit = sendableMinorUnits(pressed);
    if (limit === null) throw new Error("Limit amount is not sendable");
    return { kind: act, args: { ...target, limit: { currency: seed.currency, minorUnits: limit } } };
  }

  async function send(act: LimitAct) {
    const mounted = lifetime.current;
    const now = readForm();
    const selectedCategoryId = command.current?.args.categoryId ?? now.categoryId;
    if (!mounted.active || submitting.current || now.blocked || !selectedCategoryId) return;
    if (command.current ? command.current.kind !== act : !readyFor(act, selectedCategoryId, now.amount, seed)) return;
    submitting.current = true;
    change({ busy: true });
    setError("");
    try {
      const frozen = command.current ?? build(act, selectedCategoryId, now.amount);
      command.current = frozen;
      change({ pendingAct: frozen.kind });
      const receipt = await transport.send(frozen);
      if (!mounted.active) return;
      command.current = null;
      uncertain.current = false;
      change({ pendingAct: null });
      transport.onSaved(receipt);
    } catch (error) {
      if (transport.reportFailure(error) || !mounted.active) return;
      const data = error instanceof ConvexError ? error.data : null;
      const refused = budgetRefusal.safeParse(data);
      const release = () => { command.current = null; uncertain.current = false; change({ pendingAct: null }); };
      if (refused.success) {
        const refusal = refusals[refused.data.code] ?? { message: "budget.errorRejected", closes: false };
        release();
        change({ blocked: refusal.closes });
        setError(t(refusal.message));
      } else if (accessRefusal.safeParse(data).success) {
        // Access is checked before any write, so a first attempt is known not to have applied.
        // After an uncertain attempt it proves nothing about that earlier send, which stays frozen.
        if (!uncertain.current) release();
        setError(admissionFailure(error, translator).message);
      } else {
        uncertain.current = true;
        setError(t("budget.errorUnknown"));
      }
    } finally {
      submitting.current = false;
      if (mounted.active) change({ busy: false });
    }
  }
  const canEdit = () => lifetime.current.active && !submitting.current && !command.current && !readForm().blocked;
  const pending = form.pendingAct !== null;
  return {
    categoryId: form.categoryId, amount: form.amount, minorUnits, amountIssue: issue, search: form.search, busy: form.busy, pending,
    pendingAct: form.pendingAct, error,
    editable: !form.busy && !pending && !form.blocked,
    canSubmit: sendable("amount", form),
    canSend: (act: LimitAct) => sendable(act, readForm()),
    canDismiss: !form.busy && !pending,
    onCategory: (id: string) => { if (canEdit() && !seed.jar) change({ categoryId: id }); },
    onAmount: (value: AmountSession) => { if (canEdit() && value.currency === seed.currency) change({ amount: value }); },
    onResetAmount: () => { if (canEdit()) change({ amount: startingAmount(seed) }); },
    onSearch: (value: string) => { if (canEdit()) change({ search: value }); },
    submit: () => send("amount"),
    spendNothing: () => send("spendNothing"),
    remove: () => send("remove"),
  };
}
