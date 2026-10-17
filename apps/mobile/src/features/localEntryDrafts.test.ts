import { beforeEach, expect, test, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => memory.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    memory.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    memory.delete(key);
  },
}));

import {
  LOCAL_ENTRY_DRAFT_TTL_MS,
  beginPostIn,
  clearPendingExpense,
  keepIn,
  loadPendingPosting,
  parseLocalEntryDocument,
  readRaw,
  removeIn,
  restoreFromDocument,
  storageKey,
  viewDocument,
  writeDocument,
  type LocalEntryDocument,
  type LocalEntryFacts,
  type PostableCommand,
} from "./localEntryDrafts";

const now = 1_700_000_000_000;
const ttl = LOCAL_ENTRY_DRAFT_TTL_MS;
const newId = () => "draft-new";
const facts = {
  workspaceId: "workspace",
  currency: "COP",
  entryType: "normal",
  amountText: "-",
  accountingDate: "2026-10-17",
  description: "",
  profileId: "cash",
  destinationId: null,
  categories: { ids: [], primaryId: null },
} satisfies LocalEntryFacts;
const expense = {
  kind: "expense",
  payload: {
    workspaceId: "workspace",
    financialAccountProfileId: "cash",
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-10-17",
    description: "Food",
    idempotencyKey: "same-expense",
  },
} satisfies PostableCommand;
const empty: LocalEntryDocument = { v: 1, drafts: [] };

beforeEach(() => {
  memory.clear();
});

test("an empty store is an empty collection", () => {
  expect(parseLocalEntryDocument(null, now)).toEqual({
    document: empty,
    dirty: false,
  });
});

test("legacy expense JSON becomes one posting draft on the existing key", () => {
  const parsed = parseLocalEntryDocument(expense.payload, now);
  expect(parsed.dirty).toBe(true);
  expect(parsed.document).toEqual({
    v: 1,
    drafts: [
      {
        id: "same-expense",
        createdAt: now,
        expiresAt: now + ttl,
        status: "posting",
        command: expense,
      },
    ],
  });
});

test("a pending posting command becomes one posting draft", () => {
  const parsed = parseLocalEntryDocument(expense, now);
  expect(parsed.dirty).toBe(true);
  expect(parsed.document.drafts).toEqual([
    {
      id: "same-expense",
      createdAt: now,
      expiresAt: now + ttl,
      status: "posting",
      command: expense,
    },
  ]);
});

test("a v1 collection drops expired drafts and keeps live ones", () => {
  const live = {
    id: "live",
    createdAt: now - 1,
    expiresAt: now + 1,
    status: "open" as const,
    facts,
  };
  const expired = {
    id: "expired",
    createdAt: now - ttl,
    expiresAt: now,
    status: "open" as const,
    facts,
  };
  const parsed = parseLocalEntryDocument(
    { v: 1, drafts: [expired, live] },
    now,
  );
  expect(parsed.dirty).toBe(true);
  expect(parsed.document.drafts).toEqual([live]);
});

test("corrupt JSON is not wiped", () => {
  expect(() => parseLocalEntryDocument({ v: 2, drafts: [] }, now)).toThrow();
  expect(() => parseLocalEntryDocument({ foo: 1 }, now)).toThrow();
});

test("Keep as Draft stores incomplete amount text without posting", () => {
  const kept = keepIn(empty, { facts }, now, newId);
  expect(kept.id).toBe("draft-new");
  expect(kept.document.drafts).toEqual([
    {
      id: "draft-new",
      createdAt: now,
      expiresAt: now + ttl,
      status: "open",
      facts,
    },
  ]);
});

test("a later Keep replaces facts and freezes expiresAt", () => {
  const first = keepIn(empty, { facts }, now, newId);
  const nextFacts = { ...facts, amountText: "1,", description: "Taxi" };
  const second = keepIn(
    first.document,
    { draftId: first.id, facts: nextFacts },
    now + 86_400_000,
    () => "other",
  );
  expect(second.id).toBe(first.id);
  expect(second.document.drafts).toEqual([
    {
      id: first.id,
      createdAt: now,
      expiresAt: now + ttl,
      status: "open",
      facts: nextFacts,
    },
  ]);
});

test("Keep cannot edit a posting draft", () => {
  const posting = beginPostIn(empty, { command: expense }, now, newId);
  expect(() =>
    keepIn(
      posting.document,
      { draftId: posting.draft.id, facts },
      now,
      newId,
    ),
  ).toThrow("Cannot edit a posting draft");
});

test("beginPost converts an open draft to the stored command and ignores a later rebuild", () => {
  const kept = keepIn(empty, { facts }, now, () => "open-1");
  const first = beginPostIn(
    kept.document,
    { draftId: "open-1", command: expense },
    now,
    () => "unused",
  );
  expect(first.usedStoredCommand).toBe(false);
  expect(first.draft).toEqual({
    id: "open-1",
    createdAt: now,
    expiresAt: now + ttl,
    status: "posting",
    command: expense,
  });
  const rebuilt = {
    ...expense,
    payload: { ...expense.payload, idempotencyKey: "other-key", description: "Changed" },
  };
  const retry = beginPostIn(
    first.document,
    { draftId: "open-1", command: rebuilt },
    now + 1,
    newId,
  );
  expect(retry.usedStoredCommand).toBe(true);
  expect(retry.draft.command).toEqual(expense);
});

test("removeIn deletes one draft and leaves siblings", () => {
  const first = keepIn(empty, { facts }, now, () => "a");
  const second = keepIn(
    first.document,
    { facts: { ...facts, description: "B" } },
    now,
    () => "b",
  );
  const posting = beginPostIn(
    second.document,
    { draftId: "a", command: expense },
    now,
    newId,
  );
  const removed = removeIn(posting.document, "a");
  expect(removed.drafts.map((draft) => draft.id)).toEqual(["b"]);
  expect(removeIn(removed, "missing")).toEqual(removed);
});

test("the Home view counts live open and posting drafts including zero", () => {
  expect(viewDocument(empty, "workspace", now)).toEqual({
    items: [],
    count: 0,
    expiredIds: [],
  });
  const kept = keepIn(empty, { facts }, now, () => "open-1");
  const posted = beginPostIn(
    kept.document,
    { command: expense },
    now + 1,
    () => "post-1",
  );
  const other = keepIn(
    posted.document,
    { facts: { ...facts, workspaceId: "other" } },
    now,
    () => "other",
  );
  const view = viewDocument(other.document, "workspace", now);
  expect(view.count).toBe(2);
  expect(view.items.map((item) => item.id)).toEqual(["post-1", "open-1"]);
});

test("restore without draftId binds the unique live posting and never an open draft", () => {
  const kept = keepIn(empty, { facts }, now, () => "open-1");
  expect(
    restoreFromDocument(
      kept.document,
      { workspaceId: "workspace", currency: "COP" },
      now,
    ),
  ).toEqual({ kind: "blank" });
  const posted = beginPostIn(
    kept.document,
    { command: expense },
    now,
    () => "post-1",
  );
  expect(
    restoreFromDocument(
      posted.document,
      { workspaceId: "workspace", currency: "COP" },
      now,
    ),
  ).toEqual({ kind: "posting", draft: posted.draft });
  const second = beginPostIn(
    posted.document,
    {
      command: {
        ...expense,
        payload: { ...expense.payload, idempotencyKey: "other-expense" },
      },
    },
    now,
    () => "post-2",
  );
  expect(
    restoreFromDocument(
      second.document,
      { workspaceId: "workspace", currency: "COP" },
      now,
    ),
  ).toEqual({ kind: "blank" });
});

test("restore with draftId hydrates an open draft and reports missing or foreign rows", () => {
  const kept = keepIn(empty, { facts }, now, () => "open-1");
  expect(
    restoreFromDocument(
      kept.document,
      { workspaceId: "workspace", currency: "COP", draftId: "open-1" },
      now,
    ),
  ).toEqual({ kind: "open", draft: kept.document.drafts[0] });
  expect(
    restoreFromDocument(
      kept.document,
      { workspaceId: "workspace", currency: "COP", draftId: "gone" },
      now,
    ),
  ).toEqual({ kind: "missing", draftId: "gone" });
  expect(() =>
    restoreFromDocument(
      kept.document,
      { workspaceId: "other", currency: "COP", draftId: "open-1" },
      now,
    ),
  ).toThrow("Pending entry belongs to another workspace");
});

test("wipe deletes u01.expense.${subject} after a collection write", async () => {
  const createdAt = Date.now();
  const kept = keepIn(empty, { facts }, createdAt, () => "open-1");
  const posted = beginPostIn(
    kept.document,
    { command: expense },
    createdAt,
    () => "post-1",
  );
  await writeDocument("owner", posted.document);
  expect(memory.get(storageKey("owner"))).toEqual(JSON.stringify(posted.document));
  expect(await loadPendingPosting("owner")).toEqual(expense);
  await clearPendingExpense("owner");
  expect(memory.has("u01.expense.owner")).toBe(false);
  expect(await readRaw("owner")).toBeNull();
  expect(await loadPendingPosting("owner")).toBeNull();
});
