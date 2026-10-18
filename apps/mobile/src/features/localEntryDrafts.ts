import { z } from "zod";
import * as SecureStore from "expo-secure-store";
import {
  runLocalInputWrite,
  type LocalInputLease,
} from "../local-auth/localInput";
import type { TransactionCategories } from "./categories/transactionSelection";
import { formatMoney } from "./money";
import {
  parsePendingPosting,
  pendingPostingSchema,
  type PendingPosting,
} from "./posting/pendingPostingSchema";
import { LocalEntryDraftGoneError } from "./localEntryDraftErrors";
export { LocalEntryDraftGoneError };

export const LOCAL_ENTRY_DRAFT_TTL_MS = 15 * 24 * 60 * 60 * 1000;
export type LocalEntryDraftId = string;
export type LocalEntryStatus = "open" | "posting";
export type PostableCommand = PendingPosting;
export type LocalEntryFacts = {
  workspaceId: string;
  currency: "COP" | "USD";
  entryType: "normal" | "transfer";
  amountText: string;
  accountingDate: string;
  description: string;
  profileId: string;
  destinationId: string | null;
  categories: TransactionCategories;
};
type DraftMeta = {
  id: LocalEntryDraftId;
  createdAt: number;
  expiresAt: number;
};
export type OpenDraft = DraftMeta & {
  status: "open";
  facts: LocalEntryFacts;
};
export type PostingDraft = DraftMeta & {
  status: "posting";
  command: PostableCommand;
};
export type LocalEntryDraft = OpenDraft | PostingDraft;
export type LocalEntryDocument = {
  v: 1;
  drafts: LocalEntryDraft[];
};
export type DraftListItem = {
  id: LocalEntryDraftId;
  status: LocalEntryStatus;
  kind: PostableCommand["kind"] | "normal";
  description: string;
  expiresAt: number;
  workspaceId: string;
};
export type SessionQuery = {
  workspaceId: string;
  currency: "COP" | "USD";
  draftId?: LocalEntryDraftId;
};
export type RestoredSession =
  | { kind: "blank" }
  | { kind: "blocked" }
  | { kind: "missing"; draftId: LocalEntryDraftId }
  | { kind: "open"; draft: OpenDraft }
  | { kind: "posting"; draft: PostingDraft };
export type ParsedDocument = {
  document: LocalEntryDocument;
  dirty: boolean;
};
export type DraftView = {
  items: DraftListItem[];
  count: number;
  expiredIds: LocalEntryDraftId[];
};
export type LocalEntryDraftsPort = {
  keep(input: {
    draftId?: LocalEntryDraftId;
    facts: LocalEntryFacts;
  }): Promise<LocalEntryDraftId>;
  read(id: LocalEntryDraftId): Promise<LocalEntryDraft | null>;
};

const categoriesSchema = z
  .object({
    ids: z.array(z.string().min(1)).max(3),
    primaryId: z.string().min(1).nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      new Set(value.ids).size !== value.ids.length ||
      (value.primaryId !== null && !value.ids.includes(value.primaryId))
    )
      ctx.addIssue({ code: "custom", message: "Invalid category selection" });
  });
const factsSchema = z.object({
  workspaceId: z.string().min(1),
  currency: z.enum(["COP", "USD"]),
  entryType: z.enum(["normal", "transfer"]),
  amountText: z.string(),
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  profileId: z.string(),
  destinationId: z.string().min(1).nullable(),
  categories: categoriesSchema,
});
const metaSchema = {
  id: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
};
const localEntryDocumentSchema = z.object({
  v: z.literal(1),
  drafts: z.array(
    z.discriminatedUnion("status", [
      z.object({
        ...metaSchema,
        status: z.literal("open"),
        facts: factsSchema,
      }),
      z.object({
        ...metaSchema,
        status: z.literal("posting"),
        command: pendingPostingSchema,
      }),
    ]),
  ),
});

export function storageKey(subject: string) {
  return `u01.expense.${subject}`;
}

export function clearPendingExpense(subject: string) {
  return SecureStore.deleteItemAsync(storageKey(subject));
}

export async function readRaw(subject: string): Promise<unknown> {
  const raw = await SecureStore.getItemAsync(storageKey(subject));
  return raw === null ? null : JSON.parse(raw);
}

export function writeDocument(
  subject: string,
  document: LocalEntryDocument,
) {
  return SecureStore.setItemAsync(
    storageKey(subject),
    JSON.stringify(document),
  );
}

export function parseLocalEntryDocument(
  raw: unknown,
  now: number,
): ParsedDocument {
  if (raw === null || raw === undefined)
    return { document: { v: 1, drafts: [] }, dirty: false };
  if (typeof raw === "object" && raw !== null && "v" in raw) {
    const document = localEntryDocumentSchema.parse(raw);
    const drafts = document.drafts.filter((draft) => draft.expiresAt > now);
    return {
      document: { v: 1, drafts },
      dirty: drafts.length !== document.drafts.length,
    };
  }
  const command = parsePendingPosting(raw);
  return {
    document: {
      v: 1,
      drafts: [
        {
          id: command.payload.idempotencyKey,
          createdAt: now,
          expiresAt: now + LOCAL_ENTRY_DRAFT_TTL_MS,
          status: "posting",
          command,
        },
      ],
    },
    dirty: true,
  };
}

function workspaceOf(draft: LocalEntryDraft) {
  return draft.status === "open"
    ? draft.facts.workspaceId
    : draft.command.payload.workspaceId;
}

function currencyOf(draft: LocalEntryDraft) {
  return draft.status === "open"
    ? draft.facts.currency
    : draft.command.payload.amount.currency;
}

function descriptionOf(draft: LocalEntryDraft) {
  if (draft.status === "open") return draft.facts.description;
  return "description" in draft.command.payload
    ? draft.command.payload.description
    : draft.command.payload.name;
}

function liveDrafts(document: LocalEntryDocument, now: number) {
  return document.drafts.filter((draft) => draft.expiresAt > now);
}

function listKind(draft: LocalEntryDraft): DraftListItem["kind"] {
  if (draft.status === "posting") return draft.command.kind;
  return draft.facts.entryType === "transfer" ? "transfer" : "normal";
}

function isRetryOnlyCommand(command: PostableCommand) {
  return command.kind === "setup" || command.kind === "opening";
}

export function isListedDraft(draft: LocalEntryDraft) {
  if (draft.status === "open") return true;
  return !isRetryOnlyCommand(draft.command);
}

export function accountingDateOf(draft: LocalEntryDraft) {
  if (draft.status === "open") return draft.facts.accountingDate;
  return "accountingDate" in draft.command.payload
    ? draft.command.payload.accountingDate
    : undefined;
}

export function countDraftsInMonth(
  document: LocalEntryDocument,
  workspaceId: string,
  period: { year: number; month: number },
  now: number,
) {
  const prefix = `${String(period.year).padStart(4, "0")}-${String(period.month).padStart(2, "0")}`;
  return liveDrafts(document, now).filter((draft) => {
    if (workspaceOf(draft) !== workspaceId || !isListedDraft(draft))
      return false;
    const date = accountingDateOf(draft);
    return date !== undefined && date.startsWith(`${prefix}-`);
  }).length;
}

export function findLiveDraft(
  document: LocalEntryDocument,
  id: LocalEntryDraftId,
  workspaceId: string,
  now: number,
) {
  const draft = liveDrafts(document, now).find((row) => row.id === id);
  if (!draft) return null;
  return workspaceOf(draft) === workspaceId ? draft : null;
}

export function viewDocument(
  document: LocalEntryDocument,
  workspaceId: string,
  now: number,
): DraftView {
  const expiredIds = document.drafts
    .filter((draft) => draft.expiresAt <= now)
    .map((draft) => draft.id);
  const items = liveDrafts(document, now)
    .filter(
      (draft) =>
        workspaceOf(draft) === workspaceId && isListedDraft(draft),
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .map((draft) => ({
      id: draft.id,
      status: draft.status,
      kind: listKind(draft),
      description: descriptionOf(draft),
      expiresAt: draft.expiresAt,
      workspaceId: workspaceOf(draft),
    }));
  return { items, count: items.length, expiredIds };
}

export function restoreFromDocument(
  document: LocalEntryDocument,
  query: SessionQuery,
  now: number,
): RestoredSession {
  const live = liveDrafts(document, now);
  if (query.draftId) {
    const draft = live.find((row) => row.id === query.draftId);
    if (!draft) return { kind: "missing", draftId: query.draftId };
    if (
      workspaceOf(draft) !== query.workspaceId ||
      currencyOf(draft) !== query.currency
    )
      throw new Error("Pending entry belongs to another workspace");
    return draft.status === "open"
      ? { kind: "open", draft }
      : { kind: "posting", draft };
  }
  const postings = live.filter(
    (draft): draft is PostingDraft =>
      draft.status === "posting" &&
      workspaceOf(draft) === query.workspaceId &&
      currencyOf(draft) === query.currency,
  );
  if (postings.length > 1) return { kind: "blocked" };
  return postings.length === 1
    ? { kind: "posting", draft: postings[0] }
    : { kind: "blank" };
}

export function keepIn(
  document: LocalEntryDocument,
  input: { draftId?: LocalEntryDraftId; facts: LocalEntryFacts },
  now: number,
  newId: () => string,
): { document: LocalEntryDocument; id: LocalEntryDraftId } {
  const drafts = liveDrafts(document, now);
  const existing = drafts.find((draft) => draft.id === input.draftId);
  if (input.draftId && !existing) throw new LocalEntryDraftGoneError(input.draftId);
  if (existing?.status === "posting")
    throw new Error("Cannot edit a posting draft");
  if (existing?.status === "open") {
    const next: OpenDraft = { ...existing, facts: input.facts };
    return {
      id: existing.id,
      document: {
        v: 1,
        drafts: drafts.map((draft) =>
          draft.id === existing.id ? next : draft,
        ),
      },
    };
  }
  const id = newId();
  const next: OpenDraft = {
    id,
    createdAt: now,
    expiresAt: now + LOCAL_ENTRY_DRAFT_TTL_MS,
    status: "open",
    facts: input.facts,
  };
  return { id, document: { v: 1, drafts: [...drafts, next] } };
}

export function beginPostIn(
  document: LocalEntryDocument,
  input: { draftId?: LocalEntryDraftId; command: PostableCommand },
  now: number,
  newId: () => string,
): {
  document: LocalEntryDocument;
  draft: PostingDraft;
  usedStoredCommand: boolean;
} {
  const drafts = liveDrafts(document, now);
  const existing = drafts.find((draft) => draft.id === input.draftId);
  if (input.draftId && !existing) throw new LocalEntryDraftGoneError(input.draftId);
  if (existing?.status === "posting")
    return {
      document: { v: 1, drafts },
      draft: existing,
      usedStoredCommand: true,
    };
  const replaceOpen =
    existing?.status === "open" && !isRetryOnlyCommand(input.command);
  const draft: PostingDraft = {
    id: replaceOpen && existing ? existing.id : newId(),
    createdAt: replaceOpen && existing ? existing.createdAt : now,
    expiresAt:
      replaceOpen && existing
        ? existing.expiresAt
        : now + LOCAL_ENTRY_DRAFT_TTL_MS,
    status: "posting",
    command: input.command,
  };
  return {
    document: {
      v: 1,
      drafts:
        replaceOpen && existing
          ? drafts.map((row) => (row.id === existing.id ? draft : row))
          : [...drafts, draft],
    },
    draft,
    usedStoredCommand: false,
  };
}

export function factsFromCommand(command: PostableCommand): LocalEntryFacts {
  if (isRetryOnlyCommand(command))
    throw new Error("Retry-only commands cannot reopen as drafts");
  if (command.kind === "transfer") {
    const payload = command.payload;
    return {
      workspaceId: payload.workspaceId,
      currency: payload.amount.currency,
      entryType: "transfer",
      amountText: formatMoney(payload.amount).replace(
        `${payload.amount.currency} `,
        "",
      ),
      accountingDate: payload.accountingDate,
      description: payload.description,
      profileId: payload.sourceFinancialAccountProfileId,
      destinationId: payload.destinationFinancialAccountProfileId,
      categories: {
        ids:
          payload.userCategoryIds ??
          (payload.userCategoryId ? [payload.userCategoryId] : []),
        primaryId: payload.primaryUserCategoryId ?? null,
      },
    };
  }
  const payload = command.payload;
  const signed =
    command.kind === "expense"
      ? -payload.amount.minorUnits
      : payload.amount.minorUnits;
  return {
    workspaceId: payload.workspaceId,
    currency: payload.amount.currency,
    entryType: "normal",
    amountText: formatMoney({
      ...payload.amount,
      minorUnits: signed,
    }).replace(`${payload.amount.currency} `, ""),
    accountingDate: payload.accountingDate,
    description: payload.description,
    profileId: payload.financialAccountProfileId,
    destinationId: null,
    categories: {
      ids:
        payload.userCategoryIds ??
        (payload.userCategoryId ? [payload.userCategoryId] : []),
      primaryId: payload.primaryUserCategoryId ?? null,
    },
  };
}

export function rejectPostIn(
  document: LocalEntryDocument,
  id: LocalEntryDraftId,
): LocalEntryDocument {
  const existing = document.drafts.find((draft) => draft.id === id);
  if (!existing || existing.status !== "posting") return document;
  if (isRetryOnlyCommand(existing.command)) return removeIn(document, id);
  const next: OpenDraft = {
    id: existing.id,
    createdAt: existing.createdAt,
    expiresAt: existing.expiresAt,
    status: "open",
    facts: factsFromCommand(existing.command),
  };
  return {
    v: 1,
    drafts: document.drafts.map((draft) =>
      draft.id === id ? next : draft,
    ),
  };
}

export async function mutateLocalEntryDocument<T>(
  lease: LocalInputLease,
  subject: string,
  mutate: (
    document: LocalEntryDocument,
    now: number,
    dirty: boolean,
  ) => { document: LocalEntryDocument; result: T; write: boolean },
): Promise<T> {
  let completed = false;
  let result!: T;
  await runLocalInputWrite(lease, async () => {
    const now = Date.now();
    const parsed = parseLocalEntryDocument(await readRaw(subject), now);
    const next = mutate(parsed.document, now, parsed.dirty);
    if (next.write) await writeDocument(subject, next.document);
    result = next.result;
    completed = true;
  });
  if (!completed) throw new Error("Local entry mutation did not complete");
  return result;
}

export function syncLocalEntryDocument(
  lease: LocalInputLease,
  subject: string,
) {
  return mutateLocalEntryDocument(
    lease,
    subject,
    (document, _now, dirty) => ({
      document,
      result: document,
      write: dirty,
    }),
  );
}

export function removeIn(
  document: LocalEntryDocument,
  id: LocalEntryDraftId,
): LocalEntryDocument {
  return {
    v: 1,
    drafts: document.drafts.filter((draft) => draft.id !== id),
  };
}

export async function loadPendingPosting(subject: string) {
  const parsed = parseLocalEntryDocument(await readRaw(subject), Date.now());
  const postings = parsed.document.drafts.filter(
    (draft) => draft.status === "posting",
  );
  return postings.length === 1 ? postings[0].command : null;
}
