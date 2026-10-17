import { useEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import type { PendingExpense } from "../pendingExpense";
import { formatMoney, localDate, parseMoney } from "../money";

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
};

export function useExpenseEditor(
  account: Account,
  transport: ExpenseTransport,
) {
  const [amount, setAmount] = useState("-");
  const [description, setDescription] = useState("");
  const [userCategoryId, setUserCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(localDate());
  const [pending, setPending] = useState<PendingExpense | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<Receipt | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    transport
      .load()
      .then((value) => {
        if (!active) return;
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
          setUserCategoryId(value.userCategoryId ?? null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active)
          setError(
            "Could not restore your pending expense. Reopen this page to try again.",
          );
      });
    return () => {
      active = false;
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
    if (submitting.current || loading || !amountValid) return;
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
        ...(userCategoryId ? { userCategoryId } : {}),
      };
      await transport.save(payload);
      setPending(payload);
      const receipt = await transport.post(payload);
      await transport.clear();
      setPending(null);
      setAmount("-");
      setDescription("");
      setUserCategoryId(null);
      setPosted(receipt);
    } catch (error) {
      const data: unknown = error instanceof ConvexError ? error.data : null;
      if (
        data !== null &&
        typeof data === "object" &&
        "kind" in data &&
        data.kind === "accounting"
      ) {
        try {
          await transport.clear();
          setPending(null);
        } catch {
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
      setBusy(false);
    }
  }
  return {
    amount,
    setAmount,
    userCategoryId,
    setUserCategoryId: (id: string | null) => {
      if (!submitting.current && !pending && !loading) setUserCategoryId(id);
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
