import { expect, test, vi } from "vitest";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
import { IntakeService } from "./service";
import { capture, fixture, hash } from "./service.testSupport";
import { discardCandidate } from "./discard";

const market = { ...capture, text: "Bancolombia\nCompraste $450 en MARKET CENTRO" };
const bakery = { ...capture, captureId: "capture-2", description: "Bakery", text: "Bancolombia\nCompraste $120 en PANADERIA" };

async function twoCandidates() {
  const f = fixture();
  f.setPages([{ captures: [market, bakery], nextCursor: null }]);
  await f.service.refresh();
  return f;
}

test("discarding one Candidate removes it and its notification text and keeps the other", async () => {
  const f = await twoCandidates();
  expect(await discardCandidate(f.service, "capture-1", 0)).toBe("discarded");
  expect(f.service.candidates().map((row) => row.id)).toEqual(["capture-2"]);
  expect(f.state().records.find((row) => row.id === "capture-1")).toEqual({
    kind: "terminal", id: "capture-1", digest: await hash(JSON.stringify(market)),
    recordRevision: 1, expiresAt: market.expiresAt, reason: "deleted",
  });
  expect(f.raw()).not.toContain("MARKET CENTRO");
  expect(f.raw()).toContain("PANADERIA");
});

test("after a restart the same capture is not imported again", async () => {
  const f = await twoCandidates();
  await discardCandidate(f.service, "capture-1", 0);
  f.setPages([{ captures: [market], nextCursor: null }]);
  const restarted = new IntakeService(f.deps);
  await restarted.refresh();
  expect(restarted.candidates().map((row) => row.id)).toEqual(["capture-2"]);
  expect(f.raw()).not.toContain("MARKET CENTRO");
});

test("a stale revision is refused and the changed Candidate stays as it is", async () => {
  const f = await twoCandidates();
  const row = f.service.read("capture-1");
  if (!row) throw new Error("missing Candidate");
  await f.service.updateReview(row.id, 0, { ...row.review, description: "Edited market" });
  expect(await discardCandidate(f.service, "capture-1", 0)).toBe("changed");
  expect(f.service.read("capture-1")?.review.description).toBe("Edited market");
  expect(await discardCandidate(f.service, "capture-1", 1)).toBe("discarded");
});

test("the service refuses to delete a Candidate whose confirmation was dispatched", async () => {
  const f = await twoCandidates();
  const command = await f.service.beginConfirmation("capture-1", 0);
  const frozen = f.service.read("capture-1");
  if (!frozen) throw new Error("missing Candidate");
  await expect(f.service.deleteCandidate("capture-1", frozen.recordRevision)).rejects.toThrow("Confirmation frozen");
  expect(await discardCandidate(f.service, "capture-1", frozen.recordRevision)).toBe("frozen");
  expect(f.service.read("capture-1")?.status).toMatchObject({ kind: "submitting", command });
  expect(await f.service.beginConfirmation("capture-1", 0)).toEqual(command);
});

test("a Candidate that is no longer on the phone reports gone", async () => {
  const f = await twoCandidates();
  await discardCandidate(f.service, "capture-1", 0);
  expect(await discardCandidate(f.service, "capture-1", 1)).toBe("gone");
  expect(f.service.candidates().map((row) => row.id)).toEqual(["capture-2"]);
});
