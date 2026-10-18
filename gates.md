# First-run gates

Hermes 0.14.1 has no `Intl.DisplayNames`. Home imports Setup, so currency names
must load without that API. Keep a static English name for every
`functionalCurrencyCodes` entry in
`apps/mobile/src/features/setup/currencies.ts`. Its import test runs without Intl
and checks that every supported currency has a name.

After a failed setup submission, Cancel and Start tracking must remain usable.
A `setup_conflict` discards the saved request, explains that setup was already
saved with different answers, and allows editing or cancellation. Other failures
unlock the sheet and preserve the submitted payload for an identical retry.
Cancellation must call `onCancel` even when a retry payload exists.

Run `pnpm test && pnpm typecheck` from the repository root. Do not boot a
simulator, start Metro, deploy Convex, or change local-auth for this fix.
