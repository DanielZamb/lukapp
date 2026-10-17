# U04 Posted history and reversal

L1 implementation for SEN-73 and SEN-44, based on `b548162`. The local commit containing this receipt is the U04 handoff. No runtime acceptance or ticket closure is claimed.

## Contracts and presentation

Read sources were root `AGENTS.md`, `CONTEXT.md`, `MIGRATION.md`, the frontend run preferences, the reviewed `design-system.html`, current SEN-73/SEN-44 descriptions and SEN-44 resolution comments, the existing reversal command/tests, and U02's handoff, multi-category and write-migration contracts. No failed PR5 material was used.

SEN-44's September 30 resolution hides reversal rows from ordinary activity. SEN-73, created later that day, explicitly requires both original and reversal in history. This implementation keeps the four-row Overview and three-row account previews original-only, marking corrected originals **Reversed**. Full history includes both postings and their detail links. This resolves the two requirements by destination; the coordinator should retain that interpretation in the runtime review.

Overview and account detail offer **View all activity**. Their rows and full-history rows open `/entry?entryId=...`. `/history` is workspace-wide; `/history?profileId=...` filters one account. History requests 50 postings initially, and **Load 50 more** requests the next 50 through `usePaginatedQuery`. A `FlatList` renders loaded rows. Each row shows title, accounting date/categories, signed amount, and correction state. Detail displays account, date, the complete category set and explicit primary. It offers **View original entry**, **View reversal**, or an explicit reversal confirmation as applicable. Basic presentation renders no debit/credit columns or ledger codes.

`HistoryScreen` and `EntryDetailScreen` render supplied state and callbacks. Routes own Convex/router composition; `useReversal` owns confirmation and request state. Shared UI and token files are unchanged. The detail and history screen layouts are inferred compositions of existing controls; native fidelity is still unverified. Liability summaries say **Owed** or **Balance owed**. Posting/account setup remains U03's responsibility, including the existing Post money route's default account behavior. Budget/Plans remain U06's responsibility.

## Read and reversal contracts

New public queries in `convex/accounting.ts`:

- `postedHistory({workspaceId, financialAccountProfileId?, includeReversals?, paginationOpts})` returns `{page, continueCursor, isDone}` and native pagination split metadata when supplied by Convex. `includeReversals` defaults to true. Initial page requests are capped at 50; reactive ranges may grow or split according to Convex's pagination protocol. Cursors are opaque and belong to that workspace/filter. Recent previews request 4 or 3 with `includeReversals:false`.
- `postedEntry({workspaceId, journalEntryId})` returns `{entry, row}`. `entry` is the existing full Posted DTO, including original/reversal IDs and immutable category assignments. `row` is the basic presentation projection. Malformed, wrong-table and foreign entries fail with `journal_entry_not_found` after workspace authorization.

Both queries use the current Owner/device/workspace read guards. No actor, session, device or security observation is supplied by mobile. Read policy and projection live in `src/accounting/queries`; Convex adapters validate transport and call those queries.

`by_workspace_date` orders entries by workspace, accounting date and posted time. `by_workspace_profile_date` additionally scopes the financial account profile. Convex supplies its remaining index tie-breakers. The adapter fetches lines by each page's entry ID and reversal links by the existing reversal index. Existing cash/opening/reversal entries already carry the relevant date/profile, so the indexes cover them without a record rewrite. Schema deployment/index readiness belongs to the coordinator.

`postedActivity` preserves its existing default response and adds `includeRows:false` for the mobile summaries. This prevents those callers from transferring an unused full history alongside the paginated list. It now shares the row projection with the new queries and returns account nature for owed labels. Row direction comes from Posted profile-line debits minus credits, so a card purchase is negative while its owed balance increases. Category labels and the explicit primary remain unchanged.

Reversal still calls the existing guarded `reversePostedEntry` action. No action, internal mutation, Posting policy, category assignment rule or stored entry is changed. The exact mobile payload is:

```ts
{
	workspaceId,
	journalEntryId,
	idempotencyKey: `mobile-reversal@1:${workspaceId}:${journalEntryId}`,
}
```

There is no editable correction payload or new persisted input. The same original always gets that same key across retries, navigation, unlock and process restart. Omitting date/description preserves the existing server defaults and replay-after-lock behavior. The server uses the original date or earliest permitted open date. An uncertain response retains retry; a deterministic rejection is explained. Duplicate taps are fenced. Mounted-lifetime checks discard old responses after target changes/unmount. Confirmed privacy denials go to the existing U01 callback. No SecureStore key or cleanup contract is added; existing pending-expense fences remain untouched.

## Local evidence

Run from the bound U04 worktree:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
git diff --check
pnpm --filter @lukapp/mobile exec expo export --platform android --output-dir /tmp/u04-native-android
pnpm --filter @lukapp/mobile exec expo export --platform ios --output-dir /tmp/u04-native-ios
```

The full run passes **307 tests in 27 files**. Backend/mobile typechecks and both native Hermes exports pass. Logs are `/tmp/u04-tests.log`, `/tmp/u04-typecheck.log`, `/tmp/u04-native-android.log` and `/tmp/u04-native-ios.log`. The final targeted presentation rerun is `/tmp/u04-screens.log`. A test-only mocked spinner locator initially failed mobile typing; using the imported component fixes it, and the final typecheck is green.

Five new backend tests exercise 105 postings as 50/50/5, accounting-date order with backdated entries, both links, four-row previews, account filtering including existing records, empty history, malformed/foreign reads, exact stored original/line preservation, category/primary mirroring, same-key replay and zero net balances/category totals. Existing admission/device/membership read matrices now include both queries. Five controller tests cover confirmation/cancel, duplicate taps, uncertain retry/reopen, target-change/unmount lifetimes and privacy-denial handoff. Two presentation tests exercise row/detail actions, states, signed amounts, links and hidden accounting codes. Existing reversal period/idempotency and U01/U02 suites remain green.

These tests use in-memory Convex, controlled Clerk fixtures and local React/native drawing substitutes. Exports bundle JavaScript/Hermes; they do not install or exercise a native app. No provider-touching Convex command, including codegen, was run. Local generated bindings were used as-is. No deployment, provider/config/data mutation, rollback, shared Metro session, device operation, root checkout edit, push or delegation occurred. Static Expo export used its own terminating bundler.

## Coordinator's exact real API and phone recipe

1. Integrate the U04 commit, record the exact integrated SHA/build and deployed source, and deploy only through the coordinator's approved process. Wait for the two indexes to be ready. Target only `https://compassionate-opossum-63.convex.cloud`. Preserve the provider audit restriction on codegen/deploy until separately cleared. Record real Google/Clerk Owner admission, local unlock, and normal reactive `deviceAccess.status` registration. Use the application's normally authenticated SDK, without CLI admin identities or fabricated tokens. Never log credentials.
2. With that admitted SDK client and the local generated `api`, run the following normal reads. Use the existing personal defaults or U03's normal setup; a missing default is a prerequisite, not permission to bypass admission.

```ts
const defaults = await client.query(api.accounting.personalDefaults, {});
if (!defaults) throw new Error("Complete normal setup first");
const workspaceId = defaults.workspace.id;
const financialAccountProfileId = defaults.financialAccountProfile.id;
const before = await client.query(api.accounting.postedActivity, {
	workspaceId, month: "2026-10", includeRows: false,
});
let cursor: string | null = null;
const seen = new Set<string>();
for (;;) {
	const page = await client.query(api.accounting.postedHistory, {
		workspaceId, paginationOpts: { cursor, numItems: 50 },
	});
	for (const row of page.page) {
		if (seen.has(row.id)) throw new Error("Duplicate history row");
		seen.add(row.id);
	}
	if (page.isDone) break;
	cursor = page.continueCursor;
}
const accountPage = await client.query(api.accounting.postedHistory, {
	workspaceId, financialAccountProfileId,
	paginationOpts: { cursor: null, numItems: 50 },
});
```

3. Have at least 51 isolated Posted records available to verify a second phone page, and record their IDs/baseline effects. If the coordinator needs fixtures, create them through normal `recordCashExpense` actions with distinct keys and the admitted default profile, for example `{workspaceId, financialAccountProfileId, amount:{currency:defaults.workspace.functionalCurrency,minorUnits:1}, accountingDate:"2026-10-17", description:"U04 page N", idempotencyKey:"<unique-run>:page:N"}`. Do not reset shared records for this check. Record exact initial page counts, continuation, ordering and observed IDs, including a backdated entry.
4. On the phone, open Home → Overview. Expect at most four recent original entries. Tap **View all activity**, scroll, and tap **Load 50 more**. Expect older rows, no duplicate IDs, and the end message only on exhaustion. Open an account → **View all activity**; expect only that account. Recent account activity remains at most three originals. Verify empty and loading states, long descriptions, scrolling, accessibility labels and source-token fidelity on native.
5. Through U03's posting UI, record an isolated expense of `150000` minor units with U02's category set and explicit primary when classifications differ. Record its entry ID, category IDs/primary, month, original account balance and overall spend baseline. Read `postedEntry` for that ID and retain the original DTO/lines. Open the same row from history, verify amount/date/account/categories/primary, tap **Reverse entry**, then **Keep entry**. Expect no new posting or balance change. Reopen confirmation and tap **Confirm reversal** once. Expect **Reversal posted** with the server date, the original marked **Reversed**, and **View reversal**. Follow it and **View original entry** back. Neither detail offers a second reversal action. Full history includes both rows; the recent previews hide the reversal row.
6. Read and retry the exact public contract below. If the UI created the reversal, the first explicit action here is already a replay. Expect the same reversal ID, `replay:true` on retry, `original.entry.lines` unchanged, reciprocal links and one opposite amount. In an open same-month case the account balance/overall spend return to their pre-expense values, and every selected category returns by the full `150000`, without summing overlapping totals.

```ts
const original = await client.query(api.accounting.postedEntry, {
	workspaceId, journalEntryId,
});
const args = {
	workspaceId, journalEntryId,
	idempotencyKey: `mobile-reversal@1:${workspaceId}:${journalEntryId}`,
};
const correction = await client.action(api.accounting.reversePostedEntry, args);
const replay = await client.action(api.accounting.reversePostedEntry, args);
const linkedOriginal = await client.query(api.accounting.postedEntry, {
	workspaceId, journalEntryId,
});
const linkedReversal = await client.query(api.accounting.postedEntry, {
	workspaceId, journalEntryId: correction.id,
});
const after = await client.query(api.accounting.postedActivity, {
	workspaceId, month: "2026-10", includeRows: false,
});
const categories = await client.query(api.accounting.categoryTotals, {
	workspaceId, month: "2026-10",
});
```

7. Exercise lost acknowledgement, double taps and reopen/unlock/process restart with that same original/key, then verify one reversal. A different key for the same original must reject `journal_entry_already_reversed`; reversing the reversal must reject `reversal_cannot_be_reversed`. Check a malformed/foreign entry and foreign profile against the normal read APIs. Under the coordinator's device verification, check unregistered/revoked admission and removed membership for both reads and the existing action, including U01 cleanup. Existing locked-period fixtures should select the next open date. Verify category/month-spend effects in the reversal's actual month if it differs from the original. Do not lock shared accounting periods just to create this case.

## Open gaps

The deployment/index readiness, exact source match, real Clerk requests, normal authenticated API results and native UI journey above remain unperformed by U04. Record their observed results separately. No earlier U01/U02 tracer establishes acceptance of this source.

The existing balance and monthly-spend readers still scan complete workspace ledger data; the new history queries do not use those readers. Category/profile/account labels still load the workspace's read context. Further aggregation/index work is needed for large summary workloads. The entry/profile index supports the current cash, opening and reversal policies; future multi-account transfers need the account-line/date index and migration described by SEN-44, plus To/From presentation. This slice adds no transfer policy or line-date backfill. Native UI fidelity, real pagination reactivity under concurrent posting, hardware privacy/biometrics, process-kill and revocation cleanup remain coordinator checks. U03 posting/account selection and U06 Budget/Plans are outside U04.
