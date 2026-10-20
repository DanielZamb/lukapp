import * as SecureStore from "expo-secure-store";
import { z } from "zod";

export const DISCARD_NOTICE_TTL_MS = 15 * 24 * 60 * 60 * 1000;

const noticeSchema = z.object({
  reason: z.enum(["Missing amount or direction", "Security alert"]),
  time: z.number().int().nonnegative(),
});
export type DiscardNotice = z.infer<typeof noticeSchema>;

const pending = new Map<string, Promise<void>>();

function withStore<T>(subject: string, operation: () => Promise<T>): Promise<T> {
  const result = (pending.get(subject) ?? Promise.resolve()).then(operation);
  const settled = result.then(() => {}, () => {});
  pending.set(subject, settled);
  void settled.then(() => {
    if (pending.get(subject) === settled) pending.delete(subject);
  });
  return result;
}

export function discardNoticesStorageKey(subject: string) {
  return `u08.discard-notices.${subject}`;
}

export function clearDiscardNotices(subject: string) {
  return withStore(subject, () => SecureStore.deleteItemAsync(discardNoticesStorageKey(subject)));
}

export function readDiscardNotices(subject: string): Promise<DiscardNotice[]> {
  return withStore(subject, () => readLiveNotices(subject));
}

async function readLiveNotices(subject: string): Promise<DiscardNotice[]> {
  const raw = await SecureStore.getItemAsync(discardNoticesStorageKey(subject));
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  const notices = z.array(noticeSchema).parse(parsed);
  const now = Date.now();
  const live = notices.filter((notice) => notice.time + DISCARD_NOTICE_TTL_MS > now);
  if (live.length === 0) await SecureStore.deleteItemAsync(discardNoticesStorageKey(subject));
  else if (JSON.stringify(live) !== raw) await writeDiscardNotices(subject, live);
  return live;
}

function writeDiscardNotices(subject: string, notices: DiscardNotice[]) {
  return SecureStore.setItemAsync(discardNoticesStorageKey(subject), JSON.stringify(notices));
}

export function addDiscardNotice(subject: string, input: DiscardNotice) {
  return withStore(subject, async () => {
    const notice = noticeSchema.parse(input);
    const notices = await readLiveNotices(subject);
    if (notice.time + DISCARD_NOTICE_TTL_MS <= Date.now()) return;
    await writeDiscardNotices(subject, [...notices, notice]);
  });
}
