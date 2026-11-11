import { clearPendingExpense } from "./localEntryDrafts";
import { clearNativeIntake } from "./intake/cleanup";
import { clearReportDraft } from "./feedback/draftStore";
import { clearUnresolvedEndings } from "./placeEnding/unresolved";

const fileWipes = new Set<() => Promise<void>>();

/**
 * Local input kept in files rather than SecureStore joins the wipe here. The
 * owning module registers once at load, because the wipe runs while the
 * unlocked screens (and their providers) are already gone.
 */
export function wipeFilesWithLocalInput(wipe: () => Promise<void>) {
  fileWipes.add(wipe);
}

export async function clearLocalInput(subject: string) {
  await Promise.all([
    clearPendingExpense(subject),
    clearNativeIntake(subject),
    clearReportDraft(subject),
    clearUnresolvedEndings(subject),
    ...[...fileWipes].map((wipe) => wipe()),
  ]);
}
