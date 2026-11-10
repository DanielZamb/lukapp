# Standalone amount conventions and grammar

Branch `t3/currency-aware-amount-grammar`. Implementation source commit `f2f0ffd474cdb21a0e880d092364d5237d779f38`, based on integration `a23df04f2fb769dff68d7d7dfe5aae13373bead0`. Baseline fixtures were committed first in `856a995`. This report and the two JSON receipts are a separate documentation commit. The final handback names that commit's head.

[SEN-122](https://linear.app/sennkai-labs/issue/SEN-122/implement-currency-amount-conventions-and-strict-standalone-grammar) tracks implementation and subsequent acceptance. It stays open. The governing inputs were ADR 0096 including Consequences, the entire amount-format design study, worker-conventions.md, AGENTS.md, VERIFICATION-LESSONS.md and VERIFICATION-ASSETS.md. The task's a23df04 baseline and COP/USD-only decisions supersede the worker document's older baseline and the study's proposed 155-profile activation.

The new APIs let a caller format and parse exact signed minor units under a chosen profile, receive a typed correction reason, and edit grouped text without inferring decimal intent. COP and USD have explicit profiles. The other 153 currencies each have an explicit entry selecting the named Colombian legacy style. Unknown currency lookup throws, including inherited object keys. Precision and every live app caller retain their existing behavior.

## Public API

All money-text functions are in [src/money/amount.ts](../../src/money/amount.ts). No runtime dependency, React, translator, Intl, floating major-unit arithmetic or BigInt is used.

| Function | Contract |
| --- | --- |
| `parseAmount(text, format)` | Returns `{kind: "parsed", minorUnits}` or `{kind: "refused", issue}`. Only a leading optional sign, ASCII digits, correct groups and the workspace decimal are valid. Outer whitespace is trimmed. Financial zero is positive zero. |
| `formatMinorUnits(minorUnits, format, options?)` | Formats safe integer minor units exactly, including a Unicode minus. `hideZeroDecimals` omits an all-zero fraction only. Invalid numeric inputs throw RangeError. |
| `createAmountEditor(format, text?)` | Creates bound editing state. Empty text is incomplete. Valid initial text is normalized, grouped and preserves an explicit sign. Invalid initial text is preserved. Initial text uses paste semantics, so incomplete short groups are invalid until explicitly edited. |
| `editAmount(previous, edit)` | Pure reducer. Returns text, selection, generated-group positions and `kind`. Only `complete` has minorUnits. Accepts one-character typing, selection replacement by paste, Backspace/Delete, selection changes and semantic decimal insertion. Invalid attempts replace the previous valid value and cannot retain its minorUnits. |
| `formatCompactBody(minorUnits, format, options)` | Exact ungrouped numeric body with currency decimal. Caller selects scale and precision and appends language-specific suffixes. Rounds half up in magnitude with decimal digit arithmetic. Never parse the approximate result as an amount. |

Public money types are `AmountPrecision = 0 | 2 | 3`, `AmountFormat = {convention, precision}`, `AmountIssue`, `AmountParseResult`, `CompactBodyOptions`, `AmountSelection`, `AmountEdit` and `AmountEditorState`. Compact options have `scale: 0 | 3 | 6 | 9 | 12`, `fractionDigits: 0 | 1 | 2` and optional `trimTrailingZeros`. Selection start/end are UTF-16 offsets, as native text input uses. Invalid offsets and multi-character `type` events throw at the API boundary. Use `paste` for a replacement string.

[Currency metadata](../../src/accounting/currencies.ts) exports `AmountConvention`, `FunctionalCurrency`, the frozen `copAmountConvention`, `usdAmountConvention`, `legacyAmountConvention` and `currencyAmountConventions`, plus `isFunctionalCurrency(string)` and `currencyAmountConvention(string)`. A profile carries id, version 1, group, decimal, primary and secondary group sizes. All active profiles group in threes. The type also represents a secondary width of two for a later reviewed profile. No Indian, space or apostrophe profile is activated. A currency's future reassignment to an existing profile is one mapping-line change and requires updating the independent literal registry test.

Typical standalone use is:

`const format = { convention: currencyAmountConvention(currency), precision: currencyMinorUnitDigits(currency) };`

Perform convention lookup first so unknown currencies cannot receive the existing precision helper's fallback. The old precision helper itself was left unchanged as required. These APIs have no locale or language parameter.

Refusal codes are `empty`, `incomplete`, `wrong_separator`, `bad_grouping`, `too_many_decimals`, `decimals_not_allowed`, `too_large` and `not_a_number`. Payloads name expected digits/fraction/group, actual versus allowed fractional length, offending separator and expected separators, grouping widths, maximum minor-unit digits, or invalid character/index. A COP `12.34` is bad grouping, never a guessed decimal. A short manually typed final group is an incomplete editor state even though the standalone parser refuses it as bad grouping. The same pasted short group is invalid.

## Editing decisions

A stateful reducer was chosen over a stateless sanitizer. The latter cannot distinguish a generated group from a literal group or delete the correct adjacent digit. Model the Domain shaped the edit union, generated-position state and complete/incomplete/invalid result. Type System Discipline shaped the result union so only complete state carries a numeric value. Sequence Work into Verifiable Units shaped the separate baseline commit and the checked core commit. These leaf skills were read. All code and prose are comment-free and follow the required unslop guidance. The user prohibited nested agents, so architectural comparison and source review were performed locally. No delegated review is claimed.

Digit edits remove only known generated groups and then regroup valid text. Literal groups remain literal. COP typing `1`, `.`, `2`, `3`, `4` shows `1`, `1.`, `1.2`, `1.23`, `1.234`. Only the last is a complete grouped value. Generated `1.234` followed by digit 5 becomes `12.345`. The same unknown pasted `1.2345` stays invalid. The USD mirror uses commas for grouping.

The semantic decimal event inserts the chosen decimal at the selection. Empty or sign-only input gains an explicit zero whole part. If a decimal already exists, the caret moves just after it. At precision zero, a decimal attempt remains visible and invalid; the app must disable the decimal button. Invalid zero-precision input is not normalized. Deleting a generated separator with Backspace removes the preceding digit. Delete removes the following digit. Deleting manual incomplete punctuation removes that punctuation literally. Tests pin replacement selections, mid-string edits, pasted punctuation, explicit signs, leading zeros, overflow, recovery after invalid input and UTF-16 selection behavior.

There is no blur, review/acknowledgment, storage migration, sign-direction control, React Native replacement-span adapter or command creation in this preparatory core. A complete result establishes grammatical completeness only. It does not authorize submission or represent a reviewed value.

## Colombian behavior differences

The following table is the complete reviewed witness corpus in [legacyDifferences.test.ts](../../src/money/legacyDifferences.test.ts), with machine-readable results in [amount-policy-differences.json](amount-policy-differences.json). Numeric values are integer minor units. I is today's formatMoneyInput. P is today's direct parseMoney using es-CO and the row's precision. The I then P column shows the value today's sanitizer could manufacture. A refusal in the new column also preserves the original text in an invalid or incomplete editor state. For `-0`, editing keeps the sign while the parsed financial zero is normalized.

| p | Input | Old I | Old direct P | Old I then P | New direct parse | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | `letters` | `` | `refused` | `refused` | `not_a_number` | Characters are retained instead of stripped. |
| 2 | `1abc234` | `1.234` | `refused` | `123400` | `not_a_number` | Characters are retained instead of stripped. |
| 2 | `$12` | `12` | `refused` | `1200` | `not_a_number` | Currency symbols are not numeric input. |
| 2 | `1 234,50` | `1.234,50` | `refused` | `123450` | `not_a_number` | Internal whitespace is not removed. |
| 2 | `1e3` | `13` | `refused` | `1300` | `not_a_number` | Exponent text is not stripped to digits. |
| 2 | `1-2` | `-12` | `refused` | `-1200` | `not_a_number` | An internal sign is not relocated. |
| 2 | `--1` | `-1` | `refused` | `-100` | `not_a_number` | Duplicate signs are not collapsed. |
| 2 | `+-1` | `+1` | `refused` | `100` | `not_a_number` | Competing signs are not resolved. |
| 2 | `12.` | `12,` | `refused` | `1200` | `bad_grouping` | A group mark cannot become a decimal. |
| 2 | `12.5` | `12,5` | `refused` | `1250` | `bad_grouping` | A group mark cannot become a decimal. |
| 2 | `12.50` | `12,50` | `refused` | `1250` | `bad_grouping` | A group mark cannot become a decimal. |
| 2 | `.5` | `,5` | `refused` | `refused` | `bad_grouping` | A leading foreign group mark is not decimal intent. |
| 2 | `1.234.` | `1.234,` | `refused` | `123400` | `bad_grouping` | A second group mark cannot become a decimal. |
| 2 | `1.0005` | `10.005` | `refused` | `1000500` | `bad_grouping` | Unknown pasted malformed grouping is not regrouped. |
| 2 | `1..2` | `12` | `refused` | `1200` | `bad_grouping` | Repeated groups are not removed. |
| 2 | `1,,2` | `1,2` | `refused` | `120` | `wrong_separator` | Repeated decimals are not removed. |
| 2 | `1,2.3` | `1,23` | `refused` | `123` | `wrong_separator` | Group marks in fractions are not removed. |
| 2 | `1,2345` | `1,23` | `refused` | `123` | `too_many_decimals` | Excess fraction digits are not truncated. |
| 2 | `1.234,567` | `1.234,56` | `refused` | `123456` | `too_many_decimals` | Excess fraction digits are not truncated. |
| 2 | `1,23foo` | `1,23` | `refused` | `123` | `not_a_number` | Fraction text is not stripped. |
| 2 | `USD 1,234.56` | `1,23` | `refused` | `123` | `not_a_number` | Labels and foreign formats are not repaired. |
| 2 | `1,234,567` | `1,23` | `refused` | `123` | `wrong_separator` | Repeated decimal text is not truncated. |
| 2 | `12,` | `12,` | `1200` | `1200` | `incomplete` | A trailing decimal cannot submit. |
| 2 | `0,` | `0,` | `0` | `0` | `incomplete` | A trailing decimal cannot submit. |
| 2 | `-0` | `-0` | `-0` | `0` | `0` | Signed financial zero is normalized. |
| 2 | `9007199254740992` | `9.007.199.254.740.992` | `refused` | `refused` | `too_large` | Overflow remains visible and nonpostable. |
| 0 | `12,` | `12,` | `12` | `12` | `decimals_not_allowed` | Zero-digit currencies reject even bare decimal marks. |
| 0 | `12,abc` | `12,` | `refused` | `12` | `not_a_number` | Invalid text cannot become an accepted zero-digit amount. |
| 0 | `1.0005` | `10.005` | `refused` | `10005` | `bad_grouping` | Only editor-generated grouping permits digit continuation. |
| 3 | `12.5` | `12,5` | `refused` | `12500` | `bad_grouping` | Foreign decimal guessing is removed for three digits too. |
| 3 | `12.50` | `12,50` | `refused` | `12500` | `bad_grouping` | Foreign decimal guessing is removed for three digits too. |
| 3 | `1,2345` | `1,234` | `refused` | `1234` | `too_many_decimals` | A fourth fractional digit is not truncated. |
| 3 | `12,` | `12,` | `12000` | `12000` | `incomplete` | Trailing decimals are incomplete at every nonzero precision. |

These witnesses represent infinite input families rather than a claim that all possible malformed strings can be listed individually. All changed families are:

- Invalid characters, currency labels/symbols, internal whitespace, exponent text and punctuation in the fraction remain visible and blocked instead of being deleted.
- Internal, duplicate or competing signs remain blocked instead of being relocated or collapsed. A bare Unicode minus remains that literal incomplete sign until a valid value can normalize it; old I rendered an ASCII minus immediately. Outer whitespace around incomplete raw text may likewise remain visible until it can canonicalize.
- A single dot followed by zero through p digits, except exactly three, no longer changes to a decimal comma. This includes `12.`, `12.5` and `12.50` at p=2 or p=3. Exactly three trailing dot digits keep their grouped meaning under Colombian style, even at p=3.
- A grouped integer followed by a dot no longer turns that final dot into a comma. Partial manually typed groups remain incomplete, with their punctuation visible. Malformed pasted groups never silently regroup.
- Extra fractional digits and extra separators are neither discarded nor rounded. Overflow is visible and blocked, instead of merely producing an apparently formatted string.
- P formerly accepted a bare trailing comma. At p>0 it is now incomplete; at p=0 every decimal token is forbidden. A fraction cannot be submitted until a digit is supplied or its decimal is explicitly removed.
- Raw leading decimals remain refused by parse/paste. A semantic decimal or a typed workspace decimal from empty/sign-only input visibly inserts the missing zero. COP typing comma then 5 now gives `0,5`, complete at p=2/3. Today's I gave `,5`, which today's P rejected. A foreign leading dot never receives this convenience.
- Generated-group deletion follows explicit Backspace/Delete intent and moves the caret. Literal and pasted punctuation have no such inferred deletion behavior. Invalid edits retain no previous numeric value.
- Financial negative zero now parses as zero. Editing preserves the explicit sign until the caller commits a full display.

All accepted Colombian values retain their original numeric meanings, apart from normalizing negative zero. New complete input is never repaired from a foreign convention. Today's direct parser already rejected most malformed examples; the major change is that its old sanitizer no longer manufactures another input first. Correct Colombian display text, optional leading signs, outer whitespace, valid leading zeros, ungrouped integers, exact groups and fractions up to the currency precision still mean the same minor units. Canonical full and hide-zero displays remain exact.

## Properties and mutation evidence

The tests cover COP, USD and the distinct legacy profile at p=0/2/3. Each format exhausts signed minor units -200000 through 200000, including full display and hide-zero round trips. A deterministic digit-string generator adds thousands of samples up to the safe bound, both signs, the final 101 representable positive values and boundaries around powers of ten through 10^15. The independent naive reader validates group lengths first, splits on its independently selected decimal, strips only validated groups, then compares decimal digit strings to the safe bound. It does not call any implementation helper. Generated accepted and malformed strings must agree with that reader.

Canonical typing properties exercise both literal groups and automatic grouping, with semantic decimal events. The numeric value of every complete intermediate visible string is compared with both the parser and the independent reader. The streams cover every minor value 0 through 2000, both signs, every three-power group break and neighbors through 10^15, selected fraction/group values, and MAX_SAFE_INTEGER. Empty, sign-only, trailing decimal and partially typed manual groups are nonpostable. The literal thousand-confusion matrix states expected minor values or exact refusal codes by hand for all requested strings, orientations and precisions. Separate low-range and generated checks compare canonical Colombian text against the actual unchanged parseMoney.

`node src/money/check-mutations.mjs` temporarily edits the real implementation, runs named assertions, captures failing test witnesses, and restores both files in a finally block. It removes old output before each run and requires failed assertions, not just a nonzero exit. [The mutation receipt](amount-mutations/receipt.json) records exact edits, failed test names, failure excerpts, source hashes and restoration. The five final runs all exited 1 because assertions failed. The runner itself exited 0.

| Mutant | Failed tests | First catching test |
| --- | --- | --- |
| swap-usd-separators | 40 | `usd/0 literal thousand-confusion 1.234` |
| accept-foreign-decimal | 1 | `cop/2 literal thousand-confusion 12.34` |
| allow-short-group | 12 | `cop/0 literal thousand-confusion 12.34` |
| drop-safe-integer-bound | 1 | `safe bounds are tested as strings before conversion, without Intl or BigInt` |
| round-excess-decimals | 3 | `cop/2 literal thousand-confusion 1,234` |

Restoration was byte-identical. Final amount.ts SHA-256 is `163d9a63bb3dafc52d8fe4ed52f16be843adf7a99d6d29e9e44cbe0406dca350`. currencies.ts SHA-256 is `1731cbb834121c48bf40e0c6e4101e7e71367004237a7697d2ffc068c3b5b2c4`. The full suite and both typechecks passed after restoration. Generated raw per-mutant Vitest output remains local under amount-mutations; the compact receipt is retained with this report.

## Observed checks

Environment was Node v22.23.4, pnpm 10.30.1, Vitest 3.2.7 and the lockfile's TypeScript 5.9.2. No dependencies were added. The required `pnpm install --frozen-lockfile --offline` passed. pnpm reported ignored dependency build scripts; none were enabled.

The initial baseline fixture run passed 190 tests before core implementation. The final baseline fixture file contains 191 tests after adding the explicit English/Spanish bank-boundary check. The final full `pnpm vitest run` passed 165 files and 2477 tests, with exit 0. This includes the original 1983 tests without modifying any of them. There were no full-suite failures. `pnpm typecheck` passed the root and mobile projects with exit 0. `git diff a23df04 --check` passed.

During development, the first editor run had 12 failures: invalid decimal/precision edits lost generated grouping, and zero-precision invalid Unicode text was being expected to normalize. Generated groups are now retained on invalid attempts; the zero-precision tests explicitly expect unchanged invalid text. Three follow-up failures concerned that same unchanged-invalid rule for a middle decimal at p=0; those expectations now state the raw visible text. The first typecheck failed with TS6142 because a new root regression test imported the intake facts graph, which reaches TSX. The regression file was moved into the mobile test project before the baseline commit was finalized. Both typechecks then passed. A final review corrected code-point indexing to UTF-16 indexing for generated positions. Its literal regression passed, followed by the final whole-suite run. A test-support trailing blank line found by the staged whitespace check was removed before the core commit was finalized.

Vitest reported its existing environmentMatchGlobs deprecation and React test-renderer deprecation warnings. They are not runtime acceptance and were not suppressed. No benchmark or performance claim is made.

## Design discrepancies and next stage

The task's suggestion that p=0 can admit a string under both swapped conventions with different values conflicts with its ban on decimal input. Under p=0, `1.234` is valid Colombian grouping and refused under USD. `1,234` is the mirror. At p=2 one reading is likewise refused. Dual validity with different values exists only at p=3, with exactly one mark, one through three whole digits and exactly three trailing digits, plus an optional leading sign. Repeated marks are groups or invalid; both marks can only follow one grammar's group-before-decimal order. The tests enumerate this class over whole values 0..999, representative three-digit tails and signs, and check generated dual-valid candidates against the class. At p=3 a nonzero grouped reading is 1000 times the decimal reading. No parser can infer which convention a person intended. The UI still owes the full preview/review rule.

The study's BHD comma-group/dot-decimal and JPY comma-group examples are not activated. Both keep dot grouping and comma decimal metadata under the owner's narrowed policy. Precision zero still rejects decimal input. Space/apostrophe aliases, native digits and 155 distinct regional choices remain outside this implementation. The named legacy profile is a separator policy, not the old parser. Its strict grammar rejects old trailing-comma text. It must never be used as the frozen legacy storage reader.

The reducer deliberately requires prior state and an explicit edit. The next stage must derive replacement spans from React Native selection/text changes, preserve generated-group provenance and handle uncertain edit/paste intent conservatively. Do not reconstruct state with createAmountEditor on every keystroke. Do not rely only on onKeyPress or region inference. When provenance is unavailable, keep punctuation literal and block malformed text. Currency changes must create a new editor session; language changes must preserve the session. The core binds convention and precision, but the app must additionally bind workspace/currency identity and review acknowledgment.

Before any activation, migrate and version stored amount text under the frozen old Colombian parser and saved precision. Keep unresolved legacy strings, Candidate evidence, IDs, expiry/revisions and unknown-outcome commands intact. Preserve numeric pending payloads and retry keys. Wire every parser/display/compact/accessibility caller together. Use the new profile lookup before precision lookup. Remove old locale/default parsing only in that later migration. Do not use the bank extractor for pasted user input. Keep suggest.ts/native bank grammar and raw bank spans unchanged; facts.ts can format the already-extracted integer when its caller is migrated. Never re-extract original bank evidence to migrate formatting.

Add the app decimal button to every amount field, including sheets, on both platforms. Its label must include currency and decimal purpose. Disable it for p=0 and provide a sign/direction control where negative input is permitted. Translate issue details into catalog hints with workspace examples. Render the full currency-code preview and bind explicit review to currency, profile version and minor units before dispatch, especially after migration and punctuation-bearing paste. Neither `complete` nor a disabled Save button alone enforces that review.

Compact callers choose their existing suffix thresholds and fraction-digit policy, then pass scale and digits to formatCompactBody. Only the suffix and words follow language. The core rounds exact ties half up in magnitude. Compare existing toFixed edge cases when wiring callers; no existing compact path or rounding policy was changed here. Currency symbols remain the separate, unchanged mobile prefix concern.

## Provider and scope receipt

This is local pure-code evidence only. No app build or binary was produced. No Convex deployment URL was selected, no source was deployed, no Clerk session was admitted, no normal public API request was made and no UI was exercised. The current provider gate in .verification/provider/provider-verification.json was not edited, and runtime acceptance remains open. The worker conventions expressly prohibit deployment and device work in this assignment.

The coordinator's later acceptance must record exact app source/build and Hermes runtime, development deployment URL and deployed source, actual authenticated Clerk admission and requests through the normal public API. Exercise UI against that backend and compare displayed/reviewed/submitted/persisted minor units. Include COP/USD workspaces with Colombia/US keyboards and both languages, sign and p=0/2/3 legacy controls, malformed/foreign input, excess fractions, overflow, semantic decimal, mid-string editing, generated-group deletion, saved legacy USD text, language changes, currency reset, restart/migration retry and frozen unknown outcomes. Keep physical keyboard, accessibility and hardware checks explicit. Preserve current device-closure and production/cutover restrictions. Local tests cannot close SEN-122.

The only changed existing production file is src/accounting/currencies.ts, where metadata is appended without changing its existing set or precision lookup. New production code is src/money/amount.ts. New tests, a rerunnable mutation script and these requested reports account for the remaining files. money.ts, suggest.ts and facts.ts were compared byte for byte against a23df04 and match. No screen, storage, backend, existing test, dependency, private verification input, primary checkout or sibling worktree was edited. No Python workaround was used, so no Todo CLI feature gap was identified. No push, PR or deployment was performed.
