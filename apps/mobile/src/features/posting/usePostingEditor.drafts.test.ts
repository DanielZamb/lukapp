import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));
import {
  LocalInputLease,
  runLocalInputWrite,
} from "../../local-auth/localInput";
import {
  beginPostIn,
  keepIn,
  rejectPostIn,
  removeIn,
  type LocalEntryDraft,
  type LocalEntryDocument,
  type LocalEntryDraftsPort,
} from "../localEntryDrafts";
import {
  usePostingEditor,
  type LoadResult,
  type PostingTransport,
  type SavedPosting,
} from "./usePostingEditor";
import type { PendingPosting } from "./pendingPostingSchema";

const account = {
  workspaceId: "workspace",
  financialAccountProfileId: "bank",
  currency: "COP",
  timeZone: "America/Bogota",
} as const;
const mounts: ReactTestRenderer[] = [];
afterEach(async () => {
  for (const mounted of mounts.splice(0))
    await act(async () => mounted.unmount());
  vi.unstubAllGlobals();
});
function transport() {
  let key = 0;
  return {
    load: vi.fn(async (): Promise<LoadResult> => ({ kind: "none" })),
    save: vi.fn(async (entry: PendingPosting, draftId?: string) => ({
      id: draftId ?? `saved-${key || 1}`,
      command: entry,
    })),
    post: vi.fn(async (entry: PendingPosting) => ({
      description:
        "description" in entry.payload
          ? entry.payload.description
          : entry.payload.name,
      amount: entry.payload.amount,
    })),
    clear: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    newKey: () => `entry-${++key}`,
  } satisfies PostingTransport;
}
function port(drafts: LocalEntryDraft[] = []) {
  return {
    keep: vi.fn(async ({ draftId, facts }) => {
      const id = draftId ?? "kept-1";
      const index = drafts.findIndex((draft) => draft.id === id);
      const row: LocalEntryDraft = {
        id,
        createdAt: 1,
        expiresAt: 2,
        status: "open",
        facts,
      };
      if (index >= 0) drafts[index] = row;
      else drafts.push(row);
      return id;
    }),
    read: vi.fn(async (id) => drafts.find((draft) => draft.id === id) ?? null),
  } satisfies LocalEntryDraftsPort;
}
async function open(
  api: PostingTransport,
  drafts?: LocalEntryDraftsPort,
  draftId?: string,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof usePostingEditor> | undefined;
  function Harness() {
    editor = usePostingEditor(account, api, { drafts, draftId });
    return null;
  }
  await act(async () => {
    mounts.push(create(createElement(Harness)));
  });
  return () => {
    if (!editor) throw new Error("Editor not mounted");
    return editor;
  };
}

const openDraft: LocalEntryDraft = {
  id: "open-1",
  createdAt: 1,
  expiresAt: 2,
  status: "open",
  facts: {
    workspaceId: "workspace",
    currency: "COP",
    entryType: "normal",
    amountText: "",
    accountingDate: "2026-10-16",
    description: "Taxi",
    profileId: "cash",
    destinationId: null,
    categories: { ids: ["food"], primaryId: null },
  },
};
const groceriesFacts = {
  workspaceId: "workspace" as const,
  currency: "COP" as const,
  entryType: "normal" as const,
  amountText: "-2,00",
  accountingDate: "2026-10-16",
  description: "Groceries",
  profileId: "cash",
  destinationId: null,
  categories: { ids: [] as string[], primaryId: null },
};
function sharedStore() {
  let document: LocalEntryDocument = { v: 1, drafts: [] };
  const lease = new LocalInputLease("two-editors", "session");
  let nextId = 0;
  const kept = keepIn(
    document,
    { facts: groceriesFacts },
    Date.now(),
    () => "groceries",
  );
  document = kept.document;
  function transportFor(prefix: string) {
    let postingId: string | undefined;
    let key = 0;
    return {
      load: async () => {
        let result: LoadResult = { kind: "none" };
        await runLocalInputWrite(lease, async () => {
          const postings = document.drafts.filter(
            (draft) => draft.status === "posting",
          );
          if (postings.length === 1) {
            postingId = postings[0].id;
            result = {
              kind: "pending",
              id: postings[0].id,
              command: postings[0].command,
            };
          } else {
            postingId = undefined;
            result =
              postings.length === 0
                ? { kind: "none" }
                : { kind: "blocked" };
          }
        });
        return result;
      },
      save: async (entry, draftId) => {
        let saved!: SavedPosting;
        await runLocalInputWrite(lease, async () => {
          const begun = beginPostIn(
            document,
            { draftId: draftId ?? postingId, command: entry },
            Date.now(),
            () => `${prefix}-row-${++nextId}`,
          );
          document = begun.document;
          postingId = begun.draft.id;
          saved = { id: begun.draft.id, command: begun.draft.command };
        });
        return saved;
      },
      post: vi.fn(async (entry: PendingPosting) => ({
        description:
          "description" in entry.payload
            ? entry.payload.description
            : entry.payload.name,
        amount: entry.payload.amount,
      })),
      clear: async () => {
        await runLocalInputWrite(lease, async () => {
          if (!postingId) return;
          document = removeIn(document, postingId);
          postingId = undefined;
        });
      },
      abort: async () => {
        await runLocalInputWrite(lease, async () => {
          if (!postingId) return;
          document = rejectPostIn(document, postingId);
          postingId = undefined;
        });
      },
      newKey: () => `${prefix}-${++key}`,
    } satisfies PostingTransport;
  }
  return {
    transportFor,
    read: () => document,
    port: {
      keep: async ({ draftId, facts }) => {
        const keptRow = keepIn(
          document,
          { draftId, facts },
          Date.now(),
          () => "kept-shared",
        );
        document = keptRow.document;
        return keptRow.id;
      },
      read: async (id) =>
        document.drafts.find((draft) => draft.id === id) ?? null,
    } satisfies LocalEntryDraftsPort,
  };
}

test("Keep as Draft stores incomplete amount text and never posts", async () => {
  const api = transport();
  const notebook = port();
  const editor = await open(api, notebook);
  expect(editor().canKeepDraft).toBe(true);
  await act(async () => {
    editor().setAmount("-");
    editor().setDescription("Snacks");
  });
  await act(async () => {
    await editor().keepDraft();
  });
  expect(notebook.keep).toHaveBeenCalledOnce();
  expect(notebook.keep.mock.calls[0][0].facts).toMatchObject({
    amountText: "-",
    description: "Snacks",
    entryType: "normal",
  });
  expect(api.post).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
  expect(editor().pending).toBe(false);
  expect(editor().editable).toBe(true);
  expect(editor().draftId).toBe("kept-1");
});

test("resume hydrates an open draft without locking the form", async () => {
  const api = transport();
  const editor = await open(api, port([openDraft]), "open-1");
  expect(editor().amount).toBe("");
  expect(editor().description).toBe("Taxi");
  expect(editor().date).toBe("2026-10-16");
  expect(editor().profileId).toBe("cash");
  expect(editor().categories.ids).toEqual(["food"]);
  expect(editor().pending).toBe(false);
  expect(editor().editable).toBe(true);
  expect(editor().canSubmit).toBe(false);
  expect(editor().draftId).toBe("open-1");
});

test("a missing draftId does not bind the editor until a draft is resumed", async () => {
  const api = transport();
  const editor = await open(api, port(), "ghost");
  expect(editor().draftId).toBeUndefined();
  expect(editor().error).toBe("This draft is no longer on this device.");
});

test("resume is blocked while a posting command is already waiting", async () => {
  const api = transport();
  api.load.mockResolvedValue({
    kind: "pending",
    id: "waiting",
    command: {
      kind: "expense",
      payload: {
        workspaceId: "workspace",
        financialAccountProfileId: "bank",
        amount: { currency: "COP", minorUnits: 100 },
        accountingDate: "2026-10-17",
        description: "Waiting",
        idempotencyKey: "saved-key",
      },
    },
  });
  const editor = await open(api, port([openDraft]), "open-1");
  expect(editor().description).toBe("Waiting");
  expect(editor().pending).toBe(true);
  expect(editor().draftId).toBe("waiting");
  expect(editor().editable).toBe(false);
  expect(editor().resume(openDraft)).toBe("blocked-by-pending");
  expect(editor().description).toBe("Waiting");
});

test("Keep as Draft is unavailable during setup and initial balance", async () => {
  const api = transport();
  const notebook = port();
  const editor = await open(api, notebook);
  await act(async () => editor().setEntryType("initial"));
  expect(editor().canKeepDraft).toBe(false);
  await act(async () => {
    await editor().keepDraft();
    editor().setEntryType("normal");
    editor().setSetup({
      name: "Card",
      productKind: "creditCard",
      amount: "0",
      date: "2026-10-17",
    });
  });
  expect(editor().canKeepDraft).toBe(false);
  await act(async () => {
    await editor().keepDraft();
  });
  expect(notebook.keep).not.toHaveBeenCalled();
});

test("posting a kept draft saves under that draft id then posts once", async () => {
  const api = transport();
  const notebook = port([openDraft]);
  const editor = await open(api, notebook, "open-1");
  await act(async () => {
    editor().setAmount("-1,00");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(api.save.mock.calls[0][1]).toBe("open-1");
  expect(api.post).toHaveBeenCalledOnce();
  expect(api.clear).toHaveBeenCalledOnce();
  expect(editor().draftId).toBeUndefined();
});

test("Post stays disabled while Keep is still saving and cannot create a second row", async () => {
  const api = transport();
  const notebook = port();
  let finishKeep!: (id: string) => void;
  notebook.keep.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishKeep = resolve;
      }),
  );
  const editor = await open(api, notebook);
  await act(async () => {
    editor().setAmount("-1,00");
    editor().setDescription("Snacks");
  });
  expect(editor().canSubmit).toBe(true);
  let kept!: Promise<string | undefined>;
  await act(async () => {
    kept = editor().keepDraft();
    await editor().submit();
  });
  expect(editor().canSubmit).toBe(false);
  expect(api.save).not.toHaveBeenCalled();
  await act(async () => {
    finishKeep("kept-1");
    await kept;
  });
  expect(notebook.keep).toHaveBeenCalledOnce();
  expect(api.save).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  expect(editor().draftId).toBe("kept-1");
  expect(editor().canSubmit).toBe(true);
});

test("a successful post clears the row after the editor unmounts", async () => {
  const api = transport();
  let finishPost!: () => void;
  api.post.mockImplementationOnce(
    (entry) =>
      new Promise((resolve) => {
        finishPost = () =>
          resolve({
            description:
              "description" in entry.payload
                ? entry.payload.description
                : entry.payload.name,
            amount: entry.payload.amount,
          });
      }),
  );
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
    editor().setDescription("Taxi");
  });
  let submission!: Promise<void>;
  await act(async () => {
    submission = editor().submit();
  });
  await act(async () => {
    mounts.splice(0).forEach((mounted) => mounted.unmount());
  });
  await act(async () => {
    finishPost();
    await submission;
  });
  expect(api.clear).toHaveBeenCalledOnce();
});

test("an accounting rejection reopens the draft instead of deleting it", async () => {
  const api = transport();
  api.post.mockRejectedValueOnce(
    new ConvexError({
      kind: "accounting",
      code: "locked_period",
      message: "Locked Period",
    }),
  );
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
    editor().setDescription("Food");
  });
  await act(async () => {
    await editor().submit();
  });
  expect(api.abort).toHaveBeenCalledOnce();
  expect(api.clear).not.toHaveBeenCalled();
  expect(editor().pending).toBe(false);
  expect(editor().editable).toBe(true);
  expect(editor().error).toBe("Locked Period");
  expect(editor().description).toBe("Food");
});

test("several pending postings block a new submission", async () => {
  const api = transport();
  api.load.mockResolvedValue({ kind: "blocked" });
  const editor = await open(api);
  expect(editor().blockedByPendingPostings).toBe(true);
  expect(editor().pending).toBe(false);
  expect(editor().canSubmit).toBe(false);
  expect(editor().editable).toBe(false);
  await act(async () => {
    editor().setAmount("-1,00");
    await editor().submit();
  });
  expect(api.save).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
});

test("two editors bind the stored posting and never write it onto another draft", async () => {
  const shared = sharedStore();
  const first = shared.transportFor("first");
  const second = shared.transportFor("second");
  let finishPost!: () => void;
  first.post.mockImplementationOnce(
    (entry) =>
      new Promise((resolve) => {
        finishPost = () =>
          resolve({
            description:
              "description" in entry.payload
                ? entry.payload.description
                : entry.payload.name,
            amount: entry.payload.amount,
          });
      }),
  );
  const editor1 = await open(first);
  await act(async () => {
    editor1().setAmount("-800,00");
    editor1().setDescription("Rent");
  });
  let posting!: Promise<void>;
  await act(async () => {
    posting = editor1().submit();
  });
  const rentId = editor1().draftId;
  expect(rentId).toBeTruthy();
  expect(
    shared.read().drafts.find((draft) => draft.id === "groceries"),
  ).toMatchObject({ status: "open", facts: { description: "Groceries" } });
  const editor2 = await open(second, shared.port, "groceries");
  expect(editor2().draftId).toBe(rentId);
  expect(editor2().description).toBe("Rent");
  expect(editor2().pending).toBe(true);
  await act(async () => {
    await editor2().submit();
  });
  expect(second.post).toHaveBeenCalledOnce();
  expect(second.post.mock.calls[0][0].payload.idempotencyKey).toBe("first-1");
  expect(
    shared.read().drafts.find((draft) => draft.id === "groceries"),
  ).toMatchObject({ status: "open", facts: { description: "Groceries" } });
  await act(async () => {
    finishPost();
    await posting;
  });
});

test("an accounting rejection keeps money facts in the store as an open draft", async () => {
  const shared = sharedStore();
  const api = shared.transportFor("reject");
  api.post.mockRejectedValueOnce(
    new ConvexError({
      kind: "accounting",
      code: "locked_period",
      message: "Locked Period",
    }),
  );
  const editor = await open(api);
  await act(async () => {
    editor().setAmount("-1,00");
    editor().setDescription("Food");
  });
  await act(async () => {
    await editor().submit();
  });
  const row = shared
    .read()
    .drafts.find(
      (draft) => draft.status === "open" && draft.facts.description === "Food",
    );
  expect(row).toMatchObject({
    status: "open",
    facts: { description: "Food", amountText: "−1,00" },
  });
  expect(shared.read().drafts.some((draft) => draft.status === "posting")).toBe(
    false,
  );
});
