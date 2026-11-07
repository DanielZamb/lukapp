// App logos for the notification sources list. Rows ask for their own logo as
// they render; requests made in the same tick go to the native module in one
// batch. A package without a logo (not visible, uninstalled, older binary or a
// failed draw) is remembered as missing and keeps its letter tile.
import { useEffect, useSyncExternalStore } from "react";

/** The largest tile that shows a logo, in dp. Smaller tiles scale it down. */
export const APP_ICON_DP = 48;
const BATCH = 64;

type Loader = (packageNames: string[]) => Promise<Record<string, string>>;
// Loaded on first use, so screens that show a tile don't load the native module up front.
const defaultLoader: Loader = async (packageNames) =>
  (await import("../../../modules/notification-intake")).sourceIcons.list({ packageNames, size: APP_ICON_DP });

export function createAppIconStore(load: Loader = defaultLoader) {
  const icons = new Map<string, string | null>();
  const queued = new Set<string>();
  const listeners = new Set<() => void>();
  let scheduled = false;
  async function flush() {
    scheduled = false;
    while (queued.size) {
      const names = [...queued].slice(0, BATCH);
      names.forEach((name) => queued.delete(name));
      let found: Record<string, string> = {};
      try { found = await load(names); } catch { /* every name keeps its letter */ }
      let changed = false;
      for (const name of names) {
        const data = found[name] ?? null;
        icons.set(name, data);
        changed ||= data !== null;
      }
      if (changed) listeners.forEach((listener) => listener());
    }
  }
  return {
    request(packageName: string) {
      if (icons.has(packageName) || queued.has(packageName)) return;
      queued.add(packageName);
      if (!scheduled) { scheduled = true; setTimeout(() => { void flush(); }, 0); }
    },
    uri(packageName: string) {
      const data = icons.get(packageName);
      return data ? `data:image/png;base64,${data}` : undefined;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

const store = createAppIconStore();

/** The app's logo as an image URI once it has loaded, or undefined for the letter tile. */
export function useAppIcon(packageName: string | undefined, iconStore = store) {
  useEffect(() => { if (packageName) iconStore.request(packageName); }, [iconStore, packageName]);
  return useSyncExternalStore(iconStore.subscribe, () => packageName ? iconStore.uri(packageName) : undefined);
}
