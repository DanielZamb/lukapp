import { expect, test } from "vitest";
import { confirmCandidate } from "./confirmCandidate";
import { intakeKey } from "./policy";
import type {
  ConfirmCandidateInput,
  IntakeReceipt,
  IntakeStore,
  PostedIntakeEntry,
  IntakeSuggestion,
} from "./types";

const suggestion: IntakeSuggestion = {
  direction: "out",
  description: "Groceries",
  amount: { currency: "COP", minorUnits: 126400 },
  accountingDate: "2026-10-17",
  financialAccountProfileId: "daily",
  userCategoryIds: ["food"],
  primaryUserCategoryId: null,
};

function input(
  overrides: Partial<ConfirmCandidateInput> = {},
): ConfirmCandidateInput {
  return {
    workspaceId: "workspace",
    candidateId: "candidate-groceries",
    confirmed: suggestion,
    suggestion,
    parserVersion: "parser@1",
    consentVersion: "consent@1",
    ...overrides,
  };
}

function store(seed: IntakeReceipt[] = []): IntakeStore {
  const rows = [...seed];
  return {
    findReceipt: async (workspaceId, idempotencyKey) =>
      rows.find(
        (row) =>
          row.workspaceId === workspaceId &&
          row.idempotencyKey === idempotencyKey,
      ) ?? null,
    insertReceipt: async (receipt) => {
      const row = { ...receipt, id: `receipt-${rows.length + 1}` };
      rows.push(row);
      return row;
    },
  };
}

test("confirming a Candidate posts once with intake key and a Receipt", async () => {
  const posts: string[] = [];
  const posted: PostedIntakeEntry = {
    id: "je-1",
    description: "Groceries",
    amount: { currency: "COP", minorUnits: 126400 },
    replay: false,
  };
  const result = await confirmCandidate(
    store(),
    async (body) => {
      posts.push(body.idempotencyKey);
      return posted;
    },
    { ...input(), actorId: "owner", now: 1 },
  );
  expect(posts).toEqual([intakeKey("candidate-groceries")]);
  expect(result.replay).toBe(false);
  expect(result.posted).toEqual(posted);
  expect(result.receipt).toMatchObject({
    journalEntryId: "je-1",
    idempotencyKey: "intake:candidate-groceries",
    parserVersion: "parser@1",
    consentVersion: "consent@1",
    actorId: "owner",
    changedFields: [],
  });
});

test("retrying the same Candidate returns the Receipt and does not insert another", async () => {
  const receipts = store();
  let calls = 0;
  const post = async () => {
    calls += 1;
    return {
      id: "je-1",
      description: "Groceries",
      amount: { currency: "COP", minorUnits: 126400 },
      replay: calls > 1,
    };
  };
  const first = await confirmCandidate(receipts, post, {
    ...input(),
    actorId: "owner",
    now: 1,
  });
  const second = await confirmCandidate(receipts, post, {
    ...input(),
    actorId: "owner",
    now: 2,
  });
  expect(calls).toBe(2);
  expect(second.replay).toBe(true);
  expect(second.receipt.id).toBe(first.receipt.id);
  expect(second.receipt.confirmedAt).toBe(1);
});

test("a replay with a missing Receipt still writes one Receipt", async () => {
  const result = await confirmCandidate(
    store(),
    async () => ({
      id: "je-1",
      description: "Groceries",
      amount: { currency: "COP", minorUnits: 126400 },
      replay: true,
    }),
    { ...input(), actorId: "owner", now: 9 },
  );
  expect(result.replay).toBe(true);
  expect(result.receipt.journalEntryId).toBe("je-1");
});

test("changed fields are the names the user edited before confirm", async () => {
  const result = await confirmCandidate(
    store(),
    async () => ({
      id: "je-2",
      description: "Market",
      amount: { currency: "COP", minorUnits: 130000 },
      replay: false,
    }),
    {
      ...input({
        confirmed: {
          ...suggestion,
          description: "Market",
          amount: { currency: "COP", minorUnits: 130000 },
        },
      }),
      actorId: "owner",
      now: 1,
    },
  );
  expect(result.receipt.changedFields).toEqual(["description", "amount"]);
});
