# Up to three overlapping categories

This L1 extension starts from exact tested/deployed source `f62ce26a38168efe39887d16949202abde6b4a9e`. That source includes F01 editor lifetime checks and U01 admission, interaction, cleanup and storage-lease guards. These guards remain in place. The coordinator reported U01's real Google/Clerk admission, device registration, COP/zero setup, one expense, Posted/Done, balance/spend and reload checks on that base. Those observations do not verify this extension.

The user decided on October 17 that every selected category counts the transaction's full amount. Category and Budget totals overlap. Overall spending, account balances and the balanced ledger count the transaction once. The user subsequently chose an explicit primary when selected categories suggest different posting accounts. No selection order determines accounting.

## Source and scope

[SEN-27](https://linear.app/sennkai-labs/issue/SEN-27/prototype-posting-a-transaction) identifies `create-tx-prototype.tsx` and its attached One-form screenshot as the visual source. Its August 28, 21:48 comment by Daniel Zambrano requires at most three categories and a prompt to create one encompassing concept above three. The earlier comment requires the same searchable create/restyle sheet as setup, plus same-page Posted/Done. Current [SEN-60](https://linear.app/sennkai-labs/issue/SEN-60/specify-the-category-module), [SEN-71](https://linear.app/sennkai-labs/issue/SEN-71/attach-a-user-category-to-an-expense), SEN-57/58, `CONTEXT.md` and ADR-0086 define category/account separation and backend classification. No failed PR5 contract or acceptance is used.

The native sheet now toggles zero to three categories, retains the selection while searching, and finishes with Done. A fourth selection leaves the current three unchanged. It explains the limit and offers **Create an encompassing category**. That explicit action opens the existing custom-category editor; **Use this category instead** creates or reuses that server category and replaces this expense editor's selected set with it after confirmation. Back or dismiss does not replace anything. The issue requires the limit and encompassing-category prompt; replacement of the current form selection is this implementation's interpretation, made explicit by the button text. It does not merge, archive, delete, reclassify, or rewrite any category, pending expense or Posted history. Ordinary Add your own still uses the shared sheet and does not silently replace the set.

The primary question uses category names and appears only when backend-resolved default accounts differ. Equal classifications, including missing-final-account fallbacks, ask nothing. Removing the chosen primary clears it; removing the conflict clears the unnecessary answer. The form waits for all selected classification details and for a required primary before enabling Post. Codes are never shown in the basic UI. Budget screens remain U06's work.

## Public write and storage contract

The normal authenticated call is still `api.accounting.recordCashExpense`. Its business arguments add:

```ts
{
  userCategoryIds: [foodId, diningId, familyId], // zero to three unique IDs
  primaryUserCategoryId: diningId, // required only for different resolved accounts
}
```

No actor, device ID, signed session, proof or other security argument comes from mobile. The public action verifies the live Clerk session and invokes the existing internal mutation with G01's validated session. The transaction checks the current device, workspace membership and `accounting:post`, then runs the accounting command. Every selected category must exist in that workspace and have the matching Expense nature. An unresolved legacy nature fails even with an advanced account override. Income uses the same set/primary rules with Income categories, but its native editor remains out of scope.

`category_selection_invalid` rejects duplicate/empty identities or simultaneous scalar and array formats. `category_limit_exceeded` rejects more than three. `category_primary_invalid` rejects a primary outside the selection. `category_primary_required` rejects conflicting classifications without a primary. These use the existing explicit accounting-error marker. Security/unavailable failures retain uncertainty unless U01's confirmed privacy cleanup takes ownership.

`categoryPostingCode` resolves every selected category's default, including its template fallback. A single distinct code is unambiguous. Different codes require the explicitly selected primary. `ledgerAccountCode` remains an advanced override with the existing use guard; it cannot bypass category ownership, nature or primary validation.

The command creates two ledger lines for the one transaction. Only the expense counterpart carries the category ID set and explicit primary. `postJournalEntry` remains the sole ledger write entry point. Set order is canonicalized for immutable storage and compared as a set on retries; explicit primary identity is part of the comparison. Adding/removing/replacing an identity or changing the primary under an existing key conflicts even if amounts or suggested accounts match. Reversals mirror all assignments and the primary without selecting a new classification.

Old `userCategoryId` public payloads, SecureStore pending records and immutable journal lines remain supported. The scalar is not combined with an array. New editor submissions use arrays; restored old payloads retry in their exact original shape/key. No data rewrite or migration command is required. Posted DTO lines expose `userCategories: [{id,name}]`; old lines retain their old scalar fields too. Activity rows expose all names and the explicit primary, and still represent one original expense with its reversed state.

Pending inputs preserve the exact submitted category array and primary through JSON, restoration and uncertain retries. Selection stays fixed until acknowledgement or an explicit deterministic accounting rejection. The route still fences BOTH save and clear using its captured U01 lease. Confirmed wipe errors return to U01 without editor-owned deletion/sign-out. Mounted-lifetime checks prevent late old responses from clearing a newer pending expense after navigation/inactivity remount. Same-page Posted and Done behavior remains unchanged.

## Reporting contract for U06

Use the normally authenticated reactive query:

```ts
client.query(api.accounting.categoryTotals, { workspaceId, month: "2026-10" });
// {
//   totalsOverlap: true,
//   month: "2026-10",
//   currency: "COP",
//   categories: [
//     { categoryId: diningId, name: "Dining", nature: "Expense", minorUnits: 150000 },
//     { categoryId: familyId, name: "Family", nature: "Expense", minorUnits: 150000 },
//     { categoryId: foodId, name: "Food", nature: "Expense", minorUnits: 150000 },
//   ],
// }
```

The actual list sorts by category name and includes existing unused categories with zero. All amounts use the workspace functional currency and integer minor units. This slice supports functional-currency cash postings only. COP and USD use two decimal places here: `150000` means COP 1,500.00 or USD 1,500.00 according to `currency`; no currency conversion occurs.

The month is a real `YYYY-MM` accounting month. Expense totals are tagged expense-line debits minus credits. Income totals are tagged revenue-line credits minus debits. An unresolved category has no `nature` and cannot acquire new postings. These are net signed monthly management amounts, not separate financial balances. Expense Budget consumption uses that expense category's amount; this query implements no budget limit, rollover or screen policy.

For a COP 1,500.00 expense tagged Food, Dining and Family, all three totals are `150000`; their sum is `450000` and must never be used as overall spending. `postedActivity.monthSpendMinorUnits` is `150000`, the money account changes by `-150000`, and there is one activity row and one balanced two-line entry. The explicit primary changes only the one accounting counterpart, never the overlapping amounts.

A same-month reversal contributes `-150000` to each selected Expense category and overall net spending, so the pair nets to zero. A later-month reversal leaves the original month's `150000` per category intact and reports `-150000` per category in the reversal's accounting month. Locked original periods use the existing earliest-open-period rule. The reversal preserves the original set and primary, reverses the ledger amount once, and does not add a second ordinary activity row. U06 must keep category totals separate from overall spending; a negative reversal month is an accounting correction, not an inferred new purchase.

`categoryTotals` is a query guarded by current device, workspace membership and `workspace:read`, like other financial reads. It does not make a live provider RPC or accept security arguments. `listUserCategories` adds the derived `resolvedPostingAccountCode` used by controllers to detect a conflict. Category creation and style changes retain `category:manage`. No new public write or mutation bypass was introduced.

## Exact provider/UI verification path still required

The coordinator must integrate and deploy the final tested extension SHA before verifying this path on `https://compassionate-opossum-63.convex.cloud`. Use real Clerk admission and the ordinary SDK, without admin identities or fabricated sessions. U02 made no provider/config/data/deployment, Metro, device, root-checkout or push changes.

1. Admit the real Google/Clerk Owner, unlock strong local entry, and use `deviceAccess.status` and the existing normal registration path as required. Reuse the live workspace and protected `personalDefaults` query. Setup, if needed, uses `ensurePersonalDefaults` and its guarded atomic transaction.
2. Open Post money, enter `-1.500,00` COP, and open the existing Category sheet. Read `listUserCategories` and protected presets. Create/reuse Food and Dining through `createUserCategory`; create Family as a confirmed custom Expense. Search, toggle all three, and verify the primary question appears. Choose Dining explicitly. There is no primary question for only Food or for three categories sharing one fallback.
3. Attempt a fourth selection and verify the original three remain. Verify the encompassing-category explanation. Cancel its editor and confirm the set is unchanged. In a separate unposted draft, explicitly confirm an encompassing category and verify it replaces only that form's selected set.
4. Finish the three-category sheet, post the normal action with the exact array/primary and one stable key, and observe Posted on the same page. Done only dismisses the banner. Protected activity shows one row with all three names, balance delta `-150000` and overall spend delta `150000` minor units.
5. Read `categoryTotals` for the same month; each selected Expense category increases by `150000` minor units. Inspect the normal Posted DTO to verify one counterpart account chosen by Dining and two balanced lines, with all assignments on the counterpart.
6. Exercise timeout/retry and reload/unlock with the same category payload/key. Verify one posted entry and unchanged totals. Exercise confirmed denial cleanup and failed native deletion separately under U01's ownership; a transient error alone must preserve uncertainty.
7. Through the normal `reversePostedEntry` action, reverse an isolated expense with a stable reversal key. Verify unchanged original identities/primary, one opposite ledger amount and the signed category/overall results above. Keep real-provider negative ownership, max-three, primary-membership and retry checks in the runtime receipt.

## Local evidence and gaps

### First-open modal lifecycle correction

The coordinator's live Android trace on the earlier mobile source showed the Category tap reaching `visible: true` with an editable form and a valid modal ref, but no sheet nodes or visual overlay. A read-only follow-up confirmed the ref's status was `6`, Gorhom 5.2.14's `DISMISSING` enum value. No diagnostic imperative present/dismiss call was used.

The initial hidden `CategoryPicker` effect called `dismiss()` before the modal had ever presented. In the installed library, that changes `INITIAL` to `DISMISSING` even though no inner sheet exists to finish closing. A later `present()` schedules a frame and sets its React mount state, but `handlePortalRender` suppresses the portal callback while status remains `DISMISSING`. This explains both the existing ref and the missing content. Native-stack z-order or provider relocation cannot resolve that suppressed portal callback.

The controller now remembers its previous visibility request and dismisses only after requesting a presentation. Its first hidden mount does nothing. Existing present/dismiss callbacks, auth admission order, portal/container placement, sheet UI and tokens are unchanged. No extra delay, new protocol or provider configuration is introduced.

The new regression exercises the installed Gorhom modal, modal provider and real portal with native drawing/animation isolated. Before the fix, hidden-to-first-open rendered `null` instead of the category content; the initially-open dismiss/reopen baseline passed. After the fix, both first-open and dismiss/reopen pass. This is lifecycle regression evidence, not a native rendering receipt.

Both static native Hermes exports pass: `pnpm --filter @lukapp/mobile exec expo export --platform android --output-dir /tmp/u02-modal-android` and the equivalent `--platform ios --output-dir /tmp/u02-modal-ios`. These are bundling checks, with no install, device launch or interaction with the coordinator's running Metro session.

Parent reproduction after integrating the separate fix: use the existing admitted Android session and preserved baseline; Money actions → Post money; enter the isolated expense; tap Category once. Expect the searchable Category sheet to appear, then dismiss and reopen it. Continue the three-category/conditional-primary flow above and keep actual posting, balance and category totals in the coordinator's provider/UI receipt. U02 made no device, running Metro, provider, auth, data, deployment or root-checkout changes.

`node scripts/verify-u02.mjs` passes 295 tests in 24 files, backend and mobile typechecks, and `git diff --check`. The actual-modal lifecycle suite has 2 tests; the focused overlap suite has 10 tests; picker/controller selection has 5; editor retry/lifetime has 33 and storage schema has 3. This is the reproducible local gate for tests, backend/mobile types and diff whitespace. Focused suites exercise full overlap, single accounting treatment, mixed-primary choice, no-primary rejection, primary membership, all selected identities' ownership/nature, uniqueness/max-three, retries/reordering/conflicts, legacy immutable history, both templates, income signs, fallback equivalence and cross-month reversals. Native controller/schema suites cover sheet selection/search, limit/replacement, conditional primary, pending storage/retry and F01 late-response remount behavior. Existing G01/U01 boundary and cleanup tests remain part of the full run.

Review A P2 corrected empty scalar validation after `a094d8b`. A supplied `userCategoryId: ""` is now preserved for the same validation as `userCategoryIds: [""]`, rather than treated as an omitted category. The new public-action expense and income regressions both failed before the fix because the scalar posted successfully. They now reject both representations with `category_selection_invalid` and verify unchanged existing ledger entries, balances and activity. Omitted categories remain valid; UI, security and pending retry behavior are unchanged. This is local regression evidence, with no new deployment or provider acceptance claim.

These use controlled Clerk transport/signed-identity fixtures and local React rendering. They do not establish real provider or native UI acceptance for this extension. Open runtime checks include the full path above, actual SecureStore failure/process-kill and revocation cleanup, native gestures/keyboard/accessibility and prototype fidelity. U01's completed base tracer is separate evidence. SEN-58 reclassification and impact preview, account-door setup, rename/archive/merge, income editor, Candidate review and Budget UI remain outside this slice. No ticket is closed by this local commit.
