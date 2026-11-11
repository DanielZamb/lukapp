import * as SecureStore from "expo-secure-store";
import { beforeEach, expect, test, vi } from "vitest";
import { LocalInputLease } from "../../local-auth/localInput";
import { clearLocalInput } from "../clearLocalInput";
import { keepUnresolvedEnding } from "../placeEnding/unresolved";
import { keepUnresolvedRecovery, readUnresolvedRecovery, unresolvedRecoveryKey, type UnresolvedRecovery } from "./unresolved";

vi.mock("../intake/cleanup", () => ({ clearNativeIntake: async () => {} }));
const phone = new Map<string, string>();
beforeEach(() => {
  phone.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => phone.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { phone.set(key, value); });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { phone.delete(key); });
});
const move = (planId: string, key: string, workspaceId = "ws"): UnresolvedRecovery => ({ act: "move", request: {
  workspaceId, planId, sourceFinancialAccountProfileId: "daily", amount: { currency: "COP", minorUnits: 230_000 },
  accountingDate: "2026-11-10", description: "Recovery: Laptop", idempotencyKey: key,
} });
const activation = (expenseId: string, key: string): UnresolvedRecovery => ({ act: "activate", request: {
  workspaceId: "ws", sourceJournalEntryId: expenseId, destinationFinancialAccountProfileId: "savings",
  installmentCount: 4, installmentMinorUnits: 300_000, idempotencyKey: key,
} });

test("a plan keeps one movement and an expense one activation; a newer request replaces only its own slot", async () => {
  const lease = new LocalInputLease("owner", "session");
  await keepUnresolvedRecovery(lease, move("laptop", "a"));
  await keepUnresolvedRecovery(lease, activation("laptop", "b"));
  await keepUnresolvedRecovery(lease, move("dental", "c"));
  await keepUnresolvedRecovery(lease, move("laptop", "d"));
  await keepUnresolvedRecovery(lease, move("laptop", "e", "other-ws"));
  expect(JSON.parse(phone.get("lukapp.recovery.unresolved.owner")!)).toEqual({ v: 1, requests: [
    activation("laptop", "b"), move("dental", "c"), move("laptop", "d"), move("laptop", "e", "other-ws"),
  ] });
  expect(await readUnresolvedRecovery("owner", "ws")).toEqual([activation("laptop", "b"), move("dental", "c"), move("laptop", "d")]);
  expect(await readUnresolvedRecovery("someone-else", "ws")).toEqual([]);
});

test("a stored request holds only what resending needs; anything else makes it unreadable rather than silently changed", async () => {
  const stored = move("laptop", "a");
  phone.set(unresolvedRecoveryKey("owner"), JSON.stringify({ v: 1, requests: [{ ...stored, request: { ...stored.request, title: "Laptop" } }] }));
  await expect(readUnresolvedRecovery("owner", "ws")).rejects.toThrow("Unreadable unresolved Recovery requests");
  phone.set(unresolvedRecoveryKey("owner"), JSON.stringify({ v: 2, requests: [stored] }));
  await expect(readUnresolvedRecovery("owner", "ws")).rejects.toThrow("Unreadable unresolved Recovery requests");
});

test("signing out or losing the device wipes stored Recovery requests with the other local input, for that person only", async () => {
  await keepUnresolvedRecovery(new LocalInputLease("owner", "session"), move("laptop", "a"));
  await keepUnresolvedEnding(new LocalInputLease("owner", "session"), { act: "undo", request: {
    workspaceId: "ws", financialAccountProfileId: "wallet", idempotencyKey: "u", previewFingerprint: "f",
  } });
  await keepUnresolvedRecovery(new LocalInputLease("someone", "session"), move("laptop", "b"));
  await clearLocalInput("owner");
  expect([...phone.keys()]).toEqual([unresolvedRecoveryKey("someone")]);
});

test("after the admission ends nothing more is stored, so nothing more is sent", async () => {
  const lease = new LocalInputLease("owner", "session");
  lease.deny();
  await expect(keepUnresolvedRecovery(lease, move("laptop", "a"))).rejects.toThrow("Local input admission ended");
  expect(phone.size).toBe(0);
});
