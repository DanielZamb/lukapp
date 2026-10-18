import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { usePostingBatch, type BatchDraft } from "./usePostingBatch";
import { usePostingEditor, type PostingTransport } from "./usePostingEditor";

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
import { LocalInputLease } from "../../local-auth/localInput";
import {
  beginPostIn,
  mutateLocalEntryDocument,
  rejectPostIn,
  removeIn,
} from "../localEntryDrafts";
import { createPostingBatchStorage } from "./postingBatchStorage";

beforeEach(() => memory.clear());
const lease = new LocalInputLease("owner", "session");
const storage = () => createPostingBatchStorage(lease, "owner", "workspace");
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});
const account = {
  workspaceId: "workspace",
  financialAccountProfileId: "bank",
  currency: "COP",
  timeZone: "America/Bogota",
} as const;
function transport() {
  let key = 0;
  let postingId: string | undefined;
  return {
    load: vi.fn(async () => ({ kind: "none" as const })),
    save: vi.fn<PostingTransport["save"]>(async (command, draftId) =>
      mutateLocalEntryDocument(lease, "owner", (document, now) => {
        const begun = beginPostIn(
          document,
          { command, draftId },
          now,
          () => command.payload.idempotencyKey,
        );
        postingId = begun.draft.id;
        return {
          document: begun.document,
          write: true,
          result: { id: begun.draft.id, command: begun.draft.command },
        };
      }),
    ),
    post: vi.fn(async (command) => ({
      description:
        "description" in command.payload ? command.payload.description : "",
      amount: {
        ...command.payload.amount,
        minorUnits:
          (command.kind === "expense" ? -1 : 1) *
          command.payload.amount.minorUnits,
      },
    })),
    clear: vi.fn(async () =>
      mutateLocalEntryDocument(lease, "owner", (document) => ({
        document: postingId ? removeIn(document, postingId) : document,
        write: true,
        result: undefined,
      })),
    ),
    abort: vi.fn(async () =>
      mutateLocalEntryDocument(lease, "owner", (document) => ({
        document: postingId ? rejectPostIn(document, postingId) : document,
        write: true,
        result: undefined,
      })),
    ),
    newKey: () => `key-${++key}`,
  } satisfies PostingTransport;
}
async function open(
  api = transport(),
  beforePost?: (queue: BatchDraft[]) => Promise<boolean>,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let current:
    | {
        editor: ReturnType<typeof usePostingEditor>;
        batch: ReturnType<typeof usePostingBatch>;
      }
    | undefined;
  const batchStorage = storage();
  function Harness({ activeApi = api }: { activeApi?: PostingTransport }) {
    current = {
      editor: usePostingEditor(account, activeApi),
      batch: usePostingBatch(activeApi, batchStorage, beforePost),
    };
    return null;
  }
  await act(async () => {
    root = create(createElement(Harness));
  });
  return {
    api,
    replaceTransport: async (activeApi: PostingTransport) => {
      await act(async () => root?.update(createElement(Harness, { activeApi })));
    },
    get: () => {
      if (!current) throw new Error("Not mounted");
      return current;
    },
  };
}
async function queueEntry(
  session: Awaited<ReturnType<typeof open>>,
  amount: string,
  description: string,
) {
  await act(async () => {
    session.get().editor.setAmount(amount);
    session.get().editor.setDescription(description);
  });
  let captured: BatchDraft | null = null;
  await act(async () => {
    captured = session.get().editor.captureForBatch();
    if (!captured) throw new Error("Draft is not postable");
    await session.get().batch.keep(captured);
    session.get().editor.resetComposer();
  });
  return captured;
}

test("One to Batch captures a postable draft, resets One, and sends nothing until Post all", async () => {
  const session = await open();
  expect(session.get().editor.captureForBatch()).toBeNull();
  await queueEntry(session, "-12.500", "Taxi");
  expect(session.get().editor.amount).toBe("-");
  expect(session.get().editor.description).toBe("");
  expect(session.get().batch.queue[0].command).toMatchObject({
    kind: "expense",
    payload: { description: "Taxi", amount: { minorUnits: 1250000 } },
  });
  expect(session.api.save).not.toHaveBeenCalled();
  expect(session.api.post).not.toHaveBeenCalled();
});

test("cancelling edits leaves the queue untouched; saving replaces the selected row", async () => {
  const session = await open();
  await queueEntry(session, "-10", "Before");
  const item = session.get().batch.queue[0];
  await act(async () => {
    session.get().editor.editBatchDraft(item);
  });
  await act(async () => {
    session.get().editor.setDescription("Cancelled");
    session.get().editor.setAmount("+20");
  });
  expect(session.get().batch.queue).toEqual([item]);
  await act(async () => {
    session.get().editor.resetComposer();
  });
  expect(session.get().batch.queue).toEqual([item]);
  await act(async () => {
    session.get().editor.editBatchDraft(item);
  });
  await act(async () => {
    session.get().editor.setDescription("After");
  });
  await act(async () => {
    const draft = session.get().editor.captureForBatch();
    if (!draft) throw new Error("Expected postable edit");
    await session.get().batch.keep(draft, item.id);
  });
  expect(session.get().batch.queue).toHaveLength(1);
  expect(session.get().batch.queue[0]).toMatchObject({
    id: item.id,
    command: { payload: { description: "After" } },
  });
});

test("Post all commits every queued command and reports the signed net after acknowledgements", async () => {
  const session = await open();
  await queueEntry(session, "-10", "Taxi");
  await queueEntry(session, "+30", "Refund");
  await act(async () => {
    await session.get().batch.postAll();
  });
  expect(session.api.post.mock.calls.map(([entry]) => entry.kind)).toEqual([
    "expense",
    "income",
  ]);
  expect(session.api.clear).toHaveBeenCalledTimes(2);
  expect(session.get().batch.queue).toEqual([]);
  expect(session.get().batch.posted).toEqual({ count: 2, net: 2000 });
});

test("an uncertain partial batch locks edits and retries only the unconfirmed exact command", async () => {
  const api = transport();
  const realPost = api.post.getMockImplementation()!;
  api.post
    .mockImplementationOnce(realPost)
    .mockRejectedValueOnce(new Error("Response lost"));
  const session = await open(api);
  await queueEntry(session, "-10", "Taxi");
  await queueEntry(session, "+30", "Refund");
  await act(async () => {
    await session.get().batch.postAll();
  });
  expect(session.get().batch.queue).toHaveLength(1);
  expect(session.get().batch.posted).toBeNull();
  expect(session.get().batch.editable).toBe(false);
  const unconfirmed = api.post.mock.calls[1][0];
  await act(async () => {
    session.get().batch.remove(session.get().batch.queue[0].id);
  });
  expect(session.get().batch.queue).toHaveLength(1);
  await act(async () => {
    await session.get().batch.postAll();
  });
  expect(api.post.mock.calls[2][0]).toEqual(unconfirmed);
  expect(
    api.post.mock.calls.map(([entry]) => entry.payload.description),
  ).toEqual(["Taxi", "Refund", "Refund"]);
  expect(session.get().batch.posted).toEqual({ count: 2, net: 2000 });
});

test("a definitive rejection reopens the saved draft for correction", async () => {
  const api = transport();
  api.post.mockRejectedValueOnce(
    new ConvexError({ kind: "accounting", message: "Period is locked" }),
  );
  const session = await open(api);
  await queueEntry(session, "-10", "Taxi");
  await act(async () => {
    await session.get().batch.postAll();
  });
  expect(api.abort).toHaveBeenCalledOnce();
  expect(session.get().batch.editable).toBe(true);
  expect(session.get().batch.error).toBe("Period is locked");
  expect(session.get().batch.queue[0].draftId).toBe("key-1");
  expect(session.get().batch.posted).toBeNull();
});

test("device storage restores adds, edits and removals with the exact idempotency keys", async () => {
  let session = await open();
  await queueEntry(session, "-10", "Before");
  await queueEntry(session, "+20", "Remove");
  const first = session.get().batch.queue[0];
  await act(async () => {
    session.get().editor.editBatchDraft(first);
  });
  await act(async () => {
    session.get().editor.setDescription("After");
  });
  await act(async () => {
    const draft = session.get().editor.captureForBatch();
    if (!draft) throw new Error("Expected edit");
    await session.get().batch.keep(draft, first.id);
    await session.get().batch.remove(session.get().batch.queue[1].id);
  });
  const expected = session.get().batch.queue;
  await act(async () => root?.unmount());
  session = await open();
  expect(session.get().batch.queue).toEqual(expected);
  expect(session.get().batch.queue).toHaveLength(1);
  expect(session.get().batch.queue[0].command).toMatchObject({
    payload: { description: "After" },
  });
  expect(session.api.post).not.toHaveBeenCalled();
});

test("a restarted partial batch keeps only unconfirmed rows and retries the same saved command", async () => {
  const api = transport();
  const realPost = api.post.getMockImplementation()!;
  api.post
    .mockImplementationOnce(realPost)
    .mockRejectedValueOnce(new Error("Response lost"));
  let session = await open(api);
  await queueEntry(session, "-10", "Taxi");
  await queueEntry(session, "+20", "Refund");
  await act(async () => {
    await session.get().batch.postAll();
  });
  const expected = session.get().batch.queue;
  expect(expected).toHaveLength(1);
  await act(async () => root?.unmount());
  const restarted = transport();
  session = await open(restarted);
  expect(session.get().batch.queue).toEqual(expected);
  expect(session.get().batch.editable).toBe(false);
  await act(async () => {
    await session.get().batch.postAll();
  });
  expect(restarted.post.mock.calls[0][0]).toEqual(api.post.mock.calls[1][0]);
  expect(session.get().batch.posted).toEqual({ count: 2, net: 1000 });
  expect(
    [...api.post.mock.calls, ...restarted.post.mock.calls].map(
      ([command]) => command.payload.description,
    ),
  ).toEqual(["Taxi", "Refund", "Refund"]);
  await act(async () => root?.unmount());
  session = await open();
  expect(session.get().batch.queue).toEqual([]);
});

test("a late Post all response cannot erase drafts added after reopening and retrying", async () => {
  const api = transport();
  const realPost = api.post.getMockImplementation()!;
  let respond: (() => void) | undefined;
  api.post.mockImplementationOnce(async (command) => {
    await new Promise<void>((resolve) => { respond = resolve; });
    return realPost(command);
  });
  let session = await open(api);
  await queueEntry(session, "-10", "Taxi");
  await queueEntry(session, "+20", "Refund");
  let original: Promise<void> | undefined;
  await act(async () => { original = session.get().batch.postAll(); });
  expect(api.post).toHaveBeenCalledTimes(1);
  await act(async () => root?.unmount());
  const retry = transport();
  retry.newKey = () => "new-draft";
  session = await open(retry);
  await act(async () => { await session.get().batch.postAll(); });
  expect(retry.post.mock.calls[0][0]).toEqual(api.post.mock.calls[0][0]);
  await queueEntry(session, "+30", "new-draft");
  const expected = session.get().batch.queue;
  expect(expected).toHaveLength(1);
  await act(async () => { respond?.(); await original; });
  expect((await storage().load()).queue).toEqual(expected);
  expect(session.get().batch.queue).toEqual(expected);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.clear).not.toHaveBeenCalled();
  await act(async () => root?.unmount());
  session = await open();
  expect(session.get().batch.queue).toEqual(expected);
});

test("posting completion removes only confirmed rows from the latest stored batch", async () => {
  const api = transport();
  const realPost = api.post.getMockImplementation()!;
  let respond: (() => void) | undefined;
  api.post.mockImplementationOnce(async (command) => {
    await new Promise<void>((resolve) => { respond = resolve; });
    return realPost(command);
  });
  const session = await open(api);
  await queueEntry(session, "-10", "Taxi");
  const originalRow = session.get().batch.queue[0];
  if (originalRow.command.kind !== "expense") throw new Error("Expected expense");
  const newerRow = {
    id: "new-draft",
    command: {
      ...originalRow.command,
      payload: { ...originalRow.command.payload, idempotencyKey: "new-draft" },
    },
  };
  let posting: Promise<void> | undefined;
  await act(async () => { posting = session.get().batch.postAll(); });
  await storage().update((batch) => ({
    ...batch,
    queue: [...batch.queue, newerRow],
  }));
  await act(async () => { respond?.(); await posting; });
  expect((await storage().load()).queue).toEqual([newerRow]);
  expect(session.get().batch.queue).toEqual([newerRow]);
  expect(session.get().batch.posted).toEqual({ count: 1, net: -1000 });
  expect(api.post).toHaveBeenCalledTimes(1);
});

test.each(["confirmed", "rejected"])(
  "a superseded transport ignores its late %s response",
  async (outcome) => {
    const api = transport();
    const realPost = api.post.getMockImplementation()!;
    let respond: (() => void) | undefined;
    api.post.mockImplementationOnce(async (command) => {
      await new Promise<void>((resolve) => { respond = resolve; });
      if (outcome === "rejected") {
        throw new ConvexError({ kind: "accounting", message: "Period is locked" });
      }
      return realPost(command);
    });
    const session = await open(api);
    await queueEntry(session, "-10", "Taxi");
    await queueEntry(session, "+20", "Refund");
    let original: Promise<void> | undefined;
    await act(async () => { original = session.get().batch.postAll(); });
    const retry = transport();
    retry.newKey = () => "new-draft";
    await session.replaceTransport(retry);
    await act(async () => { await session.get().batch.postAll(); });
    expect(retry.post.mock.calls[0][0]).toEqual(api.post.mock.calls[0][0]);
    await queueEntry(session, "+30", "new-draft");
    const expected = await storage().load();
    await act(async () => { respond?.(); await original; });
    expect(await storage().load()).toEqual(expected);
    expect(session.get().batch.queue).toEqual(expected.queue);
    expect(session.get().batch.error).toBe("");
    expect(api.clear).not.toHaveBeenCalled();
    expect(api.abort).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
  },
);

test("an Initial balance rejected by accounting can be edited and posted through the real draft lifecycle", async () => {
  const api = transport();
  api.post.mockRejectedValueOnce(
    new ConvexError({ kind: "accounting", message: "Period is locked" }),
  );
  const session = await open(api);
  await act(async () => {
    session.get().editor.setEntryType("initial");
    session.get().editor.setAmount("10");
  });
  await act(async () => {
    const draft = session.get().editor.captureForBatch();
    if (!draft) throw new Error("Expected Initial balance");
    await session.get().batch.keep(draft);
  });
  await act(async () => {
    await session.get().batch.postAll();
  });
  const rejected = session.get().batch.queue[0];
  expect(rejected.draftId).toBeUndefined();
  await act(async () => {
    session.get().editor.editBatchDraft(rejected);
  });
  await act(async () => {
    session.get().editor.setAmount("20");
  });
  await act(async () => {
    const draft = session.get().editor.captureForBatch();
    if (!draft) throw new Error("Expected correction");
    await session.get().batch.keep(draft, rejected.id);
  });
  await act(async () => {
    await session.get().batch.postAll();
  });
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(api.post.mock.calls[1][0]).toMatchObject({
    kind: "opening",
    payload: { amount: { minorUnits: 2000 } },
  });
  expect(session.get().batch.queue).toEqual([]);
});

test("Post all waits for one batch budget decision before sending any entry", async () => {
  let decide: ((value: boolean) => void) | undefined;
  const check = vi.fn(
    async (_queue: BatchDraft[]) =>
      new Promise<boolean>((resolve) => {
        decide = resolve;
      }),
  );
  const session = await open(transport(), check);
  await queueEntry(session, "-10", "Taxi");
  await queueEntry(session, "-20", "Food");
  let posting: Promise<void> | undefined;
  await act(async () => {
    posting = session.get().batch.postAll();
  });
  expect(check).toHaveBeenCalledTimes(1);
  expect(check.mock.calls[0]).toEqual([session.get().batch.queue]);
  expect(session.api.post).not.toHaveBeenCalled();
  await act(async () => {
    decide?.(false);
    await posting;
  });
  expect(session.api.post).not.toHaveBeenCalled();
  expect(session.get().batch.queue).toHaveLength(2);
  await act(async () => {
    posting = session.get().batch.postAll();
  });
  await act(async () => {
    decide?.(true);
    await posting;
  });
  expect(session.api.post).toHaveBeenCalledTimes(2);
});
