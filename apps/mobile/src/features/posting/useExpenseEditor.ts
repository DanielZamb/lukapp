import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import type { PendingExpense } from "../pendingExpense";
import { formatMoney, localDate, parseMoney } from "../money";
import type { TransactionCategories } from "../categories/transactionSelection";

type Account = Pick<
  PendingExpense,
  "workspaceId" | "financialAccountProfileId"
> & { currency: "COP" | "USD" };
type Receipt = {
  description: string;
  amount: { currency: string; minorUnits: number };
};
export type ExpenseTransport = {
  load: () => Promise<PendingExpense | null>;
  save: (payload: PendingExpense) => Promise<void>;
  post: (payload: PendingExpense) => Promise<Receipt>;
  clear: () => Promise<void>;
  newKey: () => string;
  reportFailure?: (error: unknown) => boolean;
};

export function useExpenseEditor(
  account: Account,
  transport: ExpenseTransport,
) {
  const [amount, setAmount] = useState("-");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<TransactionCategories>({ ids: [], primaryId: null });
  const [date, setDate] = useState(localDate());
  const [pending, setPending] = useState<PendingExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<Receipt | null>(null);
  const submitting = useRef(false);
  const lifetime = useRef({ active: false });
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    transport
      .load()
      .then((value) => {
        if (!mounted.active) return;
        if (
          value &&
          (value.workspaceId !== account.workspaceId ||
            value.financialAccountProfileId !==
              account.financialAccountProfileId ||
            value.amount.currency !== account.currency)
        )
          throw new Error("Pending expense belongs to another account");
        setPending(value);
        if (value) {
          setAmount(
            formatMoney({
              ...value.amount,
              minorUnits: -value.amount.minorUnits,
            }).replace(`${value.amount.currency} `, ""),
          );
          setDescription(value.description);
          setDate(value.accountingDate);
          setCategories({
            ids: value.userCategoryIds ?? (value.userCategoryId ? [value.userCategoryId] : []),
            primaryId: value.primaryUserCategoryId ?? null,
          });
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (mounted.active) {
          if (transport.reportFailure?.(error)) return;
          setError(
            "Could not restore your pending expense. Reopen this page to try again.",
          );
        }
      });
    return () => {
      mounted.active = false;
    };
  }, [
    account.workspaceId,
    account.financialAccountProfileId,
    account.currency,
    transport,
  ]);
  let amountValid = false;
  try {
    amountValid = parseMoney(amount) < 0;
  } catch {
    /* Incomplete edits stay editable. */
  }
  async function submit() {
    const mounted = lifetime.current;
    if (!mounted.active || submitting.current || loading || !amountValid) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setPosted(null);
    try {
      const payload = pending ?? {
        workspaceId: account.workspaceId,
        financialAccountProfileId: account.financialAccountProfileId,
        amount: { currency: account.currency, minorUnits: -parseMoney(amount) },
        accountingDate: date,
        description: description.trim(),
        idempotencyKey: transport.newKey(),
        ...(categories.ids.length ? { userCategoryIds: [...categories.ids] } : {}),
        ...(categories.primaryId ? { primaryUserCategoryId: categories.primaryId } : {}),
      };
      await transport.save(payload);
      if (!mounted.active) return;
      setPending(payload);
      const receipt = await transport.post(payload);
      if (!mounted.active) return;
      await transport.clear();
      if (!mounted.active) return;
      setPending(null);
      setAmount("-");
      setDescription("");
      setCategories({ ids: [], primaryId: null });
      setPosted(receipt);
    } catch (error) {
      if (transport.reportFailure?.(error)) return;
      if (!mounted.active) return;
      const data: unknown = error instanceof ConvexError ? error.data : null;
      if (
        data !== null &&
        typeof data === "object" &&
        "kind" in data &&
        data.kind === "accounting"
      ) {
        try {
          await transport.clear();
          if (!mounted.active) return;
          setPending(null);
        } catch {
          if (!mounted.active) return;
          setError(
            "Could not clear the saved expense. Retry to check its status.",
          );
          return;
        }
        setError(
          "Expense was rejected. Check the category, amount, date, and whether the month is open.",
        );
      } else
        setError(
          "Could not confirm posting. Retry to safely check the same expense.",
        );
    } finally {
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  return {
    amount,
    setAmount,
    categories,
    setCategories: (value: TransactionCategories) => {
      if (!submitting.current && !pending && !loading &&
        value.ids.length <= 3 && new Set(value.ids).size === value.ids.length &&
        value.ids.every(Boolean) && (!value.primaryId || value.ids.includes(value.primaryId)))
        setCategories({ ids: [...value.ids], primaryId: value.primaryId });
    },
    description,
    setDescription,
    date,
    setDate,
    pending: !!pending,
    loading,
    busy,
    error,
    posted,
    editable: !busy && !pending && !loading,
    canSubmit: !busy && !loading && amountValid,
    submit,
    dismissPosted: () => setPosted(null),
  };
}
