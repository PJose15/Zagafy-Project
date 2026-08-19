# Zagafy — Full Codebase Audit

**Date:** 2026-08-19
**Scope:** Entire project — ~354 TS/TSX files (~26,000 LOC), 11 API routes, 17 hooks, all feature components.
**Method:** 6 parallel specialist auditors (security, React correctness, data/storage, AI layer, performance, a11y/UX/types/tests) + measured baseline (tests, `tsc`, `eslint`).

## Baseline health (measured with project toolchain)

| Check | Result |
|---|---|
| **Tests** | ✅ 137 files, **1,967 tests pass** (46.8s) |
| **ESLint** | ✅ 0 errors, ⚠️ 14 warnings (12 stale `eslint-disable`, 1 real `exhaustive-deps`, 1 stale) |
| **TypeScript (`tsc` 5.9.3)** | ❌ **Fails** — 4 errors, all in `__tests__/lib/ai/context-builder.test.ts` (fixtures out of sync with types). App source is clean. |
| **`tsconfig`** | `strict: true`, but `baseUrl` is deprecated and `noUncheckedIndexedAccess` is off. |

## Findings tally (deduplicated)

| Severity | Count |
|---|---|
| 🔴 Critical | 4 |
| 🟠 High | 17 |
| 🟡 Medium | 34 |
| 🟢 Low | 17 |

Dominant themes: **(1) silent data loss on the core writing path**, **(2) cost/abuse controls that can be bypassed or silently disabled**, **(3) AI calls mis-budgeted so features silently fall back**, **(4) systemic modal accessibility gaps**.

---

## ✅ Resolution status (post-audit fixes)

All fixes were made with the suite kept green: **1,981 tests passing, `tsc` clean, `eslint` 0 errors** after each batch.

**Fixed — Critical (4/4):** CR-1 scene-change data loss (`key` remount), CR-2 silent content-write loss, CR-3 rate-limit IP spoof + global ceiling, CR-4 diff OOM guard.

**Fixed — High (17/17):** rate-limit prod fail-safe backstop, ingest zip-bomb bound, thinking-budget fixes across all Gemini routes, context-budget decoupling, ingest partial-chunk surfacing, atomic Dexie writes, chapter-version cap/dedup, export→import round-trip, cross-tab dirty-flag guard, over-broad effect deps, flow unsaved-changes guard, version-delete confirm, story-coach route test.

**Fixed — Medium (most):** M-1 ingest body cap · M-2 Gemini timeouts · M-3 parser-error masking · M-4 micro-prompt payload cap · M-5 JSON repair/fallback · M-7 analyze-character caps · M-8 story-coach schema · M-9 content-aware coach cache · M-10 character-chat timeout budget · M-11 English-gated validator · M-13 hydration coercion · M-14 migration source-delete ordering · M-16 single-row session write · M-17 streak write guard · M-18–M-23/M-25 React unmount/abort/cleanup + error state · M-22 same-tab XP refresh · M-27/M-28 memoization + lowercase hoist · M-30–M-34 modal a11y (focus trap/return/Escape), Burn confirm, reduced-motion, textarea label, banner `role=alert`.

**Fixed — Low (subset):** L-7 dead import · L-8 diagnostic timeout cleanup · L-10 toast timer cleanup · L-13 `beforeunload` returnValue · L-14 error-boundary logging · L-17 stale lint directives (14 → 1 pre-existing).

**Now also fixed (second pass):**
- **M-6** ingest cross-chunk ID namespacing — IDs are prefixed per chunk (globally unique, intra-chunk links preserved) and `character_states` are re-pointed to the canonical character after dedup. +2 regression tests.
- **M-12** centralized the Anthropic model id / API url / version in `ai-config`.
- **M-15** gamification mutations are now race-safe (read-modify-write from storage) and surface quota failures via a `persistError` banner.
- **M-24 / P-5** `useStoryBrain` memos narrowed to the exact fields each analyzer reads.
- **M-26 / P-2** momentum moved into the `MomentumGlow` leaf (bumped via ref), so its 10 Hz decay no longer re-renders the editor.
- **L-1** defense-in-depth "content is data, not instructions" note added to the assistant prompt.
- **L-4** store persist effect reads `saveError` via a ref (no redundant re-save).
- **L-6 / L-11** BreathingGuide stops ticking after completion and no longer resets on parent re-render.

**Deferred (intentionally, with rationale):**
- **M-29 / P-6** `motion` in the shared shell — **measured** via `next build`: shared first-load JS is **102 kB** (well within budget), per-route add is 4–28 kB. `motion` is part of the shared chunk but the total is healthy, so restructuring 38 components for a marginal gain isn't warranted. No action. (Build passes clean.)
- **L-9** dead `chatMessages` Dexie table — removing a store requires a schema-version bump with migration risk for existing users; not worth it for an empty, unused table.
- **L-16** `core-web-vitals` preset — the flat `eslint-config-next` default already bundles the Next.js recommended rules (react-hooks rules are active); no separate export to add.
- **T-1 / `noUncheckedIndexedAccess`** — enabling it surfaces a large, codebase-wide set of new errors; worth doing as its own focused pass rather than bundled here.

---

## 🔴 CRITICAL (4)

### CR-1 — FlowEditor writes edits into the wrong chapter after a Scene Change (data loss)
`components/flow/flow-editor.tsx:70` · `app/flow/page.tsx:58`
Scene Change swaps chapters by changing the `chapterId` prop, but `content` is seeded once at mount and never resyncs, and the component is not remounted (no `key`). The textarea keeps showing the old chapter's prose while autosave now targets the alternate chapter — every keystroke overwrites it. Return-path word counts are also computed from stale content.
**Fix:** `<FlowEditor key={session.flowChapterId} … />` (smallest correct fix).

### CR-2 — Chapter content silently lost when the content write fails
`lib/store.tsx:296-324`
The story blob is persisted with chapter `content` stripped to `''`, and the real content is written to a separate `chapters` table via `Promise.all(...).catch(() => {})` — swallowed. `saveError` only fires if the *blob* write throws. Under quota pressure the large content write is exactly what fails, so on reload hydration finds no content row and falls back to the blob's `''` → the manuscript is gone, with no warning.
**Fix:** Capture content-write results; on any failure set `saveError` AND keep content inline in the blob for the failed chapters.

### CR-3 — Rate-limit identity is a client-spoofable header → unlimited AI spend
`lib/rate-limit.ts:5-11,120-121`
The limiter keys on `x-forwarded-for.split(',')[0]` — the left-most, caller-controlled value. Rotating that header per request yields a fresh bucket every time, so the sliding window never trips. There is no auth to fall back on.
**Fix:** Use the platform client IP (`x-vercel-forwarded-for`/`req.ip`) or the right-most trusted hop; add a global, IP-independent per-route ceiling.

### CR-4 — Word-diff allocates an O(n·m) matrix → OOM/freeze on large version compares
`lib/text-diff.ts:25` (used by `components/flow/version-compare.tsx:22`)
`diffWords` builds a full `(m+1)×(n+1)` LCS table. Two 5,000-word versions → ~10k tokens each → ~100M-cell matrix (hundreds of MB), filled synchronously on the main thread — realistically crashing the tab when a novelist compares two long drafts.
**Fix:** Diff at line granularity first; cap tokens with a Myers/linear fallback and a "too large to diff inline" guard; use `Uint32Array` rows.

---

## 🟠 HIGH (17)

### Cost / abuse
- **H-1** Rate limiting silently no-ops in prod without Upstash (in-memory, per-instance). `lib/rate-limit.ts:21,40-85`; `instrumentation.ts`. → In production, treat missing Upstash as fatal or hard-deny expensive routes.
- **H-2** No auth on any route; middleware CSRF check passes when `Origin`/`Referer` are both absent (curl/scripts). `middleware.ts:8-59`. → Add a real control (shared secret / signed request / turnstile) on expensive routes; treat middleware as defense-in-depth only.
- **H-3** Ingest zip-bomb: the 50 MB cap is on the *compressed* upload and the aggregate text cap is checked only *after* every file is parsed into memory. `app/api/ingest/route.ts:482-572`. → Enforce a decompressed-text ceiling *during* extraction; abort inside the loop.

### AI budgeting
- **H-4** `gemini-2.5-flash` runs with thinking ON; `maxOutputTokens` of 150 / 80 are consumed by thinking, so **micro-prompt and closing-question silently always fall back**. `app/api/micro-prompt/route.ts:57`; `closing-question/route.ts:53`. → Set `thinkingConfig:{ thinkingBudget: 0 }` and/or raise `maxOutputTokens`.
- **H-5** Same thinking-budget drain truncates JSON on chat/audit/story-coach/world-bible. → Explicit `thinkingConfig` + higher `maxOutputTokens` + handle `MAX_TOKENS`.
- **H-6** Context budget (`500000`) equals the route's reject threshold (`500000`), so large stories get 413'd on any input. `lib/ai/context-builder.ts:21` vs `app/api/chat/route.ts:44-47`. → Make context budget strictly smaller (e.g. 350k vs 500k).
- **H-7** Ingest has no `maxOutputTokens` and silently `continue`s past chunks whose JSON fails to parse → whole manuscript sections vanish. `app/api/ingest/route.ts:607-636`. → Cap output, detect `MAX_TOKENS`, surface per-chunk failures.

### Data integrity
- **H-8** Cross-tab rehydrate overwrites unsaved in-memory edits. `lib/store.tsx:346-358`. → Dirty-flag guard; merge/skip or reschedule local save.
- **H-9** Whole-blob last-write-wins between tabs (no merge). `lib/store.tsx:296-303`. → `updatedAt`/revision guard or per-collection rows.
- **H-10** Non-atomic `clear()` + `bulkPut()` can wipe all versions/sessions on a mid-step failure. `lib/storage/dexie-db.ts:261-265,293-307`. → Wrap in `db.transaction('rw', …)`.
- **H-11** Chapter versions: read-modify-write clobber + unbounded growth + no dedup (snapshot on every switch). `lib/types/chapter-version.ts:95-127`; `flow-editor.tsx:532`. → Per-chapter cap+prune; skip byte-identical snapshots; atomic single-row put.
- **H-12** Exported project can't be re-imported — `genre` is `string[]` but validated as a scalar string, so every backup fails restore. `app/settings/page.tsx:51-56`. → Validate `genre` as a string array.

### React correctness
- **H-13** `useChapterVersions` reloads versions on every content change (over-broad dep). `hooks/use-chapter-versions.ts:30-32`. → Depend on `[chapterId]`; seed via ref.
- **H-14** `useCharacterChat` load effect keyed on `state.characters` resets the live conversation on any character edit / cross-tab sync. `hooks/use-character-chat.ts:65`. → Depend on `[characterId]` only.

### UX / tests
- **H-15** Flow editor has no unsaved-changes / `beforeunload` guard — the one screen built for sustained writing can lose the newest prose on tab close (~5s window). `components/flow/flow-editor.tsx`. → `useUnsavedChanges` + flush on `visibilitychange`/`pagehide`.
- **H-16** Version delete is destructive with no confirm and no undo (every other delete confirms). `components/flow/version-switcher.tsx:93-96`. → Wrap in `confirm({ variant: 'danger' })`.
- **H-17** `story-coach` API route has zero tests (the only route without any). `app/api/story-coach/route.ts`. → Add a route test covering validation/parse/`finishReason` branches.

---

## 🟡 MEDIUM (34)

### Security / AI
- **M-1** Unbounded multipart body buffered before size check. `app/api/ingest/route.ts:497-536`.
- **M-2** No outbound timeout/AbortController on any Gemini call (Anthropic routes have them — inconsistent). All Gemini routes.
- **M-3** Per-file parser error text leaked to client. `app/api/ingest/route.ts:554-557`.
- **M-4** `micro-prompt` has no total body-size cap and the most permissive limit (60/min); `storyContext` fields unbounded. `app/api/micro-prompt/route.ts`.
- **M-5** world-bible & audit: truncated/invalid JSON → hard 502 with no repair/fallback (don't use `safeParseGeminiResponse`). `extract-world-bible/route.ts:111-120`; `audit/route.ts:107-113`.
- **M-6** Ingest cross-chunk ID collisions + incomplete dedupe (chapters/scenes/states/relationships not merged) → orphaned scene→chapter refs. `app/api/ingest/route.ts:364-477`.
- **M-7** `analyze-character` has no `maxOutputTokens`/`temperature` and no `AI_CONFIG` entry. `app/api/analyze-character/route.ts:50-57`.
- **M-8** `story-coach` requests JSON mimeType but provides no `responseSchema`. `app/api/story-coach/route.ts:50-57`.
- **M-9** `story-coach` cache keyed on `chapterId` only → shows insights for stale (pre-edit) text. `hooks/use-story-coach.ts:16-23`.
- **M-10** `character-chat` main (30s) + insight (15s) timeouts can exceed `maxDuration` (30s). `app/api/character-chat/route.ts:8,150,195`.
- **M-11** Ungrounded-name validator false-positives on normal & non-English fiction (English-only stopwords). `lib/ai/chat-validation.ts:96-145`.
- **M-12** Two AI providers with divergent hardcoded config; `ANTHROPIC_API_KEY` undocumented. `character-chat`, `polish` routes.

### Data integrity
- **M-13** No runtime validation/type-guard of persisted `StoryState` on hydration → a corrupt/legacy blob crashes on load. `lib/store.tsx:216-240`.
- **M-14** Migration deletes localStorage source *inside* the Dexie transaction → rollback loses both. `lib/storage/dexie-db.ts:130,154,181`.
- **M-15** Cross-tab gamification clobber + silent quota failure (return value ignored). `hooks/use-gamification.ts:114-174`.
- **M-16** `updateSessionFlowScore` rewrites the whole sessions table (clobber window). `lib/types/writing-session.ts:154-169`.
- **M-17** Unguarded `localStorage.setItem` in `writeStreak` can throw and crash the caller. `lib/diagnostic-streak.ts:32-34`.

### React correctness
- **M-18** `useSpeechSynthesis` never cancels speech on unmount / content change → audio keeps reading stale text. `hooks/use-speech-synthesis.ts`; `audiobook-view.tsx:14`.
- **M-19** `useCharacterChat` no unmount abort → setState after unmount. `hooks/use-character-chat.ts:98-191`.
- **M-20** `useMicroPrompt` & `useStoryCoach` no unmount abort. `hooks/use-micro-prompt.ts`; `hooks/use-story-coach.ts`.
- **M-21** `rePolishFromHistory` (useBraindump) has no AbortController/mount guard. `hooks/use-braindump.ts:272-305`.
- **M-22** Session-tracker XP is invisible in the same tab until a visibility change. `hooks/use-session-tracker.ts:121-135`.
- **M-23** `CharacterChatPanel` shows no error state on send failure (message silently vanishes). `hooks/use-character-chat.ts:184-188`.
- **M-24** `useStoryBrain` / story-brain analysis recomputes on every store mutation (coarse `[state]` dep). `hooks/use-story-brain.ts:34-72`; `lib/story-brain/analyzer.ts`.
- **M-25** Auto-restart race in `useSpeechRecognition.onend` vs `stop()` (state→ref sync lag). `hooks/use-speech-recognition.ts:137-146`. *(needs verification)*

### Performance
- **M-26** 100ms momentum-decay interval re-renders the whole FlowEditor ~10×/sec while writing. `components/flow/flow-editor.tsx:389-396`. → Drive glow via CSS var/ref + rAF, or isolate into a leaf component.
- **M-27** Unmemoized per-render derivations in FlowEditor (`wordCount` full-text scan, `nonDiscardedChapters`). `flow-editor.tsx:95,98,101`.
- **M-28** `analyzeText` re-lowercases the entire chapter on every match iteration; fresh regex per word. `lib/prose-analysis.ts:30,41,47`.
- **M-29** `motion` imported by the shared app shell → in the first-load bundle on every route. `components/antiquarian/library-shell.tsx`, `parchment-sidebar.tsx`. *(inferred — confirm with `ANALYZE=true next build`)*

### UX / a11y / types / tests
- **M-30** "Burn" destroys a session's writing with no secondary confirm; modal also lacks Escape. `components/flow/no-retreat-end-modal.tsx:69-75`.
- **M-31** No focus trap in any modal/overlay (systemic). Multiple overlays.
- **M-32** No focus return after a modal closes (systemic). Multiple overlays.
- **M-33** Several dialogs can't be closed with Escape (inconsistent). chapter-select, no-retreat-end, scene-change-recovery, WorldBibleMerge.
- **M-34** CSS `@keyframes` (several `infinite`) ignore `prefers-reduced-motion`. `app/globals.css:198-260`.

*(Also folded into Medium: missing `aria-label` on the primary writing textarea `flow-editor.tsx:654`; storage-failure banner lacks `role="alert"` `store.tsx:384`; `tsconfig` missing `noUncheckedIndexedAccess`; reader / flow-version / novel-completion component test gaps; flow-editor test mocks away autosave so the save seam is untested.)*

---

## 🟢 LOW (17)

- **L-1** Prompt injection is possible but self-scoped (single-tenant, no tools/cross-user). Add "content is data, not instructions" note if hardening. Multiple prompt builders.
- **L-2** `/api/health` unauth (trivial); `SAFETY_SETTINGS` all `BLOCK_NONE` — confirm this is an accepted product/legal choice. `lib/ai-config.ts:8-13`.
- **L-3** `safeParseGeminiResponse` exists but is used in only one route; others hand-roll `JSON.parse`. `lib/ai/safe-json-parse.ts`.
- **L-4** Session state is entirely ephemeral (never persisted); `Date` in a `useState` initializer is a latent hydration-mismatch. `lib/session.tsx:41`.
- **L-5** Dead `chatMessages` Dexie table; chat actually lives in the main blob. `lib/storage/dexie-db.ts:37-79`.
- **L-6** `use-flow-autosave` weak debounce (5s + 0.5s) and a stale timer ref. `hooks/use-flow-autosave.ts:22-40`.
- **L-7** `useBlockDetector` interval churns when `storyContext` identity changes. `hooks/use-block-detector.ts:50-71`.
- **L-8** `DiagnosticOverlay` 3s timeout has no cleanup. `components/diagnostic/diagnostic-overlay.tsx:30-34`.
- **L-9** `store.tsx` persist effect includes `saveError` in deps → one redundant re-save. `lib/store.tsx:330`.
- **L-10** `ToastProvider` timers not cleared on provider unmount. `components/antiquarian/antiquarian-toast.tsx:45-61`.
- **L-11** `BreathingGuide` phase timer depends on `onComplete`; keeps ticking after `done`. `components/ritual/breathing-guide.tsx:33-56`. *(needs verification)*
- **L-12** Unused `useMemo` import in `sprint-timer.tsx:3`.
- **L-13** `beforeunload` handler may not trigger the prompt (missing `e.returnValue = ''`). `hooks/use-unsaved-changes.ts:13-18`. *(needs verification)*
- **L-14** Root error boundary discards the error (no log/telemetry). `app/error.tsx:5-26`.
- **L-15** Type-erasing casts at the storage boundary. `lib/store.tsx:303`; `lib/types/writing-session.ts:137,145`.
- **L-16** Minimal ESLint config (base `next` only, not `core-web-vitals`). `eslint.config.mjs:9`. *(needs verification)*
- **L-17** 14 lint warnings — 12 stale `eslint-disable` directives, 1 real `exhaustive-deps` (`use-session-tracker.ts:144` missing `metricsRef`).

Plus the baseline: **4 `tsc` errors in `__tests__/lib/ai/context-builder.test.ts`** (fixtures missing `Scene.content` and `CanonItem.sourceReference`, wrong types) and the deprecated `baseUrl` in `tsconfig.json`.

---

## What's already solid (verified — do not "fix")

- No API keys in the client bundle; no `NEXT_PUBLIC_` secret misuse; keys never echoed in errors.
- No SSRF (all outbound fetches hardcoded to the provider), no path traversal, no `dangerouslySetInnerHTML`.
- Anthropic routes (`polish`, `character-chat`) use AbortController timeouts + input caps.
- Heavy libs are correctly code-split: `FlowEditor` (`ssr:false`), recharts, `html-to-image`, `react-markdown`; `pdf-parse`/`mammoth` are server-only.
- Keystroke-adjacent work is properly debounced/throttled (autosave, micro-prompt pause-timer with abort, 15s block detector using refs, 500ms persist).
- Detectors are pure/deterministic with stable hashed IDs and escaped regex.
- Multi-turn chat history is capped by turns and per-turn chars.
- Gamification math, detectors, storage migration, rate-limit logic, and middleware all have real test coverage.
- All context hooks guard against a missing provider; no conditional/loop hook violations found.

---

*Generated by a 6-agent parallel audit. Line references verified against source at the audited commit.*
