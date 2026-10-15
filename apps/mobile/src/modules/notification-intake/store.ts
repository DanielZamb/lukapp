import { z } from "zod";
import type { LocalInputCustody } from "../local-entry-drafts/store";

const candidate = z.object({
  kind: z.literal("candidate"), id: z.string(), workspaceId: z.string(),
  stage: z.enum(["review", "ready"]), description: z.string(),
});
export type Candidate = z.infer<typeof candidate>;
export function candidateStore(native: LocalInputCustody, generation: number, workspaceId: string) {
  return {
    list: async () => (await native.inputList("candidate", generation)).map(value => {
      const parsed = candidate.parse(JSON.parse(value));
      if (parsed.workspaceId !== workspaceId) throw new Error("Candidate ownership mismatch");
      return parsed;
    }),
    remove: (id: string) => native.inputDelete("candidate", id, generation),
  };
}
