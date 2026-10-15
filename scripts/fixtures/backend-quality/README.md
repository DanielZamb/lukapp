# Backend quality regression fixtures

These inputs preserve the existing tooling regressions without retaining complete investigation reports. They do not establish runtime or quality acceptance.

- `legacy` contains coverage and source for only the four modules read by the legacy mapping tests. Source hashes and counters are unchanged.
- `ast-remapping` contains the nested-callback fixture and the two Recovery mapper inputs. The tests exercise zero counters, missing callback mappings, source locations and invalid ranges.
- `mapper-diagnosis` contains expected coverage maps and the original pinned mapper used to compare ignore-hint behavior. It does not include the investigation logs or generated CRAP reports.
- `graph-correction` contains suite identities, numeric runner statuses and configuration facts used by the sandbox regression tests. Unused command logs, output paths and calculation summaries are omitted.

JSON maps retain their source locations and counts. Large machine-generated maps use compact JSON, matching the coverage provider's output format. Full originals are preserved outside Git in the local run archive.

Run `node --test --test-concurrency=1 scripts/backend-*.test.mjs` from the repository root. New execution output belongs under the ignored `quality/backend` directory, not here.
