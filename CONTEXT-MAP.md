# Context Map

## Contexts

- [Finance Domain](./CONTEXT.md) — Workspaces, the General Ledger, Posting, settlement, periods, and the basic entry experience
- [Savings Recovery](./src/savingsRecovery/CONTEXT.md) — plans that replenish earlier expenses through real saving

## Relationships

- **Savings Recovery → Finance Domain**: Savings Recovery reads Posted expenses and Posted asset-to-asset transfers by id. It never writes Journal Lines, holds balances, or grants Posting Authority. See ADR-0084.
