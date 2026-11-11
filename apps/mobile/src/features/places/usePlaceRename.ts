import { useState } from "react";
import { hasVisibleText } from "../../../../../src/accounting/names";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT, type MessageKey } from "../../i18n";
import type { api } from "../api";
import { useFrozenCommand } from "../useFrozenCommand";

type Request = FunctionArgs<typeof api.accounting.renameAccount>;
type Receipt = FunctionReturnType<typeof api.accounting.renameAccount>;
export type PlaceRenameTransport = {
  rename: (request: Request) => Promise<Receipt>;
  reportFailure: (error: unknown) => boolean;
  onRenamed: (receipt: Receipt) => void;
};

const refusals: Record<string, MessageKey> = {
  name_required: "planning.renameBlank",
  account_name_too_long: "planning.renameTooLong",
  account_name_conflict: "planning.renameConflict",
  account_name_stale: "planning.renameStale",
  financial_account_profile_not_found: "planning.renameMissing",
};

/**
 * renameAccount (src/accounting/commands/renameAccount.ts) answers with the Place itself once it carries the name.
 * It refuses a blank, long or unknown target from the request alone, and a stale or taken name only after finding the
 * Place without the name, so those answer an earlier send. An ended or undoing Place is checked before that and keeps it held.
 */
const settling = new Set(["name_required", "account_name_too_long", "account_name_stale", "account_name_conflict", "financial_account_profile_not_found"]);

export function usePlaceRename(
  seed: { workspaceId: string; profileId: string; storedName: string; initialName: string },
  transport: PlaceRenameTransport,
) {
  const { t } = useT();
  const [name, setName] = useState(seed.initialName);
  const command = useFrozenCommand({ send: transport.rename, reportFailure: transport.reportFailure, onDone: transport.onRenamed,
    settles: (code) => settling.has(code) });
  const trimmed = hasVisibleText(name) ? name.trim() : "";
  const { state } = command;
  const error = state.name === "uncertain" ? t("planning.renameUncertain")
    : state.name === "open" && state.refusal
      ? t(refusals[state.refusal.code] ?? "planning.renameRejected", { name: state.refusal.request.name, current: seed.storedName })
      : !trimmed ? t("planning.renameBlank") : "";
  return {
    name,
    error,
    busy: command.busy,
    pending: state.name === "uncertain",
    editable: !command.frozen,
    canDismiss: !command.frozen,
    canSubmit: !command.busy && (state.name === "uncertain" || (!!trimmed && trimmed !== seed.storedName)),
    onName: (value: string) => { if (command.canEdit()) setName(value); },
    submit: () => command.submit(() => !trimmed || trimmed === seed.storedName ? null : {
      workspaceId: seed.workspaceId,
      financialAccountProfileId: seed.profileId,
      name: trimmed,
      expectedName: seed.storedName,
    }),
  };
}
