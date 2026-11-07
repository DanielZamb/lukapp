# Real-provider verification

For Lukapp UI/UX, frontend, backend and auth work, completion requires testing the relevant behavior against the real Convex development deployment and Clerk. Local unit tests, convex-test, controlled provider transports and synthetic identities are regression evidence only.

Before reporting a runtime feature as verified or closing its implementation ticket, record the exact source/build, deployment URL and deployed source, actual authenticated Clerk admission, requests through the normal public API, expected and observed outcomes, and relevant negative/retry checks. UI acceptance must exercise that deployed backend. Admin/CLI identity overrides and fabricated tokens do not establish end-user authentication.

If real-provider configuration, sign-in or device access is missing, keep runtime acceptance open and record the missing check. A resolved specification or local code merge does not imply deployment or live acceptance. Clearly separate local, deployed, authenticated and full UI evidence.

The user permits deleting or resetting records in the named Convex development deployment for migrations and testing. Keep the environment and affected tables explicit in the receipt. This permission excludes production. Prefer isolated test records when a reset is unnecessary. Never print credentials or tokens. Let the normal SDK/CLI consume configured credentials. Keep physical/hardware skips explicitly labelled; they do not authorize a software fallback in production. Respect the current device-closure and production/cutover restrictions.

The current program's provider gate and receipts live in `.verification/provider/provider-verification.json`.

# Engineering lessons

For accounting, categories, transfers, retries, authorization, migrations, or verification work, read [VERIFICATION-LESSONS.md](VERIFICATION-LESSONS.md). It records the historical counterexamples, design lessons, and limits of prior evidence. Use it to guide new checks; current runtime acceptance still follows the real-provider requirements above.

# Navigation

Unnecessary navigation cycles are an anti-pattern. When screen B was opened from screen A, returning to A must reuse the existing screen. Do not push another A onto the stack or add reciprocal forward links that create A → B → A → B without advancing the user's task. Use one clear return path. Define an explicit fallback for direct links that have no caller.

Encode return-only flows in the component interface: expose `onBack`, and omit callbacks that could push the parent as a new destination. Keep regression checks for the forbidden forward control and the expected return behavior.

Review every navigation change by tracing its entry, child, cancel and return paths. Repeat the round trip twice, including Android system Back and sheet dismissal. A completed return must restore the existing caller without accumulating duplicate screens, reopening a dismissed sheet or losing the caller's state.

# Issue tracking

Track technical implementation, bugs, verification work, and marketing work in the Lukapp project on Linear. Include source references and acceptance evidence when updating a ticket. Implemented work with outstanding real-provider checks stays open.

Keep routine Wayfinder questions, research, prototypes, and planning in local documentation. Promote a Wayfinder item to Linear only when it is important enough to require shared tracking, such as a release blocker or a consequential product decision. Preserve links to existing decisions and ticket history.

# Retained verification assets

Keep the private `.verification/` directory and this checkout's `.git` when cleaning build or orchestration output. Read [VERIFICATION-ASSETS.md](VERIFICATION-ASSETS.md) for the retained inputs, historical evidence, and runnable checks. `.verification/` contains private financial corpus and configuration files and must stay excluded from publication. New generated verification results belong in `reports/`. The former `.orchestrator/` directories are historical origins, not required runtime inputs.
