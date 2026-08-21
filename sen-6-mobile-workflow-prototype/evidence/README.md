# Prototype evidence

Screenshots captured from the throwaway mobile workflow prototype. They show
rendering only; verdicts and route maps live in the repository README and design
principles.

## SEN-7 — Notification Intake (Variant D)

Captured 2026-08-20 at 390×844 (web build, iPhone-scale viewport).

| File | Screen |
| --- | --- |
| `sen7-variant-d-01-inbox.png` | Candidates inbox with centered pulsing warning |
| `sen7-variant-d-02-reconciliation-warning.png` | Reconciliation warning detail |
| `sen7-variant-d-03-inbox-warning-dismissed.png` | Inbox after warning opened once this session |
| `sen7-variant-d-04-candidate-edit.png` | Candidate edit before confirm |
| `sen7-variant-d-05-disclosure.png` | Device consent disclosure |
| `sen7-variant-d-06-sources-health.png` | Source selection with listener health |
| `sen7-variant-d-07-discarded-detail.png` | Discarded notifications detail |
| `sen7-variant-d-08-month-close.png` | Month Close warning (non-blocking) |
| `sen7-prototype-chooser.png` | Native route chooser (all intake variants) |

Regenerate:

```bash
cd sen-6-mobile-workflow-prototype
npx expo start --web --port 8082
# in another terminal, with playwright installed locally or via npx:
EVIDENCE_DIR="$PWD/evidence" node scripts/capture-sen7-evidence.mjs
```

## SEN-6 — home workflow (Variant E)

Validated 2026-08-20:

- `android-home.png` — physical Android device `23113RKC6G`, loaded through
  Expo Go over USB/ADB.
- `ios-home.png` — iPhone 17 Pro simulator on iOS 26.5, loaded through Expo Go.

The complete interaction walkthrough was exercised on the web build at a
390×844 mobile layout: onboarding, Draft posting, state-driven Month Close,
Financial Account creation, Recovery Plan activation, and a posted Recovery
Contribution.
