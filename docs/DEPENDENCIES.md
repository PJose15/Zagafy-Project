# Dependency Management

> Phase 6.4 (SG-08). Updated 2026-06-09.

## Pinning policy

- **Runtime dependencies** (`dependencies`): pinned to exact versions (no `^`
  or `~`). Prevents unexpected breaking changes from reaching production.
- **Development dependencies** (`devDependencies`): ranges allowed. These never
  ship to users and updating them is low-risk.

## Automated updates

Dependabot is configured in `.github/dependabot.yml`:

- **npm**: weekly on Mondays, grouped by update type.
  - **Patch updates** (runtime + dev): auto-grouped for fast review.
  - **Minor/major updates**: individual PRs, require manual review.
- **GitHub Actions**: weekly version bumps.

### Auto-merge rules

Patch-level updates for runtime dependencies can be auto-merged if:
1. CI passes (lint, type-check, unit tests, audit, build).
2. No security advisories flag the updated version.

Configure GitHub auto-merge via repository settings > Branch protection >
Require status checks.

## Adding a new dependency

1. **Justify it.** Could a 20-line utility replace the package?
2. `npm install <pkg>@<exact-version>` — always specify an exact version for
   runtime deps.
3. Run `npm audit` locally to verify no new advisories.
4. Update this doc if the package has special security or licensing concerns.

## Auditing

- CI runs `npm audit --audit-level=moderate` on every push and PR.
- For tolerable false positives, add overrides to `package.json` `overrides`
  field and document the rationale here.

### Known overrides

_None at this time._
