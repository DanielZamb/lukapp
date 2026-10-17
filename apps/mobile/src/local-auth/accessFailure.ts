import { createContext, useContext } from "react";
import { ConvexError } from "convex/values";
import { z } from "zod";

const wipeSignal = z.object({ code: z.string(), wipeLocalInput: z.literal(true) });
export function requiresLocalWipe(error: unknown): boolean {
  return error instanceof ConvexError && wipeSignal.safeParse(error.data).success;
}
export const DeviceAccessFailure = createContext<(error: unknown) => boolean>(() => false);
export function useDeviceAccessFailure() { return useContext(DeviceAccessFailure); }
