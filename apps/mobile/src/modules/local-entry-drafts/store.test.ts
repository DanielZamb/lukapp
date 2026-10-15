import { describe, expect, it } from "vitest";
import { draftStore, accountSetupStore } from "./store";
import type { ExpenseDraft, LocalInputCustody } from "./store";
import type { AccountSetupDraft } from "./account-setup";
import { candidateStore } from "../notification-intake/store";

function ownershipDouble() {
  const owners = { draft: new Map<string, string>(), candidate: new Map<string, string>() };
  let open = true;
  const native: LocalInputCustody = {
    inputPut: async (owner, id, content) => { if (!open) throw new Error("native_locked"); owners[owner].set(id, content); },
    inputList: async owner => { if (!open) throw new Error("native_locked"); return [...owners[owner].values()]; },
    inputDelete: async (owner, id) => { if (!open) throw new Error("native_locked"); owners[owner].delete(id); },
  };
  return { native, close: () => { open = false; } };
}
const confirmed: ExpenseDraft = { kind: "expense", stage: "confirmed", id: "draft1", workspaceId: "workspace1",
  request: { workspaceId: "workspace1", financialAccountProfileId: "cash1", amount: { currency: "COP", minorUnits: 125000 },
    accountingDate: "2026-10-13", description: "Coffee", idempotencyKey: "draft1" } };
describe("Draft and Candidate ownership above native encryption", () => {
  it("keeps a confirmed request and its command key immutable for retry", async () => {
    const { native } = ownershipDouble(); const drafts = draftStore(native, 1, "workspace1");
    await drafts.put(confirmed); await drafts.put(confirmed);
    expect(await drafts.list()).toEqual([confirmed]);
    await expect(drafts.put({ ...confirmed, request: { ...confirmed.request, amount: { currency: "COP", minorUnits: 1 } } })).rejects.toThrow("Confirmed request cannot change");
    await expect(drafts.put({ ...confirmed, request: { ...confirmed.request, idempotencyKey: "other" } })).rejects.toThrow("Draft ownership mismatch");
    expect(await drafts.list()).toEqual([confirmed]);
    await drafts.remove("draft1"); expect(await drafts.list()).toEqual([]);
  });
  it("keeps Candidates out of Drafts and rejects cross-Workspace reads without deleting them", async () => {
    const { native } = ownershipDouble();
    const candidate = { kind: "candidate", id: "candidate1", workspaceId: "workspace1", stage: "review", description: "Synthetic foundation input" };
    await native.inputPut("candidate", "candidate1", JSON.stringify(candidate), 1);
    await draftStore(native, 1, "workspace1").put(confirmed);
    expect(await candidateStore(native, 1, "workspace1").list()).toEqual([candidate]);
    expect(await draftStore(native, 1, "workspace1").list()).toEqual([confirmed]);
    await expect(candidateStore(native, 1, "workspace2").list()).rejects.toThrow("Candidate ownership mismatch");
    await expect(draftStore(native, 1, "workspace2").list()).rejects.toThrow("Draft ownership mismatch");
    expect(await candidateStore(native, 1, "workspace1").list()).toEqual([candidate]);
  });
  it("cannot read or save either owner after the native gate closes", async () => {
    const { native, close } = ownershipDouble(); await draftStore(native, 1, "workspace1").put(confirmed);
    close();
    await expect(draftStore(native, 1, "workspace1").list()).rejects.toThrow("native_locked");
    await expect(candidateStore(native, 1, "workspace1").list()).rejects.toThrow("native_locked");
    await expect(draftStore(native, 1, "workspace1").put(confirmed)).rejects.toThrow("native_locked");
  });
  it("restores immutable Household and account setup facts after owner replacement without mixing Expense or Candidate records", async () => {
    const { native } = ownershipDouble();
    const setup: AccountSetupDraft = { kind: "account-setup", stage: "confirmed", id: "setup1", workspaceId: "workspace1",
      target: { kind: "household", request: { functionalCurrency: "COP", idempotencyKey: "setup1-household", now: 1791892800000 } },
      request: { name: "Household cash", productKind: "cash", amount: { currency: "COP", minorUnits: 1000000 },
        accountingDate: "2026-10-13", description: "Start tracking", idempotencyKey: "setup1-account" } };
    await accountSetupStore(native, 1, "workspace1").put(setup);
    await draftStore(native, 1, "workspace1").put(confirmed);
    const restarted = accountSetupStore(native, 2, "workspace1");
    expect(await restarted.list()).toEqual([setup]);
    expect(await draftStore(native, 2, "workspace1").list()).toEqual([confirmed]);
    expect(await candidateStore(native, 2, "workspace1").list()).toEqual([]);
    await expect(restarted.put({ ...setup, target: { kind: "household", request: { functionalCurrency: "COP", idempotencyKey: "setup1-household", now: 1791892800001 } } })).rejects.toThrow("Confirmed request cannot change");
    await expect(restarted.put({ ...setup, request: { ...setup.request, idempotencyKey: "new-command" } })).rejects.toThrow("Setup retry identity mismatch");
    expect(await restarted.list()).toEqual([setup]);
    await expect(accountSetupStore(native, 2, "other-workspace").list()).rejects.toThrow("Draft ownership mismatch");
    await restarted.remove(setup.id);
    expect(await restarted.list()).toEqual([]);
    expect(await draftStore(native, 2, "workspace1").list()).toEqual([confirmed]);
  });
});
