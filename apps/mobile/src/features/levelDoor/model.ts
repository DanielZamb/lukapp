import { z } from "zod";

export function experienceLevel(accountCount: number, limitCount: number) {
  return accountCount >= 2 || limitCount > 0 ? 1 : 0;
}

export const levelUnlockSchema = z.discriminatedUnion("door", [
  z.object({ door: z.literal("account"), accountName: z.string().default("The new place") }),
  z.object({
    door: z.literal("budget"), category: z.string(), emoji: z.string(),
    color: z.string().regex(/^#[\da-f]{6}$/i), currency: z.string(),
    limitMinorUnits: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
]);

export type LevelUnlock = z.infer<typeof levelUnlockSchema>;
