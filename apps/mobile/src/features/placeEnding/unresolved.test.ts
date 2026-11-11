import * as SecureStore from "expo-secure-store";
import { beforeEach, expect, test, vi } from "vitest";
import { LocalInputLease } from "../../local-auth/localInput";
import { clearLocalInput } from "../clearLocalInput";
import { keepUnresolvedEnding, readUnresolvedEnding, settleUnresolvedEnding, unresolvedEndingKey } from "./unresolved";

vi.mock("../intake/cleanup", () => ({ clearNativeIntake: async () => {} }));
const phone = new Map<string, string>();
beforeEach(() => {
  phone.clear();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => phone.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => { phone.set(key, value); });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { phone.delete(key); });
});
const cop = (minorUnits: number) => ({ currency: "COP", minorUnits });
const close = (place: string, key: string) => ({ act: "close" as const, request: { workspaceId: "ws", financialAccountProfileId: place, idempotencyKey: key,
  reviewedBalance: cop(0), reviewedAccountingDate: "2026-11-10", lines: [] } });

test("each Place keeps at most one request per user, a newer one replaces it, and only a matching key clears it", async () => {
  const lease = new LocalInputLease("owner", "session");
  await keepUnresolvedEnding(lease, close("wallet", "a"));
  await keepUnresolvedEnding(lease, close("daily", "b"));
  await keepUnresolvedEnding(lease, close("wallet", "c"));
  expect(JSON.parse(phone.get("lukapp.placeEnding.unresolved.owner")!)).toEqual({ v: 1, endings: [close("daily", "b"), close("wallet", "c")] });
  await settleUnresolvedEnding(lease, close("wallet", "a").request);
  expect(await readUnresolvedEnding("owner", "ws", "wallet")).toEqual(close("wallet", "c"));
  await settleUnresolvedEnding(lease, close("wallet", "c").request);
  expect(await readUnresolvedEnding("owner", "ws", "wallet")).toBeNull();
  expect(await readUnresolvedEnding("other-person", "ws", "daily")).toBeNull();
});

test("a stored request holds only what resending needs; anything else makes it unreadable rather than silently changed", async () => {
  phone.set(unresolvedEndingKey("owner"), JSON.stringify({ v: 1, endings: [{ ...close("wallet", "a"), names: { wallet: "Wallet" } }] }));
  await expect(readUnresolvedEnding("owner", "ws", "wallet")).rejects.toThrow("Unreadable unresolved Place endings");
});

test("signing out or losing the device wipes stored requests with the other local input", async () => {
  await keepUnresolvedEnding(new LocalInputLease("owner", "session"), close("wallet", "a"));
  await keepUnresolvedEnding(new LocalInputLease("someone", "session"), close("wallet", "b"));
  await clearLocalInput("owner");
  expect(phone.has(unresolvedEndingKey("owner"))).toBe(false);
  expect(phone.has(unresolvedEndingKey("someone"))).toBe(true);
});

test("a request answered while the phone can't delete it is left out of later reads in this run, and the next settle deletes it", async () => {
  const lease = new LocalInputLease("owner", "session");
  await keepUnresolvedEnding(lease, close("wallet", "a"));
  vi.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error("keychain delete failed"));
  await expect(settleUnresolvedEnding(lease, close("wallet", "a").request)).rejects.toThrow("keychain delete failed");
  expect(phone.has(unresolvedEndingKey("owner"))).toBe(true);
  expect(await readUnresolvedEnding("owner", "ws", "wallet")).toBeNull();
  expect(await readUnresolvedEnding("someone-else", "ws", "wallet")).toBeNull();
  await settleUnresolvedEnding(lease, close("wallet", "a").request);
  expect(phone.has(unresolvedEndingKey("owner"))).toBe(false);
  await keepUnresolvedEnding(lease, close("wallet", "a"));
  expect(await readUnresolvedEnding("owner", "ws", "wallet")).toEqual(close("wallet", "a"));
});
