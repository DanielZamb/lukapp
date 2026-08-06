# Finance Tracker v2 Migration

This is the delivery and data-migration guide for moving the current Google Apps Script
finance tracker into Finance Tracker v2.

The migration is a learning ladder, not a screen-by-screen rewrite:

```txt
domain contract
  -> Convex accounting kernel
  -> one complete basic-finance slice
  -> reconciled historical import
  -> TanStack web cutover
  -> accrual and business capabilities
  -> Expo mobile
```

The governing model is:

- [CONTEXT.md](./CONTEXT.md) for canonical domain language;
- [Accounting Ledger Primer](./docs/accounting-ledger-primer.md) for formal objects and
  invariants; and
- [ADRs](./docs/adr/) for decisions whose rationale must survive implementation changes.

If this guide conflicts with those records, the glossary, invariants, and latest
applicable ADR win.

## Migration Outcome

The migration succeeds when:

1. every Workspace has one independently balanced General Ledger;
2. every Posted Journal Entry is immutable, balanced, and belongs to one Workspace;
3. basic users can record income, expenses, and transfers without seeing accounting
   terminology;
4. advanced users can inspect the same entries, accounts, statements, periods, and
   provenance;
5. imported balances and material reports reconcile to the legacy source;
6. the old GAS application can become read-only without becoming a hidden second source
   of truth; and
7. new capabilities can be added without replacing the accounting core.

The target is not literal parity with every old table or screen. It is preservation of
economic truth, user history, and useful workflows behind a stronger model.

## Non-Negotiable Migration Rules

- The General Ledger supersedes the legacy cash ledger as accounting truth.
- Every Posted entry is double-entry and balanced in Functional Currency.
- Opening balances are Posted against Opening Balance Equity; they are not mutable fields
  on financial accounts.
- Financial Account Profiles describe products users recognize. Ledger Accounts carry
  accounting truth.
- User Categories remain separate from the Chart of Accounts.
- Cash-style entry is an input experience, not cash-basis accounting.
- Posted records are corrected through reversals and replacements, never edits or
  deletion.
- Historical source rows remain immutable evidence.
- AI may suggest classifications and mappings only; it never posts.
- Each Workspace imports and balances independently.
- No migration heuristic may silently invent a transfer, counterparty, account
  classification, or accounting date.
- No dual-write period is allowed after cutover. Parallel operation is read-only
  comparison, not two writable ledgers.

## Target Module Map

The implementation should use deep modules. Convex functions are adapters at the
external seam; they should not spread domain rules across individual queries and
mutations.

| Module | Small interface | Complexity kept inside |
| --- | --- | --- |
| Workspace | create, authorize, change role | ownership, permissions, last-owner rule |
| Chart of Accounts | provision, activate, map | sparse IFRS-inspired templates, posting/summary roles |
| Classification | classify product, propose posting | deterministic policies, required questions, policy versions |
| Posting | prepare, validate, post, reverse | balancing, money, dates, period locks, provenance |
| Import | stage, validate, commit, reconcile | hashes, mappings, atomic units, retries, issues |
| Reporting | run normalized query | balances, statements, mappings, date and currency policy |
| Settlement | record payment, apply, reverse | open items, dual amounts, counterparty rules |
| Period Close | review, lock, reopen | structural checks, snapshots, authority, append-only decisions |
| Savings Recovery | activate, allocate, reverse | plans, schedules, contributions, waterfall, history |

The deletion test applies: removing one of these modules should force its rules into many
callers. If deleting it changes almost nothing, it is a shallow pass-through and should
be folded into a deeper module.

## Delivery Ladder

### Phase 0 — Freeze The v2 Contract

Deliver:

- copy the glossary, ledger primer, ADRs, and this guide into the v2 repository;
- assign stable names to domain modules;
- define the first Convex schema from the domain objects, not the old spreadsheet tabs;
- record any deliberate departure as a new ADR; and
- create a traceability checklist from every implemented invariant to tests.

Do not design every future table in advance. Define the objects required by the next
vertical slice and preserve identifiers and seams for later modules.

Exit criteria:

- the General Ledger source-of-truth rule is visible in schema and module interfaces;
- Workspace ownership and Functional Currency are explicit;
- Journal Entry/Line states and correction behavior are explicit; and
- no new implementation uses `financialEvent` or a UI transaction row as a competing
  balance owner.

Learning goal: understand the domain before learning it accidentally through UI code.

### Phase 1 — Build The Migration Harness Before Importing Finance

Create migration infrastructure early:

```txt
migrationRuns
migrationSourceRows
migrationIdMap
migrationIssues
migrationReconciliationResults
```

Every exported row preserves:

```txt
sourceTable
sourceId
sourceRowNumber
exportedAt
sourceHash
rawPayload
```

Every target created by migration preserves a stable source identity or an entry in
`migrationIdMap`. Re-running the same source hash returns the same result. A changed hash
is restaged and reviewed; it never silently mutates Posted accounting.

Build these commands:

```txt
export
validate-source
stage
propose-mappings
dry-run
commit-unit
reconcile
report-issues
```

Exit criteria:

- repeated dry runs are idempotent;
- invalid rows produce durable issues instead of partial writes;
- a reconciliation unit commits completely or not at all; and
- no loader writes directly around the Import module.

Learning goal: Convex transactions, indexes, stable identities, and repeatable data work.

### Phase 2 — Implement The Accounting Kernel

Implement before account or transaction screens:

```txt
Workspace
WorkspaceMembership
FiscalCalendarPolicy
AccountingPeriod
PeriodControlDecision
LedgerAccount
JournalEntry
JournalLine
```

The Posting module must own:

- Workspace isolation;
- account existence and Posting Account validation;
- non-zero lines and minimum completeness;
- debit/credit balancing in Functional Currency;
- transaction and Functional Currency preservation;
- immutable Posted state;
- Accounting Date selection;
- period-lock enforcement;
- actor and policy provenance; and
- append-only reversal and replacement.

Test the interface with hand-built commands and generated property cases before building
the web entry form.

Exit criteria:

- invalid entries cannot become Posted;
- all Posted entries reproduce a Trial Balance;
- a Locked Period rejects ordinary backdated posting;
- reversal never edits the original; and
- concurrency cannot consume the same capacity twice.

Learning goal: Convex mutations as domain commands, not table CRUD.

### Phase 3 — Provision Workspaces And The Sparse Chart Of Accounts

Implement:

```txt
users
workspaces
memberships
fiscalCalendarPolicies
ledgerAccounts
canonicalReportingConcepts
accountReportingMappings
financialAccountProfiles
```

On first login:

1. create or link the user through the chosen external auth provider;
2. create a Personal Workspace;
3. create its Owner membership;
4. choose Functional Currency;
5. apply the smallest versioned Chart of Accounts template; and
6. ask factual product questions only when a Financial Account Profile requires them.

Do not preload an entire IFRS catalog into each Workspace. Provision a sparse operational
Chart of Accounts and map accounts to broader canonical reporting concepts.

Exit criteria:

- the same user may hold different roles in different Workspaces;
- each Workspace balances independently;
- quick setup avoids accounting language;
- backend classification is deterministic and versioned; and
- Financial Account Profiles never become alternate balance owners.

Learning goal: auth, Workspace authorization, schema indexes, and progressive disclosure.

### Phase 4 — Ship One Complete Basic-Finance Slice

Backend commands:

```txt
createFinancialAccountProfile
recordCashExpense
recordCashIncome
recordTransfer
prepareOpeningPosition
postPreparedEntry
reversePostedEntry
```

User-facing commands accept familiar facts:

```txt
amount
date cash moved
from or to financial account
category
description
```

Classification and Posting translate them into balanced Draft and Posted Journal Entries.
For example:

```txt
cash expense:
  Dr Expense
  Cr Bank

cash income:
  Dr Bank
  Cr Revenue

asset transfer:
  Dr Destination Asset
  Cr Source Asset

opening asset:
  Dr Asset
  Cr Opening Balance Equity
```

Then build the first TanStack web slice:

- quick account setup;
- simple income/expense/transfer entry;
- review-before-post when needed;
- account balances;
- transaction-shaped activity list; and
- monthly income and expense summary.

The frontend consumes DTOs. It does not reconstruct accounting from loaded rows.

Exit criteria:

- a basic user completes the flow without seeing Ledger Account, debit, or credit;
- an advanced view can explain the resulting Journal Entry and Journal Lines;
- balances come from Posted Journal Lines;
- transfers do not affect income or expense; and
- server reports reconcile to the Trial Balance.

Learning goal: TanStack forms, routing, query state, and optimistic UX on a real domain
slice.

### Phase 5 — Rehearse Legacy Import Into The Basic Slice

Run a full export from a production-shaped copy of the GAS/Sheets data. Import into a
disposable Convex deployment.

Do not cut over yet. The purpose is to expose mapping gaps while the product surface is
still small.

Required source groups:

```txt
USERS
ROLES
FUNDS
CATEGORIES
PRIVATE_CATEGORIES
USER_CATEGORIES or equivalent junctions
LEDGER
HISTORY_LEDGER
loan/amortization tables
FEEDBACK_REQUESTS
APP_VERSIONS
```

Use JSONL as the canonical export and CSV only for human inspection.

Exit criteria:

- every source row is staged, skipped with reason, or committed;
- balances reconcile per Financial Account Profile;
- unresolved transfer and correction cases are visible;
- no target record depends on spreadsheet row order; and
- the import can be discarded and repeated from zero.

Learning goal: migration transforms, data-quality triage, and reconciliation.

### Phase 6 — Add Accrual-Capable Documents And Settlement

Implement only after the accounting kernel and basic slice are stable:

```txt
Counterparty
SourceDocument
DocumentLine
PostingProposal
OpenItem
Payment
PaymentApplication
CreditNote
CreditApplication
```

Keep the interfaces narrow:

```txt
prepareDocument
recognizeDocument
recordPayment
applySettlement
reverseApplication
```

Documents describe commercial reality; Journal Lines describe accounting treatment.
Payment posting and Open Item allocation remain separate.

Exit criteria:

- cash-style entries still use the same General Ledger;
- accrual workflows produce receivables or payables without a second ledger;
- payments may exist before allocation;
- applications cannot over-settle;
- cross-currency settlement preserves both native amounts; and
- corrections remain append-only.

Learning goal: deeper domain commands and multi-record transactional invariants.

### Phase 7 — Add Month Close And Recovery Planning

Implement Month Close only after reports and period locks are trustworthy.

Month Close:

- reviews unresolved work;
- prepares explicit accounting adjustments through normal Posting;
- stores an as-known-at snapshot;
- locks one whole Workspace month; and
- never creates an economic event merely because the month closed.

Then implement Personal/Household Savings Recovery:

```txt
ExpenseRecoveryCandidate
SavingsRecoveryPlan
PlanSourceAllocation
RecoveryInstallment
RecoveryContribution
ContributionSourceAllocation
RecoveryContributionReversal
RecoveryAllocationProposal
RecoveryOpeningProgress
```

The actual asset transfer remains accounting truth. Recovery is a behavioral planning
interpretation and never a Liability or subledger.

Exit criteria:

- the Monthly Recovery Waterfall uses only Available Recovery Cash;
- plan activation freezes a schedule;
- the first installment belongs to the activation month;
- imported transfers require explicit recovery intent;
- corrections may change attribution without changing accounting;
- destination withdrawals do not erase contribution history; and
- recovery reports cannot change net worth or financial statements.

Learning goal: temporal history, append-only planning allocations, and close snapshots.

### Phase 8 — Add Business Depth As Demand Requires

Add in independently releasable slices:

1. processor settlements and reserves;
2. business invoices, bills, Credit Notes, and richer recognition schedules;
3. tax facts and jurisdiction-specific reporting;
4. formal inventory or fixed-asset modules only when their responsibilities are real;
5. portfolio positions and valuation; and
6. consolidation only with explicit ownership/control relationships.

Do not introduce speculative subledgers. A supporting schedule may explain a balance but
must reconcile to the General Ledger and must not own it.

### Phase 9 — Cut Over TanStack Web

Cutover sequence:

```txt
1. Run full dry import into disposable deployment.
2. Resolve blocking migration issues.
3. Run real rehearsal into staging.
4. Compare old and new balances and reports.
5. Let users validate the new app read-only.
6. Announce and begin the write freeze.
7. Freeze GAS writes.
8. Export and import the final delta.
9. Run strict reconciliation.
10. Enable v2 writes.
11. Keep GAS read-only for the defined evidence-retention window.
```

Do not dual-write. Before step 10, GAS remains the source of truth. After step 10, v2 is
the source of truth.

Rollback before write cutover means discarding and rebuilding the v2 deployment.
After write cutover, pause v2 writes and repair forward through traceable migration or
accounting corrections; do not resume GAS writes and create two truths.

### Phase 10 — Build Expo Mobile Against Stable Interfaces

Mobile begins only after the Convex domain interfaces and web DTOs are stable.

Initial mobile scope:

- account balances;
- transaction activity;
- record basic income, expense, and transfer; and
- review pending offline entry drafts.

Offline support is limited to drafts. The server still validates and posts through the
same commands as web. Do not build an offline ledger or mobile-specific accounting model.

Learning goal: Expo navigation, native inputs, authentication, and a small idempotent
offline queue without relearning backend architecture.

## Legacy-To-v2 Mapping

| Legacy source | v2 target | Rule |
| --- | --- | --- |
| `USERS` | User + Personal Workspace + Owner Membership | migrate identity/profile, never password hashes |
| `ROLES` | Workspace Role or app-level metadata | finance authority is Workspace-scoped |
| `FUNDS` | Financial Account Profile + classified Posting Account | stage product classification; do not default everything silently |
| `CATEGORIES` | templates or Workspace User Categories | runtime categories become Workspace-owned |
| `PRIVATE_CATEGORIES` | Workspace User Categories | preserve source identity through migration mapping |
| `LEDGER` | Import Source Rows, then Journal Entries/Lines | signed row is evidence, not the final target shape |
| `HISTORY_LEDGER` | source provenance and correction evidence | never import it as duplicate economic activity |
| initial-balance rows | opening-position Journal Entries | post against Opening Balance Equity |
| linked transfer rows | one balanced asset-to-asset Journal Entry | accept deterministic linked pairs only |
| reversal/correction rows | original + Reversal Entry + replacement | preserve original and links |
| amortization/loan tables | staged schedule classification | decide external debt vs Savings Recovery; never assume |
| `FEEDBACK_REQUESTS` | separate app-level feedback records | must not block finance cutover |
| `APP_VERSIONS` | app configuration if still useful | optional, outside financial reconciliation |

## Ledger Transformation Rules

### Legacy Expense

```txt
source:
  one negative LEDGER row against a fund

target:
  Dr classified Expense account
  Cr fund's Asset Posting Account
```

### Legacy Income

```txt
source:
  one positive LEDGER row against a fund

target:
  Dr fund's Asset Posting Account
  Cr classified Revenue account
```

### Legacy Opening Position

```txt
positive asset opening:
  Dr Asset
  Cr Opening Balance Equity

negative or liability opening:
  classification review required
```

Do not turn an unexplained negative fund into an Asset that silently allows negative
balances.

### Legacy Transfer

Auto-accept only when source evidence explicitly links the two legs and amount, date,
Workspace, and currency agree.

Heuristic pairs become review proposals:

```txt
same Workspace
same date or documented clearing window
same absolute amount
opposite directions
different financial accounts
compatible group or description evidence
```

Accepted target:

```txt
Dr Destination Asset
Cr Source Asset
```

Never represent a transfer through income and expense.

### Legacy Deletion, Reversal, Or Correction

Prefer reconstructing:

```txt
original Posted Journal Entry
  -> explicit Reversal Entry
  -> optional replacement Journal Entry
```

Use source history dates when reliable. If the source cannot establish an Accounting Date
or relationship, create a blocking migration issue; do not invent chronology.

### Legacy Category

A User Category may select a default Posting Account through a versioned classification
policy, but the migrated category is never the account itself. Low-confidence mappings
remain reviewable and do not block staging; unresolved accounting classification does
block posting.

### Legacy Currency

Every Workspace selects Functional Currency explicitly. Preserve source-native amounts
when evidence exists. Do not convert historical amounts merely to make them fit a newly
classified account.

If the legacy source contains no currency evidence, stage a Workspace-level assumption
for confirmation and preserve that assumption as migration provenance.

## Migration Reconciliation

Reconciliation is a product deliverable, not a final script log.

Required controls:

```txt
source row counts by table and state
committed/skipped/blocked rows by reconciliation unit
users, Workspaces, and memberships
Financial Account Profiles and Posting Accounts
User Categories and unresolved mappings
Journal Entry and Journal Line counts
debits equal credits per Posted Journal Entry
Trial Balance equals zero per Workspace
legacy closing balance vs v2 balance per financial account
income and expense by month
category totals by month
opening position by account
transfer pairs and unpaired candidates
reversal/correction chains
missing Accounting Dates
missing or assumed currencies
unresolved account classifications
recovery opening progress vs imported schedule totals
```

The account-level proof is:

```txt
legacy effective closing balance
  = v2 balance derived from signed Functional Currency effects
    of Posted Journal Lines for the mapped Posting Account
```

Any presentation cache or snapshot must reconcile to those Journal Lines. A visually
similar dashboard is not proof.

## Golden Migration Fixtures

The migration test corpus must include:

1. checking account with an opening balance;
2. cash expense;
3. cash income;
4. transfer between two Assets;
5. a likely transfer that must remain a proposal;
6. credit-card purchase and later settlement;
7. reversal and corrected replacement;
8. split-category purchase;
9. foreign-currency source with preserved rate evidence;
10. missing currency requiring confirmation;
11. Locked Period correction;
12. Invoice or Bill with later Payment;
13. processor settlement with fee and reserve;
14. Savings Recovery Plan with verified contributions;
15. imported Recovery Opening Progress without old transfer evidence;
16. source expense later refunded; and
17. destination withdrawal that leaves recovery progress intact.

For every fixture, assert:

- Workspace isolation;
- balanced Posted entries;
- immutable source evidence;
- deterministic idempotent re-run;
- expected report totals;
- expected migration issues; and
- current versus as-known-at history where applicable.

## Subscription And AI Boundaries

Subscription gates control assistance and convenience, not accounting correctness.

Paid capabilities may include:

- historical Excel/CSV import;
- optional AI-assisted mapping;
- richer reconciliation assistance; and
- advanced reports or business workflows.

The underlying records remain deterministic. AI output is always a proposal, and a user
with appropriate authority accepts it before any posting or recovery attribution.

## Explicitly Deferred

The initial web cutover does not require:

- formal consolidated financial statements;
- a complete IFRS account catalog in every Workspace;
- investment position and tax-lot accounting;
- automatic AI posting;
- cross-currency Savings Recovery;
- arbitrary custom Workspace roles;
- mandatory maker-checker approval;
- processor reserve lots or another processor subledger;
- general-purpose offline synchronization; or
- mobile feature parity with web.

Each deferred capability must enter through the existing module interfaces or justify a
new seam and ADR.

## What Not To Do

- Do not copy spreadsheet tables one-for-one into Convex.
- Do not keep both a transaction table and the General Ledger as balance owners.
- Do not store opening balances as mutable account fields.
- Do not make User Categories stand in for Ledger Accounts.
- Do not infer accounting from frontend labels.
- Do not auto-merge suspected transfers.
- Do not discard deleted or corrected source history.
- Do not use old numeric IDs as Convex identities.
- Do not let UI code calculate authoritative report totals.
- Do not let AI bypass Posting Authority.
- Do not introduce a subledger merely to avoid designing a reconciliation.
- Do not cut over while any Workspace fails Trial Balance or account reconciliation.

## Final Cutover Gate

Finance Tracker v2 may accept writes only when:

```txt
domain contract is copied and versioned
Posting module passes all kernel invariants
Workspace authorization is tested
basic income/expense/transfer flow is usable
opening positions reconcile
all migration units are committed or intentionally deferred
every Workspace Trial Balance equals zero
material account and monthly report totals reconcile
blocking classifications and dates are resolved
reversal/correction chains are preserved
strict import re-run is idempotent
GAS write freeze is active
fallback and repair procedures are rehearsed
```

At that point the migration is not “finished forever.” It has established a trustworthy
engine, a working web client, a reproducible data lineage, and safe seams for the next
capability.
