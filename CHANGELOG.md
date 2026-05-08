# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows the phased build plan in `ZAGAFY_CLAUDE_CODE_BUILD_PLAN2.md`.

## [Unreleased]

### Phase 3 — Reliability & error handling

- **Phase 3.1** New `lib/api-response.ts` defines the canonical envelope:
  `{ ok: true, data, requestId, timestamp }` for success and
  `{ ok: false, code, message, error, requestId, timestamp }` for errors,
  with a stable `ApiErrorCode` vocabulary. Object payloads also flatten
  onto the top level so existing client code keeps working —
  `parseApiResponse<T>` is the new typed client-side counterpart and falls
  back to legacy shapes when the envelope is absent. Migrated every API
  route (analyze-character, audit, character-chat, chat, closing-question,
  extract-world-bible, ingest, micro-prompt, polish, story-coach, both
  health probes). The Gemini health probe's inner `ok` is renamed
  `geminiReachable` to avoid colliding with the envelope.
- **CB-10** New `lib/ai/retry.ts` ships a generic `withRetry` (3 attempts,
  800ms→8s exponential backoff, ±20% jitter) and `isRetryableUpstream`
  predicate that recognizes 429 / 502 / 503 / 504 / 529, ETIMEDOUT /
  ECONNRESET, and message-shaped UNAVAILABLE / overloaded / timeout signals.
  Applied to every Gemini call (replaces extract-world-bible's inline
  retry loop) and to both Anthropic fetches; AbortError is excluded so the
  per-call timeouts still fire. Test mode collapses delays so the suite
  doesn't burn seconds in setTimeout.
- **CB-12** `closing-question`, `micro-prompt`, and `story-coach` now flag
  fallback responses with `degraded: true` and a stable
  `degradationReason` (`gemini_key_missing`, `empty_response`,
  `gemini_timeout`, `gemini_error`, `safety_blocked`, `empty_or_invalid`,
  `parse_error`, `rate_limited`). The Closing Ritual surfaces a subtle
  "The oracle rests; an older voice answers" hint; `useMicroPrompt`
  swaps in a local prompt-bank suggestion so writers never see a blank
  inline nudge.
- **CB-09** `/api/character-chat` now always returns `insight: string | null`
  and sets `insightError` to `'timeout' | 'parse_error' | 'rate_limited' |
  'upstream_error'` when the optional secondary call fails.
  `useCharacterChat` exposes `lastInsightError`; the chat panel renders an
  antiquarian "The oracle could not see clearly this turn" hint.
- **Phase 3.5** New `lib/logger.ts` ships a structured logger that emits
  JSON in production (one line per call, fields indexable by Vercel log
  capture / Sentry breadcrumbs in Phase 5) and a readable `[LEVEL] msg`
  format in development. Every API route now creates a per-request
  `createRouteLogger({ endpoint, requestId })` and routes every
  `console.log/warn/error` through it; `makeRequestId` is exported from
  `lib/api-response` so the same UUID can flow into both logs and the
  response envelope.

### Phase 2 — Security hardening

- **SG-02** Rate limiter gains a mode resolver
  (`getRateLimitMode(): 'upstash' | 'memory' | 'disabled'`) and a circuit
  breaker around Upstash. Production with Upstash unset is now `disabled`
  — every rate-limited endpoint responds 503 instead of silently using
  the in-memory fallback. The breaker opens after 3 failures within 30s
  and half-opens 60s later; success closes it. New protected
  `/api/health/rate-limit` returns mode, breaker state, consecutive
  failures, and last error (gated by `HEALTH_TOKEN`).
- **SG-07** New `docs/SECURITY.md` with threat model, defense-in-depth
  inventory, the CSP `'unsafe-inline'` trade-off (Phase 7 nonce migration),
  reporting flow, and audit log. Cross-referenced from `next.config.ts`.
- **SG-10** Middleware emits a structured `cors_deny` warn record on every
  403, with a stable `reason` code (`invalid-origin-url`,
  `invalid-referer-url`, `origin-and-referer-not-in-allowlist`). Localhost
  dev bypass moved before the allowlist check so dev tooling never logs
  spurious denials.
- **Phase 2.4** New `lib/bot-signals.ts` scores requests by missing /
  bot-shaped headers and headless / library user agents. Middleware logs
  any score ≥ 30 as a `bot_signals` warn record. We do **not** block — the
  rate limiter is the gate; Phase 5 may decide to deny over a threshold
  once auth context exists.
- **SG-09** Husky + lint-staged installed; pre-commit hook runs gitleaks
  (when present) plus `eslint --fix` on staged TypeScript. `.gitleaks.toml`
  extends the bundled rules with Anthropic, Google, Upstash, Stripe, and
  Clerk patterns. README documents how to install gitleaks locally;
  CI fallback lands in Phase 6 (SG-03).

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
