import { api } from "../../../../../convex/_generated/api";
import type { AccessController } from "../../access/controller";
import type { PhoneSummary, PostedActivityRow, PostedTransport } from "./source";
import { functionalCurrencyDigits } from "../../../../../src/accounting/currencies";

export function formatMoney(currency: string, minorUnits: number) {
  const digits = functionalCurrencyDigits(currency);
  const scale = 10 ** digits;
  const absolute = Math.abs(minorUnits);
  const fraction = absolute % scale;
  const whole = (absolute - fraction) / scale;
  return (minorUnits < 0 ? "-" : "") + currency + "\u00a0" + new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(whole) +
    (digits ? "." + String(fraction).padStart(digits, "0") : "");
}
export function accountRows(phone: PhoneSummary, profileId: string): PostedActivityRow[] {
  const profile = phone.profiles.find(p => p.id === profileId);
  if (!profile) return [];
  return phone.entries.filter(entry => !entry.reversesEntryId &&
    entry.lines.some(line => line.financialAccountProfileId === profileId))
    .sort((a, b) => b.accountingDate.localeCompare(a.accountingDate) || b.postedAt - a.postedAt)
    .map(entry => ({
      id: entry.id, title: entry.description,
      supporting: entry.accountingDate + (entry.reversedByEntryId ? " · Reversed" : ""),
      signedAmount: formatMoney(phone.workspace.functionalCurrency, entry.lines
        .filter(line => line.financialAccountProfileId === profileId)
        .reduce((sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits, 0)),
    }));
}
export function phoneTransport(controller: AccessController): PostedTransport {
  return { subscribe: (workspaceId, receive) => {
    let cancelled = false;
    void controller.execute(async (proof, rpc) => {
      const request = await proof("accounting.phoneSummary", { workspaceId });
      return rpc.query(api.accounting.phoneSummary, request);
    }).then(phone => {
      if (cancelled) return;
      const first = phone.profiles[0];
      receive({ kind: "ready", phone, rows: first ? accountRows(phone, first.id) : [] });
    }).catch(() => { if (!cancelled) receive({ kind: "failed", message: "Reconnect and unlock to load your money." }); });
    return () => { cancelled = true; };
  } };
}
