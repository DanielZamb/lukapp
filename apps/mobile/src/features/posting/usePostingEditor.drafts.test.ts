import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import type { LocalEntryDraft, LocalEntryDraftsPort } from "../localEntryDrafts";
import { usePostingEditor, type PostingTransport } from "./usePostingEditor";
import type { PendingPosting } from "./pendingPostingSchema";

const account = {
  workspaceId: "workspace",
  financialAccountProfileId: "bank",
  currency: "COP",
} as const;
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function transport() {
  let key = 0;
  return {
    load: vi.fn(async (): Promise<PendingPosting | null> => null),
    save: vi.fn(async (_entry: PendingPosting, _draftId?: string) => {}),
    post: vi.fn(async (entry: PendingPosting) => ({
      description:
        "description" in entry.payload
          ? entry.payload.description
          : entry.payload.name,
      amount: entry.payload.amount,
    })),
    clear: vi.fn(async () => {}),
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
async function open(api: PostingTransport, drafts?: LocalEntryDraftsPort, draftId?: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof usePostingEditor> | undefined;
  function Harness() {
    editor = usePostingEditor(account, api, { drafts, draftId });
    return null;
  }
  await act(async () => {
    root = create(createElement(Harness));
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
});

test("resume is blocked while a posting command is already waiting", async () => {
  const api = transport();
  api.load.mockResolvedValue({
    kind: "expense",
    payload: {
      workspaceId: "workspace",
      financialAccountProfileId: "bank",
      amount: { currency: "COP", minorUnits: 100 },
      accountingDate: "2026-10-17",
      description: "Waiting",
      idempotencyKey: "saved-key",
    },
  });
  const editor = await open(api, port([openDraft]), "open-1");
  expect(editor().description).toBe("Waiting");
  expect(editor().pending).toBe(true);
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
