import { z } from "zod";
import type { CameraCutout } from "../device/cameraCutout";
import type { LayoutTier } from "./layout";
import { pillCopy, type ContextPillContent } from "./contextPillModel";

export const islandCapabilitySchema = z.object({ supported: z.boolean(), enabled: z.boolean() });
export const islandObservationSchema = z.object({
  scope: z.string().uuid(), state: z.enum(["active", "dismissed", "ended"]), revision: z.number().int().nonnegative(),
});
export type IslandObservation = z.infer<typeof islandObservationSchema>;
export type IslandCapability = z.infer<typeof islandCapabilitySchema>;
export type IslandPayload = ReturnType<typeof islandPayload>;

export function islandExpansion(input: {
  platform: string; iosVersion: number; tier: LayoutTier; cutout: CameraCutout; capability: IslandCapability;
  nativeTransientIsland: boolean;
}): "inert" | "t7" | "native" {
  if (input.tier !== "xxxl") return "inert";
  return input.nativeTransientIsland && input.platform === "ios" && input.iosVersion >= 18 && input.cutout.kind === "island"
    && input.capability.supported && input.capability.enabled ? "native" : "t7";
}

export function islandPayload(scope: string, content: ContextPillContent) {
  const copy = pillCopy(content);
  return { scope, ...publicIslandContent(content),
    figures: copy.figures, tone: copy.tone };
}

export function publicIslandContent(content: ContextPillContent) {
  return { name: content.name, emoji: content.emoji, progress: pillCopy(content).progress };
}

export function islandReturnScope(path: string): string | null {
  try {
    const url = new URL(path, "lukapp-u01:///");
    if (url.protocol !== "lukapp-u01:" || url.hostname !== "" || url.pathname !== "/context-pill"
      || [...url.searchParams.keys()].some(key => key !== "scope") || url.searchParams.getAll("scope").length !== 1
      || url.hash) return null;
    const parsed = z.string().uuid().safeParse(url.searchParams.get("scope"));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
