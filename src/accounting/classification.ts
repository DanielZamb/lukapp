import { AccountingError } from "./errors";
import type { AccountNature, FinancialAccountProductKind } from "./types";

/** Product Classification Policy (ADR-0010): product facts decide the Posting Account nature. */
export const profileClassificationPolicy = "financial-account-profile@1";

const natureByProductKind: Record<FinancialAccountProductKind, AccountNature> = {
  cash: "Asset",
  bankAccount: "Asset",
  creditCard: "Liability",
  loan: "Liability",
};

export function classifyFinancialAccountProfile(productKind: string): {
  productKind: FinancialAccountProductKind;
  nature: AccountNature;
  policy: string;
} {
  if (!Object.hasOwn(natureByProductKind, productKind)) {
    throw new AccountingError("financial_account_product_kind_unknown");
  }
  const kind = productKind as FinancialAccountProductKind;
  return {
    productKind: kind,
    nature: natureByProductKind[kind],
    policy: profileClassificationPolicy,
  };
}
