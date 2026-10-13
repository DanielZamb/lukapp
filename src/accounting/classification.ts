import { natureOfCode } from "./chartOfAccounts";
import { AccountingError } from "./errors";
import type {
  ChartOfAccountsTemplate, FinancialAccountProductKind, FinancialAccountParentKind,
  ProfileClassificationAnswers,
} from "./types";

export const profileClassificationPolicy = "financial-account-profile@3";

export function classifyFinancialAccountProfile(
  template: ChartOfAccountsTemplate,
  productKind: string,
  answers?: ProfileClassificationAnswers,
) {
  let parent: FinancialAccountParentKind;
  let normalized: ProfileClassificationAnswers | undefined;
  switch (productKind) {
    case "receivable":
      if (answers?.kind !== "receivable" || !answers.counterpartyName.trim())
        throw new AccountingError("profile_classification_answers_required");
      parent = answers.security === "secured" ? "securedReceivable" : "unsecuredReceivable";
      normalized = { kind: "receivable", security: answers.security, counterpartyName: answers.counterpartyName.trim() };
      break;
    case "investment":
      if (answers?.kind !== "investment")
        throw new AccountingError("profile_classification_answers_required");
      parent = answers.form === "termDeposit" ? "termDeposit" : "investmentFund";
      normalized = { kind: "investment", form: answers.form,
        ...(answers.counterpartyName?.trim() ? { counterpartyName: answers.counterpartyName.trim() } : {}) };
      break;
    case "personalDebt":
      if (answers?.kind !== "personalDebt" || !answers.counterpartyName.trim())
        throw new AccountingError("profile_classification_answers_required");
      parent = "personalDebt";
      normalized = { kind: "personalDebt", counterpartyName: answers.counterpartyName.trim() };
      break;
    case "cash": case "bankAccount": case "savingsAccount": case "creditCard": case "loan":
      if (answers) throw new AccountingError("profile_classification_answers_required");
      parent = productKind;
      break;
    default: {
      throw new AccountingError("financial_account_product_kind_unknown");
    }
  }
  const parentCode = template.financialAccountParents[parent];
  if ((productKind === "receivable" || productKind === "investment" || productKind === "personalDebt") &&
      !template.accounts.some(account => account.code === parentCode && account.use === "general"))
    throw new AccountingError("ledger_account_code_unknown");
  return { productKind, parentCode, nature: natureOfCode(template, parentCode), policy: profileClassificationPolicy,
    ...(normalized ? { answers: normalized } : {}) };
}
