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
    originalSuggestion: suggestion, frozen: false, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const),
    confirm: vi.fn(),
  });
  expect(editor().description).toBe("Groceries");
  expect(editor().amount).toBe("-1.264,00");
  expect(editor().date).toBe("2026-10-17");
  expect(editor().profileId).toBe("daily");
  expect(editor().categories).toEqual({ ids: ["food"], primaryId: null });
  expect(editor().canKeepDraft).toBe(false);
});

test("confirming a Candidate displays its receipt once", async () => {
  const confirm = vi.fn(async () => ({
    description: "Groceries",
    amount: { currency: "COP", minorUnits: -126400 },
  }));
  const editor = await open({
    id: "candidate-groceries",
    facts,
    originalSuggestion: suggestion, frozen: false, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const),
    confirm,
  });
  await act(async () => {
    await editor().submit();
  });
  expect(confirm).toHaveBeenCalledOnce();
  expect(confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      direction: "out",
      description: "Groceries",
      financialAccountProfileId: "daily",
      amount: { currency: "COP", minorUnits: 126400 },
    }),
  );
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
      originalSuggestion: suggestion, frozen: false, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const),
      confirm,
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
    originalSuggestion: suggestion, frozen: false, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const),
    confirm: vi.fn(),
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

test.each(["intake", "accounting"])("an idempotency conflict from %s retains the Candidate and never fabricates Posted", async (kind) => {
  const confirm = vi.fn(async () => {
    throw new ConvexError({
      kind,
      code: "idempotency_key_conflict",
      message: "idempotency_key_conflict",
    });
  });
  const editor = await open({
    id: "candidate-groceries",
    facts,
    originalSuggestion: suggestion, frozen: false, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const),
    confirm,
  });
  await act(async () => {
    await editor().submit();
  });
  expect(editor().posted).toBeNull();
  expect(editor().error).toBe("Idempotency key already used");
  expect(editor().description).toBe("Groceries");
  expect(editor().amount).toBe(facts.amountText);
  expect(editor().categories).toEqual(facts.categories);
  await act(async () => { await editor().submit(); });
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(editor().posted).toBeNull();
  const timeout = vi.fn(async () => {
    throw new Error("network timeout");
  });
  const retry = await open({
    id: "candidate-groceries",
    facts,
    originalSuggestion: suggestion, frozen: false, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const),
    confirm: timeout,
  });
  await act(async () => {
    await retry().submit();
  });
  expect(retry().posted).toBeNull();
  expect(retry().description).toBe("Groceries");
  expect(retry().error).toBe("Could not confirm posting. Retry to safely check the same entry.");
});

test("a definite accounting rejection fails the Candidate and never aborts a Draft", async () => {
  const api = transport();
  const editor = await open(
    {
      id: "candidate-groceries",
      facts,
      originalSuggestion: suggestion, frozen: false, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const),
      confirm: vi.fn(async () => {
        throw new ConvexError({
          kind: "accounting",
          code: "locked_period",
          message: "Locked Period",
        });
      }),
    },
    api,
  );
  await act(async () => {
    await editor().submit();
  });
  expect(editor().error).toBe("Locked Period");
  expect(api.abort).not.toHaveBeenCalled();
});


test("the account door explicitly refuses intake without changing its facts or writing", async () => {
  const api = transport();
  const binding = { id: "candidate-groceries", facts, originalSuggestion: suggestion, frozen: false, persistReview: vi.fn(async () => {}), discard: vi.fn(async () => "discarded" as const), confirm: vi.fn() };
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

test("partial original evidence opens the existing editor with no amount and correction uses the reviewed workspace currency", async () => {
  const confirm = vi.fn(async () => ({ description: "Reviewed", amount: { currency: "COP", minorUnits: -1230 } }));
  const persistReview = vi.fn(async () => {});
  const editor = await open({ id: "partial", facts: { ...facts, amountText: "", description: "", categories: { ids: [], primaryId: null } },
    originalSuggestion: { ...suggestion, direction: null, description: "", amount: { currency: null, minorUnits: null } },
    frozen: false, persistReview, confirm, discard: vi.fn(async () => "discarded" as const) });
  expect(editor().amount).toBe(""); expect(editor().canSubmit).toBe(false);
  await act(async () => { await editor().submit(); }); expect(confirm).not.toHaveBeenCalled();
  await act(async () => { editor().setAmount("-12,30"); editor().setDescription("Reviewed"); });
  expect(editor().canSubmit).toBe(true);
  await act(async () => { await editor().submit(); });
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ direction: "out", description: "Reviewed", amount: { currency: "COP", minorUnits: 1230 } }));
  expect(persistReview).toHaveBeenCalled();
});
