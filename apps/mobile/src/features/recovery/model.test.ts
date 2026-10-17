import { expect, test } from "vitest";
import { formatRate, limitsCopy, minInstallment, movedCopy, progressCopy, progressRatio, suggestionFor } from "./model";

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
  })).toBe("COP 2.300,00 of COP 13.800,00 moved back to savings");
  expect(limitsCopy("COP", suggestionFor(1_200_000, 4, 330_000))).toEqual({
    range: "Each month must be at least COP 3.000,00 and at most COP 12.000,00.",
    extra: "This schedule saves COP 1.200,00 extra.",
    invalid: "Enter a monthly amount between COP 3.000,00 and COP 12.000,00.",
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
  })).toBe("COP 2.300,00 counted toward Laptop repair. Laptop repair is now 17% recovered. The savings balance stays separate from plan progress.");
});
