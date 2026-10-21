import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { formatMoney, parseMoney } from "../money";
import { defaultAccountingDate } from "../timeZones";
import type { AccountSetupRequest } from "../categories/model";
import type { TransactionCategories } from "../categories/transactionSelection";
import type { PendingPosting, PlaceKind } from "./pendingPostingSchema";
import type {
  LocalEntryDraft,
  LocalEntryDraftId,
  LocalEntryDraftsPort,
  LocalEntryFacts,
} from "../localEntryDrafts";
import { pendingExpenseSchema } from "../pendingExpenseSchema";
import { LocalEntryDraftGoneError } from "../localEntryDraftErrors";
import type { EntryType } from "./PostingForm";
import type {
  ConfirmCandidateInput,
  IntakeSuggestion,
} from "../../../../../src/notificationIntake/types";
import {
  intakeConfirmOutcome,
  intakeErrorMessage,
} from "../../../../../src/notificationIntake/outcome";
export type PostingReceipt = {
  description: string;
  amount: { currency: string; minorUnits: number };
  financialAccountProfileId?: string;
  title?: string;
};
export type LoadResult =
  | { kind: "none" }
  | { kind: "pending"; id: LocalEntryDraftId; command: PendingPosting }
  | { kind: "blocked" };
export type SavedPosting = {
  id: LocalEntryDraftId;
  command: PendingPosting;
};
export type PostingTransport = {
  load: (draftId?: LocalEntryDraftId, resume?: boolean) => Promise<LoadResult>;
  save: (
    entry: PendingPosting,
    draftId?: LocalEntryDraftId,
  ) => Promise<SavedPosting>;
  post: (entry: PendingPosting) => Promise<PostingReceipt>;
  clear: () => Promise<void>;
  abort: () => Promise<void>;
  newKey: () => string;
  reportFailure?: (error: unknown) => boolean;
};
type Account = {
  workspaceId: string;
  financialAccountProfileId: string;
  currency: string;
  timeZone: string;
};
export type PlaceDraft = {
  name: string;
  emoji?: string;
  productKind: PlaceKind | null;
  amount: string;
  date: string;
  target?: Extract<PendingPosting, { kind: "setup" }>["target"];
};
export type IntakeBinding = {
  id: string;
  facts: LocalEntryFacts;
  suggestion: IntakeSuggestion;
  parserVersion: string;
  consentVersion: string;
  confirm: (input: ConfirmCandidateInput) => Promise<PostingReceipt>;
  consume: () => Promise<void>;
  fail: (error: string) => Promise<void>;
};
export type PostingDraftsSession = {
  drafts?: LocalEntryDraftsPort | null;
  draftId?: LocalEntryDraftId;
  intake?: IntakeBinding | null;
  intakeRoute?: boolean;
};

export function usePostingEditor(
  account: Account,
  transport: PostingTransport,
  session: PostingDraftsSession = {},
) {
  const drafts = session.drafts ?? null;
  const requestedId = session.draftId;
  const intake = session.intake ?? null;
  const isolate = session.intakeRoute === true || intake !== null;
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
  const [transferReviewRequired, setTransferReviewRequired] = useState(false);
  const [setup, setSetup] = useState<PlaceDraft | null>(null);
  const [pending, setPending] = useState<PendingPosting | null>(null);
  const [draftId, setDraftId] = useState<LocalEntryDraftId | undefined>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [keeping, setKeeping] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<PostingReceipt | null>(null);
  const [setupPosted, setSetupPosted] = useState<PostingReceipt | null>(null);
  const opLock = useRef(false);
  const submitting = useRef(false);
  const appliedDraft = useRef<LocalEntryDraftId | undefined>(undefined);
  const lifetime = useRef({ active: false });
  const editable = !busy && !pending && !loading && !blocked;
  const canKeepDraft =
    drafts !== null &&
    intake === null &&
    editable &&
    !keeping &&
    !setup &&
    entryType !== "initial";
  const canEdit = () =>
    lifetime.current.active &&
    !submitting.current &&
    !pending &&
    !loading &&
    !blocked;
  function hydrateFromCommand(value: PendingPosting) {
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
        ...(value.payload.emoji ? { emoji: value.payload.emoji } : {}),
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
      setDestinationId(value.payload.destinationFinancialAccountProfileId);
    } else setProfileId(value.payload.financialAccountProfileId);
    if (
      value.kind === "expense" ||
      value.kind === "income" ||
      value.kind === "transfer"
    )
      setCategories({
        ids:
          value.payload.userCategoryIds ??
          (value.payload.userCategoryId ? [value.payload.userCategoryId] : []),
        primaryId: value.payload.primaryUserCategoryId ?? null,
      });
  }
  function hydrateFromFacts(facts: LocalEntryFacts) {
    setAmount(facts.amountText);
    setDescription(facts.description);
    setDate(facts.accountingDate);
    setEntryType(facts.entryType);
    setTransferReviewRequired(facts.entryType === "transfer");
    setProfileId(facts.profileId);
    setDestinationId(facts.destinationId);
    setCategories({
      ids: [...facts.categories.ids],
      primaryId: facts.categories.primaryId,
    });
    setSetup(null);
  }
  function assertSameWorkspace(draft: LocalEntryDraft) {
    const workspaceId =
      draft.status === "open"
        ? draft.facts.workspaceId
        : draft.command.payload.workspaceId;
    const currency =
      draft.status === "open"
        ? draft.facts.currency
        : draft.command.payload.amount.currency;
    if (workspaceId !== account.workspaceId || currency !== account.currency)
      throw new Error("Pending entry belongs to another workspace");
  }
  function resume(draft: LocalEntryDraft): "applied" | "blocked-by-pending" {
    if (pending || loading || blocked) return "blocked-by-pending";
    assertSameWorkspace(draft);
    if (draft.status === "posting") {
      hydrateFromCommand(draft.command);
      setPending(draft.command);
    } else hydrateFromFacts(draft.facts);
    setDraftId(draft.id);
    appliedDraft.current = draft.id;
    return "applied";
  }
  function resetComposer() {
    setAmount("-");
    setDescription("");
    setCategories({ ids: [], primaryId: null });
    setDate(defaultAccountingDate(account.timeZone));
    setEntryType("normal");
    setProfileId(account.financialAccountProfileId);
    setDestinationId(null);
    setTransferReviewRequired(false);
    setDraftId(undefined);
    appliedDraft.current = undefined;
    setPosted(null);
    setError("");
  }
  function snapshotConfirmed(binding: IntakeBinding): IntakeSuggestion {
    return {
      direction,
      description: description.trim(),
      amount: {
        currency: binding.suggestion.amount.currency,
        minorUnits: Math.abs(parseMoney(amount, "es-CO", account.currency)),
      },
      accountingDate: date,
      financialAccountProfileId: profileId,
      userCategoryIds: [...categories.ids],
      primaryUserCategoryId: categories.primaryId,
    };
  }
  function snapshotFacts(): LocalEntryFacts {
    return {
      workspaceId: account.workspaceId,
      currency: pendingExpenseSchema.shape.amount.shape.currency.parse(account.currency),
      entryType: entryType === "transfer" ? "transfer" : "normal",
      amountText: amount,
      accountingDate: date,
      description,
      profileId,
      destinationId,
      categories: { ids: [...categories.ids], primaryId: categories.primaryId },
    };
  }
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    transport
      .load(isolate ? undefined : requestedId, isolate ? false : true)
      .then((value) => {
        if (!mounted.active) return;
        if (isolate && (value.kind === "pending" || value.kind === "blocked")) {
          setBlocked(true);
          setLoading(false);
          return;
        }
        if (isolate) {
          setLoading(false);
          return;
        }
        if (value.kind === "blocked") {
          setBlocked(true);
          setLoading(false);
          return;
        }
        if (value.kind === "pending") {
          if (
            value.command.payload.workspaceId !== account.workspaceId ||
            value.command.payload.amount.currency !== account.currency
          )
            throw new Error("Pending entry belongs to another workspace");
          setPending(value.command);
          setDraftId(value.id);
          appliedDraft.current = value.id;
          hydrateFromCommand(value.command);
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
  }, [account.workspaceId, account.currency, transport, isolate]);
  useLayoutEffect(() => {
    if (loading || !requestedId || !drafts || pending || blocked) return;
    if (appliedDraft.current === requestedId) return;
    const mounted = lifetime.current;
    appliedDraft.current = requestedId;
    void drafts
      .read(requestedId)
      .then((draft) => {
        if (!mounted.active) return;
        if (!draft) {
          setError("This draft is no longer on this device.");
          return;
        }
        resume(draft);
      })
      .catch((error: unknown) => {
        if (mounted.active && !transport.reportFailure?.(error))
          setError(
            "Could not restore this draft. Reopen this page to try again.",
          );
      });
  }, [loading, requestedId, drafts, pending, blocked, transport]);
  useLayoutEffect(() => {
    if (loading || !intake || pending || blocked) return;
    const token = `intake:${intake.id}`;
    if (appliedDraft.current === token) return;
    appliedDraft.current = token;
    hydrateFromFacts(intake.facts);
  }, [loading, intake, pending, blocked]);

  let minorUnits: number | null = null;
  try {
    minorUnits = parseMoney(amount, "es-CO", account.currency);
  } catch {
    /* Incomplete edits stay editable. */
  }
  const amountValid =
    minorUnits !== null &&
    (entryType === "initial" ? minorUnits >= 0 : minorUnits !== 0);
  const validTransfer =
    entryType !== "transfer" ||
    (!!destinationId && destinationId !== profileId && !transferReviewRequired);
  const direction: "in" | "out" =
    minorUnits !== null && minorUnits > 0 ? "in" : "out";
  function buildEntry(): PendingPosting {
    if (setup) {
      if (!setup.productKind) throw new Error("Choose Credit card or Loan");
      return {
        kind: "setup",
        ...(setup.target ? { target: setup.target } : {}),
        payload: {
          workspaceId: account.workspaceId,
          name: setup.name.trim(),
          ...(setup.emoji?.trim() ? { emoji: setup.emoji.trim() } : {}),
          productKind: setup.productKind,
          amount: {
            currency: account.currency,
            minorUnits: parseMoney(setup.amount, "es-CO", account.currency),
          },
          accountingDate: setup.date,
          idempotencyKey: transport.newKey(),
        },
      };
    }
    const payload = {
      workspaceId: account.workspaceId,
      amount: {
        currency: account.currency,
        minorUnits: Math.abs(parseMoney(amount, "es-CO", account.currency)),
      },
      accountingDate: date,
      description: description.trim(),
      idempotencyKey: transport.newKey(),
    };
    const categoryAssignments = {
      ...(categories.ids.length
        ? { userCategoryIds: [...categories.ids] }
        : {}),
      ...(categories.primaryId
        ? { primaryUserCategoryId: categories.primaryId }
        : {}),
    };
    if (entryType === "transfer") {
      if (!destinationId) throw new Error("Choose where the money goes");
      return {
        kind: "transfer",
        payload: {
          ...payload,
          ...categoryAssignments,
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
        ...categoryAssignments,
      },
    };
  }
  let setupValid = false;
  try {
    setupValid = !!setup?.name.trim() && setup.productKind !== null && parseMoney(setup.amount, "es-CO", account.currency) >= 0;
  } catch {
    /* Keep incomplete setup editable. */
  }
  const canSubmit =
    !busy &&
    !loading &&
    !keeping &&
    !blocked &&
    (!intake ||
      (!pending &&
        entryType === "normal" &&
        !setup &&
        intake.suggestion.amount.currency === account.currency)) &&
    (!!pending || (setup ? setupValid : amountValid && validTransfer));
  async function keepDraft() {
    const mounted = lifetime.current;
    if (
      !drafts ||
      !editable ||
      setup ||
      entryType === "initial" ||
      opLock.current
    )
      return;
    opLock.current = true;
    setKeeping(true);
    setError("");
    try {
      const id = await drafts.keep({
        draftId,
        facts: snapshotFacts(),
      });
      if (!mounted.active) return;
      setDraftId(id);
      appliedDraft.current = id;
      return id;
    } catch (error) {
      if (transport.reportFailure?.(error) || !mounted.active) return;
      if (error instanceof LocalEntryDraftGoneError) {
        setDraftId(undefined);
        appliedDraft.current = undefined;
        setError(
          "This draft was already posted or removed. Keep again to save it as a new draft.",
        );
        return;
      }
      setError("Could not keep this draft on this device.");
    } finally {
      opLock.current = false;
      if (mounted.active) setKeeping(false);
    }
  }
  async function submit() {
    const mounted = lifetime.current;
    if (!mounted.active || opLock.current || !canSubmit) return;
    opLock.current = true;
    submitting.current = true;
    setBusy(true);
    setError("");
    setPosted(null);
    try {
      if (intake) {
        if (pending) {
          setError("A posting is already in progress. Finish it from Drafts.");
          return;
        }
        const receipt = await intake.confirm({
          workspaceId: account.workspaceId,
          candidateId: intake.id,
          confirmed: snapshotConfirmed(intake),
          suggestion: intake.suggestion,
          parserVersion: intake.parserVersion,
          consentVersion: intake.consentVersion,
        });
        await intake.consume();
        if (!mounted.active) return;
        setAmount("-");
        setDescription("");
        setCategories({ ids: [], primaryId: null });
        setPosted(receipt);
        return;
      }
      const built = pending ?? buildEntry();
      const saved = await transport.save(built, draftId);
      if (mounted.active) {
        setPending(saved.command);
        setDraftId(saved.id);
        appliedDraft.current = saved.id;
      }
      const receipt = await transport.post(saved.command);
      try {
        await transport.clear();
      } catch {
        if (mounted.active)
          setError(
            "Could not clear the saved entry. Retry to check its status.",
          );
        return;
      }
      if (!mounted.active) return;
      setPending(null);
      setDraftId(undefined);
      appliedDraft.current = undefined;
      setSetup(null);
      if (saved.command.kind === "setup" && receipt.financialAccountProfileId) {
        if (saved.command.target?.kind === "destination") {
          setProfileId(saved.command.target.sourceProfileId);
          setDestinationId(receipt.financialAccountProfileId);
          setEntryType("transfer");
          setTransferReviewRequired(true);
        } else setProfileId(receipt.financialAccountProfileId);
        setSetupPosted(receipt);
        return;
      }
      setAmount(entryType === "initial" ? "0" : "-");
      setDescription("");
      setCategories({ ids: [], primaryId: null });
      setPosted(receipt);
    } catch (error) {
      if (transport.reportFailure?.(error)) return;
      if (intake) {
        const message = intakeErrorMessage(
          error,
          "Could not confirm this Candidate.",
        );
        const outcome = intakeConfirmOutcome(error);
        if (outcome === "consume") {
          try {
            await intake.consume();
          } catch {
            /* A replay still belongs on this device until consume writes. */
          }
          if (!mounted.active) return;
          setAmount("-");
          setDescription("");
          setCategories({ ids: [], primaryId: null });
          setPosted({
            description: description.trim() || "Entry",
            amount: {
              currency: pendingExpenseSchema.shape.amount.shape.currency.parse(account.currency),
              minorUnits:
                (direction === "out" ? -1 : 1) * Math.abs(minorUnits ?? 0),
            },
          });
          return;
        }
        if (outcome === "fail") {
          try {
            await intake.fail(message);
          } catch {
            /* The Candidate stays for retry if fail cannot write. */
          }
        }
        if (mounted.active)
          setError(
            outcome === "fail"
              ? message
              : "Could not confirm posting. Retry to safely check the same entry.",
          );
        return;
      }
      if (error instanceof LocalEntryDraftGoneError) {
        if (!mounted.active) return;
        setPending(null);
        setDraftId(undefined);
        appliedDraft.current = undefined;
        setError(
          "This draft was already posted or removed. Nothing was posted again.",
        );
        return;
      }
      const data: unknown = error instanceof ConvexError ? error.data : null;
      if (
        data !== null &&
        typeof data === "object" &&
        "kind" in data &&
        data.kind === "accounting"
      ) {
        // Reopen the facts even if the screen is gone, so the rejected draft can be corrected.
        try {
          await transport.abort();
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
      } else if (mounted.active)
        setError(
          "Could not confirm posting. Retry to safely check the same entry.",
        );
    } finally {
      opLock.current = false;
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
          nextDirection = parseMoney(value, "es-CO", account.currency) > 0 ? "in" : "out";
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
      if (canEdit() && !intake) {
        setEntryType(value);
        setTransferReviewRequired(value === "transfer" && destinationId !== null);
        setCategories({ ids: [], primaryId: null });
        setError("");
      }
    },
    profileId,
    setProfileId: (value: string) => {
      if (canEdit()) {
        if (entryType === "transfer" && value !== profileId) setTransferReviewRequired(true);
        setProfileId(value);
      }
    },
    destinationId,
    setDestinationId: (value: string) => {
      if (canEdit()) {
        if (entryType === "transfer" && value !== destinationId) setTransferReviewRequired(true);
        setDestinationId(value);
      }
    },
    transferReviewRequired,
    swapTransferPlaces: () => {
      if (canEdit() && entryType === "transfer" && !setup && destinationId && destinationId !== profileId) {
        setProfileId(destinationId);
        setDestinationId(profileId);
        setTransferReviewRequired(true);
      }
    },
    confirmTransferReview: () => {
      if (canEdit() && entryType === "transfer" && destinationId && destinationId !== profileId)
        setTransferReviewRequired(false);
    },
    beginTransfer: () => {
      if (!canEdit() || isolate || keeping || opLock.current) return false;
      setCategories({ ids: [], primaryId: null });
      setEntryType("transfer");
      setDestinationId(null);
      setTransferReviewRequired(true);
      setError("");
      return true;
    },
    beginAccountSetup: (request: AccountSetupRequest) => {
      if (!canEdit() || isolate || keeping || opLock.current) return false;
      setCategories({ ids: [], primaryId: null });
      setEntryType("transfer");
      setDestinationId(null);
      setTransferReviewRequired(true);
      setSetupPosted(null);
      setSetup({
        name: request.name,
        emoji: request.style.emoji,
        productKind: request.answer === "payDebt" ? null : "bankAccount",
        amount: "0",
        date: defaultAccountingDate(account.timeZone),
        target: { kind: "destination", sourceProfileId: profileId },
      });
      setError("");
      return true;
    },
    setup,
    setSetup: (value: PlaceDraft | null) => {
      if (canEdit() && !isolate) { setSetupPosted(null); setSetup(value); }
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
    setupPosted,
    posted,
    editable,
    canSubmit,
    canKeepDraft,
    lockEntryType: intake !== null,
    draftId,
    blockedByPendingPostings: blocked,
    keepDraft,
    captureForBatch: () => {
      if (!canEdit() || !canSubmit || setup || intake) return null;
      return { command: buildEntry(), draftId };
    },
    resetComposer: () => {
      if (canEdit() && !setup) resetComposer();
    },
    editBatchDraft: (value: { command: PendingPosting; draftId?: string }) => {
      if (!canEdit() || setup || intake) return false;
      hydrateFromCommand(value.command);
      setDraftId(value.draftId);
      appliedDraft.current = value.draftId;
      setPosted(null);
      setError("");
      return true;
    },
    resume,
    submit,
    dismissPosted: () => setPosted(null),
  };
}
