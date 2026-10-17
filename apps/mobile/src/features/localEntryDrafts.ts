import { z } from "zod";
import * as SecureStore from "expo-secure-store";
import type { TransactionCategories } from "./categories/transactionSelection";
import {
  parsePendingPosting,
  pendingPostingSchema,
  type PendingPosting,
} from "./posting/pendingPostingSchema";

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
    .filter((draft) => workspaceOf(draft) === workspaceId)
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
  if (existing?.status === "posting")
    return {
      document: { v: 1, drafts },
      draft: existing,
      usedStoredCommand: true,
    };
  const draft: PostingDraft = {
    id: existing?.id ?? input.draftId ?? newId(),
    createdAt: existing?.createdAt ?? now,
    expiresAt: existing?.expiresAt ?? now + LOCAL_ENTRY_DRAFT_TTL_MS,
    status: "posting",
    command: input.command,
  };
  return {
    document: {
      v: 1,
      drafts: existing
        ? drafts.map((row) => (row.id === existing.id ? draft : row))
        : [...drafts, draft],
    },
    draft,
    usedStoredCommand: false,
  };
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
