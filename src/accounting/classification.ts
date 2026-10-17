import { natureOfCode } from "./chartOfAccounts";
import { AccountingError } from "./errors";
import type {
  AccountNature,
  ChartOfAccountsTemplate,
  FinancialAccountProductKind,
} from "./types";

/** Product Classification Policy (ADR-0010): product facts decide where the profile's Posting Account sits. */
export const profileClassificationPolicy = "financial-account-profile@2";

export function classifyFinancialAccountProfile(
  template: ChartOfAccountsTemplate,
  productKind: string,
): {
  productKind: FinancialAccountProductKind;
  parentCode: string;
  nature: AccountNature;
  policy: string;
} {
  if (!Object.hasOwn(template.financialAccountParents, productKind)) {
    throw new AccountingError("financial_account_product_kind_unknown");
  }
  const kind = productKind as FinancialAccountProductKind;
  const parentCode = template.financialAccountParents[kind];
  return {
    productKind: kind,
    parentCode,
    nature: natureOfCode(template, parentCode),
    policy: profileClassificationPolicy,
  };
}
