import { expect, test } from "vitest";
import { pendingExpenseSchema } from "./pendingExpenseSchema";

const payload = {
  workspaceId: "workspace",
  financialAccountProfileId: "cash",
  amount: { currency: "COP", minorUnits: 150000 },
  accountingDate: "2026-10-17",
  description: "Food",
  idempotencyKey: "same-expense",
};
test("saved category identity survives JSON storage and schema parsing", () => {
  const selected = { ...payload, userCategoryId: "server-category-id" };
  expect(
    pendingExpenseSchema.parse(JSON.parse(JSON.stringify(selected))),
  ).toEqual(selected);
});
test("pending expenses saved before categories remain valid", () => {
  expect(pendingExpenseSchema.parse(payload)).toEqual(payload);
  expect(
    pendingExpenseSchema.safeParse({ ...payload, userCategoryId: "" }).success,
  ).toBe(false);
});
