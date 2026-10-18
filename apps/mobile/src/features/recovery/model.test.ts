import { expect, test } from "vitest";
import { candidateDetail, formatRate, limitsCopy, minInstallment, movedCopy, progressCopy, progressRatio, recoveryMoney, recoveryMonthName, suggestionFor } from "./model";

test("recovery amounts hide only zero cents and dates use English without a year", () => {
  expect(recoveryMoney({ currency: "COP", minorUnits: 48_000_000 })).toBe("COP 480.000");
  expect(recoveryMoney({ currency: "COP", minorUnits: 48_000_025 })).toBe("COP 480.000,25");
  expect(recoveryMonthName("2026-10")).toBe("October");
  expect(candidateDetail({ accountingDate: "2026-08-04", placeName: undefined }))
    .toBe("August 4");
});

test("the Plans suggestion uses the same split and limits as the recovery core", () => {
  expect(suggestionFor(1_200_000, 6)).toEqual({
    installmentMinorUnits: 200_000,
    minInstallmentMinorUnits: 200_000,
    maxInstallmentMinorUnits: 1_200_000,
    premiumMinorUnits: 0,
    targetMinorUnits: 1_200_000,
    valid: true,
  });
  expect(suggestionFor(1_200_000, 4, 330_000)).toEqual({
    installmentMinorUnits: 330_000,
    minInstallmentMinorUnits: 300_000,
    maxInstallmentMinorUnits: 1_200_000,
    premiumMinorUnits: 120_000,
    targetMinorUnits: 1_320_000,
    valid: true,
  });
  expect(suggestionFor(1_200_000, 6, 199_999).valid).toBe(false);
  expect(minInstallment(1_200_001, 6)).toBe(200_000);
  expect(suggestionFor(1_200_001, 6)).toMatchObject({
    installmentMinorUnits: 200_000, premiumMinorUnits: 0, targetMinorUnits: 1_200_001, valid: true,
  });
});

test("progress is recovered of the plan target, and the implied rate stays a percent", () => {
  expect(progressRatio({ recoveredMinorUnits: 230_000, targetMinorUnits: 1_380_000 })).toBeCloseTo(230_000 / 1_380_000);
  expect(formatRate(260)).toBe("2.6%");
  expect(formatRate(0)).toBe("0.0%");
  expect(progressCopy({
    id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1", sourceTitle: "Laptop repair",
    destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
    principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000,
    impliedAnnualRateBps: 150, activationMonth: "2026-09", currency: "COP",
    recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000, targetMinorUnits: 1_380_000,
    dueMinorUnits: 230_000,
  })).toBe("COP 2.300 of COP 13.800 moved back to savings");
  expect(limitsCopy("COP", suggestionFor(1_200_000, 4, 330_000))).toEqual({
    range: "Each month must be at least COP 3.000 and at most COP 12.000.",
    extra: "This schedule saves COP 1.200 extra.",
    invalid: "Enter a monthly amount between COP 3.000 and COP 12.000.",
  });
});

test("a replayed move uses server progress, and a larger transfer shows moved versus counted", () => {
  expect(movedCopy({
    currency: "COP", title: "Laptop repair",
    movedMinorUnits: 230_000, countedMinorUnits: 230_000,
    recoveredMinorUnits: 230_000, targetMinorUnits: 1_380_000,
  })).toBe("Laptop repair is now 17% recovered. The savings balance stays separate from plan progress.");
  expect(movedCopy({
    currency: "COP", title: "Laptop repair",
    movedMinorUnits: 500_000, countedMinorUnits: 230_000,
    recoveredMinorUnits: 230_000, targetMinorUnits: 1_380_000,
  })).toBe("COP 2.300 counted toward Laptop repair. Laptop repair is now 17% recovered. The savings balance stays separate from plan progress.");
});
