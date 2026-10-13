import type { ConvexHttpClient } from "convex/browser";
import type { Rpc } from "./controller";

export function requestScopedRpc(createClient: () => Promise<ConvexHttpClient>): Rpc {
  return {
    query: async (reference, args, guard) => {
      const client = await createClient();
      try { guard?.(); return await client.query(reference, args); }
      finally { client.clearAuth(); }
    },
    mutation: async (reference, args, guard) => {
      const client = await createClient();
      try { guard?.(); return await client.mutation(reference, args); }
      finally { client.clearAuth(); }
    },
    action: async (reference, args, guard) => {
      const client = await createClient();
      try { guard?.(); return await client.action(reference, args); }
      finally { client.clearAuth(); }
    },
  };
}
