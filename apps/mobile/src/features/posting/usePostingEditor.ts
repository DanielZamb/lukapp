import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { formatMoney, parseMoney } from "../money";
import { defaultAccountingDate } from "../timeZones";
import type { TransactionCategories } from "../categories/transactionSelection";
import type { PendingPosting, PlaceKind } from "./pendingPostingSchema";

import type { EntryType } from "./PostingForm";
export type PostingReceipt = {
  description: string;
  amount: { currency: string; minorUnits: number };
  financialAccountProfileId?: string;
  title?: string;
};
export type PostingTransport = {
  load: () => Promise<PendingPosting | null>;
  save: (entry: PendingPosting) => Promise<void>;
  post: (entry: PendingPosting) => Promise<PostingReceipt>;
  clear: () => Promise<void>;
  newKey: () => string;
  reportFailure?: (error: unknown) => boolean;
};
type Account = {
  workspaceId: string;
  financialAccountProfileId: string;
  currency: "COP" | "USD";
  timeZone: string;
};
export type PlaceDraft = {
  name: string;
  productKind: PlaceKind;
  amount: string;
  date: string;
  target?: Extract<PendingPosting, { kind: "setup" }>["target"];
};

export function usePostingEditor(
  account: Account,
  transport: PostingTransport,
) {
  const [amount, setAmount] = useState("-");
  const [description, setDescription] = useState("");
  const [categories, setCategories] = useState<TransactionCategories>({
    ids: [],
    primaryId: null,
  });
  const [date, setDate] = useState(() =>
    defaultAccountingDate(account.timeZone),
  );
  const [entryType, setEntryType] = useState<EntryType>("normal");
  const [profileId, setProfileId] = useState(account.financialAccountProfileId);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [setup, setSetup] = useState<PlaceDraft | null>(null);
  const [pending, setPending] = useState<PendingPosting | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<PostingReceipt | null>(null);
  const submitting = useRef(false);
  const lifetime = useRef({ active: false });
  const editable = !busy && !pending && !loading;
  const canEdit = () =>
    lifetime.current.active && !submitting.current && !pending && !loading;
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    transport
      .load()
      .then((value) => {
        if (!mounted.active) return;
        if (
          value &&
          (value.payload.workspaceId !== account.workspaceId ||
            value.payload.amount.currency !== account.currency)
        )
          throw new Error("Pending entry belongs to another workspace");
        setPending(value);
        if (value) {
          const payload = value.payload;
          setDate(payload.accountingDate);
          setAmount(
            formatMoney({
              ...payload.amount,
              minorUnits:
                value.kind === "expense"
                  ? -payload.amount.minorUnits
                  : payload.amount.minorUnits,
            }).replace(`${payload.amount.currency} `, ""),
          );
          setDescription("description" in payload ? payload.description : "");
          setEntryType(
            value.kind === "transfer"
              ? "transfer"
              : value.kind === "opening"
                ? "initial"
                : "normal",
          );
          if (value.kind === "setup")
            setSetup({
              name: value.payload.name,
              productKind: value.payload.productKind,
              amount: formatMoney(value.payload.amount).replace(
                `${payload.amount.currency} `,
                "",
              ),
              date: payload.accountingDate,
              target: value.target,
            });
          else if (value.kind === "transfer") {
            setProfileId(value.payload.sourceFinancialAccountProfileId);
            setDestinationId(
              value.payload.destinationFinancialAccountProfileId,
            );
          } else setProfileId(value.payload.financialAccountProfileId);
          if (value.kind === "expense" || value.kind === "income")
            setCategories({
              ids:
                value.payload.userCategoryIds ??
                (value.payload.userCategoryId
                  ? [value.payload.userCategoryId]
                  : []),
              primaryId: value.payload.primaryUserCategoryId ?? null,
            });
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (mounted.active && !transport.reportFailure?.(error))
          setError(
            "Could not restore your pending entry. Reopen this page to try again.",
          );
      });
    return () => {
      mounted.active = false;
    };
  }, [account.workspaceId, account.currency, transport]);

  let minorUnits: number | null = null;
  try {
    minorUnits = parseMoney(amount);
  } catch {
    /* Incomplete edits stay editable. */
  }
  const amountValid =
    minorUnits !== null &&
    (entryType === "initial" ? minorUnits >= 0 : minorUnits !== 0);
  const validTransfer =
    entryType !== "transfer" ||
    (!!destinationId && destinationId !== profileId);
  const direction: "in" | "out" =
    minorUnits !== null && minorUnits > 0 ? "in" : "out";
  function buildEntry(): PendingPosting {
    if (setup)
      return {
        kind: "setup",
        ...(setup.target ? { target: setup.target } : {}),
        payload: {
          workspaceId: account.workspaceId,
          name: setup.name.trim(),
          productKind: setup.productKind,
          amount: {
            currency: account.currency,
            minorUnits: parseMoney(setup.amount),
          },
          accountingDate: setup.date,
          idempotencyKey: transport.newKey(),
        },
      };
    const payload = {
      workspaceId: account.workspaceId,
      amount: {
        currency: account.currency,
        minorUnits: Math.abs(parseMoney(amount)),
      },
      accountingDate: date,
      description: description.trim(),
      idempotencyKey: transport.newKey(),
    };
    if (entryType === "transfer") {
      if (!destinationId) throw new Error("Choose where the money goes");
      return {
        kind: "transfer",
        payload: {
          ...payload,
          sourceFinancialAccountProfileId: profileId,
          destinationFinancialAccountProfileId: destinationId,
        },
      };
    }
    if (entryType === "initial")
      return {
        kind: "opening",
        payload: { ...payload, financialAccountProfileId: profileId },
      };
    return {
      kind: direction === "in" ? "income" : "expense",
      payload: {
        ...payload,
        financialAccountProfileId: profileId,
        ...(categories.ids.length
          ? { userCategoryIds: [...categories.ids] }
          : {}),
        ...(categories.primaryId
          ? { primaryUserCategoryId: categories.primaryId }
          : {}),
      },
    };
  }
  let setupValid = false;
  try {
    setupValid = !!setup?.name.trim() && parseMoney(setup.amount) >= 0;
  } catch {
    /* Keep incomplete setup editable. */
  }
  const canSubmit =
    !busy &&
    !loading &&
    (!!pending || (setup ? setupValid : amountValid && validTransfer));
  async function submit() {
    const mounted = lifetime.current;
    if (!mounted.active || submitting.current || !canSubmit) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setPosted(null);
    try {
      const entry = pending ?? buildEntry();
      await transport.save(entry);
      if (!mounted.active) return;
      setPending(entry);
      const receipt = await transport.post(entry);
      if (!mounted.active) return;
      await transport.clear();
      if (!mounted.active) return;
      setPending(null);
      setAmount(entryType === "initial" ? "0" : "-");
      setDescription("");
      setCategories({ ids: [], primaryId: null });
      setSetup(null);
      if (entry.kind === "setup" && receipt.financialAccountProfileId) {
        if (entry.target?.kind === "destination") {
          setProfileId(entry.target.sourceProfileId);
          setDestinationId(receipt.financialAccountProfileId);
          setEntryType("transfer");
        } else setProfileId(receipt.financialAccountProfileId);
      }
      setPosted(receipt);
    } catch (error) {
      if (transport.reportFailure?.(error) || !mounted.active) return;
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
          if (mounted.active)
            setError(
              "Could not clear the saved entry. Retry to check its status.",
            );
          return;
        }
        setError(
          "message" in data && typeof data.message === "string"
            ? data.message
            : "Entry was rejected. Check the places, category, amount and date.",
        );
      } else
        setError(
          "Could not confirm posting. Retry to safely check the same entry.",
        );
    } finally {
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  return {
    amount,
    setAmount: (value: string) => {
      if (canEdit()) {
        let nextDirection = direction;
        try {
          nextDirection = parseMoney(value) > 0 ? "in" : "out";
        } catch {
          /* Preserve the selection during incomplete edits. */
        }
        if (nextDirection !== direction)
          setCategories({ ids: [], primaryId: null });
        setAmount(value);
      }
    },
    description,
    setDescription: (value: string) => {
      if (canEdit()) setDescription(value);
    },
    date,
    setDate: (value: string) => {
      if (canEdit()) setDate(value);
    },
    entryType,
    setEntryType: (value: EntryType) => {
      if (canEdit()) {
        setEntryType(value);
        setCategories({ ids: [], primaryId: null });
        setError("");
      }
    },
    profileId,
    setProfileId: (value: string) => {
      if (canEdit()) setProfileId(value);
    },
    destinationId,
    setDestinationId: (value: string) => {
      if (canEdit()) setDestinationId(value);
    },
    setup,
    setSetup: (value: PlaceDraft | null) => {
      if (canEdit()) setSetup(value);
    },
    direction,
    categories,
    setCategories: (value: TransactionCategories) => {
      if (
        canEdit() &&
        value.ids.length <= 3 &&
        new Set(value.ids).size === value.ids.length &&
        value.ids.every(Boolean) &&
        (!value.primaryId || value.ids.includes(value.primaryId))
      )
        setCategories({ ids: [...value.ids], primaryId: value.primaryId });
    },
    pending: !!pending,
    loading,
    busy,
    error,
    posted,
    editable,
    canSubmit,
    submit,
    dismissPosted: () => setPosted(null),
  };
}
