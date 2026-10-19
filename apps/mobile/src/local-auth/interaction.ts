import { createContext, useContext } from "react";

export const LocalEntryInteraction = createContext<() => void>(() => {});
// Input owners call this for keyboard edits, which do not bubble through root touches.
export function useLocalEntryInteraction() {
  return useContext(LocalEntryInteraction);
}
