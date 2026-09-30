---
name: finance-tracker-v2-core-structure
description: Design or review Finance Tracker v2 server and accounting core files when implementing commands, queries, Convex functions, or ledger posting. Use for oversized files, duplicated rules, or accounting logic in adapters.
---

# Finance Tracker v2 core structure

Use this skill during implementation or review of the server and accounting core. Read the applicable phase in `MIGRATION.md` and the relevant terms in `CONTEXT.md` before changing a boundary. Apply the rules to the current slice; do not build future modules solely to satisfy a folder layout.

## File boundaries

- Give each core file one concern: a command, a query, or a shared domain invariant. Name shared files for the rule they own, such as `posting.ts` or `periods.ts`.
- Commands express accounting intent and build Draft entries. Queries read the ledger and reporting projections. Keep write and read paths separate.
- Put every General Ledger write through one Posting entry point, such as `postJournalEntry`. It must enforce Workspace scope, Posting Authority, valid Posting Accounts, balanced nonzero lines in Functional Currency, Accounting Date and period rules, provenance, idempotency, and atomic creation of immutable Posted entries. Commands must not insert Journal Lines directly. Reversals use the same Posting controls and preserve the original entry.
- Extract logic shared by two concerns into one named module. Callers use that module instead of copying its checks. Avoid catchall `helpers.ts` and `utils.ts` files.
- Keep Convex functions and route or server-function files thin: parse and validate transport input, call one core command or query, and map the result. Accounting policy belongs in the core.

## The 600-line review trigger

When a server or core file passes 600 lines, inspect its responsibilities. Split at a real concern boundary when one exists. Keep a cohesive file together even if it stays long, and put a one-line comment at its top explaining why. Never split a concern merely to meet the count.

Before finishing, trace one write command and one read query through their adapters. Confirm that each ledger write reaches the shared Posting entry point and that neither path duplicates its invariants.
