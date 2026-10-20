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
import type * as accountingErrors from "../accountingErrors.js";
import type * as accountingValues from "../accountingValues.js";
import type * as accountingWrites from "../accountingWrites.js";
import type * as authConnection from "../authConnection.js";
import type * as budget from "../budget.js";
import type * as budgetErrors from "../budgetErrors.js";
import type * as budgetStore from "../budgetStore.js";
import type * as budgetValues from "../budgetValues.js";
import type * as budgetWrites from "../budgetWrites.js";
import type * as categoryValidators from "../categoryValidators.js";
import type * as clerkWebhooks from "../clerkWebhooks.js";
import type * as deviceAccess from "../deviceAccess.js";
import type * as deviceAccessInternal from "../deviceAccessInternal.js";
import type * as historyBackfill from "../historyBackfill.js";
import type * as historyStore from "../historyStore.js";
import type * as historyValidators from "../historyValidators.js";
import type * as http from "../http.js";
import type * as ledgerSummary from "../ledgerSummary.js";
import type * as ledgerSummaryBackfill from "../ledgerSummaryBackfill.js";
import type * as lib_admission from "../lib/admission.js";
import type * as lib_clerkProvider from "../lib/clerkProvider.js";
import type * as lib_deviceAuthorization from "../lib/deviceAuthorization.js";
import type * as lib_deviceRegistry from "../lib/deviceRegistry.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_securityValues from "../lib/securityValues.js";
import type * as lib_session from "../lib/session.js";
import type * as notificationIntake from "../notificationIntake.js";
import type * as notificationIntakeErrors from "../notificationIntakeErrors.js";
import type * as notificationIntakeStore from "../notificationIntakeStore.js";
import type * as notificationIntakeValues from "../notificationIntakeValues.js";
import type * as notificationIntakeWrites from "../notificationIntakeWrites.js";
import type * as personalDefaults from "../personalDefaults.js";
import type * as savingsRecovery from "../savingsRecovery.js";
import type * as savingsRecoveryErrors from "../savingsRecoveryErrors.js";
import type * as savingsRecoveryStore from "../savingsRecoveryStore.js";
import type * as savingsRecoveryValues from "../savingsRecoveryValues.js";
import type * as savingsRecoveryWrites from "../savingsRecoveryWrites.js";
import type * as store from "../store.js";
import type * as validators from "../validators.js";
import type * as workspaceBackfill from "../workspaceBackfill.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounting: typeof accounting;
  accountingErrors: typeof accountingErrors;
  accountingValues: typeof accountingValues;
  accountingWrites: typeof accountingWrites;
  authConnection: typeof authConnection;
  budget: typeof budget;
  budgetErrors: typeof budgetErrors;
  budgetStore: typeof budgetStore;
  budgetValues: typeof budgetValues;
  budgetWrites: typeof budgetWrites;
  categoryValidators: typeof categoryValidators;
  clerkWebhooks: typeof clerkWebhooks;
  deviceAccess: typeof deviceAccess;
  deviceAccessInternal: typeof deviceAccessInternal;
  historyBackfill: typeof historyBackfill;
  historyStore: typeof historyStore;
  historyValidators: typeof historyValidators;
  http: typeof http;
  ledgerSummary: typeof ledgerSummary;
  ledgerSummaryBackfill: typeof ledgerSummaryBackfill;
  "lib/admission": typeof lib_admission;
  "lib/clerkProvider": typeof lib_clerkProvider;
  "lib/deviceAuthorization": typeof lib_deviceAuthorization;
  "lib/deviceRegistry": typeof lib_deviceRegistry;
  "lib/functions": typeof lib_functions;
  "lib/securityValues": typeof lib_securityValues;
  "lib/session": typeof lib_session;
  notificationIntake: typeof notificationIntake;
  notificationIntakeErrors: typeof notificationIntakeErrors;
  notificationIntakeStore: typeof notificationIntakeStore;
  notificationIntakeValues: typeof notificationIntakeValues;
  notificationIntakeWrites: typeof notificationIntakeWrites;
  personalDefaults: typeof personalDefaults;
  savingsRecovery: typeof savingsRecovery;
  savingsRecoveryErrors: typeof savingsRecoveryErrors;
  savingsRecoveryStore: typeof savingsRecoveryStore;
  savingsRecoveryValues: typeof savingsRecoveryValues;
  savingsRecoveryWrites: typeof savingsRecoveryWrites;
  store: typeof store;
  validators: typeof validators;
  workspaceBackfill: typeof workspaceBackfill;
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
