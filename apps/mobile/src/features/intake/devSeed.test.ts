import { expect, test } from "vitest";
import { consumeIn } from "./candidates";
import { devSeedAction, seedCandidate } from "./devSeed";

const seedId = "QA-DRAFTS-20261018-C1";

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
  expect([devSeedAction("1", seedId, true), devSeedAction("remove", seedId, true)])
    .toEqual([{ kind: "plant", id: seedId }, { kind: "remove", id: seedId }]);
});

test.each(["1", "remove"])("%s is ignored outside development", (seed) => {
  expect(devSeedAction(seed, seedId, false)).toBeNull();
});

test.each([undefined, "", "seed-groceries", "QA-DRAFTS", "QA-DRAFTS-", "QA-DRAFTS-20261018-C1/other", "QA-DRAFTS-C1\n", [seedId]])(
  "missing or malformed ID %j cannot plant or remove a Candidate",
  (id) => {
    expect(devSeedAction("1", id, true)).toBeNull();
    expect(devSeedAction("remove", id, true)).toBeNull();
  },
);

test.each([undefined, "", "clear", ["1"]])("unsupported control %j does nothing", (seed) => {
  expect(devSeedAction(seed, seedId, true)).toBeNull();
});
