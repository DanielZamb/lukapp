import { runLocalInputWrite, type LocalInputLease } from "../../local-auth/localInput";
import { countDraftsInMonth, parseLocalEntryDocument, readRaw } from "../localEntryDrafts";
import type { ClosePeriod } from "./model";

// Counts Drafts dated in the period and locks only when there are none. The local input lease
// is held across both, so a Draft write queued meanwhile runs after the lock, never between.
export async function lockWhenClear(
  lease: LocalInputLease,
  subject: string,
  input: { workspaceId: string; period: ClosePeriod },
  lock: (input: { workspaceId: string; period: ClosePeriod }) => Promise<unknown>,
): Promise<number> {
  let found = 0;
  await runLocalInputWrite(lease, async () => {
    const now = Date.now();
    const parsed = parseLocalEntryDocument(await readRaw(subject), now);
    found = countDraftsInMonth(parsed.document, input.workspaceId, input.period, now);
    if (found === 0) await lock(input);
  });
  return found;
}
