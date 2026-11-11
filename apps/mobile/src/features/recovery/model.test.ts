import { expect, test } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
import { candidateDetail, correctionTargets, isCancellable, formatRate, limitsCopy, minInstallment, movedCopy, plansDoorDetail, progressCopy, progressRatio, recoveryMoney, recoveryMonthName, suggestionFor, type RecoveryPlanView } from "./model";

const en = createTranslator("en");
const es = createTranslator("es");

test("recovery amounts hide only zero cents and dates use English without a year", () => {
  expect(recoveryMoney({ currency: "COP", minorUnits: 48_000_000 })).toBe("COP 480.000");
  expect(recoveryMoney({ currency: "COP", minorUnits: 48_000_025 })).toBe("COP 480.000,25");
  expect(recoveryMonthName("2026-10", en)).toBe("October");
  expect(candidateDetail({ accountingDate: "2026-08-04", placeName: undefined }, en))
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
    canCancel: true, acceptsContributions: true, cancellation: undefined, replacesPlanId: undefined, replacedByPlanId: undefined, contributionHistory: [],
    status: "active", id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1", sourceTitle: "Laptop repair",
    destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
    principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000,
    impliedAnnualRateBps: 150, activationDate: "2026-09-01", activationMonth: "2026-09", currency: "COP",
    recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000, targetMinorUnits: 1_380_000,
    dueMinorUnits: 230_000,
  }, en.t)).toBe("COP 2.300 of COP 13.800 moved back to savings");
  expect(limitsCopy("COP", suggestionFor(1_200_000, 4, 330_000), en.t)).toEqual({
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
  }, en.t)).toBe("Your Laptop repair plan is now 17% complete. Your savings place's balance is separate from plan progress.");
  expect(movedCopy({
    currency: "COP", title: "Laptop repair",
    movedMinorUnits: 500_000, countedMinorUnits: 230_000,
    recoveredMinorUnits: 230_000, targetMinorUnits: 1_380_000,
  }, en.t)).toBe("COP 2.300 counted toward Laptop repair. Your Laptop repair plan is now 17% complete. Your savings place's balance is separate from plan progress.");
});

test("only plans the server will accept are offered as targets, and never another plan for the same expense", () => {
  const base = {
    destinationFinancialAccountProfileId: "savings", remainingMinorUnits: 500_000, activationDate: "2026-06-01", activationMonth: "2026-06",
    acceptsContributions: true, sourceJournalEntryId: "expense-b",
  };
  const from = { ...base, id: "from", sourceJournalEntryId: "expense-a" };
  const plans = [
    from,
    { ...base, id: "open" },
    { ...base, id: "replacement-of-from", sourceJournalEntryId: "expense-a" },
    { ...base, id: "closed-to-contributions", acceptsContributions: false },
    { ...base, id: "other-destination", destinationFinancialAccountProfileId: "wallet" },
    { ...base, id: "too-small", remainingMinorUnits: 100_000 },
    { ...base, id: "started-later", activationDate: "2026-10-01", activationMonth: "2026-10" },
  ] as unknown as Parameters<typeof correctionTargets>[0];
  expect(correctionTargets(plans, plans[0], { amountMinorUnits: 300_000, contributionDate: "2026-09-18" }).map((plan) => plan.id))
    .toEqual(["open"]);
});

test("cancel is offered exactly when the server says the plan can be cancelled", () => {
  expect(isCancellable({ canCancel: true })).toBe(true);
  expect(isCancellable({ canCancel: false })).toBe(false);
});

const laptopPlan = {
  canCancel: true, acceptsContributions: true, cancellation: undefined, replacesPlanId: undefined, replacedByPlanId: undefined, contributionHistory: [],
  status: "active", id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1", sourceTitle: "Laptop repair",
  destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000,
  impliedAnnualRateBps: 150, activationDate: "2026-09-01", activationMonth: "2026-09", currency: "COP",
  recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000, targetMinorUnits: 1_380_000,
  dueMinorUnits: 230_000,
} satisfies RecoveryPlanView;

test("month names and expense dates follow the language and stay on the stored calendar day", () => {
  expect(recoveryMonthName("2026-01", en)).toBe("January");
  expect(recoveryMonthName("2026-01", es)).toBe("enero");
  expect(recoveryMonthName("2026-12", es)).toBe("diciembre");
  expect(candidateDetail({ accountingDate: "2026-08-04", placeName: "Daviplata" }, en)).toBe("August 4 · Daviplata");
  expect(candidateDetail({ accountingDate: "2026-08-04", placeName: "Daviplata" }, es)).toBe("4 de agosto · Daviplata");
  expect(candidateDetail({ accountingDate: "2026-12-31", placeName: undefined }, es)).toBe("31 de diciembre");
});

test("the proposal limits explain the range and the extra saving in Spanish with exact amounts", () => {
  expect(limitsCopy("COP", suggestionFor(1_200_000, 4, 330_000), es.t)).toEqual({
    range: "Cada mes puedes pasar mínimo COP 3.000 y máximo COP 12.000.",
    extra: "Con este plan terminas ahorrando COP 1.200 de más.",
    invalid: "Escribe un monto por mes entre COP 3.000 y COP 12.000.",
  });
  expect(limitsCopy("COP", suggestionFor(1_200_000, 4), en.t).extra).toBe("This schedule replenishes the expense with no extra.");
  expect(limitsCopy("COP", suggestionFor(1_200_000, 4), es.t).extra).toBe("Con este plan recuperas justo lo del gasto, sin nada de más.");
});

test("progress and moved copy read as whole Spanish sentences", () => {
  expect(progressCopy(laptopPlan, es.t)).toBe("COP 2.300 de COP 13.800 recuperados");
  expect(progressCopy({ ...laptopPlan, status: "suspended" }, en.t)).toBe("Suspended · COP 2.300 moved back to savings");
  expect(progressCopy({ ...laptopPlan, status: "suspended" }, es.t)).toBe("Suspendido · COP 2.300 recuperados");
  const moved = { currency: "COP", title: "Arreglo del portátil", recoveredMinorUnits: 230_000, targetMinorUnits: 1_380_000 };
  expect(movedCopy({ ...moved, movedMinorUnits: 230_000, countedMinorUnits: 230_000 }, es.t))
    .toBe("Tu plan Arreglo del portátil ya va en el 17%. El saldo de tu lugar de ahorro va aparte del avance del plan.");
  expect(movedCopy({ ...moved, movedMinorUnits: 500_000, countedMinorUnits: 230_000 }, es.t))
    .toBe("COP 2.300 cuentan para Arreglo del portátil. Tu plan Arreglo del portátil ya va en el 17%. El saldo de tu lugar de ahorro va aparte del avance del plan.");
});

test("the Plans door names one active plan, counts several and invites a first one", () => {
  const second = { ...laptopPlan, id: "plan-2", title: "Nevera" };
  expect(plansDoorDetail([], en)).toBe("Start from an expense");
  expect(plansDoorDetail([], es)).toBe("Empieza desde un gasto");
  expect(plansDoorDetail([{ ...laptopPlan, status: "cancelled" }], es)).toBe("Empieza desde un gasto");
  expect(plansDoorDetail([laptopPlan, { ...second, remainingMinorUnits: 0 }], es)).toBe("Laptop repair");
  expect(plansDoorDetail([laptopPlan, second], en)).toBe("2 plans");
  expect(plansDoorDetail([laptopPlan, second], es)).toBe("2 planes");
});
