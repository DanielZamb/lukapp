# Finance Domain

This context defines the financial language shared by the simple tracking experience and the advanced bookkeeping and reporting experience.

## Accounting boundary

**Reporting Entity**:
A coherent set of economic activities for which financial statements can be prepared. It may be a person, household, business, or another deliberately chosen boundary; it is not necessarily a legal entity.

**Workspace**:
The product boundary representing exactly one Reporting Entity and its independently balanced General Ledger.
_Avoid_: Account, profile, organization

**Workspace Kind**:
The Reporting Entity classification Personal, Household, or Business. It governs which planning experiences apply without changing General Ledger mechanics.
_Avoid_: Legal entity type, Workspace Role

**Workspace Membership**:
A user's scoped relationship to one Workspace, carrying explicit permissions to view, prepare, post, correct, or administer its accounting and planning workflows.
_Avoid_: Global role, ownership of the Reporting Entity

**Workspace Role**:
A fixed user-facing permission preset assigned to a Workspace Membership: Owner, Accountant, Preparer, or Viewer.
_Avoid_: Global user type, custom role

**Posting Authority**:
The Workspace permission to turn validated Draft accounting into immutable Posted Journal Entries, including settlement commitment when it posts accounting.
_Avoid_: Edit access, import access

**Recovery Plan Authority**:
The Workspace permission to activate, cancel, and correct Savings Recovery planning. It never grants authority to post or alter General Ledger accounting.
_Avoid_: Posting Authority, plan ownership

**Counterparty**:
A person or organization outside the Reporting Entity that owns settlement balances and may act as a customer, supplier, or both.
_Avoid_: User, Workspace, Ledger Account

**General Ledger**:
The sole source of accounting truth for a Workspace, built from balanced entries against its Chart of Accounts.
_Avoid_: Transaction list, cash ledger

**Cash Activity**:
The unsmoothed history of entries affecting cash and cash-equivalent Ledger Accounts. It is a prominent view of the General Ledger, not a separate source of truth.
_Avoid_: Cash source of truth, cash ledger

**Functional Currency**:
The currency of a Workspace's primary economic environment and the balancing measurement of its General Ledger.
_Avoid_: Transaction Currency, Presentation Currency

**Transaction Currency**:
The currency in which a transaction is denominated or requires settlement, preserved on its Journal Lines even when it differs from the Functional Currency.
_Avoid_: Functional Currency

**Presentation Currency**:
A currency chosen for displaying translated financial statements; it does not create another General Ledger or replace Functional Currency amounts.
_Avoid_: Functional Currency

**FX Revaluation**:
A new Journal Entry that updates the functional-currency carrying amount of qualifying foreign-currency balances at a later rate and recognizes the resulting exchange difference.
_Avoid_: Editing the original exchange rate

**IFRS-aligned Management Reporting**:
Internal financial reporting whose concepts and presentation map to IFRS reporting concepts without claiming statutory, tax, or jurisdiction-specific compliance.
_Avoid_: IFRS-compliant books, tax-ready books

## Accounting records

**Chart of Accounts**:
The organized set of Ledger Accounts available to one Workspace for recognizing assets, liabilities, equity, income, and expenses.
_Avoid_: Category list, IFRS taxonomy

**COA Template**:
A versioned, application-owned starting structure used to create a Workspace-owned Chart of Accounts. Applying or upgrading a template never makes Workspaces share mutable Ledger Accounts.
_Avoid_: Global Chart of Accounts

**Sparse Chart of Accounts**:
A Workspace Chart of Accounts containing only the Ledger Accounts needed for its current activities, expanded deliberately as the Workspace adopts new financial capabilities.
_Avoid_: Full IFRS taxonomy preload

**Ledger Account**:
A member of the Chart of Accounts against which financial effects are recognized and balances are accumulated.
_Avoid_: User Category, Fund

**Summary Account**:
A non-postable Ledger Account that organizes and aggregates descendant accounts for navigation and reporting.
_Avoid_: Posting Account

**Posting Account**:
A Ledger Account eligible to receive Journal Lines. It never has child Ledger Accounts.
_Avoid_: Summary Account

**Financial Account Profile**:
The user-facing description of a real-world bank account, wallet, card, loan, deposit, or similar financial product, linked to its automatically classified Posting Account.
_Avoid_: Ledger Account, Chart of Accounts entry

**Processor Clearing Account**:
An asset Posting Account representing funds collected or held by a payment processor before payout, reconciled through gross receipts, fees, refunds, chargebacks, and transfers to bank.
_Avoid_: Bank Account, revenue, net payout

**Processor Merchant Account**:
A provider-side account or contract under which a Workspace receives collections and settlements in a particular currency.
_Avoid_: Workspace, Processor Clearing Account, Counterparty

**Processor Reserve Asset**:
An asset Posting Account whose General Ledger balance represents recoverable funds retained by a payment processor until they are released or explicitly determined to be unrecoverable.
_Avoid_: Processor Fee, immediate loss, Reserve Lot

**Processor Settlement**:
A source record for one processor payout that preserves its stable provider identity, gross collections, deductions, reserves, adjustments, net bank transfer, and reconciliation.
_Avoid_: Net customer Payment, bank deposit alone

**Processor Settlement Component**:
An immutable provider-source line within a Processor Settlement that preserves its stable source identity, original type, native amount and currency, and links to the accounting records it explains.
_Avoid_: Derived settlement total, Journal Line

**Bank Source Transaction**:
An immutable bank-provided record of an account movement used as evidence for matching or creating accounting, but not itself a Journal Entry.
_Avoid_: Payment, Journal Entry, duplicate payout

**Settlement Component Allocation**:
A measured association assigning part or all of a Processor Settlement Component to a Payment or Journal Entry that it explains.
_Avoid_: Bare record link, Payment Application

**Reconciliation Match Policy**:
A versioned deterministic rule set that decides whether proposed Settlement Component Allocations are exact and unambiguous enough for automatic acceptance.
_Avoid_: AI confidence score, posting authority

**Processor Posting Policy**:
A versioned deterministic rule set that translates an unmatched typed Processor Settlement Component into valid Draft Payments or Journal Entries.
_Avoid_: AI accountant, settlement plug

**Settlement Difference**:
The derived amount by which a staged Processor Settlement's component equation differs from its stated net payout.
_Avoid_: Miscellaneous expense, balancing plug

**Reconciliation Exception**:
A preserved conflict or unexplained mismatch between source evidence and existing accounting that requires confirmation or corrective accounting rather than silent mutation.
_Avoid_: Automatic rewrite, balancing plug

**Processor Adjustment**:
An explicit, typed processor-settlement component supported by a reason and evidence, used for a real provider adjustment or an allowed currency-rounding difference.
_Avoid_: Silent correction, unexplained plug

**Product Classification Policy**:
A versioned backend policy that converts the required factual attributes of a Financial Account Profile into its accounting classification and Posting Account.
_Avoid_: Frontend mapping, AI classification

**Required Classification Question**:
A plain-language question asked only when its answer is necessary for the Product Classification Policy to reach a valid decision.
_Avoid_: Accounting questionnaire, optional enrichment

**AI-assisted Intake**:
An optional paid capability that extracts or suggests product facts for user review without authority to classify or post accounting records.
_Avoid_: AI accountant, automatic posting

**Canonical Reporting Concept**:
A stable financial-statement concept used to compare and group Ledger Accounts from independently structured Workspace Charts of Accounts.
_Avoid_: Ledger Account, User Category

**Account Reporting Mapping**:
A versioned classification connecting a Workspace-owned Ledger Account to a Canonical Reporting Concept without changing the account's identity or history.
_Avoid_: Shared account, category mapping

**Current/Non-current Classification**:
A reporting-date classification derived from an asset's expected realization or a liability's expected settlement and other applicable facts. It is not permanent COA placement.
_Avoid_: Ledger Account class, fixed account parent

**Portfolio Overview**:
A read-only analytical view that compares or summarizes selected Workspaces through canonical mappings and currency translation without merging their General Ledgers.
_Avoid_: Consolidated Financial Statements

**Consolidated Financial Statements**:
Statements that present a controlling parent and its controlled entities as one economic entity after applying ownership, translation, and elimination rules.
_Avoid_: Portfolio Overview, combined dashboard

**User Category**:
An optional, user-friendly management classification for analysis and budgeting. It can suggest a default Ledger Account but is not itself accounting truth.
_Avoid_: Ledger Account

**Journal Entry**:
The aggregate accounting record recognized in the General Ledger, containing the Journal Lines that together represent one accounting treatment.
_Avoid_: Generic Financial Event

**Accounting Date**:
The date that determines the accounting period in which a Journal Entry is recognized and reported.
_Avoid_: Posted At, Source Document Date

**Accounting Date Source**:
The preserved evidence or rule that justifies an accounting record's Accounting Date, such as a provider effective date, bank value date, contractual settlement date, or user confirmation.
_Avoid_: Import timestamp, unexplained default date

**Journal Line**:
One debit or credit posting to exactly one Ledger Account within a Journal Entry. It preserves transaction and functional amounts with rate provenance and may carry an optional User Category for management analysis.
_Avoid_: Allocation, transaction

**Payment**:
A cash-settlement record that creates its own Journal Entry on the date money moves and may settle one or more compatible Open Items belonging to at most one Counterparty.
_Avoid_: Settlement date field

**Payment Reversal**:
A corrective record that neutralizes a posted Payment which did not represent a real cash movement, together with its applications and accounting effects.
_Avoid_: Refund Payment, Chargeback, deleted Payment

**Refund Payment**:
A new opposite-direction Payment representing money that genuinely moved back after an earlier Payment.
_Avoid_: Payment Reversal, edited Payment

**Chargeback**:
A bank-initiated opposite-direction Payment that removes previously settled funds while preserving the original Payment as historical fact.
_Avoid_: Payment Reversal, deleted receipt

**Chargeback Resolution**:
The explicit treatment of a Chargeback as either reopening the original settled Open Items or creating a new receivable against the Counterparty responsible for recovery.
_Avoid_: Automatic Invoice reopening, Payment Reversal

**Chargeback Receivable**:
An amount-due Open Item against the Counterparty responsible for repaying charged-back funds while the original customer Invoice remains settled.
_Avoid_: Reopened Invoice, processor fee

**Chargeback Recovery Payment**:
A new incoming Payment representing disputed funds returned after a Chargeback, linked to that Chargeback and applied to its selected recovery target.
_Avoid_: Chargeback Reversal, edited Chargeback

**Payment Application**:
The allocation of part of a Payment to one compatible Open Item, preserving both the Payment Currency amount consumed and the Document Currency amount settled; it also connects Refund Payments to credit balances.
_Avoid_: User Category, Journal Line, Refund Application

**Application Reversal**:
An immutable settlement record that neutralizes a previously active Payment Application without erasing the original allocation.
_Avoid_: Deleted application, edited match

**Replacement Payment Application**:
A new allocation linked to a reversed Payment Application that identifies the Open Item the Payment was actually intended to settle.
_Avoid_: Edited application

**Payment Currency**:
The currency in which cash moves for a Payment, which may differ from the Document Currency of any Open Item it settles.
_Avoid_: Document Currency, Functional Currency

**Unapplied Amount**:
The portion of a posted Payment, measured in Payment Currency, that has not yet been allocated to Open Items through active Payment Applications.
_Avoid_: Missing transaction, unposted cash, payment error

**Unapplied Receipt**:
Incoming cash not yet allocated to an Open Item and represented as a customer credit, advance, or other appropriate liability under the applicable posting policy.
_Avoid_: Revenue, paid invoice

**Supplier Advance**:
Outgoing cash paid before allocation to a supplier Open Item and represented as an asset until applied or otherwise resolved.
_Avoid_: Expense, settled Bill

**Realized FX Difference**:
The Functional Currency gain or loss recognized when settling a foreign-currency balance at a rate different from its functional carrying amount.
_Avoid_: FX Revaluation, exchange-rate edit

**Open Item**:
A recognized receivable or payable that remains available for settlement until its outstanding amount reaches zero. Its balance and settlement status are derived from recognition, adjustments, and Payment Applications.
_Avoid_: Journal Entry, paid flag

**Credit Open Item**:
A recognized customer or supplier credit balance created from a Credit Note and available to offset one or more amount-due Open Items or support a Refund Payment.
_Avoid_: Negative Invoice, edited Bill

**Credit Application**:
An immutable allocation of part of a Credit Open Item to an amount-due Open Item that preserves the amount consumed and the amount settled.
_Avoid_: Invoice edit, Payment Application

**Cross-Currency Credit Application**:
A Credit Application whose Credit Open Item and amount-due Open Item use different currencies, preserving both native amounts, conversion provenance, and Functional Currency carrying amounts.
_Avoid_: Exchange-rate edit, same-currency auto-match

**Credit Transfer**:
An authorized movement of an available credit balance from one Counterparty to another that preserves both parties, the amounts transferred, and its accounting provenance.
_Avoid_: Cross-counterparty Credit Application, Counterparty edit

**Outstanding Amount**:
The non-negative Document Currency balance of an Open Item that remains available for settlement after recognition, adjustments, and active Payment Application effects.
_Avoid_: Editable paid amount, negative invoice balance

**Invoice**:
A first-class customer document that records an amount requested for goods or services and may link to an Open Item and one or more Journal Entries according to the applicable Recognition Policy.
_Avoid_: Payment, receipt, generic transaction

**Bill**:
A first-class supplier document that records an amount owed for goods or services and may link to an Open Item and one or more Journal Entries according to the applicable Recognition Policy.
_Avoid_: Invoice, Payment, generic expense

**Document Line**:
One commercial component of an Invoice, Bill, or Credit Note describing what was sold, purchased, or adjusted, including its quantity, price, discounts, and applicable tax facts.
_Avoid_: Journal Line, User Category, Ledger Account posting

**Document Posting Policy**:
A versioned, deterministic rule that translates a source document and its Document Lines into proposed Journal Entries and Journal Lines.
_Avoid_: Document Line, AI classification, direct user posting

**Document Classification Input**:
The user-facing category, business purpose, and structured facts supplied for a Document Line so the Document Posting Policy can propose its accounting treatment.
_Avoid_: Ledger Account, Posted Journal Line

**Posting Proposal**:
A reviewable accounting treatment produced by a Document Posting Policy before posting, containing the proposed Ledger Accounts and balanced Draft Journal Entries.
_Avoid_: Posted Journal Entry, source document, accounting truth

**Document Revision**:
An identified version of a draft source document and all facts that affect its commercial totals or proposed accounting treatment.
_Avoid_: Posted Journal Entry version, edit timestamp

**Document Total**:
The monetary summary derived from a document's lines and explicit discounts, charges, taxes, and rounding adjustments under its currency and rounding policy.
_Avoid_: User-entered balancing amount, Ledger Account balance

**Document Currency**:
The single currency in which every line price, adjustment, tax, total, and Open Item amount of an Invoice, Bill, or Credit Note is denominated.
_Avoid_: Functional Currency, Payment Currency, mixed-currency document

**Finalized Document Revision**:
The immutable Document Revision accepted when an Invoice is issued, a Bill is approved, or a Credit Note is finalized, including its calculated monetary snapshot.
_Avoid_: Draft document, Posted Journal Entry

**Rounding Adjustment**:
An explicit document amount that reconciles calculated components to the currency's permitted precision under the applicable rounding policy.
_Avoid_: Hidden total override, discount

**Stale Posting Proposal**:
A Posting Proposal whose bound Document Revision or accounting-policy inputs no longer match the current source state and therefore cannot be posted.
_Avoid_: Invalid Posted Journal Entry, rejected document

**Accepted Posting Proposal**:
The current Posting Proposal atomically used to create Posted Journal Entries and retained as the audit explanation for that accounting treatment.
_Avoid_: Draft proposal, Posted Journal Entry

**Recognition Policy**:
The explicit accounting rule that determines when and in what amount a source document or economic event produces Journal Entries. Document issuance or approval may satisfy the rule but does not universally define it.
_Avoid_: Payment terms, document status, posting timestamp

**Recognition Event**:
The occurrence that satisfies a Recognition Policy and authorizes the corresponding accounting treatment, such as delivery, service performance, acceptance, or passage of time.
_Avoid_: Invoice issuance, Payment, server event

**Immediate Recognition Policy**:
A Recognition Policy that treats the current qualifying business event as sufficient to recognize the full applicable amount now.
_Avoid_: Cash-basis accounting, automatic payment

**Manual Recognition Policy**:
A Recognition Policy that leaves recognition pending until an authorized user records the qualifying Recognition Event and accounting treatment.
_Avoid_: Draft Journal Entry, unreviewed AI posting

**Recognition Schedule**:
A plan for recognizing an amount across future dates or performance events rather than all at once.
_Avoid_: Payment schedule, invoice due date

**Credit Note**:
A first-class correction document that reduces or reverses all or part of a recognized Invoice or Bill through linked accounting entries rather than editing the original document or Posted Journal Entry.
_Avoid_: Editing an issued document, deleting a Posted Journal Entry

**Draft Journal Entry**:
An incomplete or uncommitted accounting entry that may still be changed or discarded.
_Avoid_: Posted entry

**Posted Journal Entry**:
An immutable, balanced accounting record recognized in the General Ledger.
_Avoid_: Editable transaction

**Opening Journal Entry**:
A Posted Journal Entry establishing a Workspace's account balances at a chosen cutover date, including the corresponding equity or other opening counterparts.
_Avoid_: Opening balance field, initial balance row

**Opening Balance Equity**:
An equity account used to represent the net position introduced when a simple Workspace begins tracking existing balances.
_Avoid_: Unexplained balancing error

**Start Tracking Workflow**:
An opening workflow that establishes a Workspace's net position at a chosen date without claiming to reproduce earlier accounting history.
_Avoid_: Historical migration

**Continue Existing Books Workflow**:
An opening workflow that imports and reconciles an existing adjusted trial balance before posting the Workspace's opening accounting state.
_Avoid_: Start Tracking Workflow

**Historical Import**:
A subscription-gated workflow that converts Excel or CSV financial history into reviewable, source-linked Journal Entries under the normal classification and ledger invariants.
_Avoid_: Direct spreadsheet posting, AI-generated ledger

**Import Reconciliation Unit**:
The smallest source-backed group of imported Draft Journal Entries that must validate, reconcile, and commit atomically, such as one account statement period or one adjusted trial balance.
_Avoid_: Individual imported row, entire multi-year upload

**Imported Source Row**:
An immutable staged representation of one source record with a stable identity used for provenance and idempotency.
_Avoid_: Journal Line, posted transaction

**Reversal Entry**:
A new Posted Journal Entry that offsets another Posted Journal Entry without erasing it.
_Avoid_: Delete, void

**Replacement Entry**:
A new Posted Journal Entry containing the corrected accounting treatment after an incorrect entry has been reversed.
_Avoid_: Edit

**Locked Period**:
An entire Workspace accounting period in which postings and backdated entries are prohibited until an authorized user explicitly reopens it.
_Avoid_: Archived month

**Period Control Decision**:
An immutable, ordered record of locking or reopening a Workspace Accounting Period. It preserves the authorized actor, reason, and the action-specific validation or reconciliation evidence without replacing earlier decisions.
_Avoid_: Module reconciliation status, silent override

**Fiscal Calendar**:
A Workspace-specific, versioned definition of fiscal-year boundaries, defaulting to January through December. A new version applies prospectively and never reassigns historical Accounting Dates or Locked Periods.
_Avoid_: Report date filter, global calendar

**Accounting Period**:
One calendar-month control boundary within a Workspace Fiscal Year, used for closing review and hard locking. An arbitrary report date range is not an Accounting Period.
_Avoid_: Report range, fiscal year

**Month Close**:
A guided workflow that reviews a monthly Accounting Period, completes any explicit accounting work, and then hard-locks it. The lock itself is a control decision, not a financial transaction or balance update.
_Avoid_: Automatic balance adjustment, silent closing entry

**Prior-Period Restatement**:
The correction of a material error in previously presented periods by revising comparative amounts or opening balances as though the error had not occurred, when practicable.
_Avoid_: Ordinary Payment Reversal, silent backdated edit

## Product experience

**Cash-style Entry**:
A simplified entry experience for an immediate receipt or payment that generates an accounting-correct entry in the accrual-capable General Ledger.
_Avoid_: Cash-basis accounting

**Local Entry Draft**:
Device-owned, short-lived form input for a manually initiated financial entry. It never synchronizes or becomes Workspace state; submitting it invokes an ordinary online server command under current Workspace authority.
_Avoid_: Workspace Draft, offline transaction, sync queue

**Notification Intake**:
An optional, user-consented workflow that interprets selected device notifications as local suggestions for financial activity. It is neither an accounting source of truth nor a completeness mechanism.
_Avoid_: Notification ledger, automatic posting

**Notification Intake Candidate**:
A device-owned, short-lived suggestion derived from allowed notification content and held for user review. It is not a Workspace Draft, source record, or accounting record and has no Posting Authority.
_Avoid_: Draft Journal Entry, Bank Source Transaction, automatic transaction

**Discard Notice**:
A content-free local acknowledgement that Notification Intake discarded a notification instead of creating a Candidate. It reports intake behavior without preserving the discarded evidence or implying financial activity.
_Avoid_: Notification Intake Candidate, accounting exception

**Notification Intake Receipt**:
An immutable Workspace record created when a user confirms a Notification Intake Candidate into accounting. It preserves the normalized suggestion and confirmation history without retaining raw notification content or source-application identity.
_Avoid_: Notification Intake Candidate, source notification, Posting Authority

**Progressive Disclosure**:
One financial engine presented at different depths: basic users see simple inputs and insights, while advanced users can inspect and control the underlying bookkeeping and reporting.
_Avoid_: Separate basic and advanced ledgers

**Savings Recovery Plan**:
A Personal or Household Workspace commitment to replenish an earlier expense through scheduled contributions into a designated savings or investment asset. It may include the original amount and a Savings Premium, but it is never a Liability.
_Avoid_: Self-debt, loan to self, expense reversal

**Draft Savings Recovery Plan**:
An editable proposal for a recovery bundle and schedule that has not yet reserved Expense Recovery Candidates or accepted Recovery Contributions. Activation validates and freezes it as a Savings Recovery Plan.
_Avoid_: Active plan, Draft Journal Entry

**Suspended Savings Recovery Plan**:
An activated plan whose source-expense eligibility changed and whose future recovery activity is paused pending cancellation and replacement. Its frozen schedule and completed contributions remain historical fact.
_Avoid_: Cancelled plan, payment default

**Savings Premium**:
The total amount by which a Savings Recovery Plan's scheduled installments exceed its original expense principal. It is a derived behavioral saving goal, not accounting interest or investment return, and any amount already contributed remains historical saving if the plan ends.
_Avoid_: Self-interest, investment yield

**Annual Self-Charge Rate**:
The non-negative nominal annual rate used by a Savings Recovery Plan. The user may set it directly or let the amortization core calculate it from principal, installment count, and Regular Recovery Amount; it is never accounting interest, an investment return, or an external borrowing rate.
_Avoid_: Implied Self-Charge Rate, investment return, credit-card rate

**Regular Recovery Amount**:
The compact, currency-friendly amount used for every Recovery Installment except the final settlement adjustment. The user may set it directly or let the amortization core calculate it from principal, Annual Self-Charge Rate, and installment count.
_Avoid_: Exact amortized payment, arbitrary payment precision

**Recovery Installment**:
One monthly contribution in a Savings Recovery Plan, split into principal recovery and Savings Premium by the amortization core. Regular installments use the Regular Recovery Amount, while the final installment settles the remaining plan amount.
_Avoid_: Loan payment, investment contribution

**Recovery Prepayment**:
The portion of a Recovery Contribution applied to one or more not-yet-due Recovery Installments in their original order. It advances completion without recalculating the frozen schedule or reducing its Savings Premium target.
_Avoid_: Loan principal curtailment, schedule rewrite

**Combined Recovery Payment**:
The sum of outstanding Recovery Shortfalls and current Recovery Installments due across all Active Savings Recovery Plans for one month. It is the first priority in the Monthly Recovery Waterfall and may be satisfied through one real transfer.
_Avoid_: Savings Premium, Liability payment

**Recovery Shortfall**:
The unpaid portion of a due Recovery Installment, carried forward at highest planning priority without penalties, additional premium, or accounting effects.
_Avoid_: Default, arrears, mora

**Expense Recovery Candidate**:
A review-only representation of an ordinary Posted Personal or Household expense amount that may be recovered now, enrolled in a Savings Recovery Plan, deferred, or excluded. It never changes the original expense, creates a Liability, or posts accounting by itself.
_Avoid_: Accounts payable, unpaid expense

**Plan Source Allocation**:
The measured portion of one Expense Recovery Candidate assigned to the principal of one Savings Recovery Plan. It preserves source-expense traceability when a plan bundles multiple expenses without combining their original accounting.
_Avoid_: Journal Line allocation, merged expense

**Contribution Source Allocation**:
The measured principal portion of one Recovery Contribution attributed to one Plan Source Allocation. It advances bundled source expenses proportionally while preserving exact contribution-level provenance.
_Avoid_: Savings Premium allocation, Journal Line

**Available Recovery Cash**:
The cash a Personal or Household Workspace may safely apply to self-imposed recovery after protecting essential spending, taxes, required reserves, and real external obligations.
_Avoid_: Bank balance, total income, free cash flow

**Monthly Recovery Waterfall**:
The planning priority that applies Available Recovery Cash first to Recovery Shortfalls and current Recovery Installments, then to Expense Recovery Candidates, optional Recovery Prepayment, and ordinary saving.
_Avoid_: Bank payment waterfall, Journal Entry allocation

**Recovery Contribution**:
The measured principal and Savings Premium portions of a Posted asset-to-asset transfer allocated to one Savings Recovery Plan. Unallocated transfer value remains ordinary saving, and earnings produced by the destination asset are not Recovery Contributions.
_Avoid_: Debt payment, investment return

**Recovery Contribution Reversal**:
An immutable planning correction that neutralizes one Recovery Contribution without changing its supporting Posted transfer. Replacement contributions may reinterpret the restored transfer capacity while preserving the original attribution history.
_Avoid_: Reversal Journal Entry, deleted contribution

**Recovery Contribution Date**:
The date the supporting asset transfer actually moved value, used to place Recovery Contribution progress in the plan timeline. It is preserved even when the allocation is recorded or corrected later.
_Avoid_: Recovery Recording Time, correction date

**Recovery Recording Time**:
The audit instant when a Recovery Contribution, proposal decision, or reversal entered the recovery history. It supports as-known-at reporting without changing the Recovery Contribution Date.
_Avoid_: Accounting Date, backdated contribution

**Recovery Allocation Proposal**:
A reviewable deterministic suggestion for interpreting an independently imported Posted transfer as Recovery Contributions. It creates no recovery progress until the user accepts it.
_Avoid_: Automatic match, Journal Entry

**Recovery Opening Progress**:
A cutover-only declared baseline for recovery progress that predates the app's available transfer evidence. It is displayed separately from verified Recovery Contributions and never creates or implies accounting.
_Avoid_: Opening Balance, fabricated transfer
