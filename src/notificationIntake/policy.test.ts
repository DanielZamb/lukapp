import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { changedFields, isWipeBearingError } from "./policy";
import type { IntakeSuggestion } from "./types";

test("wipe-bearing authorization errors keep wipeLocalInput", () => {
  expect(
    isWipeBearingError(
      new ConvexError({ code: "device_revoked", wipeLocalInput: true }),
    ),
  ).toBe(true);
  expect(
    isWipeBearingError(new ConvexError({ code: "device_revoked" })),
  ).toBe(false);
  expect(isWipeBearingError(new Error("device_revoked"))).toBe(false);
});

const suggestion: IntakeSuggestion = {
  direction: "out",
  description: "Groceries",
  amount: { currency: "COP", minorUnits: 126400 },
  accountingDate: "2026-09-24",
  financialAccountProfileId: "daily",
  userCategoryIds: [],
  primaryUserCategoryId: null,
};

test.each([
  { before: ["first\0second"], after: ["first", "second"], expected: ["userCategoryIds"] },
  { before: ["first\0second", "third"], after: ["first", "second\0third"], expected: ["userCategoryIds"] },
  { before: [], after: [""], expected: ["userCategoryIds"] },
  { before: ["first", "second"], after: ["second", "first"], expected: ["userCategoryIds"] },
  { before: ["first\0second"], after: ["first\0second"], expected: [] },
  { before: [], after: [], expected: [] },
])("category evidence compares ordered elements: $before to $after", ({ before, after, expected }) => {
  expect(changedFields(
    { ...suggestion, userCategoryIds: before },
    { ...suggestion, userCategoryIds: after },
  )).toEqual(expected);
});
