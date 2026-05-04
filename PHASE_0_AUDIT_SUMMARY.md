# Phase 0 — Baseline Audit Summary

> Snapshot taken: 2026-05-04 on branch `phase-0-preflight`
> Source: `phase-0-baseline-audit.json`, `phase-0-baseline-outdated.json`, `npm ci` output
> Fixes are NOT applied in Phase 0 — this is a pre-rebuild snapshot.

## 1. Vulnerability counts

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 7 |
| Moderate | 2 |
| Low | 0 |
| Info | 0 |
| **Total** | **10** |

## 2. Affected packages

| Package | Severity | Direct? | Fix available |
|---|---|---|---|
| `protobufjs` | critical | transitive | yes |
| `next` | high | direct | yes |
| `happy-dom` | high | direct | yes |
| `@xmldom/xmldom` | high | transitive | yes |
| `flatted` | high | transitive | yes |
| `picomatch` | high | transitive | yes |
| `tar` | high | transitive | yes |
| `vite` | high | transitive | yes |
| `postcss` | moderate | direct | yes |
| `brace-expansion` | moderate | transitive | yes |

### Critical — `protobufjs`
Arbitrary code execution. Transitive — likely via Gemini SDK or Google Cloud client. Verify path before patching: `npm ls protobufjs`.

### High — direct dependencies
- **`next`** — HTTP request smuggling in rewrites; unbounded `next/image` disk cache; DoS via Server Components. Currently 15.4.9. Patch path: minor/patch upgrade within the 15.x line.
- **`happy-dom`** — fetch credentials cross-origin leak; ECMAScript module compiler code injection via export names. Test-only (Vitest environment), but still worth patching.

### High — transitives worth tracking
- `@xmldom/xmldom` — XML injection vectors (likely via docx/pdf parsing in import path).
- `tar` — hardlink + symlink path traversal.
- `vite` — path traversal in dev-server `.map` handler; arbitrary file read via WebSocket. Dev-only.

### Moderate
- `postcss` — XSS via unescaped `</style>` in CSS stringify output.
- `brace-expansion` — process hang on zero-step sequence (DoS).

## 3. Outdated packages

`npm outdated --json` returned empty — no packages are behind their declared range. Major version drift (if any) would require explicit version bump checks; this snapshot only reports against current ranges in `package.json`.

## 4. Deprecated dependencies (from `npm ci`)

- `node-domexception@1.0.0` — replaced by platform-native `DOMException`.
- `glob@10.5.0` — old version with known security issues; current is 11.x.

## 5. Recommended sequencing

Per the build plan, dependency fixes are NOT a Phase 0 task. They land later:

- **Phase 1** — addresses code-level issues (CB-01..CB-06), no dep upgrades.
- **Phase 6.1 / SG-03** — `npm audit` becomes a CI gate at moderate+.
- **Phase 6.4 / SG-08** — dependency pinning + Renovate/Dependabot policy.

Patching `next` and `happy-dom` directly should happen in a focused branch before Phase 6 lands the CI gate, since the gate will fail until those are addressed. Document in `docs/SECURITY.md` (Phase 2 / SG-07) any remaining accepted risks.

## 6. Files captured

- `phase-0-baseline-lint.log` — 0 errors, 14 warnings (mostly unused eslint-disable directives + 1 exhaustive-deps).
- `phase-0-baseline-typecheck.log` — empty (0 errors with current `tsconfig.json`; strict mode hardening lands in Phase 1.6).
- `phase-0-baseline-tests.log` — 137 test files / 1976 tests passing.
- `phase-0-baseline-build.log` — `Compiled successfully in 53s`.
- `phase-0-baseline-audit.json` — full audit detail.
- `phase-0-baseline-outdated.json` — empty (no out-of-range packages).

These artifacts are gitignored per Phase 0.4 spec; only this summary is committed.
