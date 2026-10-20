import { createContext, useContext } from "react";

export const LocalEnrollment = createContext({
  ready: false,
  ensure: async (): Promise<boolean> => false,
});
export function useLocalEnrollment() { return useContext(LocalEnrollment); }
