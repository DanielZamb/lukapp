import { inboxBadgeCount } from "./inboxCount";
import { useIntakeCandidates } from "./useIntakeCandidates";
import { useLocalEntryDrafts } from "./useLocalEntryDrafts";

export function useInboxCount(input: { subject: string; workspaceId: string; currency: string }) {
  const drafts = useLocalEntryDrafts(input);
  const intake = useIntakeCandidates({ ...input, currency: input.currency });
  return drafts.error || intake.error ? undefined : inboxBadgeCount(drafts.count, intake.count);
}
