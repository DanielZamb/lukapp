import { placeStatus } from "../placeState";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor, FinancialAccountProfile, PlaceStatus } from "../types";
import { toProfile } from "../views";

export async function listFinancialAccountProfiles(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; status?: PlaceStatus | "all" },
): Promise<FinancialAccountProfile[]> {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const profiles = await store.listProfiles(input.workspaceId);
  return profiles.filter(profile => input.status === "all" || placeStatus(profile) === (input.status ?? "open")).map(toProfile);
}
