# U02 category slice

This local slice adds server categories to the expense editor from U01 correction `dc90360`, then migrates all accounting writes through tested G01 session/device guards. It implements the local SEN-71 path and part of SEN-60. It does not establish runtime acceptance or close either ticket.

The source requirements are the current SEN-71, SEN-60, SEN-57, and SEN-58 descriptions, ADR-0086, the original prototype, and the reviewed frontend design-system HTML. SEN-27's August 28 comment requires up to three categories. No allocation or counting rule is recorded. The current form explicitly labels its one-category limit. The coordinator is awaiting the user's choice of primary category with labels, split amounts, or overlapping full amounts.

## Public API flow

All protected writes now use G01's tested thin-sid boundary from `f4e66c5`. Public actions verify the live Clerk session, then call internal mutations that check current device, membership, and operation permission in the same transaction. Reads remain reactive queries with local current guards. [The write migration receipt](WRITE-MIGRATION.md) records all endpoints, permissions, cleanup integration, and remaining acceptance gaps. No challenge or attestation API is used.

The following calls use the app's normally authenticated Convex client. This sequence describes the public contract; it is not a real-provider execution receipt.

```ts
import { api } from "../../convex/_generated/api";

const presets = await client.query(api.accounting.listCategoryPresets, {
  nature: "Expense",
});

// Presets have a fixed nature and ask no nature question.
const created = await client.action(api.accounting.createUserCategory, {
  workspaceId,
  selection: {
    kind: "preset",
    presetId: "groceries",
    style: { emoji: "🛒", tone: "primary" },
  },
});

if (created.kind === "category") {
  const payload = {
    workspaceId,
    financialAccountProfileId,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-10-17",
    description: "Groceries",
    idempotencyKey: "one-stable-key-per-expense",
    userCategoryId: created.category.id,
  };
  await client.action(api.accounting.recordCashExpense, payload);
  const activity = await client.query(api.accounting.postedActivity, {
    workspaceId,
    month: "2026-10",
  });
  // The row's detail is Food, and its amount is -150000 minor units.
}
```

Custom names first call `suggestCategoryNature({ name, direction: "out" })`. The response contains `allowed`, `suggested`, and `version`. The native sheet preselects a suggestion and requires the user to confirm with **Add category**. An unknown or ambiguous name requires an explicit answer. Setup omits `direction` and offers all four answers.

```ts
await client.query(api.accounting.suggestCategoryNature, {
  name: "mercadoo",
  direction: "out",
});
// suggested: spend; allowed: spend, stillMine, payDebt

await client.action(api.accounting.createUserCategory, {
  workspaceId,
  selection: {
    kind: "custom",
    name: "mercadoo",
    answer: "spend",
    style: { emoji: "🛒", tone: "primary" },
  },
});
```

The `stillMine` and `payDebt` answers return `{ kind: "accountSetupRequired", name, answer }`. They create no category, account, or journal entry. The sheet explains the missing place-setup handoff. Debt copy includes the outstanding-amount question. The full account setup flow remains unbuilt here.

`listUserCategories({ workspaceId })` returns server records for the picker. `restyleUserCategory({ workspaceId, categoryId, style })` changes only icon and color. It cannot change a category's nature or posting account.

`ensurePersonalDefaults({ functionalCurrency, startingMinorUnits, categories })` accepts optional category selections in the same shape as `createUserCategory.selection`. The setup screen holds these as unsaved form drafts. One mutation creates the workspace, categories, My money, and opening entry atomically. An account-door answer aborts the entire mutation. An identical retry returns the existing setup. Different category answers produce `setup_conflict`; reordering the same selections does not.

## Policy and storage

`userCategories` is separate from `ledgerAccounts`. Journal lines store an optional `userCategoryId` on the classified counterpart, never on the money-holding side. Posted entry DTOs expose the category ID and name. The activity reader supplies the name in `detail`, so the mobile row renders the category without a ledger code or account name. Reversed rows retain that label alongside **Reversed**.

The write path is the public `accounting.recordCashExpense` action, the guarded `accountingWrites.recordCashExpense` internal mutation, `recordCashExpense`, `recordCashActivity`, `categoryPostingCode`, `requireTemplateAccount`, and `postJournalEntry`. All journal writes still reach the shared Posting entry point. The read path is `accounting.postedActivity`, `postedActivity`, `listJournalEntries`, and `journalContext`. The context resolves category names from server records. Money totals still come from posted lines.

The versioned `category-es-en@1` policy normalizes accents, case, and repeated whitespace. Exact aliases win. Names and aliases of at least four characters tolerate one insertion, deletion, or substitution. Equal best concepts do not choose an arbitrary account. Resolution searches only the confirmed nature and otherwise uses its template default. Nature suggestions also cover the two account doors.

There are eleven expense presets and four income presets. Each preset has a concept key and an account for both `co-puc-personal@1` and `us-gaap-personal@1`. Food routes to `51959501` or `5310`. Unknown expense names resolve to `51959595` or `5599`. A category with a nature but no final account also uses the template's default. A legacy category without a nature blocks posting, including when an advanced override is submitted.

Category records preserve the nature source and account classification source. Presets record their concept; custom resolution records a lexicon concept and version or a fallback version. Creation retries reuse a record by normalized name without changing its style or classification. A different classification under the same normalized name returns `category_name_conflict`. Style changes use the explicit restyle mutation. Rename, archive, merge, and changes to nature or posting account are not exposed in this slice.

`ledgerAccountCode` remains the advanced override and keeps the existing recording-use guard. Category identity participates in Posting's payload comparison even when two categories resolve to the same account. Reversals preserve the original category on the mirrored line.

## Native contract and retry behavior

`PostingForm` remains presentational. It receives a category label and an `onCategory` callback. The route composes it with `CategoryPicker({ workspaceId, value, onChange, visible, onClose })`. That component coordinates the native modal with `useCategoryPicker`; `CategorySheet` only renders supplied state and emits callbacks. Setup uses the same sheet and create/restyle workflow. No shared UI or token file changes belong to U02.

Posting uses a searchable native sheet with existing categories, suggestions, **No category**, and **Add your own**. Starter suggestions appear in setup, not as chips on the posting form. Only expense categories are selectable in the expense editor.

Deliberate setup, posting, category search, create, and restyle edits call U01's `useLocalEntryInteraction` from controller handlers. Restored storage values and provider updates do not count as user activity.

The posting transport captures U01's admitted local-input lease and fences both pending saves and clears. Caught confirmed wipe signals in setup, category, and posting controllers report through U01's cleanup hook. The editor returns without its own deletion or sign-out when that hook takes ownership. The inner protected-read boundary handles thrown read errors. See [the cleanup receipt](WRITE-MIGRATION.md#error-classification-and-privacy-handoff).

The pending expense schema now preserves optional `userCategoryId` through SecureStore JSON. Existing saved expenses without categories remain valid. `useExpenseEditor` restores category identity, locks selection while a payload is pending, and retries that exact payload and key after an uncertain response. A confirmed post clears the category with the other entry fields. The page stays open with **Posted**, and **Done** dismisses only the banner.

## Local evidence and remaining gaps

`node scripts/verify-u02.mjs` runs the full Vitest suite, backend and mobile typechecks, and `git diff --check`. The local receipt is 230 passing tests in 20 files, with both typechecks passing. The existing Vitest configuration and react-test-renderer emit deprecation notices.

The public-handler tests cover both template mappings, name normalization and typo suggestions, nature-scoped rent, unknown and missing-account fallbacks, account-door refusal, setup atomicity and retries, category identity conflicts, advanced overrides, and reversal labels. Mobile hook and schema tests cover category persistence, restoration, exact-payload retry, locking, and clearing after acknowledgement.

This evidence uses signed-session fixtures, normal public registration/actions with a controlled Clerk HTTP transport, and local React tests. Kernel-only workspace provisioning fixtures are not public endpoints. The raw public workspace-creation action is denied. It does not establish actual Clerk admission or requests against `https://compassionate-opossum-63.convex.cloud`. No deployment, native build, device interaction, Linear mutation, or push was performed. The SEN-11/SEN-68 session/device gate and the unresolved security boundary remain open.

The remaining product work includes SEN-27's up-to-three-category accounting decision, account-door handoff and account setup, SEN-58 reclassification and its impact preview, full **Edit category**, rename/archive/merge, income posting UI, Candidate review, and native keyboard, gesture, accessibility, and prototype-fidelity acceptance. Source contrast proposals remain unaccepted. No posted history mutation or reclassification acceptance is claimed.
