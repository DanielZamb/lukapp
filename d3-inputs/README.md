# D3 design inputs

These are the local inputs requested for the D3 Claude Cloud handoff on `xxl/d3-visual`. Repository paths are preserved under `d3-inputs/`. This upload is the user-authorized exception to the brief's original restrictions on publishing design artifacts.

Read the brief at `reports/xxl-2026-10-24/D3-visual-pass.md` in the repository root. Its local paths now resolve under this folder. Read both skills in the root `.claude/skills/` folder before designing.

## Input locations

- `reports/xxl-2026-10-24/D2/` contains `audit.md`, `recommendation.md`, the comparison grid, and the complete `captures/` directory, including the 1.3, 1.5, and 2.0 scales. Capture JSON and manifests accompany the screenshots. Captures under `rejected-loading-*` are failed loading attempts retained for provenance, not acceptance references.
- `reports/xxl-2026-10-24/T0/` contains the requested `before-*.png`, `xxxl-components-*.png`, and `api.md`.
- `design/xxl-density/index.html` is D2's pattern exploration page.
- `design/xxxl-system/` contains the approved system page, prototype, written design decisions, original builder, and both builder templates.
- `design/connecting/connecting.html` is the selected splash reference.

The built HTML pages embed their fonts and image assets. Open them directly, or serve this folder with `python3 -m http.server 8769 --directory d3-inputs` from the repository root.

The original XXXL builder expects `apps/mobile/node_modules/@expo-google-fonts/geist` and `apps/mobile/assets/brand/lockup-color.png` relative to its source root. Those belong to the existing app checkout. To rebuild after the app's existing dependencies are installed, create a local `d3-inputs/apps` symlink to `../apps`, then run `python3 d3-inputs/design/xxxl-system/build.py prototype` and `python3 d3-inputs/design/xxxl-system/build.py xxxl-system`. The symlink is not part of this handoff. No build is needed to view the supplied HTML.

## Publication review

The selected text files and capture metadata were scanned for credential patterns. The PNGs were reviewed visually and scanned with OCR for credential labels and email addresses. No matching credentials or sign-in codes were found. Tall stitched captures were checked alongside their individual frames. This is a bounded review, not a guarantee that the captures contain no private information.

The screenshots and capture JSON retain real balances, transaction descriptions, account/category names, and the visible workspace name. They are preserved as requested design evidence. The audit also retains its device identifier and development deployment URL. This repository is public.

Unrelated T0 logs, provider-auth files, environment files, keys, `.verification/`, dependencies, and app source are excluded. Some links in the original documents point to other local reports that were not requested for this upload.

`manifest.json` records each copied input's path, size, and SHA-256. Original input bytes are unchanged.
