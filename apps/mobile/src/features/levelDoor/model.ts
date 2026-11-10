import { z } from "zod";

/**
 * Level 1 opens through a second Place or a Budget limit. A removed limit keeps it open, so removing the only limit
 * neither steps Home back down nor replays the unlock when a limit is set again.
 */
export function experienceLevel(accountCount: number, budget: { jars: readonly unknown[]; removedLimits: readonly unknown[] } | undefined) {
  return accountCount >= 2 || (budget?.jars.length ?? 0) + (budget?.removedLimits.length ?? 0) > 0 ? 1 : 0;
}

export const levelUnlockSchema = z.discriminatedUnion("door", [
  z.object({ door: z.literal("account"), accountName: z.string().optional() }),
  z.object({
    door: z.literal("budget"), category: z.string(), emoji: z.string(),
    color: z.string().regex(/^#[\da-f]{6}$/i), currency: z.string(),
    limitMinorUnits: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
]);

export type LevelUnlock = z.infer<typeof levelUnlockSchema>;
