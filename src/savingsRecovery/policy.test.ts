import { expect, test } from "vitest";
import { impliedMonthlyRateBps, minInstallment, suggestContribution } from "./policy";

test("the default suggestion is the zero-rate split that still covers the principal", () => {
  expect(suggestContribution({ principalMinorUnits: 1_200_000, installmentCount: 6 })).toEqual({
    principalMinorUnits: 1_200_000,
    installmentCount: 6,
    installmentMinorUnits: 200_000,
    minInstallmentMinorUnits: 200_000,
    maxInstallmentMinorUnits: 1_200_000,
    impliedAnnualRateBps: 0,
    premiumMinorUnits: 0,
    targetMinorUnits: 1_200_000,
  });
  expect(minInstallment(1_200_001, 6)).toBe(200_000);
  expect(suggestContribution({ principalMinorUnits: 1_200_001, installmentCount: 6 })).toEqual({
    principalMinorUnits: 1_200_001,
    installmentCount: 6,
    installmentMinorUnits: 200_000,
    minInstallmentMinorUnits: 200_000,
    maxInstallmentMinorUnits: 1_200_001,
    impliedAnnualRateBps: 0,
    premiumMinorUnits: 0,
    targetMinorUnits: 1_200_001,
  });
});

test("an edited amount above the split reports extra saving and a positive monthly rate", () => {
  const four = suggestContribution({
    principalMinorUnits: 1_200_000, installmentCount: 4, installmentMinorUnits: 330_000,
  });
  expect(four).toMatchObject({
    installmentMinorUnits: 330_000,
    minInstallmentMinorUnits: 300_000,
    premiumMinorUnits: 120_000,
    targetMinorUnits: 1_320_000,
  });
  expect(four.impliedAnnualRateBps).toBeGreaterThan(0);
  const six = suggestContribution({
    principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000,
  });
  expect(six).toMatchObject({ premiumMinorUnits: 180_000, targetMinorUnits: 1_380_000 });
  expect(six.impliedAnnualRateBps).toBeGreaterThan(four.impliedAnnualRateBps);
});

test("the implied rate is the monthly charge in basis points", () => {
  const principal = 2_181_700;
  const monthly = 0.026;
  const growth = (1 + monthly) ** 8;
  const payment = Math.round((principal * monthly * growth) / (growth - 1));
  expect(impliedMonthlyRateBps(principal, 8, payment)).toBeCloseTo(260, -1);
  expect(suggestContribution({
    principalMinorUnits: principal, installmentCount: 8, installmentMinorUnits: payment,
  }).impliedAnnualRateBps).toBe(impliedMonthlyRateBps(principal, 8, payment));
});

test("suggestion math names its inputs and rejects amounts that cannot finish the plan", () => {
  expect(() => suggestContribution({ principalMinorUnits: 1_200_000, installmentCount: 5 }))
    .toThrowError("installment_count_invalid");
  expect(() => suggestContribution({
    principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 199_999,
  })).toThrowError("installment_below_minimum");
  expect(() => suggestContribution({
    principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 1_200_001,
  })).toThrowError("installment_above_principal");
  expect(() => suggestContribution({ principalMinorUnits: 0, installmentCount: 6 }))
    .toThrowError("amount_must_be_positive");
});
