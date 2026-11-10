import { useLayoutEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { z } from "zod";
import { useT, type MessageKey } from "../../i18n";
import { admissionFailure } from "../../device-admission/failure";
import { api } from "../api";
import { formatMoney, parseMoney } from "../money";
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

function readAmount(text: string, currency: string, currentMinorUnits: number | undefined):
  { minorUnits: number; issue: AmountIssue | null } {
  if (!text.trim()) return { minorUnits: 0, issue: "empty" };
  let minorUnits: number;
  try { minorUnits = parseMoney(text, "es-CO", currency); } catch { return { minorUnits: 0, issue: "invalid" }; }
  if (minorUnits === 0) return { minorUnits, issue: "zero" };
  if (minorUnits < 0) return { minorUnits, issue: "notPositive" };
  return { minorUnits, issue: minorUnits === currentMinorUnits ? "unchanged" : null };
}

function startingAmount(seed: BudgetEditorSeed) {
  return seed.jar && seed.jar.limitMinorUnits > 0
    ? formatMoney({ currency: seed.currency, minorUnits: seed.jar.limitMinorUnits }).replace(`${seed.currency} `, "")
    : "";
}

export function useSendLimitCommand(): BudgetTransport["send"] {
  const amount = useAction(api.budget.setCategoryLimit);
  const spendNothing = useAction(api.budget.setCategorySpendNothing);
  const remove = useAction(api.budget.removeCategoryLimit);
  return (command) => command.kind === "amount" ? amount(command.args)
    : command.kind === "spendNothing" ? spendNothing(command.args) : remove(command.args);
}

export function useBudgetEditor(seed: BudgetEditorSeed, transport: BudgetTransport) {
  const translator = useT();
  const { t } = translator;
  const [categoryId, setCategoryId] = useState<string | null>(seed.jar?.category.id ?? seed.initialCategoryId ?? null);
  const [amount, setAmount] = useState(() => startingAmount(seed));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingAct, setPendingAct] = useState<LimitAct | null>(null);
  const [blocked, setBlocked] = useState(false);
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
  const { minorUnits, issue } = readAmount(amount, seed.currency, seed.jar?.limitMinorUnits);
  const ready: Record<LimitAct, boolean> = {
    amount: !!categoryId && !issue,
    spendNothing: !!categoryId && seed.jar?.limitMinorUnits !== 0,
    remove: !!seed.jar,
  };
  const canSend = (act: LimitAct) => !busy && !blocked && (pendingAct ? pendingAct === act : ready[act]);

  function build(act: LimitAct, selectedCategoryId: string): LimitCommand {
    const target = {
      workspaceId: seed.workspaceId, categoryId: selectedCategoryId, effectiveMonth: seed.month,
      expectedRevisionId: seed.jar?.revisionId
        ?? seed.removedLimits.find((removed) => removed.categoryId === selectedCategoryId)?.revisionId ?? null,
      idempotencyKey: transport.newKey(),
    };
    return act === "amount" ? { kind: act, args: { ...target, limit: { currency: seed.currency, minorUnits } } }
      : { kind: act, args: target };
  }

  async function send(act: LimitAct) {
    const mounted = lifetime.current;
    const selectedCategoryId = command.current?.args.categoryId ?? categoryId;
    if (!mounted.active || submitting.current || blocked || !selectedCategoryId) return;
    if (command.current ? command.current.kind !== act : !ready[act]) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const frozen = command.current ?? build(act, selectedCategoryId);
      command.current = frozen;
      setPendingAct(frozen.kind);
      const receipt = await transport.send(frozen);
      if (!mounted.active) return;
      command.current = null;
      uncertain.current = false;
      setPendingAct(null);
      transport.onSaved(receipt);
    } catch (error) {
      if (transport.reportFailure(error) || !mounted.active) return;
      const data = error instanceof ConvexError ? error.data : null;
      const refused = budgetRefusal.safeParse(data);
      const release = () => { command.current = null; uncertain.current = false; setPendingAct(null); };
      if (refused.success) {
        const refusal = refusals[refused.data.code] ?? { message: "budget.errorRejected", closes: false };
        release();
        setBlocked(refusal.closes);
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
      if (mounted.active) setBusy(false);
    }
  }
  const canEdit = () => lifetime.current.active && !submitting.current && !command.current && !blocked;
  const pending = pendingAct !== null;
  return {
    categoryId, amount, minorUnits, amountIssue: issue, search, busy, pending, pendingAct, error,
    editable: !busy && !pending && !blocked,
    canSubmit: canSend("amount"),
    canSend,
    canDismiss: !busy && !pending,
    onCategory: (id: string) => { if (canEdit() && !seed.jar) setCategoryId(id); },
    onAmount: (value: string) => { if (canEdit()) setAmount(value); },
    onResetAmount: () => { if (canEdit()) setAmount(startingAmount(seed)); },
    onSearch: (value: string) => { if (canEdit()) setSearch(value); },
    submit: () => send("amount"),
    spendNothing: () => send("spendNothing"),
    remove: () => send("remove"),
  };
}
