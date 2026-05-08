# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows the phased build plan in `ZAGAFY_CLAUDE_CODE_BUILD_PLAN2.md`.

## [Unreleased]

### Phase 4 — Core product features (partial: 9 of 13 tasks)

Shipped:

- **CB-08 (4.11)** — `lib/prose-analysis-cache.ts` caches reader prose
  analysis keyed by SHA-256 (Web Crypto, FNV-1a fallback) of chapter
  content. Reader page hydrates cached issues on chapter switch and
  shows "Analyzed Xh ago". Dexie v4 introduces the `chapterAnalysis`
  store.
- **MP-08 (4.6)** — `lib/analytics/pacing.ts` ships
  `READING_SPEEDS`/`readingTimeMinutes`/`readingTimeLabel` plus
  `pacingVariance` + `pacingHealthStatus` (consistent / varied /
  erratic). Manuscript header and per-chapter rows show reading-time
  estimates; new PacingHealth panel on `/writing-map` shows a per-chapter
  word-count bar chart with mean line + ±σ band.
- **CB-05 (4.8)** — Canon promotion ladder
  (`draft → flexible → confirmed`, `discarded` as side-exit) in
  `lib/canon-promotion.ts`. WorldBibleSectionCard grows promote/demote/
  discard controls; new WorldBibleReviewQueue modal lists every draft
  with bulk Promote-to-Flexible / Promote-to-Confirmed / Discard actions
  (confirmed promotions are gated by an AI-canon-enforcement warning).
- **MP-07 v1 (4.5)** — Browser-native spellcheck toggle
  (`hooks/use-spellcheck-preference` via `useSyncExternalStore`).
  ParchmentTextarea respects the preference; settings page exposes the
  toggle. New `docs/ROADMAP.md` tracks the LanguageTool grammar layer
  (MP-07 v2) and other deferred items.
- **MP-03 (4.7)** — Manuscript-wide snapshots in `lib/snapshot.ts`
  (Dexie v5, `storySnapshots` store). New `/versions` page lets writers
  name + describe a snapshot, browse newest-first list, restore one
  with a delta-summary confirmation, or delete. Cap of 30 with
  oldest-first pruning; tier-aware caps land in Phase 5.
- **MP-06 (4.2)** — Find-and-replace across chapters in
  `lib/find-replace.ts`: `buildPattern`/`findInChapter`/`findAll`/
  `replaceAllInChapter` with case / whole-word / regex toggles and
  `current-chapter` vs `all-chapters` scope. Cmd/Ctrl+F on /manuscript
  opens the dialog; replacements snapshot a chapterVersion first so
  Replace All is reversible.
- **MP-11 + MP-12 (4.12 / 4.13)** — Long-term writer memory in
  `lib/writer-memory.ts` (Dexie v6, `writerInsights` store). Coach
  insights fold into observations via a lens → category mapper;
  confidence rises with evidence (1 - exp(-n/4)) and decays with age
  (30-day half-life). Top 3 are injected into /api/micro-prompt and
  /api/story-coach system prompts. New WriterMemoryCard on /writing-map
  + Forget All Observations on settings.
- **MP-09 (4.3)** — Outline / corkboard view at /outline. Index-card
  layout for every chapter (grid 4×/list toggle), inline summary edit,
  reorder with chevron buttons, canon + length filter chips. Drag-to-
  reorder is deferred (no new dependency).

Deferred to a focused future session:

- **CB-11 (4.9)** — granular per-entity import review queue (current
  /import flow already requires explicit Confirm before merging).
- **CB-07 (4.10)** — rich-text manuscript editor (Lexical migration).
- **MP-04 (4.1)** — DOCX / PDF industry-format export (depends on 4.10).
- **MP-05 (4.4)** — comments / margin notes layer.

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
