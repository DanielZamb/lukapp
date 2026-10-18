import { afterEach, expect, test, vi } from "vitest";
import { consumeIn, isReadyCandidate } from "./candidates";
import { devSeedAction, readySeedCandidate, seedCandidate } from "./devSeed";

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
  expect(["1", "ready", "remove", "ready"].map((seed) => devSeedAction(seed, seedId, true)))
    .toEqual([{ kind: "plant", id: seedId }, { kind: "ready", id: seedId },
      { kind: "remove", id: seedId }, { kind: "ready", id: seedId }]);
});

test.each(["1", "ready", "remove"])("%s is ignored outside development", (seed) => {
  expect(devSeedAction(seed, seedId, false)).toBeNull();
});

test.each([undefined, "", "seed-groceries", "QA-DRAFTS", "QA-DRAFTS-", "QA-DRAFTS-20261018-C1/other", "QA-DRAFTS-C1\n", [seedId]])(
  "missing or malformed ID %j cannot plant or remove a Candidate",
  (id) => {
    expect(devSeedAction("1", id, true)).toBeNull();
    expect(devSeedAction("ready", id, true)).toBeNull();
    expect(devSeedAction("remove", id, true)).toBeNull();
  },
);

test.each([undefined, "", "clear", ["1"]])("unsupported control %j does nothing", (seed) => {
  expect(devSeedAction(seed, seedId, true)).toBeNull();
});
