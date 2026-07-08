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

## One-time setup (requires the Clerk dashboard)

1. In [Clerk](https://dashboard.clerk.com), open the **Development** instance
   of the Zagafy application (never use production keys for E2E).
2. Copy the development **Publishable key** (`pk_test_…`) and **Secret key**
   (`sk_test_…`).
3. Create a dedicated test user on that instance, e.g.
   `e2e+clerk_test@zagafy.com`, with **password** authentication enabled and a
   strong password. (`+clerk_test` addresses are Clerk test identifiers — no
   real email is sent.)
4. Add the four repository secrets:

   ```bash
   gh secret set E2E_CLERK_PUBLISHABLE_KEY --body "pk_test_..."
   gh secret set E2E_CLERK_SECRET_KEY --body "sk_test_..."
   gh secret set E2E_CLERK_USER_EMAIL --body "e2e+clerk_test@zagafy.com"
   gh secret set E2E_CLERK_USER_PASSWORD --body "<the test user's password>"
   ```

That's it — the next pull request's `e2e` job picks them up automatically
(`.github/workflows/ci.yml` maps them into the dev server + test env).

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
