# E2E — Authenticated Flows (S6-M3)

The Playwright suite runs in two modes:

1. **Keyless (default)** — no Clerk env vars → the app boots with auth disabled
   and the specs exercise the unauthenticated app. This is what CI does until
   the secrets below are added.
2. **Authenticated** — Clerk development-instance keys + a dedicated test user
   are configured → `e2e/global-setup.ts` mints a Clerk Testing Token
   (bypasses bot protection) and `e2e/helpers/auth.ts#gotoApp()` signs in
   through the real `<SignIn />` form before each flow. This exercises the
   sign-in, export-with-auth, billing, and collaboration paths that previously
   self-skipped in CI.

## One-time setup

The only manual step is copying the two keys — everything else is scripted.

1. In [Clerk](https://dashboard.clerk.com), open the Zagafy application with
   the **Development** instance selected (never use production keys for E2E),
   then Configure → **API Keys**: copy the **Publishable key** (`pk_test_…`)
   and **Secret key** (`sk_test_…`).
2. From the repo root, in your own terminal:

   ```bash
   node scripts/setup-e2e-clerk.mjs pk_test_... sk_test_...
   ```

   The script creates (or reuses) the `e2e+clerk_test@zagafy.com` test user
   via the Clerk Backend API with a freshly generated password, and sets all
   four repo secrets (`E2E_CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_SECRET_KEY`,
   `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD`) via `gh secret set`,
   piping values over stdin. It refuses `pk_live_`/`sk_live_` keys. Rerun it
   any time to rotate the test user's password.

That's it — the next pull request's `e2e` job picks the secrets up
automatically (`.github/workflows/ci.yml` maps them into the dev server +
test env).

## Running authenticated E2E locally

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... \
CLERK_SECRET_KEY=sk_test_... \
E2E_CLERK_USER_EMAIL=e2e+clerk_test@zagafy.com \
E2E_CLERK_USER_PASSWORD=... \
npx playwright test --grep-invert "Visual regression"
```

Without those vars, `npm run test:e2e` runs keyless exactly as before.

## How the pieces fit

| Piece | Role |
|---|---|
| `e2e/global-setup.ts` | Calls `clerkSetup()` (Testing Token) when keys are present; no-op otherwise |
| `e2e/helpers/auth.ts` | `gotoApp(page, path)` — navigates, signs in when redirected to `/sign-in`, or skips with instructions when auth is on but credentials are missing |
| Spec files | All auth-gated flows start with `await gotoApp(page, …)` instead of a hardcoded skip |
| `ci.yml` e2e job | Maps the `E2E_CLERK_*` secrets into the Playwright process (empty → keyless mode) |

Visual-regression specs remain excluded in CI — they need committed baseline
screenshots, which is a separate piece of work.

## Visual regression baselines

`e2e/visual-regression.spec.ts` compares five pages (dashboard, manuscript,
flow, corkboard, settings) against committed screenshots in
`e2e/visual-regression.spec.ts-snapshots/` with a 0.1% pixel-diff tolerance
(`maxDiffPixelRatio` in `playwright.config.ts`).

Playwright snapshots are **platform-specific** — baselines generated on
Windows/macOS will not match the linux CI runners. Baselines are therefore
generated on linux by the manual `visual-baselines.yml` workflow:

```bash
gh workflow run visual-baselines.yml
```

The workflow (workflow_dispatch only) checks out `master`, runs the visual
spec with `--update-snapshots` (the Playwright config boots the dev server
itself), uploads the snapshots as an artifact for inspection, and commits any
changed baselines back to `master` as `github-actions[bot]` with `[skip ci]`.

Re-run it after any **intentional** UI change that shifts one of the captured
pages — a red visual diff in CI after a deliberate redesign means the
baselines are stale, not that the app is broken.

Once the first successful run has committed linux baselines, the CI `e2e` job
can drop its `--grep-invert "Visual regression"` filter and include the
visual spec.
