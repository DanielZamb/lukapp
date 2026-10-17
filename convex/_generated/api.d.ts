/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounting from "../accounting.js";
import type * as authConnection from "../authConnection.js";
import type * as categoryValidators from "../categoryValidators.js";
import type * as clerkWebhooks from "../clerkWebhooks.js";
import type * as deviceAccess from "../deviceAccess.js";
import type * as deviceAccessInternal from "../deviceAccessInternal.js";
import type * as http from "../http.js";
import type * as lib_admission from "../lib/admission.js";
import type * as lib_clerkProvider from "../lib/clerkProvider.js";
import type * as lib_deviceAuthorization from "../lib/deviceAuthorization.js";
import type * as lib_deviceRegistry from "../lib/deviceRegistry.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_securityValues from "../lib/securityValues.js";
import type * as lib_session from "../lib/session.js";
import type * as personalDefaults from "../personalDefaults.js";
import type * as store from "../store.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounting: typeof accounting;
  authConnection: typeof authConnection;
  categoryValidators: typeof categoryValidators;
  clerkWebhooks: typeof clerkWebhooks;
  deviceAccess: typeof deviceAccess;
  deviceAccessInternal: typeof deviceAccessInternal;
  http: typeof http;
  "lib/admission": typeof lib_admission;
  "lib/clerkProvider": typeof lib_clerkProvider;
  "lib/deviceAuthorization": typeof lib_deviceAuthorization;
  "lib/deviceRegistry": typeof lib_deviceRegistry;
  "lib/functions": typeof lib_functions;
  "lib/securityValues": typeof lib_securityValues;
  "lib/session": typeof lib_session;
  personalDefaults: typeof personalDefaults;
  store: typeof store;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
