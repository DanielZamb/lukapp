import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { z } from "zod";
import type { api } from "../api";
import { formatMoney, parseMoney } from "../money";
import type { BudgetJar } from "./model";

type Request = FunctionArgs<typeof api.budget.setCategoryLimit>;
type Receipt = FunctionReturnType<typeof api.budget.setCategoryLimit>;
export type BudgetEditorSeed = {
  workspaceId: string;
  month: string;
  currency: string;
  initialCategoryId?: string;
  jar: (BudgetJar & { revisionId: string }) | null;
};
export type BudgetTransport = {
  save: (request: Request) => Promise<Receipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onSaved: (receipt: Receipt) => void;
};
const rejection = z.object({ kind: z.literal("budget"), code: z.string() });

export function useBudgetEditor(seed: BudgetEditorSeed, transport: BudgetTransport) {
  const [categoryId, setCategoryId] = useState<string | null>(seed.jar?.category.id ?? seed.initialCategoryId ?? null);
  const [amount, setAmount] = useState(seed.jar ? formatMoney({ currency: seed.currency, minorUnits: seed.jar.limitMinorUnits })
    .replace(`${seed.currency} `, "") : "");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<Request | null>(null);
  const submitting = useRef(false);
  const lifetime = useRef({ active: false });
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    return () => { mounted.active = false; };
  }, []);
  let minorUnits = 0;
  try { minorUnits = parseMoney(amount, "es-CO", seed.currency); } catch { /* Incomplete input stays editable. */ }
  const editable = !busy && !pending && !blocked;
  async function submit() {
    const mounted = lifetime.current;
    const selectedCategoryId = request.current?.categoryId ?? categoryId;
    if (!mounted.active || submitting.current || blocked || !selectedCategoryId || (!request.current && minorUnits <= 0)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = request.current ?? {
        workspaceId: seed.workspaceId, categoryId: selectedCategoryId, effectiveMonth: seed.month,
        limit: { currency: seed.currency, minorUnits }, expectedRevisionId: seed.jar?.revisionId ?? null,
        idempotencyKey: transport.newKey(),
      };
      request.current = payload;
      setPending(true);
      const receipt = await transport.save(payload);
      if (!mounted.active) return;
      request.current = null;
      setPending(false);
      transport.onSaved(receipt);
    } catch (error) {
      if (transport.reportFailure(error) || !mounted.active) return;
      const parsed = rejection.safeParse(error instanceof ConvexError ? error.data : null);
      if (parsed.success) {
        request.current = null;
        setPending(false);
        const stale = parsed.data.code === "limit_changed" || parsed.data.code === "month_changed";
        setBlocked(stale);
        setError(stale ? "This limit or month changed. Close and reopen the Budget to use its latest limit."
          : "Budget was not saved. Check the category and positive limit, then try again.");
      } else setError("Could not confirm saving. Retry to safely check the same Budget.");
    } finally {
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  const canEdit = () => lifetime.current.active && !submitting.current && !request.current && !blocked;
  return {
    categoryId, amount, minorUnits, search, busy, pending, error, editable,
    canSubmit: !busy && !blocked && (pending || (!!categoryId && minorUnits > 0)),
    canDismiss: !busy && !pending,
    onCategory: (id: string) => { if (canEdit() && !seed.jar) setCategoryId(id); },
    onAmount: (value: string) => { if (canEdit()) setAmount(value); },
    onSearch: (value: string) => { if (canEdit()) setSearch(value); },
    submit,
  };
}
