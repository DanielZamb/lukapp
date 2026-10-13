import { createContext, useContext, useSyncExternalStore } from "react";
import type { PropsWithChildren } from "react";
import type { PostedActivitySource } from "./source";

const PostedContext = createContext<PostedActivitySource | null>(null);
export function PostedActivityProvider({
  source,
  children,
}: PropsWithChildren<{ source: PostedActivitySource }>) {
  return <PostedContext value={source}>{children}</PostedContext>;
}
export function usePostedActivity() {
  const source = useContext(PostedContext);
  if (!source) throw new Error("Posted activity requires its shared provider.");
  return useSyncExternalStore(
    source.subscribe,
    source.getSnapshot,
    source.getSnapshot,
  );
}
