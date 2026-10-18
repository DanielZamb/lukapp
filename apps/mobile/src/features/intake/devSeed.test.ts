import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as SecureStore from "expo-secure-store";
import { consumeIn, isReadyCandidate } from "./candidates";
import { devSeedAction, readySeedCandidate, seedCandidate, seedDiscardNotices } from "./devSeed";
import { addDiscardNotice, discardNoticesStorageKey, readDiscardNotices } from "../localDiscardNotices";

const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => memory.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { memory.set(key, value); });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { memory.delete(key); });
});

const seedId = "QA-DRAFTS-20261018-C1";
const readyInput = {
  workspaceId: "workspace",
  profileId: "daily",
  currency: "COP",
  seedId: "QA-DRAFTS-20261018-B1",
  categoryId: "existing-expense",
  categories: [{ id: "existing-expense", workspaceId: "workspace", nature: "Expense" }],
  timeZone: "America/Bogota",
} satisfies Parameters<typeof readySeedCandidate>[0];

afterEach(() => vi.useRealTimers());

test("Ready uses COP 1, the explicit existing expense category, place, and workspace date", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T02:30:00Z"));
  expect(devSeedAction("ready", readyInput.seedId, true))
    .toEqual({ kind: "ready", id: readyInput.seedId });
  const candidate = readySeedCandidate(readyInput, true);
  expect(candidate).toMatchObject({
    id: "QA-DRAFTS-20261018-B1", workspaceId: "workspace", currency: "COP",
    createdAt: Date.parse("2026-11-03T02:30:00Z"),
    suggestion: {
      direction: "out", description: "QA QA-DRAFTS-20261018-B1", amountMinorUnits: 100,
      accountingDate: "2026-11-02", financialAccountProfileId: "daily",
      userCategoryIds: ["existing-expense"], primaryUserCategoryId: "existing-expense",
    },
  });
  if (!candidate) throw new Error("Expected a Ready Candidate");
  expect(isReadyCandidate(candidate, "COP")).toBe(true);
  expect(readySeedCandidate({ ...readyInput, timeZone: "Pacific/Auckland" }, true)
    ?.suggestion.accountingDate).toBe("2026-11-03");
});

test.each<Partial<Parameters<typeof readySeedCandidate>[0]>>([
  { workspaceId: "" }, { profileId: "" }, { currency: "USD" },
  { seedId: "genuine" }, { categoryId: undefined }, { categoryId: "" },
  { categoryId: ["existing-expense"] }, { categoryId: "unknown" },
  { categories: undefined }, { categories: [] },
  { categories: [{ id: "existing-expense", workspaceId: "other", nature: "Expense" }] },
  { categories: [{ id: "existing-expense", workspaceId: "workspace", nature: "Income" }] },
  { categories: [{ id: "existing-expense", workspaceId: "workspace" }] },
  { timeZone: "" }, { timeZone: "invalid-zone" },
])("Ready returns no Candidate for missing or invalid required input %j", (invalid) => {
  expect(readySeedCandidate({ ...readyInput, ...invalid }, true)).toBeNull();
});

test("Ready returns no Candidate outside development", () => {
  expect(readySeedCandidate(readyInput, false)).toBeNull();
});

test("Ready exact removal leaves genuine and other QA Candidates intact", () => {
  const ready = readySeedCandidate(readyInput, true);
  if (!ready) throw new Error("Expected a Ready Candidate");
  const genuine = { ...ready, id: "genuine", suggestion: { ...ready.suggestion, description: "Genuine" } };
  const other = seedCandidate("workspace", "daily", "COP", seedId);
  const action = devSeedAction("remove", ready.id, true);
  if (action?.kind !== "remove") throw new Error("Expected exact removal");
  expect(consumeIn({ v: 1, candidates: [ready, genuine, other] }, action.id).candidates)
    .toEqual([genuine, other]);
});

test("the explicit QA seed ID identifies the Candidate and its description", () => {
  expect(devSeedAction("1", seedId, true)).toEqual({ kind: "plant", id: seedId });
  const candidate = seedCandidate("workspace", "daily", "COP", seedId);
  expect(candidate).toMatchObject({
    id: seedId,
    workspaceId: "workspace",
    suggestion: { description: "QA QA-DRAFTS-20261018-C1" },
  });
  expect(seedCandidate("workspace", "daily", "COP", "QA-DRAFTS-20261018-C2"))
    .toMatchObject({
      id: "QA-DRAFTS-20261018-C2",
      suggestion: { description: "QA QA-DRAFTS-20261018-C2" },
    });
});

test("remove selects only the exact QA Candidate through consume", () => {
  const action = devSeedAction("remove", seedId, true);
  expect(action).toEqual({ kind: "remove", id: seedId });
  if (action?.kind !== "remove") throw new Error("Expected a removal action");
  const other = seedCandidate("workspace", "daily", "COP", "QA-DRAFTS-20261018-C2");
  const genuine = { ...other, id: "bank-capture", suggestion: { ...other.suggestion, description: "Genuine" } };
  const legacy = { ...other, id: "seed-groceries" };
  const result = consumeIn({ v: 1, candidates: [
    seedCandidate("workspace", "daily", "COP", seedId), other, genuine, legacy,
  ] }, action.id);
  expect(result.candidates).toEqual([other, genuine, legacy]);
});

test("switching from plant to remove for the same ID selects a distinct action", () => {
  expect(["1", "ready", "discard", "remove", "ready"].map((seed) => devSeedAction(seed, seedId, true)))
    .toEqual([{ kind: "plant", id: seedId }, { kind: "ready", id: seedId },
      { kind: "discard", id: seedId }, { kind: "remove", id: seedId }, { kind: "ready", id: seedId }]);
});

test.each(["1", "ready", "discard", "remove"])("%s is ignored outside development", (seed) => {
  expect(devSeedAction(seed, seedId, false)).toBeNull();
});

test.each([undefined, "", "seed-groceries", "QA-DRAFTS", "QA-DRAFTS-", "QA-DRAFTS-20261018-C1/other", "QA-DRAFTS-C1\n", [seedId]])(
  "missing or malformed ID %j cannot plant or remove a Candidate",
  (id) => {
    expect(devSeedAction("1", id, true)).toBeNull();
    expect(devSeedAction("ready", id, true)).toBeNull();
    expect(devSeedAction("discard", id, true)).toBeNull();
    expect(devSeedAction("remove", id, true)).toBeNull();
  },
);

test.each([undefined, "", "clear", ["1"]])("unsupported control %j does nothing", (seed) => {
  expect(devSeedAction(seed, seedId, true)).toBeNull();
});

test("discard plants only the owned content-free D1 notices and preserves other local input", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-18T22:40:27Z"));
  const id = "QA-DRAFTS-20261018-D1";
  expect(devSeedAction("discard", id, true)).toEqual({ kind: "discard", id });
  const unrelated = { reason: "Security alert", time: Date.parse("2026-10-18T20:00:00Z") } satisfies Parameters<typeof addDiscardNotice>[1];
  await addDiscardNotice("owner", unrelated);
  await addDiscardNotice("other-owner", unrelated);
  memory.set("u01.expense.owner", "two genuine local drafts");
  memory.set("u08.intake.owner", "existing Candidates");
  const before = new Map(memory);
  const expected = [unrelated,
    { reason: "Missing amount or direction", time: 1792334520000 },
    { reason: "Security alert", time: 1792279080000 },
  ];
  expect(await seedDiscardNotices("owner", id, true)).toEqual(expected);
  expect(await readDiscardNotices("owner")).toEqual(expected);
  expect(JSON.parse(memory.get(discardNoticesStorageKey("owner")) ?? "null")).toEqual(expected);
  expect(await seedDiscardNotices("owner", id, true)).toEqual(expected);
  for (const [key, value] of before) {
    if (key !== discardNoticesStorageKey("owner")) expect(memory.get(key)).toBe(value);
  }
});

test.each([
  { subject: "owner", id: "QA-DRAFTS-20261018-D1", dev: false },
  { subject: "owner", id: "genuine", dev: true },
  { subject: "owner", id: "QA-DRAFTS-20261018-D2", dev: true },
  { subject: "", id: "QA-DRAFTS-20261018-D1", dev: true },
])("discard rejects an unowned ID, missing subject, or production without touching storage %j", async ({ subject, id, dev }) => {
  memory.set(discardNoticesStorageKey("owner"), "untouched");
  expect(await seedDiscardNotices(subject, id, dev)).toBeNull();
  expect([...memory]).toEqual([[discardNoticesStorageKey("owner"), "untouched"]]);
});
