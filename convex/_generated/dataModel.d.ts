/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { DataModelFromSchemaDefinition } from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

export type TableNames = string & keyof DataModel;
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
export type Doc<TableName extends TableNames> = DataModel[TableName]["document"];
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type SystemTableNames = "_storage" | "_scheduled_functions";
