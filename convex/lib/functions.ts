import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { mutation, query } from "../_generated/server";
import { requireOwner } from "./admission";

const admission = customCtx(async (ctx) => ({
  actor: await requireOwner(ctx.auth),
}));
export const ownerQuery = customQuery(query, admission);
export const ownerMutation = customMutation(mutation, admission);
