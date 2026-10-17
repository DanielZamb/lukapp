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

import { LocalInputLease } from "../../local-auth/localInput";
import { clearLocalInput } from "../clearLocalInput";
import { writeDocument, storageKey } from "../localEntryDrafts";
import {
  INTAKE_CANDIDATE_TTL_MS,
  acceptIn,
  clearIntakeCandidates,
  consumeIn,
  failIn,
  intakeStorageKey,
  isReadyCandidate,
  mutateIntakeDocument,
  parseIntakeDocument,
  viewInbox,
  writeIntakeDocument,
  type IntakeCandidate,
} from "./candidates";
import { captureToCandidate, memorySource } from "./source";

const now = 1_700_000_000_000;

function candidate(
  id: string,
  extra: Partial<IntakeCandidate> = {},
): IntakeCandidate {
  return {
    id,
    createdAt: now,
    expiresAt: now + INTAKE_CANDIDATE_TTL_MS,
    workspaceId: "workspace",
    currency: "COP",
    suggestion: {
      direction: "out",
      description: "Groceries",
      amountMinorUnits: 126400,
      accountingDate: "2026-10-17",
      financialAccountProfileId: "daily",
      userCategoryIds: ["food"],
      primaryUserCategoryId: null,
    },
    parserVersion: "parser@1",
    consentVersion: "consent@1",
    ...extra,
  };
}

beforeEach(() => {
  memory.clear();
});

test("a ready Candidate is listed and consumed after confirm", () => {
  const accepted = acceptIn({ v: 1, candidates: [] }, candidate("c1"), now);
  expect(isReadyCandidate(accepted.candidates[0]!, "COP")).toBe(true);
  expect(viewInbox(accepted, "workspace", now, "COP").ready).toHaveLength(1);
  expect(consumeIn(accepted, "c1").candidates).toEqual([]);
});

test("a Candidate in a foreign currency is never Ready", () => {
  const usd = candidate("usd", { currency: "USD" });
  const inbox = viewInbox({ v: 1, candidates: [usd] }, "workspace", now, "COP");
  expect(isReadyCandidate(usd, "COP")).toBe(false);
  expect(inbox.ready).toEqual([]);
  expect(inbox.now.map((row) => row.id)).toEqual(["usd"]);
});

test("Needs you now holds review, errors, and soon-to-expire rows", () => {
  const review = candidate("review", {
    suggestion: {
      ...candidate("review").suggestion,
      financialAccountProfileId: "",
    },
  });
  const failed = candidate("failed", { error: "Locked Period" });
  const soon = candidate("soon", { expiresAt: now + 2 * 24 * 60 * 60 * 1000 });
  const later = candidate("later", { expiresAt: now + 10 * 24 * 60 * 60 * 1000 });
  const document = {
    v: 1 as const,
    candidates: [review, failed, soon, later],
  };
  const inbox = viewInbox(document, "workspace", now, "COP");
  expect(inbox.now.map((row) => row.id)).toEqual(["review", "failed", "soon"]);
  expect(inbox.wait.map((row) => row.id)).toEqual(["later"]);
  expect(failIn(document, "later", "Locked Period").candidates[3]?.error).toBe(
    "Locked Period",
  );
});

test("revocation wipe deletes Candidates without touching a missing Drafts key", async () => {
  await writeIntakeDocument("owner", {
    v: 1,
    candidates: [candidate("c1")],
  });
  expect(memory.has(intakeStorageKey("owner"))).toBe(true);
  await clearIntakeCandidates("owner");
  expect(memory.has(intakeStorageKey("owner"))).toBe(false);
});

test("local-input wipe clears Drafts and Candidates for the subject", async () => {
  await writeDocument("owner", { v: 1, drafts: [] });
  await writeIntakeDocument("owner", {
    v: 1,
    candidates: [candidate("c1")],
  });
  await clearLocalInput("owner");
  expect(memory.has(storageKey("owner"))).toBe(false);
  expect(memory.has(intakeStorageKey("owner"))).toBe(false);
});

test("the source adapter writes captures locally and never invents Convex ids", async () => {
  const source = memorySource([
    {
      workspaceId: "workspace",
      currency: "COP",
      suggestion: candidate("x").suggestion,
      parserVersion: "parser@1",
      consentVersion: "consent@1",
    },
  ]);
  const [capture] = await source.pull();
  const row = captureToCandidate(
    capture!,
    now,
    "candidate-from-source",
    INTAKE_CANDIDATE_TTL_MS,
  );
  const lease = new LocalInputLease("owner", "sess");
  const stored = await mutateIntakeDocument(lease, "owner", (document) => ({
    document: acceptIn(document, row, now),
    result: row.id,
    write: true,
  }));
  expect(stored).toBe("candidate-from-source");
  expect(parseIntakeDocument(JSON.parse(memory.get(intakeStorageKey("owner"))!), now).document.candidates[0]?.id).toBe(
    "candidate-from-source",
  );
  expect(await source.pull()).toEqual([]);
});
