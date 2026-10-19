import { expect, test, vi } from "vitest";

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
import { keepIn, mutateLocalEntryDocument, type LocalEntryFacts } from "../localEntryDrafts";
import { lockWhenClear } from "./lockWhenClear";

const october = { year: 2026, month: 10 };
const facts = (accountingDate: string): LocalEntryFacts => ({
  workspaceId: "workspace",
  currency: "COP",
  entryType: "normal",
  amountText: "-1000",
  accountingDate,
  description: "Taxi",
  profileId: "cash",
  destinationId: null,
  categories: { ids: [], primaryId: null },
});
const keep = (lease: LocalInputLease, date: string) =>
  mutateLocalEntryDocument(lease, "subject", (document, now) => {
    const kept = keepIn(document, { facts: facts(date) }, now, () => `draft-${date}`);
    return { document: kept.document, write: true, result: kept.id };
  });

test("a Draft written while the lock is in flight lands after the lock, never between count and lock", async () => {
  memory.clear();
  const lease = new LocalInputLease("subject", "session");
  const order: string[] = [];
  let release: () => void = () => {};
  const lock = vi.fn(() => new Promise<void>((resolve) => {
    order.push("lock started");
    release = () => {
      order.push("lock finished");
      resolve();
    };
  }));
  const closing = lockWhenClear(lease, "subject", { workspaceId: "workspace", period: october }, lock);
  await vi.waitFor(() => expect(lock).toHaveBeenCalledTimes(1));
  const writing = keep(lease, "2026-10-20").then(() => order.push("draft written"));
  await Promise.resolve();
  expect(order).toEqual(["lock started"]);
  release();
  expect(await closing).toBe(0);
  await writing;
  expect(order).toEqual(["lock started", "lock finished", "draft written"]);
});

test("a Draft dated in the month blocks the lock; one dated elsewhere does not", async () => {
  memory.clear();
  const lease = new LocalInputLease("subject", "session");
  await keep(lease, "2026-11-01");
  const lock = vi.fn(async () => undefined);
  expect(await lockWhenClear(lease, "subject", { workspaceId: "workspace", period: october }, lock)).toBe(0);
  expect(lock).toHaveBeenCalledTimes(1);
  await keep(lease, "2026-10-15");
  expect(await lockWhenClear(lease, "subject", { workspaceId: "workspace", period: october }, lock)).toBe(1);
  expect(lock).toHaveBeenCalledTimes(1);
});
