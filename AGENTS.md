# Real-provider verification

For Lukapp UI/UX, frontend, backend and auth work, completion requires testing the relevant behavior against the real Convex development deployment and Clerk. Local unit tests, convex-test, controlled provider transports and synthetic identities are regression evidence only.

Before reporting a runtime feature as verified or closing its implementation ticket, record the exact source/build, deployment URL and deployed source, actual authenticated Clerk admission, requests through the normal public API, expected and observed outcomes, and relevant negative/retry checks. UI acceptance must exercise that deployed backend. Admin/CLI identity overrides and fabricated tokens do not establish end-user authentication.

If real-provider configuration, sign-in or device access is missing, keep runtime acceptance open and record the missing check. A resolved specification or local code merge does not imply deployment or live acceptance. Clearly separate local, deployed, authenticated and full UI evidence.

The user permits deleting or resetting records in the named Convex development deployment for migrations and testing. Keep the environment and affected tables explicit in the receipt. This permission excludes production. Prefer isolated test records when a reset is unnecessary. Never print credentials or tokens. Let the normal SDK/CLI consume configured credentials. Keep physical/hardware skips explicitly labelled; they do not authorize a software fallback in production. Respect the current device-closure and production/cutover restrictions.

The current program's provider gate and receipts live in `.orchestrator/runs/2026-10-13-core/orchestrate/lukapp/sources/provider-verification.json`.
