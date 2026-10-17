import { z } from "zod";

const base = { version: z.literal(1), installId: z.string().uuid() };
export const installMarkerSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("sign-in-required") }),
  z.object({
    ...base,
    kind: z.literal("enrolled"),
    subject: z.string().min(1),
    sessionId: z.string().min(1),
  }),
]);
export type InstallMarker = z.infer<typeof installMarkerSchema>;
export function parseInstallMarker(raw: string | null): InstallMarker | null {
  if (raw === null) return null;
  try {
    return installMarkerSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function requireNewSignIn(marker: InstallMarker): InstallMarker {
  return { version: 1, installId: marker.installId, kind: "sign-in-required" };
}
