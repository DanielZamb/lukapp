import { expect, test } from "vitest";
import { shouldPlantDevSeed } from "./devSeed";

test("the Drafts seed is ignored outside development", () => {
  expect(shouldPlantDevSeed("1", false)).toBe(false);
  expect(shouldPlantDevSeed("1", true)).toBe(true);
  expect(shouldPlantDevSeed(undefined, true)).toBe(false);
});
