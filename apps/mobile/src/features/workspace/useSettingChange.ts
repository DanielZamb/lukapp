import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useT, type MessageKey } from "../../i18n";
import type { api } from "../api";
import { useFrozenCommand } from "../useFrozenCommand";

type Commands = {
  defaultPlace: typeof api.accounting.changeDefaultPlace;
  timeZone: typeof api.accounting.changeWorkspaceTimeZone;
  functionalCurrency: typeof api.accounting.changeFunctionalCurrency;
};
export type Setting = keyof Commands;
export type SettingRequest<S extends Setting> = FunctionArgs<Commands[S]>;
export type SettingReceipt = FunctionReturnType<Commands[Setting]>;
export type WorkspaceSettingsRead = FunctionReturnType<typeof api.accounting.workspaceSettings>;
type CurrencyLock = NonNullable<WorkspaceSettingsRead["currencyChangeBlockedReason"]>;

const requests: { [S in Setting]: (workspaceId: string, value: string, expected: string, idempotencyKey: string) => SettingRequest<S> } = {
  defaultPlace: (workspaceId, financialAccountProfileId, expectedFinancialAccountProfileId, idempotencyKey) =>
    ({ workspaceId, financialAccountProfileId, expectedFinancialAccountProfileId, idempotencyKey }),
  timeZone: (workspaceId, timeZone, expectedTimeZone, idempotencyKey) =>
    ({ workspaceId, timeZone, expectedTimeZone, idempotencyKey }),
  functionalCurrency: (workspaceId, functionalCurrency, expectedFunctionalCurrency, idempotencyKey) =>
    ({ workspaceId, functionalCurrency, expectedFunctionalCurrency, idempotencyKey }),
};

const currencyLocks: Record<CurrencyLock, MessageKey> = {
  functional_currency_has_entries: "workspace.currencyHasEntries",
  functional_currency_has_records: "workspace.currencyHasRecords",
  functional_currency_already_changed: "workspace.currencyAlreadyChanged",
};

const refusals: Record<string, MessageKey> = {
  ...currencyLocks,
  default_place_stale: "workspace.defaultPlaceStale",
  financial_account_profile_not_found: "workspace.placeMissing",
  time_zone_stale: "workspace.timeZoneStale",
  time_zone_month_behind: "workspace.timeZoneMonthBehind",
  time_zone_invalid: "workspace.timeZoneInvalid",
  functional_currency_stale: "workspace.currencyStale",
  functional_currency_invalid: "workspace.currencyInvalid",
  defaults_unavailable: "workspace.notReady",
  idempotency_key_required: "workspace.rejected",
  idempotency_key_conflict: "workspace.rejected",
  authentication_required: "workspace.sessionRefused",
  session_required: "workspace.sessionRefused",
  session_inactive: "workspace.sessionRefused",
  session_verification_required: "workspace.sessionRefused",
  device_registration_required: "workspace.deviceRefused",
  device_revoked: "workspace.deviceRefused",
  membership_required: "workspace.accessRefused",
  workspace_membership_required: "workspace.accessRefused",
  permission_denied: "workspace.accessRefused",
};

/**
 * changeWorkspaceSetting (convex/personalDefaults.ts) looks for the receipt under the key first. Every refusal after
 * that, and a blank key, answers an earlier send. defaults_unavailable is also raised before the lookup, so it keeps
 * the request held, as idempotency_key_conflict does.
 */
const settling = new Set([
  "idempotency_key_required", "time_zone_invalid", "functional_currency_invalid", ...Object.keys(currencyLocks),
  "workspace_membership_required", "financial_account_profile_not_found", "financial_account_profile_ended", "place_undo_in_progress",
  "default_place_stale", "time_zone_stale", "functional_currency_stale", "time_zone_month_behind",
]);

/** The one sentence that says why the currency is read-only, chosen by the read's reason. */
export function currencyLockKey(settings: WorkspaceSettingsRead): MessageKey | null {
  if (settings.canChangeFunctionalCurrency) return null;
  return settings.currencyChangeBlockedReason ? currencyLocks[settings.currencyChangeBlockedReason] : "workspace.currencyLocked";
}

/** A structured server error is a definite refusal: the mutation rolled back. Anything else may have applied. */
function refusalCode(error: unknown) {
  const data: unknown = error instanceof ConvexError ? error.data : null;
  return data !== null && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : null;
}

export type SettingTransport<S extends Setting> = {
  send: (request: SettingRequest<S>) => Promise<SettingReceipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onDone: (receipt: SettingReceipt) => void;
};

export function useSettingChange<S extends Setting>(
  setting: S,
  seed: { workspaceId: string; current: string; describe: (value: string) => string },
  transport: SettingTransport<S>,
) {
  const { t } = useT();
  const command = useFrozenCommand<SettingRequest<S>, SettingReceipt>({
    send: transport.send, reportFailure: transport.reportFailure, onDone: transport.onDone, refusalCode,
    settles: (code) => settling.has(code),
  });
  const { state } = command;
  const current = seed.describe(seed.current);
  const error = state.name === "uncertain" ? t("workspace.uncertain")
    : state.name === "open" && state.refusal
      ? t(refusals[state.refusal.code] ?? "workspace.rejected", { current, currency: seed.current })
      : "";
  return {
    error,
    busy: command.busy,
    uncertain: state.name === "uncertain",
    locked: command.frozen,
    /** Whether a request is sending or held at the press, which a stale render cannot tell. */
    atPress: command.atPress,
    /** Sends `value` against the value last read. While the outcome is unknown it resends that exact request. */
    submit: (value: string) => command.submit(() =>
      value === seed.current ? null : requests[setting](seed.workspaceId, value, seed.current, transport.newKey())),
  };
}
