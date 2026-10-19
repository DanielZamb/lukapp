import { createContext, useContext } from "react";
import { ConvexError } from "convex/values";
import { z } from "zod";

const wipeSignal = z.object({ code: z.string(), wipeLocalInput: z.literal(true) });
const movedSignal = wipeSignal.extend({ movedTo: z.string().min(1).max(80) });
export function requiresLocalWipe(error: unknown): boolean {
  return error instanceof ConvexError && wipeSignal.safeParse(error.data).success;
}
export const DeviceAccessFailure = createContext<(error: unknown) => boolean>(() => false);
export function useDeviceAccessFailure() { return useContext(DeviceAccessFailure); }

export function movedAccessLabel(error: unknown): string | undefined {
  const parsed = movedSignal.safeParse(error instanceof ConvexError ? error.data : undefined);
  return parsed.success && parsed.data.code === "device_revoked" ? parsed.data.movedTo : undefined;
}
