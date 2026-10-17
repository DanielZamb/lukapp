import { createContext, useContext } from "react";

export const LocalInstallation = createContext<string | null>(null);
export function useLocalInstallId(): string {
  const installId = useContext(LocalInstallation);
  if (!installId)
    throw new Error("Local unlock is required before device admission");
  return installId;
}
