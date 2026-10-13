/* eslint-disable */
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
import type * as accounting from "../accounting.js";
import type * as authConnection from "../authConnection.js";
import type * as clerkProvider from "../clerkProvider.js";
import type * as clerkWebhook from "../clerkWebhook.js";
import type * as deviceValidators from "../deviceValidators.js";
import type * as devices from "../devices.js";
import type * as http from "../http.js";
import type * as lib_clerk from "../lib/clerk.js";
import type * as lib_deviceAccess from "../lib/deviceAccess.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_personalWorkspace from "../lib/personalWorkspace.js";
import type * as lib_providerWork from "../lib/providerWork.js";
import type * as providerValidators from "../providerValidators.js";
import type * as providerWork from "../providerWork.js";
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
  authConnection: typeof authConnection;
  clerkProvider: typeof clerkProvider;
  clerkWebhook: typeof clerkWebhook;
  deviceValidators: typeof deviceValidators;
  devices: typeof devices;
  http: typeof http;
  "lib/clerk": typeof lib_clerk;
  "lib/deviceAccess": typeof lib_deviceAccess;
  "lib/owner": typeof lib_owner;
  "lib/personalWorkspace": typeof lib_personalWorkspace;
  "lib/providerWork": typeof lib_providerWork;
  providerValidators: typeof providerValidators;
  providerWork: typeof providerWork;
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
