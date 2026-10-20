import { beforeEach, expect, test, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, string>());
const events = vi.hoisted(() => [] as string[]);
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => {
    events.push("read");
    return memory.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    memory.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    memory.delete(key);
  },
}));

import {
  LocalInputLease,
  runLocalInputWrite,
} from "../local-auth/localInput";
import { LocalEntryDraftGoneError } from "./localEntryDraftErrors";
import {
  LOCAL_ENTRY_DRAFT_TTL_MS,
  beginPostIn,
  clearPendingExpense,
  keepIn,
  loadPendingPosting,
  parseLocalEntryDocument,
  readRaw,
  rejectPostIn,
  removeIn,
  restoreFromDocument,
  storageKey,
  syncLocalEntryDocument,
  viewDocument,
  writeDocument,
  countDraftsInMonth,
  factsFromCommand,
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

const opening = {
  kind: "opening",
  payload: {
    workspaceId: "workspace",
    financialAccountProfileId: "cash",
    amount: { currency: "COP", minorUnits: 0 },
    accountingDate: "2026-10-17",
    description: "",
    idempotencyKey: "opening-key",
  },
} satisfies PostableCommand;
const transfer = {
  kind: "transfer",
  payload: {
    workspaceId: "workspace",
    sourceFinancialAccountProfileId: "cash",
    destinationFinancialAccountProfileId: "savings",
    amount: { currency: "COP", minorUnits: 50000 },
    accountingDate: "2026-10-17",
    description: "Move",
    idempotencyKey: "transfer-key",
    userCategoryIds: ["food"],
    primaryUserCategoryId: "food",
  },
} satisfies PostableCommand;
const setup = {
  kind: "setup",
  payload: {
    workspaceId: "workspace",
    amount: { currency: "COP", minorUnits: 0 },
    accountingDate: "2026-10-17",
    idempotencyKey: "setup-key",
    name: "Card",
    productKind: "creditCard",
  },
} satisfies PostableCommand;

beforeEach(() => {
  memory.clear();
  events.length = 0;
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
  ).toEqual({ kind: "blocked" });
});

test("Month Close counts only live listed drafts dated in that workspace month", () => {
  const october = keepIn(empty, { facts }, now, () => "oct-open");
  const september = keepIn(
    october.document,
    { facts: { ...facts, accountingDate: "2026-09-30" } },
    now,
    () => "sept-open",
  );
  const posting = beginPostIn(
    september.document,
    {
      command: {
        ...expense,
        payload: { ...expense.payload, accountingDate: "2026-10-02" },
      },
    },
    now,
    () => "oct-post",
  );
  const setupRow = beginPostIn(
    posting.document,
    { command: setup },
    now,
    () => "setup-1",
  );
  const foreign = keepIn(
    setupRow.document,
    { facts: { ...facts, workspaceId: "other" } },
    now,
    () => "other-oct",
  );
  expect(
    countDraftsInMonth(foreign.document, "workspace", { year: 2026, month: 10 }, now),
  ).toBe(2);
  expect(
    countDraftsInMonth(foreign.document, "workspace", { year: 2026, month: 9 }, now),
  ).toBe(1);
  expect(
    countDraftsInMonth(
      {
        v: 1,
        drafts: [
          {
            id: "expired",
            createdAt: now - ttl,
            expiresAt: now,
            status: "open",
            facts,
          },
        ],
      },
      "workspace",
      { year: 2026, month: 10 },
      now,
    ),
  ).toBe(0);
});

test("the Home view omits setup and opening retry rows from the draft count", () => {
  const kept = keepIn(empty, { facts }, now, () => "open-1");
  const opened = beginPostIn(
    kept.document,
    { command: opening },
    now + 1,
    () => "opening-1",
  );
  const viewed = viewDocument(opened.document, "workspace", now);
  expect(viewed.count).toBe(1);
  expect(viewed.items.map((item) => item.id)).toEqual(["open-1"]);
});

test("setup and opening posts append their own rows instead of replacing an expense draft", () => {
  const kept = keepIn(
    empty,
    { facts: { ...facts, description: "Groceries" } },
    now,
    () => "groceries",
  );
  const posted = beginPostIn(
    kept.document,
    { draftId: "groceries", command: setup },
    now,
    () => "setup-1",
  );
  expect(posted.draft.id).toBe("setup-1");
  expect(
    posted.document.drafts.find((draft) => draft.id === "groceries"),
  ).toMatchObject({ status: "open", facts: { description: "Groceries" } });
  expect(
    posted.document.drafts.find((draft) => draft.id === "setup-1"),
  ).toMatchObject({ status: "posting", command: setup });
});

test("factsFromCommand keeps transfer categories for a rejected retry", () => {
  expect(factsFromCommand(transfer).categories).toEqual({
    ids: ["food"],
    primaryId: "food",
  });
});

test("an accounting rejection reopens a money draft with its facts", () => {
  const posted = beginPostIn(empty, { command: expense }, now, () => "food");
  const reopened = rejectPostIn(posted.document, "food");
  expect(reopened.drafts).toEqual([
    {
      id: "food",
      createdAt: now,
      expiresAt: now + ttl,
      status: "open",
      facts: {
        workspaceId: "workspace",
        currency: "COP",
        entryType: "normal",
        amountText: "−1.500,00",
        accountingDate: "2026-10-17",
        description: "Food",
        profileId: "cash",
        destinationId: null,
        categories: { ids: [], primaryId: null },
      },
    },
  ]);
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

test("Home expiry purge does not read the store until it holds the local-input lease", async () => {
  const createdAt = Date.now();
  const expired = {
    id: "expired",
    createdAt: createdAt - ttl,
    expiresAt: createdAt - 1,
    status: "open" as const,
    facts,
  };
  const live = {
    id: "live",
    createdAt,
    expiresAt: createdAt + ttl,
    status: "posting" as const,
    command: expense,
  };
  await writeDocument("owner", { v: 1, drafts: [expired, live] });
  events.length = 0;
  const lease = new LocalInputLease("owner", "session");
  let release!: () => void;
  const hold = runLocalInputWrite(
    lease,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const sync = syncLocalEntryDocument(lease, "owner");
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(events).toEqual([]);
  release();
  await hold;
  await sync;
  expect(events).toContain("read");
});

test("Home expiry purge does not restore a draft that posted while it waited", async () => {
  const createdAt = Date.now();
  const expired = {
    id: "expired",
    createdAt: createdAt - ttl,
    expiresAt: createdAt - 1,
    status: "open" as const,
    facts,
  };
  const live = {
    id: "live",
    createdAt,
    expiresAt: createdAt + ttl,
    status: "posting" as const,
    command: expense,
  };
  await writeDocument("owner", { v: 1, drafts: [expired, live] });
  const lease = new LocalInputLease("owner", "session");
  let release!: () => void;
  const hold = runLocalInputWrite(
    lease,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const posted = runLocalInputWrite(lease, async () => {
    const parsed = parseLocalEntryDocument(await readRaw("owner"), Date.now());
    await writeDocument("owner", removeIn(parsed.document, "live"));
  });
  const sync = syncLocalEntryDocument(lease, "owner");
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  release();
  await Promise.all([hold, posted, sync]);
  const after = parseLocalEntryDocument(await readRaw("owner"), Date.now());
  expect(after.document.drafts.map((draft) => draft.id)).not.toContain("live");
});

test("a draft posted or removed by another editor is gone, never recreated under a new key", () => {
  // Editor A posted and cleared row "posted-elsewhere"; editor B still holds that id.
  const other = keepIn(empty, { facts }, now, () => "still-open").document;
  for (const act of [
    () => keepIn(other, { draftId: "posted-elsewhere", facts }, now, newId),
    () => beginPostIn(other, { draftId: "posted-elsewhere", command: expense }, now, newId),
  ]) {
    expect(act).toThrow(LocalEntryDraftGoneError);
  }
  expect(other.drafts.map((draft) => draft.id)).toEqual(["still-open"]);
});

test("batch-owned posting drafts stay out of the one-entry session and survive other draft operations", () => {
  const queued = { id: "batch-row", command: expense };
  const batch = { queue: [queued], receipts: { count: 0, net: 0 } };
  const document: LocalEntryDocument = { v: 1, drafts: [], postingBatches: { workspace: batch } };
  const begun = beginPostIn(document, { command: expense }, now, newId);
  // The queue's idempotency key owns the saved draft even before its draftId is persisted.
  expect(restoreFromDocument(begun.document, { workspaceId: "workspace", currency: "COP" }, now)).toEqual({ kind: "blank" });
  expect(viewDocument(begun.document, "workspace", now).items).toEqual([]);
  expect(countDraftsInMonth(begun.document, "workspace", { year: 2026, month: 10 }, now)).toBe(0);
  const restored = parseLocalEntryDocument(JSON.parse(JSON.stringify(begun.document)), now).document;
  expect(restored.postingBatches).toEqual({ workspace: batch });
  const rejected = rejectPostIn(restored, begun.draft.id);
  const kept = keepIn(rejected, { facts }, now, () => "another-draft");
  expect(removeIn(kept.document, begun.draft.id).postingBatches).toEqual({ workspace: batch });
});

test("a EUR local draft survives storage and restores only in the matching currency", () => {
  const kept = keepIn(empty, { facts: { ...facts, currency: "EUR" } }, now, newId);
  const parsed = parseLocalEntryDocument(JSON.parse(JSON.stringify(kept.document)), now);
  expect(restoreFromDocument(parsed.document, { workspaceId: "workspace", currency: "EUR", draftId: kept.id }, now))
    .toMatchObject({ kind: "open", draft: { facts: { currency: "EUR" } } });
  expect(() => restoreFromDocument(parsed.document, { workspaceId: "workspace", currency: "COP", draftId: kept.id }, now))
    .toThrow("Pending entry belongs to another workspace");
});
