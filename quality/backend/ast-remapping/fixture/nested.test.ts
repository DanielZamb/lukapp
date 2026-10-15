import { expect, test } from "vitest";
import { parent, chosen, mapped } from "./nested";

test("parent call leaves nine paths and all returned callbacks unexecuted", () => {
  expect(parent(99)).toBe(1);
  expect(typeof chosen(true)).toBe("function");
  expect(mapped([1, 2])).toEqual([0, 2]);
});
