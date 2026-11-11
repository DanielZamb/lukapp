import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
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
import type { AmountNotice, StoredAmountText } from "../amount/storedText";
import {
  amountOfMinorUnits,
  amountSendable,
  amountSign,
  displayedMinorUnits,
  openAmount,
  openSavedAmount,
  sendableMinorUnits,
  storedAmountOf,
  withAmountSign,
  type AmountAtPress,
  type AmountReview,
  type AmountSession,
} from "../amount/session";
import { useFormState, withFields, type ReadAtPress } from "../amount/useAmountState";
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
  amount: AmountSession;
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
    facts.amountReenter === true, facts.amountReview ?? null, facts.accountingDate, facts.description, facts.profileId, facts.destinationId,
    facts.categories.ids, facts.categories.primaryId]);
}

function factsAmount(facts: LocalEntryFacts): StoredAmountText {
  return { text: facts.amountText, format: facts.amountFormat, ...(facts.amountReenter ? { reenter: true } : {}),
    ...(facts.amountReview ? { review: facts.amountReview } : {}) };
}

function amountFacts(stored: StoredAmountText): Pick<LocalEntryFacts, "amountText" | "amountFormat" | "amountReenter" | "amountReview"> {
  return { amountText: stored.text, amountFormat: stored.format, ...(stored.reenter ? { amountReenter: true } : {}),
    ...(stored.review ? { amountReview: stored.review } : {}) };
}

function categoryAmount(value: AmountSession, nature: CategoryNature) {
  return withAmountSign(value, nature === "Income" ? "+" : "-");
}

/**
 * The saved amount the editor opened, kept while nothing has changed the amount since. Saving it again keeps the
 * saved text and its format, so an unreadable or rewritten amount reopens exactly as before. Any change to the
 * amount, even one that ends with the same characters, drops it: the amount is then saved as the session holds it.
 */
type OpenedAmount = { stored: StoredAmountText; notice: AmountNotice | null; text: string; review: AmountReview | null };

/** The text to save for `amount`: the opened saved text while the amount is still the one opened, else the session's. */
function savedAmountText(amount: AmountSession, opened: OpenedAmount | null): StoredAmountText {
  return opened && opened.text === amount.editor.text && opened.review === amount.review ? opened.stored : storedAmountOf(amount);
}

/** The amount of a complete session in `currency`. Submission paths call it after checking validity, and it refuses again. */
function requiredMinorUnits(amount: AmountAtPress, currency: string): number {
  const minorUnits = sendableMinorUnits(amount, currency);
  if (minorUnits === null) throw new Error("Amount is not complete");
  return minorUnits;
}

/** A place's starting balance left blank is zero, as first-run setup reads it; any other text must be a sendable amount. */
function balanceMinorUnits(amount: AmountAtPress, currency: string): number | null {
  if (amount.currency !== currency) return null;
  return amount.editor.text.trim() ? sendableMinorUnits(amount, currency) : 0;
}

/** Whether a place's starting balance may be sent, as `balanceMinorUnits` would read it. */
function balanceSendable(amount: AmountSession): boolean {
  if (!amount.editor.text.trim()) return true;
  const shown = displayedMinorUnits(amount);
  return amountSendable(amount) && shown !== null && shown >= 0;
}

/** Money in for a positive amount, money out otherwise. */
function directionOf(amount: AmountSession): "in" | "out" {
  const shown = displayedMinorUnits(amount);
  return shown !== null && shown > 0 ? "in" : "out";
}

type Classification = { value: TransactionCategories; nature: CategoryNature | null };
const unclassified: Classification = { value: { ids: [], primaryId: null }, nature: null };
function classify(value: TransactionCategories, nature: CategoryNature | null = null): Classification {
  return { value, nature: value.ids.length ? nature : null };
}

/** The From and To a person confirmed for a transfer. Any other pair on the form is unconfirmed. */
export type TransferPair = { from: string; to: string };

/**
 * Everything the person sets on an entry, with the editor state that decides whether a press may send it. A press
 * reads it once and builds, validates and sends from that one snapshot.
 */
type Editor = {
  amount: AmountSession;
  openedAmount: OpenedAmount | null;
  description: string;
  classification: Classification;
  date: string;
  entryType: EntryType;
  profileId: string;
  destinationId: string | null;
  confirmedPair: TransferPair | null;
  setup: PlaceDraft | null;
  /** The entry sent and kept on the phone whose outcome is not yet known; a press resends it exactly. */
  pending: PendingPosting | null;
  draftId: LocalEntryDraftId | undefined;
  loading: boolean;
  busy: boolean;
  keeping: boolean;
  blocked: boolean;
};
/** The editor as rendered or as read at a press; only the press reading can send its amounts. */
type EditorView = Editor | ReadAtPress<Editor>;

function composerFields(account: Account, date: string) {
  return {
    amount: openAmount(account.currency, "-"), openedAmount: null, description: "", classification: unclassified, date,
    entryType: "normal", profileId: account.financialAccountProfileId, destinationId: null, confirmedPair: null,
  } satisfies Partial<Editor>;
}

/** The form showing an entry already built, as it was sent. */
function commandFields(value: PendingPosting): Partial<Editor> {
  const payload = value.payload;
  return {
    openedAmount: null,
    date: payload.accountingDate,
    amount: amountOfMinorUnits(payload.amount.currency, value.kind === "expense" ? -payload.amount.minorUnits : payload.amount.minorUnits),
    description: "description" in payload ? payload.description : "",
    entryType: value.kind === "transfer" ? "transfer" : value.kind === "opening" ? "initial" : "normal",
    ...(value.kind === "setup" ? {
      setup: {
        name: value.payload.name,
        ...(value.payload.emoji ? { emoji: value.payload.emoji } : {}),
        productKind: value.payload.productKind,
        amount: amountOfMinorUnits(value.payload.amount.currency, value.payload.amount.minorUnits),
        date: payload.accountingDate,
        target: value.target,
      },
    } : value.kind === "transfer" ? {
      profileId: value.payload.sourceFinancialAccountProfileId,
      destinationId: value.payload.destinationFinancialAccountProfileId,
    } : { profileId: value.payload.financialAccountProfileId }),
    ...(value.kind === "expense" || value.kind === "income" || value.kind === "transfer" ? {
      classification: classify({
        ids: value.payload.userCategoryIds ?? (value.payload.userCategoryId ? [value.payload.userCategoryId] : []),
        primaryId: value.payload.primaryUserCategoryId ?? null,
      }, value.kind === "income" ? "Income" : value.kind === "expense" ? "Expense" : null),
    } : {}),
  };
}

/** The form showing kept facts. A kept transfer is confirmed again before it posts. */
function factsFields(facts: LocalEntryFacts): Partial<Editor> {
  const stored = factsAmount(facts);
  const opened = openSavedAmount(facts.currency, stored);
  return {
    amount: opened.session,
    openedAmount: { stored, notice: opened.notice, text: opened.session.editor.text, review: opened.session.review },
    description: facts.description,
    date: facts.accountingDate,
    entryType: facts.entryType,
    confirmedPair: null,
    profileId: facts.profileId,
    destinationId: facts.destinationId,
    classification: classify({ ids: [...facts.categories.ids], primaryId: facts.categories.primaryId },
      facts.entryType === "normal" ? (amountSign(opened.session) === "-" ? "Expense" : "Income") : null),
    setup: null,
  };
}

/** The held entry as it was sent; a press reads it through a read-only view of the same plain data. */
function heldEntry(now: EditorView): PendingPosting | null {
  return now.pending as PendingPosting | null;
}

function pairConfirmed(now: EditorView) {
  return !!now.destinationId && now.confirmedPair?.from === now.profileId && now.confirmedPair.to === now.destinationId;
}

function validTransfer(now: EditorView) {
  return now.entryType !== "transfer" || (!!now.destinationId && now.destinationId !== now.profileId && pairConfirmed(now));
}

function isEditable(now: EditorView, intake: IntakeBinding | null) {
  return !now.busy && !now.pending && !now.loading && !now.blocked && !intake?.frozen;
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
  const [form, setForm, readForm] = useFormState<Editor>(() => ({
    ...composerFields(account, defaultAccountingDate(account.timeZone)),
    setup: null, pending: null, draftId: undefined, loading: true, busy: false, keeping: false, blocked: false,
  }));
  const change = (patch: Partial<Editor>) => setForm((now) => withFields(now, patch));
  const [boundCurrency, setBoundCurrency] = useState(account.currency);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<PostingReceipt | null>(null);
  const [setupPosted, setSetupPosted] = useState<PostingReceipt | null>(null);
  const [savedFacts, setSavedFacts] = useState(() => factsKey(blankFacts(readForm().date)));
  const opLock = useRef(false);
  const submitting = useRef(false);
  const appliedDraft = useRef<LocalEntryDraftId | undefined>(undefined);
  const lifetime = useRef({ active: false });
  const editable = isEditable(form, intake);
  const canKeepDraft =
    drafts !== null &&
    intake === null &&
    editable &&
    !form.keeping &&
    !form.setup &&
    form.entryType !== "initial";
  const canEdit = () => {
    const now = readForm();
    return lifetime.current.active && !submitting.current && !now.pending && !now.loading && !now.blocked && !intake?.frozen;
  };
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
    change({ ...commandFields(command), pending: command, draftId: id });
    appliedDraft.current = id;
  }
  function resume(draft: LocalEntryDraft): "applied" | "blocked-by-pending" {
    const now = readForm();
    if (now.pending || now.loading || now.blocked) return "blocked-by-pending";
    assertSameWorkspace(draft);
    if (draft.status === "posting") showSent(draft.id, draft.command);
    else {
      change({ ...factsFields(draft.facts), draftId: draft.id });
      setSavedFacts(factsKey(draft.facts));
      appliedDraft.current = draft.id;
    }
    return "applied";
  }
  function resetComposer() {
    const today = defaultAccountingDate(account.timeZone);
    change({ ...composerFields(account, today), draftId: undefined });
    setSavedFacts(factsKey(blankFacts(today)));
    appliedDraft.current = undefined;
    setPosted(null);
    setError("");
  }
  function snapshotConfirmed(binding: IntakeBinding, now: ReadAtPress<Editor>): IntakeSuggestion {
    const currency = binding.facts.currency;
    if (currency !== "COP" && currency !== "USD") throw new Error("Unsupported Candidate currency");
    return {
      direction: directionOf(now.amount),
      description: now.description.trim(),
      amount: {
        currency,
        minorUnits: Math.abs(requiredMinorUnits(now.amount, currency)),
      },
      accountingDate: now.date,
      financialAccountProfileId: now.profileId,
      userCategoryIds: [...now.classification.value.ids],
      primaryUserCategoryId: now.classification.value.primaryId,
    };
  }
  function blankFacts(accountingDate: string): LocalEntryFacts {
    return {
      workspaceId: account.workspaceId,
      currency: account.currency,
      entryType: "normal",
      ...amountFacts(storedAmountOf(openAmount(account.currency, "-"))),
      accountingDate,
      description: "",
      profileId: account.financialAccountProfileId,
      destinationId: null,
      categories: { ids: [], primaryId: null },
    };
  }
  function snapshotFacts(now: EditorView): LocalEntryFacts {
    return {
      workspaceId: account.workspaceId,
      currency: pendingExpenseSchema.shape.amount.shape.currency.parse(account.currency),
      entryType: now.entryType === "transfer" ? "transfer" : "normal",
      ...amountFacts(savedAmountText(now.amount, now.openedAmount)),
      accountingDate: now.date,
      description: now.description,
      profileId: now.profileId,
      destinationId: now.destinationId,
      categories: { ids: [...now.classification.value.ids], primaryId: now.classification.value.primaryId },
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
          change({ blocked: true, loading: false });
          return;
        }
        if (isolate) {
          change({ loading: false });
          return;
        }
        if (value.kind === "blocked") {
          change({ blocked: true, loading: false });
          return;
        }
        if (value.kind === "pending") {
          if (
            value.command.payload.workspaceId !== account.workspaceId ||
            value.command.payload.amount.currency !== account.currency
          )
            throw new Error("Pending entry belongs to another workspace");
          appliedDraft.current = value.id;
          change({ ...commandFields(value.command), pending: value.command, draftId: value.id });
        }
        change({ loading: false });
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
    if (form.loading || !requestedId || !drafts || form.pending || form.blocked) return;
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
  }, [form.loading, requestedId, drafts, form.pending, form.blocked, transport]);
  useLayoutEffect(() => {
    if (form.loading || !intake || form.pending || form.blocked) return;
    const token = `intake:${intake.id}`;
    if (appliedDraft.current === token) return;
    appliedDraft.current = token;
    change(factsFields(intake.facts));
  }, [form.loading, intake, form.pending, form.blocked]);

  if (boundCurrency !== account.currency) {
    setBoundCurrency(account.currency);
    setForm((now) => ({
      ...now, amount: openAmount(account.currency, "-"), openedAmount: null,
      setup: now.setup && { ...now.setup, amount: openAmount(account.currency, "0") },
    }));
  }
  /**
   * Changes the amount, with `patch` in the same update so that both are refused together when the amount belongs to
   * one the form replaced. A change to its text or its confirmation means it is no longer the saved amount.
   */
  function changeAmount(next: AmountSession, patch: Partial<Editor> = {}) {
    setForm((now) => ({
      ...now, ...patch, amount: next,
      openedAmount: next.editor.text !== now.amount.editor.text || next.review !== now.amount.review ? null : now.openedAmount,
    }));
  }
  function buildEntry(now: ReadAtPress<Editor>): PendingPosting {
    const setupNow = now.setup;
    if (setupNow) {
      if (!setupNow.productKind) throw new Error("Choose Credit card or Loan");
      return {
        kind: "setup",
        ...(setupNow.target ? { target: setupNow.target } : {}),
        payload: {
          workspaceId: account.workspaceId,
          name: setupNow.name.trim(),
          ...(setupNow.emoji?.trim() ? { emoji: setupNow.emoji.trim() } : {}),
          productKind: setupNow.productKind,
          amount: {
            currency: account.currency,
            minorUnits: balanceMinorUnits(setupNow.amount, account.currency) ?? requiredMinorUnits(setupNow.amount, account.currency),
          },
          accountingDate: setupNow.date,
          idempotencyKey: transport.newKey(),
        },
      };
    }
    const signed = requiredMinorUnits(now.amount, account.currency);
    const categories = now.classification.value;
    const payload = {
      workspaceId: account.workspaceId,
      amount: {
        currency: account.currency,
        minorUnits: Math.abs(signed),
      },
      accountingDate: now.date,
      description: now.description.trim(),
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
    if (now.entryType === "transfer") {
      if (!now.destinationId) throw new Error("Choose where the money goes");
      return {
        kind: "transfer",
        payload: {
          ...payload,
          ...categoryAssignments,
          sourceFinancialAccountProfileId: now.profileId,
          destinationFinancialAccountProfileId: now.destinationId,
        },
      };
    }
    if (now.entryType === "initial")
      return {
        kind: "opening",
        payload: { ...payload, financialAccountProfileId: now.profileId },
      };
    return {
      kind: signed > 0 ? "income" : "expense",
      payload: {
        ...payload,
        financialAccountProfileId: now.profileId,
        ...categoryAssignments,
      },
    };
  }
  /** Whether a post may be sent; rendering asks with the form, a press with what it reads. */
  function canSubmitWith(now: EditorView) {
    const shown = displayedMinorUnits(now.amount);
    const amountValid = amountSendable(now.amount) && shown !== null && (now.entryType === "initial" ? shown >= 0 : shown !== 0);
    const setupNow = now.setup;
    const setupValid = !!setupNow?.name.trim() && setupNow.productKind !== null && setupNow.amount.currency === account.currency
      && balanceSendable(setupNow.amount);
    return !now.busy &&
      !now.loading &&
      !now.keeping &&
      !now.blocked &&
      (!intake ||
        (!now.pending &&
          now.entryType === "normal" &&
          !setupNow &&
          intake.facts.currency === account.currency)) &&
      (!!now.pending || (setupNow ? setupValid : amountValid && validTransfer(now)));
  }
  /** The entry as a screen reads it: as rendered, or with `read()` at the moment of a press. */
  function view<V extends EditorView>(now: V) {
    return {
      description: now.description,
      date: now.date,
      entryType: now.entryType,
      profileId: now.profileId,
      destinationId: now.destinationId,
      categories: now.classification.value as V["classification"]["value"],
      direction: directionOf(now.amount),
      setup: now.setup,
      pending: !!now.pending || intake?.frozen === true,
      loading: now.loading,
      canSubmit: canSubmitWith(now),
      transferReviewRequired: !pairConfirmed(now),
    };
  }
  async function keepDraft() {
    const mounted = lifetime.current;
    const now = readForm();
    if (
      !drafts ||
      !isEditable(now, intake) ||
      now.setup ||
      now.entryType === "initial" ||
      opLock.current
    )
      return;
    opLock.current = true;
    change({ keeping: true });
    setError("");
    try {
      const facts = snapshotFacts(now);
      const id = await drafts.keep({ draftId: now.draftId, facts });
      if (!mounted.active) return;
      change({ draftId: id });
      appliedDraft.current = id;
      setSavedFacts(factsKey(facts));
      return id;
    } catch (error) {
      if (transport.reportFailure?.(error) || !mounted.active) return;
      if (error instanceof LocalEntryDraftGoneError) {
        change({ draftId: undefined });
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
      if (mounted.active) change({ keeping: false });
    }
  }
  async function discardDraft() {
    const draftId = readForm().draftId;
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
  const reviewFacts = intake && !form.loading && appliedDraft.current === `intake:${intake.id}` ? snapshotFacts(form) : null;
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
  async function saveCandidateReview(facts: LocalEntryFacts | null = latestReview.current) {
    try {
      await reviewWrites.current.catch(() => {});
      if (intake && !intake.frozen && facts) await intake.persistReview(facts);
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
    const now = readForm();
    if (!mounted.active || opLock.current || !canSubmitWith(now)) return;
    opLock.current = true;
    submitting.current = true;
    change({ busy: true });
    setError("");
    setPosted(null);
    try {
      if (intake) {
        if (now.pending) {
          setError(t("posting.alreadyPosting"));
          return;
        }
        await saveCandidateReview(latestReview.current && snapshotFacts(now));
        const receipt = await intake.confirm(snapshotConfirmed(intake, now));
        if (!mounted.active) return;
        change({ amount: openAmount(account.currency, "-"), openedAmount: null, description: "", classification: unclassified });
        setPosted(receipt);
        return;
      }
      const built = heldEntry(now) ?? buildEntry(now);
      const saved = await transport.save(built, now.draftId);
      if (saved.command.payload.idempotencyKey !== built.payload.idempotencyKey) {
        if (mounted.active) {
          showSent(saved.id, saved.command);
          setError(t("posting.alreadySent"));
        }
        return;
      }
      if (mounted.active) {
        change({ pending: saved.command, draftId: saved.id });
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
      change({ pending: null, draftId: undefined, setup: null });
      appliedDraft.current = undefined;
      if (saved.command.kind === "setup" && receipt.financialAccountProfileId) {
        if (saved.command.target?.kind === "destination")
          change({ profileId: saved.command.target.sourceProfileId, destinationId: receipt.financialAccountProfileId,
            entryType: "transfer", confirmedPair: null });
        else change({ profileId: receipt.financialAccountProfileId });
        setSetupPosted(receipt);
        return;
      }
      change({ amount: openAmount(account.currency, now.entryType === "initial" ? "0" : "-"), description: "",
        classification: unclassified, openedAmount: null });
      setSavedFacts(factsKey({ ...snapshotFacts(now), amountReenter: undefined, ...amountFacts(storedAmountOf(openAmount(account.currency, "-"))),
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
        change({ pending: null, draftId: undefined });
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
          change({ pending: null });
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
      if (mounted.active) change({ busy: false });
    }
  }
  const unsaved =
    drafts !== null &&
    intake === null &&
    editable &&
    !form.setup &&
    form.entryType !== "initial" &&
    posted === null &&
    factsKey(snapshotFacts(form)) !== savedFacts;
  return {
    ...view(form),
    amount: form.amount,
    amountNotice: form.openedAmount?.notice?.kind === "reenter" ? form.openedAmount.notice : null,
    signLocked: form.entryType === "normal" && form.classification.nature !== null,
    setAmount: (value: AmountSession) => {
      const now = readForm();
      if (canEdit() && value.currency === now.amount.currency) {
        const nature = now.classification.nature;
        if (now.entryType === "normal" && nature) {
          changeAmount(categoryAmount(value, nature));
          return;
        }
        changeAmount(value, displayedMinorUnits(value) !== null && directionOf(value) !== directionOf(now.amount)
          ? { classification: unclassified } : {});
      }
    },
    /** The amount as of the latest change, for a check a press makes before it sends. */
    readAmount: () => readForm().amount,
    /** The entry as of the latest change, for a check a press makes before it sends. */
    read: () => view(readForm()),
    setDescription: (value: string) => {
      if (canEdit()) change({ description: value });
    },
    setDate: (value: string) => {
      if (canEdit()) change({ date: value });
    },
    setEntryType: (value: EntryType) => {
      if (canEdit() && !intake) {
        change({ entryType: value, confirmedPair: null, classification: unclassified });
        setError("");
      }
    },
    setProfileId: (value: string) => {
      if (canEdit()) change({ profileId: value });
    },
    setDestinationId: (value: string) => {
      if (canEdit()) change({ destinationId: value });
    },
    swapTransferPlaces: () => {
      const now = readForm();
      if (canEdit() && now.entryType === "transfer" && !now.setup && now.destinationId && now.destinationId !== now.profileId)
        change({ profileId: now.destinationId, destinationId: now.profileId });
    },
    /**
     * Confirms the pair now on the form, or only `shown`, the pair the person was looking at, when it still is: a
     * confirmation never applies to a pair that changed after it was shown.
     */
    confirmTransferReview: (shown?: TransferPair) => {
      const now = readForm();
      if (!canEdit() || now.entryType !== "transfer" || !now.destinationId || now.destinationId === now.profileId) return;
      if (shown && (shown.from !== now.profileId || shown.to !== now.destinationId)) return;
      change({ confirmedPair: { from: now.profileId, to: now.destinationId } });
    },
    beginTransfer: () => {
      if (!canEdit() || isolate || readForm().keeping || opLock.current) return false;
      change({ classification: unclassified, entryType: "transfer", destinationId: null, confirmedPair: null });
      setError("");
      return true;
    },
    beginAccountSetup: (request: AccountSetupRequest) => {
      const now = readForm();
      if (!canEdit() || isolate || now.keeping || opLock.current) return false;
      setSetupPosted(null);
      change({
        classification: unclassified, entryType: "transfer", destinationId: null, confirmedPair: null,
        setup: {
          name: request.name,
          emoji: request.style.emoji,
          productKind: request.answer === "payDebt" ? null : "bankAccount",
          amount: openAmount(account.currency, "0"),
          date: defaultAccountingDate(account.timeZone),
          target: { kind: "destination", sourceProfileId: now.profileId },
        },
      });
      setError("");
      return true;
    },
    setSetup: (value: PlaceDraft | null) => {
      if (canEdit() && !isolate) { setSetupPosted(null); change({ setup: value }); }
    },
    /** Applies the fields that changed to the latest draft, never to a render's copy, which may hold an older amount. */
    changeSetup: (patch: Partial<PlaceDraft>) => {
      if (canEdit() && !isolate) { setSetupPosted(null); setForm((now) => ({ ...now, setup: now.setup && { ...now.setup, ...patch } })); }
    },
    setCategories: (value: TransactionCategories, nature: CategoryNature | null = null) => {
      if (
        canEdit() &&
        value.ids.length <= 3 &&
        new Set(value.ids).size === value.ids.length &&
        value.ids.every(Boolean) &&
        (!value.primaryId || value.ids.includes(value.primaryId))
      ) {
        const now = readForm();
        change({ classification: classify({ ids: [...value.ids], primaryId: value.primaryId }, nature) });
        if (now.entryType === "normal" && value.ids.length && nature)
          changeAmount(categoryAmount(now.amount, nature));
      }
    },
    busy: form.busy,
    error,
    setupPosted,
    posted,
    editable,
    canKeepDraft,
    lockEntryType: intake !== null,
    draftId: form.draftId,
    blockedByPendingPostings: form.blocked,
    keepDraft,
    unsaved,
    discardDraft,
    discardCandidate,
    captureForBatch: () => {
      const now = readForm();
      if (!canEdit() || !canSubmitWith(now) || now.setup || intake) return null;
      return { command: buildEntry(now), draftId: now.draftId };
    },
    resetComposer: () => {
      if (canEdit() && !readForm().setup) resetComposer();
    },
    editBatchDraft: (value: { command: PendingPosting; draftId?: string }) => {
      if (!canEdit() || readForm().setup || intake) return false;
      change({ ...commandFields(value.command), draftId: value.draftId });
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
