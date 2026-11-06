vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "00000000-0000-4000-8000-000000000001" }));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
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
  clearIntakeCandidates,
  intakeStorageKey,
  isReadyCandidate,
  parseIntakeDocument,
  viewInbox,
  type IntakeCandidate,
} from "./candidates";
import { acceptIn, consumeIn, failIn, mutateIntakeDocument, writeIntakeDocument } from "./legacy.testSupport";
import { captureToCandidate, memorySource } from "./source.testSupport";

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

test("platform-unsupported local-input wipe clears legacy Drafts and Candidates for the subject", async () => {
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

test("kept notifications with no amount fold under Other notifications and leave the badge count", () => {
  const notification = { text: "Nu\nAprovecha 30% de descuento", packageName: "com.nu.production", at: now };
  const promo = candidate("promo", { notification, suggestion: { ...candidate("x").suggestion, amountMinorUnits: null, direction: null } });
  const typed = candidate("typed", { notification, reviewAmountText: "-12.000", suggestion: { ...candidate("x").suggestion, amountMinorUnits: null } });
  const old = candidate("old", { suggestion: { ...candidate("x").suggestion, amountMinorUnits: null } });
  const inbox = viewInbox({ v: 1, candidates: [promo, typed, old, candidate("money")] }, "workspace", now, "COP");
  expect(inbox.otherNotifications.map((row) => row.id)).toEqual(["promo"]);
  expect([...inbox.now, ...inbox.wait].map((row) => row.id).sort()).toEqual(["money", "old", "typed"]);
  expect(inbox.count).toBe(3);
});

test("missing parsed amounts never hide incoming money or unrecognized bank alerts", () => {
  const unresolved = { ...candidate("x").suggestion, amountMinorUnits: null, direction: null };
  const incoming = candidate("incoming", { suggestion: unresolved,
    notification: { text: "Recibiste 45,00 en tu cuenta\nTe llegó dinero de MARIA EJEMPLO con tu llave.", packageName: "com.nu.production", at: now } });
  const unknown = candidate("unknown", { suggestion: unresolved,
    notification: { text: "Hay una novedad en tu cuenta. Revísala en la app.", packageName: "app.bank", at: now } });
  const mixed = candidate("mixed", { suggestion: unresolved,
    notification: { text: "Consignaron dinero en tu cuenta por la promoción.", packageName: "app.bank", at: now } });
  const inbox = viewInbox({ v: 1, candidates: [incoming, unknown, mixed] }, "workspace", now, "COP");
  expect(inbox.now.map((row) => row.id)).toEqual(["incoming", "unknown", "mixed"]);
  expect(inbox.count).toBe(3);
  expect(inbox.ready).toEqual([]);
});
