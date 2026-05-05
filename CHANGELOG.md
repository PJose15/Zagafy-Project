# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows the phased build plan in `ZAGAFY_CLAUDE_CODE_BUILD_PLAN2.md`.

## [Unreleased]

### Phase 1 — Critical bug fixes & code hygiene

- **CB-01** Centralized the Anthropic model in `lib/ai-config.ts`. Default upgraded
  from `claude-sonnet-4-20250514` to `claude-sonnet-4-5-20250929`; override via
  the `ANTHROPIC_MODEL` env var.
- **CB-02** Removed the `@ts-nocheck` pragma from `hooks/use-speech-recognition.ts`.
  Added ambient Web Speech API types in `lib/types/web-speech.d.ts` and exported
  an `isSpeechRecognitionSupported()` helper.
- **CB-03** Verified that `setRate` is exposed by `useSpeechSynthesis` and
  consumed by the audiobook view (no code change needed; the plan note was
  stale).
- **CB-04** Removed stale `// L17: Removed unused calculateLevel import` comment
  from `hooks/use-gamification.ts`.
- **CB-06** Replaced `app/api/ingest/mergeResults` per-array dedup with a
  generic `dedupBatch()` helper. Keys now normalize via lowercase + trim
  (`Aragorn` / `aragorn` / `  ARAGORN  ` collapse to one); characters and
  locations use a most-complete merge so later non-empty fields fill earlier
  blanks; chapters, scenes, character_states, relationships, canon_items,
  ambiguities, and foreshadowing_elements get dedup for the first time.
  Seven new tests pin the new behavior.
- **Phase 1.6** Strict TypeScript already passes with zero errors and zero
  `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` directives. No code
  change required.
- **Phase 1.7** Lint passes `--max-warnings=0`. Promoted
  `@typescript-eslint/no-explicit-any` and `react-hooks/exhaustive-deps` to
  `error` in source code. Tests are exempt from `no-explicit-any` to avoid
  a sweeping refactor of intentional mock typings; the rule still guards
  product code. Fixed one exhaustive-deps gap in
  `hooks/use-session-tracker.ts` (added `metricsRef` to `endSession` deps)
  and added a documented React Compiler suppression for the same callback.

### Phase 0 — Pre-flight & environment

- Tagged `pre-rebuild-baseline-20260504` as a pre-rebuild safety net.
- Expanded `.env.example` with all current variables and Phase 5+ placeholders
  (Clerk, Neon, Stripe, Sentry, PostHog, Resend, `ANTHROPIC_MODEL`).
- Captured baseline lint / typecheck / test (1976 passing) / build state in
  `PHASE_0_AUDIT_SUMMARY.md` along with a 10-finding `npm audit` snapshot
  (1 critical, 7 high, 2 moderate; remediation deferred per plan).
