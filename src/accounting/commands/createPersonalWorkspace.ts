import { provisionWorkspace } from "../workspaceProvisioning";
import type { AccountingClock, AccountingStore, Actor, Workspace } from "../types";

export function createPersonalWorkspace(
  store: AccountingStore,
  clock: AccountingClock,
  input: { actor: Actor; functionalCurrency: string; chartOfAccountsTemplate?: string },
): Promise<Workspace> {
  return provisionWorkspace(store, clock, { ...input, kind: "Personal" });
}
