export function inboxBadgeCount(
  draftsCount: number | null,
  intakeCount: number | null,
) {
  if (draftsCount === null || intakeCount === null) return undefined;
  return draftsCount + intakeCount;
}
