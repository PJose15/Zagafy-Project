<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3f233f6e-57f3-453e-a3dd-ec015bf6b05b

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Pre-commit hook

`npm install` installs Husky and a pre-commit hook that runs `lint-staged`
and (if available locally) `gitleaks` against staged changes. To enable
the secrets scan locally, install gitleaks:

- macOS:    `brew install gitleaks`
- Windows:  `scoop install gitleaks` or download from https://github.com/gitleaks/gitleaks/releases
- Linux:    package manager or release tarball

Without gitleaks installed the hook still runs `lint-staged`; secrets
scanning then falls back to CI-only (Phase 6, SG-03).

If you need to commit something the hook flags incorrectly, fix the rule
in [.gitleaks.toml](.gitleaks.toml) rather than bypassing the hook with
`--no-verify`.
