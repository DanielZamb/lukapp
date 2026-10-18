import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";
import { usePostingBatch, type BatchDraft } from "./usePostingBatch";
import { usePostingEditor, type PostingTransport } from "./usePostingEditor";

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
  return {
    load: vi.fn(async () => ({ kind: "none" as const })),
    save: vi.fn(async (command, draftId) => ({
      command,
      id: draftId ?? command.payload.idempotencyKey,
    })),
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
    clear: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    newKey: () => `key-${++key}`,
  } satisfies PostingTransport;
}
async function open(api = transport()) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let current:
    | {
        editor: ReturnType<typeof usePostingEditor>;
        batch: ReturnType<typeof usePostingBatch>;
      }
    | undefined;
  function Harness() {
    current = {
      editor: usePostingEditor(account, api),
      batch: usePostingBatch(api),
    };
    return null;
  }
  await act(async () => {
    root = create(createElement(Harness));
  });
  return {
    api,
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
    session.get().batch.keep(captured);
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
    session.get().batch.keep(draft, item.id);
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
