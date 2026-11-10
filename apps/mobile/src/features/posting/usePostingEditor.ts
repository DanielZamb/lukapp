import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { formatMoney, parseMoney } from "../money";
import { defaultAccountingDate } from "../timeZones";
import type { AccountSetupRequest, CategoryNature } from "../categories/model";
import type { TransactionCategories } from "../categories/transactionSelection";
import type { PendingPosting, PlaceKind } from "./pendingPostingSchema";
import type {
  LocalEntryDraft,
  LocalEntryDraftId,
  LocalEntryDraftsPort,
  LocalEntryFacts,
} from "../localEntryDrafts";
import { pendingExpenseSchema } from "../pendingExpenseSchema";
import {
  LocalEntryDraftFrozenError,
  LocalEntryDraftGoneError,
} from "../localEntryDraftErrors";
import type { DiscardOutcome } from "../discardOutcome";
import type { EntryType } from "./PostingForm";
import type {
  IntakeSuggestion, IntakeEvidence,
} from "../../../../../src/notificationIntake/types";
import { intakeConfirmOutcome } from "../../../../../src/notificationIntake/outcome";
import { useT } from "../../i18n";
import { rejectionMessage } from "./rejection";
import { legacyAmountConvention, currencyMinorUnitDigits } from "../../../../../src/accounting/currencies";
import { openStoredAmountText, type StoredAmountText } from "../amount/storedText";
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
  reviewNote?: string;
  /** The kept notification text, shown beside the form. Never submitted. */
  notification?: { text: string; packageName: string; at: number } | null;
  originalSuggestion: IntakeEvidence;
  readonly frozen: boolean;
  persistReview(facts: LocalEntryFacts): Promise<void>;
  confirm(confirmed: IntakeSuggestion): Promise<PostingReceipt>;
  /** Discards the Candidate at the last revision this form saw or saved. */
  discard(): Promise<DiscardOutcome>;
};
export type PostingDraftsSession = {
  drafts?: LocalEntryDraftsPort | null;
  draftId?: LocalEntryDraftId;
  intake?: IntakeBinding | null;
  intakeRoute?: boolean;
};

/** Equal keys mean the person has nothing new to keep. */
function factsKey(facts: LocalEntryFacts) {
  return JSON.stringify([facts.workspaceId, facts.currency, facts.entryType, facts.amountText, facts.amountFormat,
    facts.amountReenter === true, facts.accountingDate, facts.description, facts.profileId, facts.destinationId,
    facts.categories.ids, facts.categories.primaryId]);
}

function storedAmountOf(facts: LocalEntryFacts): StoredAmountText {
  return { text: facts.amountText, format: facts.amountFormat, ...(facts.amountReenter ? { reenter: true } : {}) };
}

function editorText(stored: StoredAmountText, currency: string) {
  if (stored.format === "pre-currency" && !stored.reenter) return stored.text;
  return openStoredAmountText(stored, currency, {
    convention: legacyAmountConvention, precision: currencyMinorUnitDigits(currency),
  }).text;
}

function categoryAmount(value: string, nature: CategoryNature) {
  return `${nature === "Income" ? "+" : "-"}${value.replace(/^[+\-−]/, "")}`;
}

export function usePostingEditor(
  account: Account,
  transport: PostingTransport,
  session: PostingDraftsSession = {},
) {
  const { t } = useT();
  const drafts = session.drafts ?? null;
  const requestedId = session.draftId;
  const intake = session.intake ?? null;
  const isolate = session.intakeRoute === true || intake !== null;
  const [amount, setAmount] = useState("-");
  const [openedAmount, setOpenedAmount] = useState<{ text: string; stored: StoredAmountText } | null>(null);
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<{
    value: TransactionCategories;
    nature: CategoryNature | null;
  }>({
    value: { ids: [], primaryId: null },
    nature: null,
  });
  const categories = classification.value;
  function setCategories(value: TransactionCategories, nature: CategoryNature | null = null) {
    setClassification({ value, nature: value.ids.length ? nature : null });
  }
  const [startDate] = useState(() => defaultAccountingDate(account.timeZone));
  const [date, setDate] = useState(startDate);
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
  const [savedFacts, setSavedFacts] = useState(() => factsKey(blankFacts(startDate)));
  const opLock = useRef(false);
  const submitting = useRef(false);
  const appliedDraft = useRef<LocalEntryDraftId | undefined>(undefined);
  const lifetime = useRef({ active: false });
  const editable = !busy && !pending && !loading && !blocked && !intake?.frozen;
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
    !blocked &&
    !intake?.frozen;
  function hydrateFromCommand(value: PendingPosting) {
    const payload = value.payload;
    setOpenedAmount(null);
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
      }, value.kind === "income" ? "Income" : value.kind === "expense" ? "Expense" : null);
  }
  function hydrateFromFacts(facts: LocalEntryFacts) {
    const stored = storedAmountOf(facts);
    const text = editorText(stored, facts.currency);
    setAmount(text);
    setOpenedAmount({ text, stored });
    setDescription(facts.description);
    setDate(facts.accountingDate);
    setEntryType(facts.entryType);
    setTransferReviewRequired(facts.entryType === "transfer");
    setProfileId(facts.profileId);
    setDestinationId(facts.destinationId);
    setCategories({
      ids: [...facts.categories.ids],
      primaryId: facts.categories.primaryId,
    }, facts.entryType === "normal" ? (/^[\-−]/.test(text.trim()) ? "Expense" : "Income") : null);
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
  function showSent(id: LocalEntryDraftId, command: PendingPosting) {
    hydrateFromCommand(command);
    setPending(command);
    setDraftId(id);
    appliedDraft.current = id;
  }
  function resume(draft: LocalEntryDraft): "applied" | "blocked-by-pending" {
    if (pending || loading || blocked) return "blocked-by-pending";
    assertSameWorkspace(draft);
    if (draft.status === "posting") showSent(draft.id, draft.command);
    else {
      hydrateFromFacts(draft.facts);
      setSavedFacts(factsKey(draft.facts));
      setDraftId(draft.id);
      appliedDraft.current = draft.id;
    }
    return "applied";
  }
  function resetComposer() {
    const today = defaultAccountingDate(account.timeZone);
    setAmount("-");
    setOpenedAmount(null);
    setDescription("");
    setCategories({ ids: [], primaryId: null });
    setDate(today);
    setSavedFacts(factsKey(blankFacts(today)));
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
    const currency = binding.facts.currency;
    if (currency !== "COP" && currency !== "USD") throw new Error("Unsupported Candidate currency");
    return {
      direction,
      description: description.trim(),
      amount: {
        currency,
        minorUnits: Math.abs(parseMoney(amount, "es-CO", account.currency)),
      },
      accountingDate: date,
      financialAccountProfileId: profileId,
      userCategoryIds: [...categories.ids],
      primaryUserCategoryId: categories.primaryId,
    };
  }
  function blankFacts(accountingDate: string): LocalEntryFacts {
    return {
      workspaceId: account.workspaceId,
      currency: account.currency,
      entryType: "normal",
      amountText: "-",
      amountFormat: "pre-currency",
      accountingDate,
      description: "",
      profileId: account.financialAccountProfileId,
      destinationId: null,
      categories: { ids: [], primaryId: null },
    };
  }
  function snapshotFacts(): LocalEntryFacts {
    const kept = openedAmount?.text === amount ? openedAmount.stored : null;
    return {
      workspaceId: account.workspaceId,
      currency: pendingExpenseSchema.shape.amount.shape.currency.parse(account.currency),
      entryType: entryType === "transfer" ? "transfer" : "normal",
      amountText: kept ? kept.text : amount,
      amountFormat: kept ? kept.format : "pre-currency",
      ...(kept?.reenter ? { amountReenter: true } : {}),
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
          setError(t("posting.restoreFailed"));
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
          setError(t("posting.draftMissing"));
          return;
        }
        resume(draft);
      })
      .catch((error: unknown) => {
        if (mounted.active && !transport.reportFailure?.(error))
          setError(t("posting.draftRestoreFailed"));
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
        intake.facts.currency === account.currency)) &&
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
      const facts = snapshotFacts();
      const id = await drafts.keep({ draftId, facts });
      if (!mounted.active) return;
      setDraftId(id);
      appliedDraft.current = id;
      setSavedFacts(factsKey(facts));
      return id;
    } catch (error) {
      if (transport.reportFailure?.(error) || !mounted.active) return;
      if (error instanceof LocalEntryDraftGoneError) {
        setDraftId(undefined);
        appliedDraft.current = undefined;
        setError(t("posting.draftGoneKeep"));
        return;
      }
      if (error instanceof LocalEntryDraftFrozenError) {
        const stored = await drafts.read(error.draftId).catch(() => null);
        if (!mounted.active) return;
        if (stored?.status === "posting") {
          showSent(stored.id, stored.command);
          setError(t("posting.alreadySent"));
          return;
        }
      }
      setError(t("posting.keepFailed"));
    } finally {
      opLock.current = false;
      if (mounted.active) setKeeping(false);
    }
  }
  async function discardDraft() {
    if (!drafts || !draftId || intake || opLock.current) return undefined;
    opLock.current = true;
    try {
      return await drafts.discard(draftId);
    } catch (error) {
      if (transport.reportFailure?.(error)) return undefined;
      throw error;
    } finally {
      opLock.current = false;
    }
  }
  const reviewWrites = useRef<Promise<void>>(Promise.resolve());
  const latestReview = useRef<LocalEntryFacts | null>(null);
  const persistedReview = useRef<string | null>(null);
  const reviewFacts = intake && !loading && appliedDraft.current === `intake:${intake.id}` ? snapshotFacts() : null;
  latestReview.current = reviewFacts;
  const reviewValue = reviewFacts ? JSON.stringify(reviewFacts) : null;
  useLayoutEffect(() => {
    if (!intake || intake.frozen || reviewValue === null || !reviewFacts) return;
    if (persistedReview.current === null) { persistedReview.current = reviewValue; return; }
    if (persistedReview.current === reviewValue) return;
    persistedReview.current = reviewValue;
    const facts = reviewFacts;
    const write = reviewWrites.current.catch(() => {}).then(() => intake.persistReview(facts));
    reviewWrites.current = write;
    void write.catch((error: unknown) => {
      if (transport.reportFailure?.(error)) return;
      if (lifetime.current.active) setError(t("posting.reviewSaveFailed"));
    });
  }, [intake, reviewValue, transport]);
  async function saveCandidateReview() {
    try {
      await reviewWrites.current.catch(() => {});
      if (intake && !intake.frozen && latestReview.current) await intake.persistReview(latestReview.current);
    } catch (error) {
      if (!transport.reportFailure?.(error) && lifetime.current.active) setError(t("posting.reviewSaveFailed"));
      throw error;
    }
  }
  async function discardCandidate() {
    if (!intake) return undefined;
    await reviewWrites.current.catch(() => {});
    return intake.discard();
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
          setError(t("posting.alreadyPosting"));
          return;
        }
        await saveCandidateReview();
        const receipt = await intake.confirm(snapshotConfirmed(intake));
        if (!mounted.active) return;
        setAmount("-");
        setDescription("");
        setCategories({ ids: [], primaryId: null });
        setPosted(receipt);
        return;
      }
      const built = pending ?? buildEntry();
      const saved = await transport.save(built, draftId);
      if (saved.command.payload.idempotencyKey !== built.payload.idempotencyKey) {
        if (mounted.active) {
          showSent(saved.id, saved.command);
          setError(t("posting.alreadySent"));
        }
        return;
      }
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
          setError(t("posting.clearFailed"));
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
      setOpenedAmount(null);
      setSavedFacts(factsKey({ ...snapshotFacts(), amountText: "-", amountFormat: "pre-currency", amountReenter: undefined,
        description: "", categories: { ids: [], primaryId: null } }));
      setPosted(receipt);
    } catch (error) {
      if (transport.reportFailure?.(error)) return;
      if (intake) {
        if (mounted.active)
          setError(
            intakeConfirmOutcome(error) === "fail"
              ? rejectionMessage(t, error, "posting.candidateConfirmFailed")
              : t("posting.confirmUncertain"),
          );
        return;
      }
      if (error instanceof LocalEntryDraftGoneError) {
        if (!mounted.active) return;
        setPending(null);
        setDraftId(undefined);
        appliedDraft.current = undefined;
        setError(t("posting.draftGonePosted"));
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
            setError(t("posting.clearFailed"));
          return;
        }
        setError(rejectionMessage(t, error, "posting.rejected"));
      } else if (mounted.active) setError(t("posting.confirmUncertain"));
    } finally {
      opLock.current = false;
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  const unsaved =
    drafts !== null &&
    intake === null &&
    editable &&
    !setup &&
    entryType !== "initial" &&
    posted === null &&
    factsKey(snapshotFacts()) !== savedFacts;
  return {
    amount,
    setAmount: (value: string) => {
      if (canEdit()) {
        if (entryType === "normal" && classification.nature) {
          setAmount(categoryAmount(value, classification.nature));
          return;
        }
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
    setCategories: (value: TransactionCategories, nature: CategoryNature | null = null) => {
      if (
        canEdit() &&
        value.ids.length <= 3 &&
        new Set(value.ids).size === value.ids.length &&
        value.ids.every(Boolean) &&
        (!value.primaryId || value.ids.includes(value.primaryId))
      ) {
        setCategories({ ids: [...value.ids], primaryId: value.primaryId }, nature);
        if (entryType === "normal" && value.ids.length && nature)
          setAmount(categoryAmount(amount, nature));
      }
    },
    pending: !!pending || intake?.frozen === true,
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
    unsaved,
    discardDraft,
    discardCandidate,
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
    saveCandidateReview,
    submit,
    dismissPosted: () => setPosted(null),
  };
}
