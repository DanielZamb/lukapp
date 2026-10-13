import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { openWorkspace } from "../queries/openWorkspace";
import type { AccountingClock, AccountingStore, Actor, Workspace } from "../types";
import {
  provisionWorkspace,
  workspaceConfiguration,
} from "../workspaceProvisioning";

export async function createHouseholdWorkspace(
  store: AccountingStore,
  clock: AccountingClock,
  input: {
    actor: Actor;
    functionalCurrency: string;
    chartOfAccountsTemplate?: string;
    idempotencyKey: string;
  },
): Promise<Workspace> {
  if (!input.idempotencyKey.trim()) {
    throw new AccountingError("idempotency_key_required");
  }
  const existingId = await store.findHouseholdWorkspaceByKey(
    input.actor.userId,
    input.idempotencyKey,
  );
  if (existingId) {
    const workspace = await requireWorkspace(
      store,
      existingId,
      input.actor,
      "administerMembership",
    );
    const { functionalCurrency, template } = workspaceConfiguration({
      ...input,
      kind: "Household",
    });
    if (
      workspace.kind !== "Household" ||
      workspace.functionalCurrency !== functionalCurrency ||
      workspace.chartOfAccountsTemplate !== template.version
    ) {
      throw new AccountingError("idempotency_key_conflict");
    }
    return openWorkspace(store, clock, {
      actor: input.actor,
      workspaceId: existingId,
    });
  }
  const workspace = await provisionWorkspace(store, clock, {
    ...input,
    kind: "Household",
  });
  await store.saveHouseholdWorkspaceCreation({
    ownerUserId: input.actor.userId,
    idempotencyKey: input.idempotencyKey,
    workspaceId: workspace.id,
  });
  return workspace;
}
