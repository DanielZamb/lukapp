import { islandReturnScope } from "./contextIslandModel";

let current: ((scope: string) => boolean) | null = null;
export function registerIslandReturn(handler: (scope: string) => boolean) {
  current = handler;
  return () => { if (current === handler) current = null; };
}
export function routeIslandIntent({ path, initial }: { path: string; initial: boolean }): string | null {
  const scope = islandReturnScope(path);
  if (scope) return !initial && current?.(scope) ? null : "/";
  if (/context-pill/.test(path)) return "/";
  return path;
}
