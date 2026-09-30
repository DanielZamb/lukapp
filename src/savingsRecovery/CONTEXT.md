# Savings Recovery

This context defines the planning language for replenishing earlier Personal or Household expenses through real saving. It refers to Posted expenses and Posted asset-to-asset transfers from the Finance Domain but never records accounting.

## Language

**Recovery Plan Authority**:
The Workspace permission to activate, cancel, and correct Savings Recovery planning. It never grants authority to post or alter General Ledger accounting.
_Avoid_: Posting Authority, plan ownership

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
The total amount by which a Savings Recovery Plan's chosen installments exceed its original expense principal. It is a derived behavioral saving goal—not accounting interest or investment return—and any amount already contributed remains historical saving if the plan ends.
_Avoid_: Self-interest, investment yield

**Implied Self-Charge Rate**:
The monthly rate mathematically implied by a Savings Recovery Plan's principal, chosen installment count, and chosen installment amount. It is a transparent description of the plan, not an external yield or user-entered rate.
_Avoid_: Investment return, credit-card rate

**Recovery Installment**:
One scheduled monthly amount in a Savings Recovery Plan, split into principal recovery and Savings Premium using the Implied Self-Charge Rate. Every installment uses the chosen amount except for a minor final currency-rounding adjustment.
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
