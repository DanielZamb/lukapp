import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";
import {
  usePostingEditor,
  type IntakeBinding,
  type LoadResult,
  type PostingTransport,
} from "./usePostingEditor";
import type { PendingPosting } from "./pendingPostingSchema";
import type { LocalEntryFacts } from "../localEntryDrafts";
import type { IntakeSuggestion } from "../../../../../src/notificationIntake/types";

const account = {
  workspaceId: "workspace",
  financialAccountProfileId: "wallet",
  currency: "COP" as const,
  timeZone: "America/Bogota",
};
const suggestion: IntakeSuggestion = {
  direction: "out",
  description: "Groceries",
  amount: { currency: "COP", minorUnits: 126400 },
  accountingDate: "2026-10-17",
  financialAccountProfileId: "daily",
  userCategoryIds: ["food"],
  primaryUserCategoryId: null,
};
const facts: LocalEntryFacts = {
  workspaceId: "workspace",
  currency: "COP",
  entryType: "normal",
  amountText: "-1.264,00",
  accountingDate: "2026-10-17",
  description: "Groceries",
  profileId: "daily",
  destinationId: null,
  categories: { ids: ["food"], primaryId: null },
};

let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

function transport() {
  return {
    load: vi.fn(async (): Promise<LoadResult> => ({ kind: "none" })),
    save: vi.fn(async (entry: PendingPosting) => ({
      id: "draft",
      command: entry,
    })),
    post: vi.fn(async () => {
      throw new Error("ordinary post must not run for a Candidate");
    }),
    clear: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
    newKey: () => "uuid",
  } satisfies PostingTransport;
}

async function open(
  intake: IntakeBinding,
  api: PostingTransport = transport(),
  session: { intakeRoute?: boolean } = {},
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof usePostingEditor> | undefined;
  function Harness() {
    editor = usePostingEditor(account, api, { intake, ...session });
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

const pendingExpense = {
  kind: "expense",
  payload: {
    workspaceId: "workspace",
    amount: { currency: "COP", minorUnits: 50000 },
    accountingDate: "2026-10-17",
    description: "Pending food",
    idempotencyKey: "draft-key",
    financialAccountProfileId: "wallet",
  },
} satisfies PendingPosting;

test("a Candidate prefills the shared posting form", async () => {
  const editor = await open({
    id: "candidate-groceries",
    facts,
    suggestion,
    parserVersion: "parser@1",
    consentVersion: "consent@1",
    confirm: vi.fn(),
    consume: vi.fn(),
    fail: vi.fn(),
  });
  expect(editor().description).toBe("Groceries");
  expect(editor().amount).toBe("-1.264,00");
  expect(editor().date).toBe("2026-10-17");
  expect(editor().profileId).toBe("daily");
  expect(editor().categories).toEqual({ ids: ["food"], primaryId: null });
  expect(editor().canKeepDraft).toBe(false);
});

test("confirming a Candidate posts once and consumes it", async () => {
  const confirm = vi.fn(async () => ({
    description: "Groceries",
    amount: { currency: "COP", minorUnits: -126400 },
  }));
  const consume = vi.fn(async () => {});
  const editor = await open({
    id: "candidate-groceries",
    facts,
    suggestion,
    parserVersion: "parser@1",
    consentVersion: "consent@1",
    confirm,
    consume,
    fail: vi.fn(),
  });
  await act(async () => {
    await editor().submit();
  });
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      candidateId: "candidate-groceries",
      confirmed: expect.objectContaining({
        description: "Groceries",
        financialAccountProfileId: "daily",
        amount: { currency: "COP", minorUnits: 126400 },
      }),
    }),
  );
  expect(consume).toHaveBeenCalledOnce();
  expect(editor().posted).toEqual({
    description: "Groceries",
    amount: { currency: "COP", minorUnits: -126400 },
  });
  await act(async () => {
    await editor().submit();
  });
  expect(confirm).toHaveBeenCalledOnce();
});

test("a Candidate route is blocked when a posting Draft exists and never touches it", async () => {
  const confirm = vi.fn();
  const api = {
    ...transport(),
    load: vi.fn(async (_id?: string, resume?: boolean): Promise<LoadResult> => {
      if (resume === false) return { kind: "blocked" };
      return { kind: "pending", id: "post-1", command: pendingExpense };
    }),
  };
  const editor = await open(
    {
      id: "candidate-groceries",
      facts,
      suggestion,
      parserVersion: "parser@1",
      consentVersion: "consent@1",
      confirm,
      consume: vi.fn(),
      fail: vi.fn(),
    },
    api,
    { intakeRoute: true },
  );
  expect(api.load).toHaveBeenCalledWith(undefined, false);
  expect(editor().blockedByPendingPostings).toBe(true);
  expect(editor().pending).toBe(false);
  expect(editor().description).not.toBe("Pending food");
  await act(async () => {
    await editor().submit();
  });
  expect(confirm).not.toHaveBeenCalled();
  expect(api.abort).not.toHaveBeenCalled();
  expect(api.clear).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});

test("a bound Candidate stays a cash in or out and refuses setup", async () => {
  const editor = await open({
    id: "candidate-groceries",
    facts,
    suggestion,
    parserVersion: "parser@1",
    consentVersion: "consent@1",
    confirm: vi.fn(),
    consume: vi.fn(),
    fail: vi.fn(),
  });
  expect(editor().lockEntryType).toBe(true);
  await act(async () => {
    editor().setEntryType("transfer");
    editor().setSetup({
      name: "New place",
      productKind: "bankAccount",
      amount: "0",
      date: "2026-10-17",
    });
  });
  expect(editor().entryType).toBe("normal");
  expect(editor().setup).toBeNull();
});

test("idempotency conflict consumes the Candidate; a timeout leaves it", async () => {
  const consume = vi.fn(async () => {});
  const fail = vi.fn(async () => {});
  const confirm = vi.fn(async () => {
    throw new ConvexError({
      kind: "intake",
      code: "idempotency_key_conflict",
      message: "idempotency_key_conflict",
    });
  });
  const editor = await open({
    id: "candidate-groceries",
    facts,
    suggestion,
    parserVersion: "parser@1",
    consentVersion: "consent@1",
    confirm,
    consume,
    fail,
  });
  await act(async () => {
    await editor().submit();
  });
  expect(consume).toHaveBeenCalledOnce();
  expect(fail).not.toHaveBeenCalled();
  const timeout = vi.fn(async () => {
    throw new Error("network timeout");
  });
  const retryFail = vi.fn(async () => {});
  const retryConsume = vi.fn(async () => {});
  const retry = await open({
    id: "candidate-groceries",
    facts,
    suggestion,
    parserVersion: "parser@1",
    consentVersion: "consent@1",
    confirm: timeout,
    consume: retryConsume,
    fail: retryFail,
  });
  await act(async () => {
    await retry().submit();
  });
  expect(retryConsume).not.toHaveBeenCalled();
  expect(retryFail).not.toHaveBeenCalled();
});

test("a definite accounting rejection fails the Candidate and never aborts a Draft", async () => {
  const fail = vi.fn(async () => {});
  const api = transport();
  const editor = await open(
    {
      id: "candidate-groceries",
      facts,
      suggestion,
      parserVersion: "parser@1",
      consentVersion: "consent@1",
      confirm: vi.fn(async () => {
        throw new ConvexError({
          kind: "accounting",
          code: "period_locked",
          message: "Locked Period",
        });
      }),
      consume: vi.fn(),
      fail,
    },
    api,
  );
  await act(async () => {
    await editor().submit();
  });
  expect(fail).toHaveBeenCalledWith("Locked Period");
  expect(api.abort).not.toHaveBeenCalled();
});


test("the account door explicitly refuses intake without changing its facts or writing", async () => {
  const api = transport();
  const binding = { id: "candidate-groceries", facts, suggestion, parserVersion: "parser@1", consentVersion: "consent@1",
    confirm: vi.fn(), consume: vi.fn(), fail: vi.fn() };
  const editor = await open(binding, api, { intakeRoute: true });
  let accepted = true;
  await act(async () => {
    accepted = editor().beginAccountSetup({ name: "Savings", answer: "stillMine", style: { emoji: "🏦", tone: "primary" } });
  });
  expect(accepted).toBe(false);
  expect(editor().setup).toBeNull();
  expect(editor().entryType).toBe("normal");
  expect(editor().amount).toBe(facts.amountText);
  expect(editor().categories).toEqual(facts.categories);
  expect(api.save).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
  expect(binding.confirm).not.toHaveBeenCalled();
});
