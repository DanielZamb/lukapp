/* The Workspace Chart of Accounts: template lookup, locked classification, and sparse activation (ADR-0007, ADR-0082). */
import { AccountingError, type AccountingErrorCode } from "./errors";
import { coPucPersonalTemplate } from "./templates/coPucPersonal";
import type {
  AccountNature,
  AccountingStore,
  CatalogAccount,
  CatalogAccountView,
  CatalogUse,
  ChartOfAccountsTemplate,
  LedgerAccount,
  NormalSide,
  StoredWorkspace,
} from "./types";

/** The template every new Personal Workspace starts from. */
export const personalChartTemplate: ChartOfAccountsTemplate = coPucPersonalTemplate;

const templates = new Map<string, ChartOfAccountsTemplate>([
  [coPucPersonalTemplate.version, coPucPersonalTemplate],
]);

/** Uses a recording flow may ask for, and the error when a code belongs to another use. */
type RecordingUse = Extract<CatalogUse, "expense" | "income">;

const wrongUse: Record<RecordingUse, AccountingErrorCode> = {
  expense: "cash_expense_account_invalid",
  income: "cash_income_account_invalid",
};

export function chartTemplate(version: string): ChartOfAccountsTemplate {
  const template = templates.get(version);
  if (!template) {
    throw new AccountingError("chart_of_accounts_template_unknown");
  }
  return template;
}

/** The first digit of a code is its class, and the class locks the nature. */
export function natureOfCode(template: ChartOfAccountsTemplate, code: string): AccountNature {
  const nature = template.natureByClass[code.charAt(0)];
  if (!nature) {
    throw new AccountingError("ledger_account_code_unknown");
  }
  return nature;
}

/** Assets and Expenses grow with debits; Liabilities, Equity, and Revenue grow with credits. */
export function increasesWithDebit(nature: AccountNature): boolean {
  return nature === "Asset" || nature === "Expense";
}

export function normalSideOf(nature: AccountNature): NormalSide {
  return increasesWithDebit(nature) ? "Debit" : "Credit";
}

/** Balance on the account's normal side, so an Asset shows money held and a Liability money owed. */
export function normalBalance(
  normalSide: NormalSide,
  totals: { debitMinorUnits: number; creditMinorUnits: number },
): number {
  return normalSide === "Debit"
    ? totals.debitMinorUnits - totals.creditMinorUnits
    : totals.creditMinorUnits - totals.debitMinorUnits;
}

function classify(template: ChartOfAccountsTemplate, account: CatalogAccount) {
  const nature = natureOfCode(template, account.code);
  return { nature, normalSide: account.normalSide ?? normalSideOf(nature) };
}

function catalogAccount(template: ChartOfAccountsTemplate, code: string): CatalogAccount {
  const account = template.accounts.find((candidate) => candidate.code === code);
  if (!account) {
    throw new AccountingError("ledger_account_code_unknown");
  }
  return account;
}

async function activate(
  store: AccountingStore,
  workspaceId: string,
  template: ChartOfAccountsTemplate,
  account: CatalogAccount,
): Promise<LedgerAccount> {
  const existing = await store.findLedgerAccountByCode(workspaceId, account.code);
  if (existing) {
    return existing;
  }
  return store.insertLedgerAccount({
    workspaceId,
    code: account.code,
    name: account.name,
    ...classify(template, account),
    role: "Posting",
  });
}

export async function provisionChartOfAccounts(
  store: AccountingStore,
  workspaceId: string,
  template: ChartOfAccountsTemplate,
): Promise<void> {
  const { expense, income, openingBalance } = template.defaults;
  for (const code of [openingBalance, income, expense]) {
    await activate(store, workspaceId, template, catalogAccount(template, code));
  }
}

/**
 * The Workspace's Posting Account for a template code, activated on first use.
 * The template's use for the code must match the recording flow asking for it.
 */
export async function requireTemplateAccount(
  store: AccountingStore,
  workspace: StoredWorkspace,
  use: RecordingUse,
  code?: string,
): Promise<LedgerAccount> {
  const template = chartTemplate(workspace.chartOfAccountsTemplate);
  const account = catalogAccount(template, code ?? template.defaults[use]);
  if (account.use !== use) {
    throw new AccountingError(wrongUse[use]);
  }
  return activate(store, workspace.id, template, account);
}

/** Next auxiliary code under a profile parent: 111005 → 11100501, 11100502, … up to 99. Template accounts never sit under a profile parent. */
export async function nextAuxiliaryCode(
  store: AccountingStore,
  workspaceId: string,
  parentCode: string,
): Promise<string> {
  const accounts = await store.listLedgerAccounts(workspaceId);
  const used = accounts
    .filter((account) => account.code.startsWith(parentCode))
    .map((account) => Number(account.code.slice(parentCode.length)));
  const next = Math.max(0, ...used) + 1;
  if (next > 99) {
    throw new AccountingError("auxiliary_accounts_exhausted");
  }
  return `${parentCode}${String(next).padStart(2, "0")}`;
}

/** Every Posting Account the template offers, each with its summary levels and activation. */
export function catalogView(
  template: ChartOfAccountsTemplate,
  activated: LedgerAccount[],
): CatalogAccountView[] {
  const byCode = new Map(activated.map((account) => [account.code, account.id]));
  return template.accounts.map((account) => {
    const view: CatalogAccountView = {
      code: account.code,
      name: account.name,
      ...classify(template, account),
      use: account.use,
      ancestors: ancestorCodes(account.code).map((code) => ({
        code,
        name: template.summaryNames[code] ?? "",
      })),
    };
    const ledgerAccountId = byCode.get(account.code);
    if (ledgerAccountId) {
      view.ledgerAccountId = ledgerAccountId;
    }
    return view;
  });
}

/** Clase, grupo, cuenta, and subcuenta above a code: 51959595 → 5, 51, 5195, 519595. */
export function ancestorCodes(code: string): string[] {
  return [1, 2, 4, 6].filter((length) => length < code.length).map((length) => code.slice(0, length));
}
