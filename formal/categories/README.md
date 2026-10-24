# Category verification

The category question now uses shared `Choice` cards and `Field` inputs.
The original finding and native evidence remain in
[the historical UI audit](ui-adherence.md). Current source adds category
management for creation, naming, appearance changes and deletion.

Run the bounded safety check from the repository root:

```sh
python3 formal/categories/verify.py
```

Run the isolated real-source mutation rehearsal after changing the verifier:

```sh
python3 formal/categories/verify.py --prove-checks
```

Use [the generated skill](../../.agents/skills/verify-categories/SKILL.md) for
the properties, bounds, source synchronization rules and runtime gate.
[coverage.json](coverage.json) names the exact source files and functions.
[receipt.json](receipt.json) records the latest run and points to its raw
reports. Tests execute real TypeScript and Convex public handlers through
convex-test. They do not prove all possible inputs or establish live provider
acceptance.

The [current UI acceptance](ui-acceptance.md) records the separate signed-in
iOS checks, exact source/build and development deployment. Android authentication
and physical hardware acceptance remain open.

Deletion removes a category from active selection while preserving its identity
for posted history, saved retries and reversals. Name and appearance changes
preserve accounting classification. Correcting accounting nature is a separate
Category Reclassification operation and is outside these metadata APIs.
