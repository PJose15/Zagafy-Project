# Security

> Status: living document. Update on every meaningful change to defenses,
> deployment surface, or threat model.
> Phase reference: ZAGAFY_CLAUDE_CODE_BUILD_PLAN2 §3.2 (SG-\*).

## 1. Scope and threat model

Zagafy is a Next.js app with a small server-side surface (~11 API routes
proxying Gemini / Anthropic) and a substantial client-side surface
(IndexedDB-backed story state, Web Speech, drag-and-drop import).

We defend against:

- **Cross-site scripting (XSS)** — via Content-Security-Policy headers and
  React's escape-by-default rendering.
- **Cross-site request forgery (CSRF)** — via origin allowlisting in
  `middleware.ts` and same-site cookie defaults (auth lands in Phase 5).
- **Prompt injection / system-prompt exfiltration** — character / chat /
  story-coach prompts never accept a raw client `systemPrompt`; servers
  build prompts from sanitized payloads (`app/api/character-chat/route.ts`,
  `app/api/chat/route.ts`).
- **Rate limit abuse / cost explosion** — Upstash-backed sliding window
  per-IP-per-route, plus aggregate text size and chunk caps in
  `app/api/ingest/route.ts`. Rate limiter health gated by HEALTH_TOKEN.
- **DoS via huge uploads** — 50MB per file, 10 files max, 2M char total,
  20 chunks max in `app/api/ingest/route.ts`.
- **Secrets in commits** — gitleaks pre-commit hook (Phase 2.5).
- **Stale or vulnerable deps** — `npm audit --audit-level=moderate` runs as
  a CI gate (Phase 6, SG-03). Dependabot keeps deps updated weekly.
  Runtime deps are pinned to exact versions (SG-08).
- **Static analysis** — ESLint with `eslint-plugin-security` (eval, unsafe
  regex, child_process, timing attacks) + GitHub CodeQL weekly + on-PR
  (Phase 6, SG-04).

We do **not** defend against:

- A motivated APT or physical-access attacker.
- A hostile browser extension running in the user's session.
- A user uploading their own content that will only be processed for
  themselves (creative writing is the entire point — content judgment is
  the user's call).

## 2. Defense in depth

| Layer            | Mechanism                                                              |
| ---------------- | ---------------------------------------------------------------------- |
| Transport        | HSTS preload (`next.config.ts`)                                        |
| Origin           | CORS allowlist in `middleware.ts` (incl. AI Studio embed origins)      |
| Headers          | CSP, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy         |
| Rate limit       | Upstash sliding window per IP × route; circuit breaker on outage       |
| Input validation | Per-route sanitizers (character payload, transcript caps, file caps)   |
| AI prompts       | Server-built; client never supplies the system prompt                  |
| Storage          | IndexedDB (Dexie) — manuscript content stays on device until Phase 5   |
| Logging          | Structured warnings on CORS denial; never logs manuscript content      |

## 3. Known trade-offs

### 3.1 CSP `'unsafe-inline'` for scripts

`next.config.ts` ships:

```
script-src 'self' 'unsafe-inline'           // production
script-src 'self' 'unsafe-inline' 'unsafe-eval'  // development
```

`'unsafe-inline'` is currently required because Next.js 15 emits inline
scripts for streaming, hydration, and self-contained server-action
responses. Removing it without a compatible nonce-based CSP breaks
hydration.

The supported migration path is nonce-based CSP via middleware that
injects a per-request `nonce` and propagates it to Next's emitted
scripts. Reference: <https://nextjs.org/docs/app/guides/content-security-policy>.

That migration is scheduled for **Phase 7** (launch readiness). It is a
known accepted risk until then. The mitigations that already apply:

- React escapes string children, so the most common XSS sink is closed.
- All routes return JSON; there is no server-rendered user-generated HTML
  on the response surface.
- `frame-ancestors 'none'` and `X-Frame-Options DENY` block clickjacking.

### 3.2 In-memory rate limiter on dev / test only

The in-memory limiter is **never** used in production after Phase 2.1.
Production without Upstash configured fails closed (503 on every
rate-limited endpoint) — see `lib/rate-limit.ts:getRateLimitMode()`.

### 3.3 AI Studio embed mode bypasses auth

`lib/auth.ts → requireUser()` returns a synthetic `embed-mode` user when
`NEXT_PUBLIC_DEPLOYMENT_MODE=embed` or Clerk keys are absent. This means
**every protected API route is callable without a session** in embed mode.

**Why this is acceptable:** AI Studio runs Zagafy as a trusted
single-tenant applet inside Google's infrastructure. The applet is
rendered in an iframe with no public URL — only the Studio user can
reach it. End-user auth is meaningless in that context.

**What it means for SaaS:** In SaaS mode (Clerk keys present,
`DEPLOYMENT_MODE` unset or not `embed`), `requireUser()` calls
`@clerk/nextjs/server → auth()` and returns 401 if no session exists.
All protected routes — AI endpoints, sync, billing — require a valid
Clerk session.

**Ownership enforcement (Phase 5.13):** After authentication, routes that
access user-scoped data enforce ownership:

| Route | Ownership check |
|-------|----------------|
| `/api/sync/push` | `stories.ownerId = userId` (403 on mismatch) |
| `/api/sync/pull` | `stories.ownerId = userId` (returns null on mismatch) |
| `/api/billing/checkout` | `users.id = userId` |
| `/api/billing/portal` | `users.id = userId` |
| AI routes (chat, audit, etc.) | Stateless — process request body only, no DB access |

### 3.4 Stateless AI routes have no ownership check

The 10 AI processing endpoints (`/api/chat`, `/api/character-chat`,
`/api/audit`, `/api/analyze-character`, `/api/closing-question`,
`/api/extract-world-bible`, `/api/ingest`, `/api/micro-prompt`,
`/api/polish`, `/api/story-coach`) accept content in the request body,
send it to Gemini or Anthropic, and return the AI's response.

They never query user-specific database records, so there is no
ownership to verify. The content the user sends is their own — they
typed it or uploaded it. Rate limiting prevents abuse.

## 4. Reporting a vulnerability

Email security disclosures to `security@<zagafy-domain-tbd>`. Please
include reproduction steps and a description of the impact. We do not yet
maintain a public PGP key.

We commit to:

- Acknowledging the report within 5 business days.
- Triaging and replying with a fix timeline within 14 business days for
  high-severity issues.
- Crediting reporters in the audit log below if they wish.

## 5. Audit log

| Date       | Reviewer | Scope                                      |
| ---------- | -------- | ------------------------------------------ |
| 2026-05-04 | internal | Phase 2 security hardening (SG-02, SG-07)  |
| 2026-06-09 | internal | Phase 5.13 auth gates audit (SG-01)        |
| 2026-06-09 | internal | Phase 6 — npm audit CI (SG-03), SAST (SG-04), adversarial prompt-injection suite (SG-05), dependency pinning (SG-08) |
