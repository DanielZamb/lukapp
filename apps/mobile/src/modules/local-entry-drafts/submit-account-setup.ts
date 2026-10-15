import { api } from "../../../../../convex/_generated/api";
import type { AccessController } from "../../access/controller";
import { commandResult } from "../../access/command-result";
import type { accountSetupStore } from "./store";

export async function submitAccountSetup(controller: Pick<AccessController, "execute">,
  store: ReturnType<typeof accountSetupStore>, id: string) {
  const draft = (await store.list()).find(draft => draft.id === id);
  if (!draft) throw new Error("Saved setup unavailable");
  let workspaceId = draft.workspaceId;
  const target = draft.target;
  if (target.kind === "household") {
    const result = await controller.execute(async (proof, rpc) => {
      const request = await proof("accounting.createHouseholdWorkspace", target.request);
      return commandResult(() => rpc.mutation(api.accounting.createHouseholdWorkspace, request));
    });
    if (result.kind === "rejected") return result;
    workspaceId = result.value.id;
  }
  const result = await controller.execute(async (proof, rpc) => {
    const request = await proof("accounting.setupFinancialAccount", { ...draft.request, workspaceId });
    return commandResult(() => rpc.mutation(api.accounting.setupFinancialAccount, request));
  });
  if (result.kind === "rejected") return result;
  await store.remove(draft.id);
  return { kind: "accepted" as const, workspaceId, opening: result.value };
}
