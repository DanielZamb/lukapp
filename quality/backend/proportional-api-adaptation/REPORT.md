# Proportional allocation test adaptation

The branch fast-forwarded normally from approved `de65c76` to exact reviewed integration `48b9c33b42d902e447c140860a3cf670d4443b85`, tree `02ddbaa95c762e3717e7935bb8c9c5c64ad6b73b`. The only source edit adapts eight calls in `src/savingsRecovery/amounts.test.ts` to C04's reviewed `proportional(amount, parts, weight)` API. No production or tooling changes were made.

Allocation assertions now check complete `{part, amountMinor}` pairs. Distinct source identities verify part association and source-order tie breaking. All literal outcomes remain unchanged:

| Amount | Weights in source order | Expected cents in that order |
| ---: | --- | --- |
| 0 | 0, 10 | 0, 0 |
| 1 | 1, 1, 1 | 1, 0, 0 |
| 2 | 1, 1, 1 | 1, 1, 0 |
| 7 | 5, 3, 2 | 4, 2, 1 |
| 10 | 5, 3, 2 | 5, 3, 2 |
| 3 | 0, 4 | 0, 3 |

Amounts 1 against weights 0, 0 and 11 against weights 5, 3, 2 still require `recovery_capacity_exceeded`. The other two amounts tests remain byte-identical. No assertion was removed or weakened.

Checks ran sequentially. Both Vitest commands used `--maxWorkers=1 --no-file-parallelism`:

- `pnpm exec vitest run src/savingsRecovery/amounts.test.ts --maxWorkers=1 --no-file-parallelism`: 3 passed.
- `pnpm exec vitest run convex/savingsRecovery.test.ts --maxWorkers=1 --no-file-parallelism`: 25 passed.
- `pnpm typecheck`: exited 0.

[receipt.json](receipt.json) records exact commands, exits, times, compressed logs and source/test/configuration hashes. Its input digest is `c0dc5b8e39ab6982e996cc518a0fcaea75754a3da7c0525ca15d6357e73014bf`; inputs remained unchanged during the checks. [integrity.json](integrity.json) records the before/after test hashes, unchanged test sections and source comparison with `48b9c33`. The coordinator's original eight-error typecheck receipt, prior public-test pass and tooling approval remain verbatim in `history` gzip archives.

These are local regression checks. No full suite, load, coverage, mutation or retained-data audit ran. Production, tooling, dependencies, policy and fixtures remain unchanged from the reviewed integration source. Official combined-source execution still awaits the reviewed F03 union, and real-provider acceptance remains open.
