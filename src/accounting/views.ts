import { AccountingError } from "./errors";
import type {
  AccountingPeriod,
  AccountingStore,
  FinancialAccountProfile,
  LedgerAccount,
  PostedJournalEntry,
  StoredJournalEntry,
  StoredProfile,
  StoredWorkspace,
  Workspace,
} from "./types";

export function toWorkspace(
  workspace: StoredWorkspace,
  currentAccountingPeriod: AccountingPeriod,
): Workspace {
  return {
    id: workspace.id,
    kind: workspace.kind,
    functionalCurrency: workspace.functionalCurrency,
    chartOfAccountsTemplate: workspace.chartOfAccountsTemplate,
    currentAccountingPeriod,
  };
}

export function toProfile(profile: StoredProfile): FinancialAccountProfile {
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    name: profile.name,
    productKind: profile.productKind,
    ledgerAccountId: profile.postingAccountId,
  };
}

/** Reads what a view of one Workspace's entries needs, once, for any number of entries. */
export async function journalContext(
  store: AccountingStore,
  workspace: StoredWorkspace,
) {
  const [accounts, profiles] = await Promise.all([
    store.listLedgerAccounts(workspace.id),
    store.listProfiles(workspace.id),
  ]);
  return {
    workspace,
    accounts: new Map(accounts.map((account) => [account.id, account])),
    profiles: new Map(profiles.map((profile) => [profile.id, profile])),
  };
}

export type JournalContext = Awaited<ReturnType<typeof journalContext>>;

export async function toPostedJournalEntry(
  store: AccountingStore,
  context: JournalContext,
  entry: StoredJournalEntry,
  links: { replay: boolean; reversedByEntryId?: string },
): Promise<PostedJournalEntry> {
  const period = await store.getAccountingPeriod(context.workspace.id, entry.period);
  if (!period) {
    throw new AccountingError("accounting_period_not_found");
  }
  const profile = entry.financialAccountProfileId
    ? context.profiles.get(entry.financialAccountProfileId)
    : undefined;
  const view: PostedJournalEntry = {
    id: entry.id,
    policy: entry.policy,
    description: entry.description,
    accountingDate: entry.accountingDate,
    accountingPeriod: period,
    amount: {
      currency: context.workspace.functionalCurrency,
      minorUnits: entry.lines.reduce((sum, line) => sum + line.debitMinorUnits, 0),
    },
    postedBy: entry.postedBy,
    postedAt: entry.postedAt,
    replay: links.replay,
    lines: entry.lines.map((line) => {
      const account = requireAccount(context.accounts, line.ledgerAccountId);
      return {
        ledgerAccountId: line.ledgerAccountId,
        code: account.code,
        name: account.name,
        nature: account.nature,
        debitMinorUnits: line.debitMinorUnits,
        creditMinorUnits: line.creditMinorUnits,
      };
    }),
  };
  if (profile) {
    view.financialAccountProfileId = profile.id;
    view.financialAccountProfileName = profile.name;
  }
  if (entry.reversesEntryId) {
    view.reversesEntryId = entry.reversesEntryId;
  }
  if (links.reversedByEntryId) {
    view.reversedByEntryId = links.reversedByEntryId;
  }
  return view;
}

/** Chart of Accounts order: hierarchical codes sort as strings, so 1105 comes before 111005 and 2105. */
export function byCode(a: { code: string }, b: { code: string }): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

function requireAccount(
  accounts: Map<string, LedgerAccount>,
  accountId: string,
): LedgerAccount {
  const account = accounts.get(accountId);
  if (!account) {
    throw new AccountingError("ledger_account_not_found");
  }
  return account;
}
