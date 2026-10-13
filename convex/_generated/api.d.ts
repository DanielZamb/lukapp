/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as budget from "../budget.js";
import type * as accounting from "../accounting.js";
import type * as authConnection from "../authConnection.js";
import type * as deviceValidators from "../deviceValidators.js";
import type * as devices from "../devices.js";
import type * as lib_deviceAccess from "../lib/deviceAccess.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_personalWorkspace from "../lib/personalWorkspace.js";
import type * as store from "../store.js";
import type * as validators from "../validators.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  accounting: typeof accounting;
  budget: typeof budget;
  authConnection: typeof authConnection;
  deviceValidators: typeof deviceValidators;
  devices: typeof devices;
  "lib/deviceAccess": typeof lib_deviceAccess;
  "lib/owner": typeof lib_owner;
  "lib/personalWorkspace": typeof lib_personalWorkspace;
  store: typeof store;
  validators: typeof validators;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
