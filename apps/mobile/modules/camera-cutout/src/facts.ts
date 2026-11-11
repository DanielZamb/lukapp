import { z } from "zod";

export type CutoutRect = { x: number; y: number; width: number; height: number };
export type CameraCutout =
  | { kind: "island"; rect: CutoutRect }
  | { kind: "centredPunchHole"; rect: CutoutRect }
  | { kind: "none"; rect: null };

export const NO_CAMERA_CUTOUT: CameraCutout = { kind: "none", rect: null };
export const MAX_CENTRE_DISTANCE_RATIO = 0.08;
export const MAX_PUNCH_HOLE_WIDTH_RATIO = 0.25;
export const FUTURE_IPHONE_ISLAND_SAFE_AREA_TOP = 59;

// UIKit exposes no public island bounds; these are conservative resting estimates.
export const ESTIMATED_ISLAND_GEOMETRY = { width: 126, height: 37 };
export const MINIMUM_ISLAND_TOP = 11;
export const ESTIMATED_ISLAND_BOTTOM_CLEARANCE = 11;
export const ESTIMATED_ISLAND_SAFE_AREA_OFFSET = ESTIMATED_ISLAND_GEOMETRY.height + ESTIMATED_ISLAND_BOTTOM_CLEARANCE;

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

const factsSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("android"),
    portrait: z.boolean(),
    windowWidth: z.number().finite().positive(),
    rects: z.array(rectSchema),
  }),
  z.object({
    platform: z.literal("ios"),
    portrait: z.boolean(),
    windowWidth: z.number().finite().positive(),
    modelIdentifier: z.string(),
    safeAreaTop: z.number().finite().nonnegative(),
  }),
  z.object({ platform: z.literal("unavailable") }),
]).nullable();

export const cutoutSnapshotSchema = z.object({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  facts: factsSchema,
});
export type CameraCutoutFacts = z.infer<typeof factsSchema>;

const ISLAND_IPHONE_IDENTIFIERS = new Set([
  "iPhone15,2", "iPhone15,3", "iPhone15,4", "iPhone15,5",
  "iPhone16,1", "iPhone16,2",
  "iPhone17,1", "iPhone17,2", "iPhone17,3", "iPhone17,4",
  "iPhone18,1", "iPhone18,2", "iPhone18,3", "iPhone18,4",
  "iPhone19,2", "iPhone19,3", "iPhone19,7",
]);
const KNOWN_NON_ISLAND_IPHONE_IDENTIFIERS = new Set(["iPhone17,5", "iPhone18,5"]);
const LAST_RESEARCHED_IPHONE_GENERATION = 19;

export function classifyAndroidCutout(input: {
  rects: CutoutRect[];
  windowWidth: number;
}): CameraCutout {
  const parsed = z.object({
    rects: z.array(rectSchema).length(1),
    windowWidth: z.number().finite().positive(),
  }).safeParse(input);
  if (!parsed.success) return NO_CAMERA_CUTOUT;
  const { rects, windowWidth } = parsed.data;
  const [rect] = rects;
  if (!rect || rect.x < 0 || rect.x + rect.width > windowWidth || rect.y > 0 || rect.y + rect.height <= 0) {
    return NO_CAMERA_CUTOUT;
  }
  const distance = Math.abs(rect.x + rect.width / 2 - windowWidth / 2);
  if (distance > windowWidth * MAX_CENTRE_DISTANCE_RATIO || rect.width >= windowWidth * MAX_PUNCH_HOLE_WIDTH_RATIO) {
    return NO_CAMERA_CUTOUT;
  }
  return { kind: "centredPunchHole", rect };
}

export function classifyCameraCutoutFacts(facts: CameraCutoutFacts): CameraCutout {
  if (!facts || facts.platform === "unavailable" || !facts.portrait) return NO_CAMERA_CUTOUT;
  if (facts.platform === "android") return classifyAndroidCutout(facts);

  const { modelIdentifier, windowWidth } = facts;
  if (!ISLAND_IPHONE_IDENTIFIERS.has(modelIdentifier)) {
    const match = /^iPhone(\d+),\d+$/.exec(modelIdentifier);
    const generation = match ? Number(match[1]) : 0;
    if (KNOWN_NON_ISLAND_IPHONE_IDENTIFIERS.has(modelIdentifier)
      || generation < LAST_RESEARCHED_IPHONE_GENERATION
      || facts.safeAreaTop < FUTURE_IPHONE_ISLAND_SAFE_AREA_TOP) return NO_CAMERA_CUTOUT;
  }
  const { width, height } = ESTIMATED_ISLAND_GEOMETRY;
  const top = Math.max(MINIMUM_ISLAND_TOP, facts.safeAreaTop - ESTIMATED_ISLAND_SAFE_AREA_OFFSET);
  if (windowWidth < width) return NO_CAMERA_CUTOUT;
  return { kind: "island", rect: { x: (windowWidth - width) / 2, y: top, width, height } };
}
