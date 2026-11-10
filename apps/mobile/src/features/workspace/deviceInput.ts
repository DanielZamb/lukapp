import type { LocalInputLease } from "../../local-auth/localInput";
import { dropUnsentInCurrency, mutateLocalEntryDocument } from "../localEntryDrafts";

/** How many Drafts this phone holds for the Workspace in `currency` that were never sent. */
export function countUnsentInCurrency(lease: LocalInputLease, workspaceId: string, currency: string) {
  return mutateLocalEntryDocument(lease, lease.subject, (document, _now, dirty) => ({
    document, write: dirty, result: dropUnsentInCurrency(document, workspaceId, currency).dropped,
  }));
}

/** After a currency change, removes the unsent input typed in the previous currency. */
export function dropUnsentAfterCurrencyChange(lease: LocalInputLease, workspaceId: string, previous: string) {
  return mutateLocalEntryDocument(lease, lease.subject, (document, _now, dirty) => {
    const next = dropUnsentInCurrency(document, workspaceId, previous);
    return { document: next.document, write: dirty || next.dropped > 0, result: next.dropped };
  });
}
