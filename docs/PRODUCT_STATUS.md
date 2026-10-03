# Zagafy product status — October 3, 2026

Zagafy is an offline-first narrative workshop for authors. The product centers on
an editable manuscript, project-specific canon and characters, deliberate AI
assistance, reversible revisions, and publishing preparation. English and Spanish
interfaces and an antiquarian visual style are part of the existing experience.
Clerk, Postgres, Redis and Stripe support the optional hosted subscription product.

This inventory is based on the current release branch, not historical roadmap
checkboxes. A feature existing in code is distinct from a verified hosted feature.

## Existing product and evidence

| Area | Present in the code | Evidence and remaining limit |
| --- | --- | --- |
| First-run and projects | Intake, Genesis wizard, local library, owned/shared cloud catalog and safe import | Local persistence, catalog isolation/pagination and import rollback/account-change regressions; authenticated second-device acceptance remains. |
| Manuscript | Lexical editor, chapter organization, word counts, find/replace | Real browser save/reload regression; storage transactions and failure regressions. |
| Narrative design | Story bible, canon, characters, timeline, conflicts and outlines | Existing component/API tests; complete author journey and narrative quality review remain. |
| Assistance | Main chat, coaching, polish, flow, character chat and helper analysis | Auth, quota and helper ownership/replay tests; real model quality, latency and spend remain. |
| History | Chapter versions and manuscript snapshots | Chapter-version mutations now serialize read/write and queue in one transaction, with explicit failures and safe editor switching. Session writes and score updates are atomic; scoped WIP/completed journals and migration rollback preserve recovery. Hosted acceptance remains. |
| Publishing | Query materials, manuscript DOCX/PDF and JSON backup/restore | Real document round trips and browser downloads/restores; live AI publishing quality remains. |
| Billing | Tier limits, monthly/yearly checkout, portal and webhooks | Transactional Postgres webhook regressions, price matching, authenticated plan display and API tests; live Stripe lifecycle remains. |
| Cloud/collaboration | Project binding, push/pull, invitations, roles, comments | Database transactions, concurrency and authorization regressions; gaps below still block a complete cloud promise. |
| Operations | CI, CodeQL, monitoring hooks, cron, staging workflow and runbook | Local and CI evidence must be tied to a specific commit; live alerts, restore and rollback drills remain. |

## Fixed in the current continuation

- Manuscript metadata, chapter contents, deletions and durable manuscript sync
  mutations commit in one local transaction. Failed chapter or queue writes roll
  back the entire save. Chapter IDs cannot overwrite another local project.
- Storage read failures and corrupt project records block editing and default overwrites.
  Retry and a project-scoped raw recovery download preserve access to the original
  records and chapter contents; read and corruption regressions cover failures.
- Explicit chapter save waits for confirmed storage before success; failure keeps
  the editor open. Explicit saves cancel older pending debounce writes.
- Cloud push validates batches, serializes concurrent writes per story, and rolls
  back partial batches. Accepted story state controls its title; a chapter-only
  push cannot rename the story from stale client metadata.
- Sync pushes are bounded to 500 entries and clear only covered queue rows. Partial
  acknowledgements keep the queue. Failed pushes retain their error state.
- Conflict resolution saves a chapter version or a full manuscript snapshot before
  overwriting a local edit. Failed recovery storage blocks that overwrite.
- Cloud history uses timezone-aware database receipt times, so late offline
  uploads and changed labels/completed sessions reach incremental pulls. Pull and
  push share a story lock and database clock; Postgres tests cover a non-UTC session.
  Foreign IDs are rejected for all seven non-story entity types and failed batches
  roll back. The current Drizzle snapshot prevents duplicate future generation.
- Owned and shared cloud projects appear in an authenticated, paginated catalog
  without manuscript content or unrelated project metadata. Downloaded data,
  binding and watermark commit before a new local project becomes active; account
  changes, partial downloads, ID collisions and failed storage cannot leave a
  blank active project or partial import. Existing bindings preserve local edits.
- Cloud pulls now commit all local rows and their watermark atomically. Changed
  version labels, snapshot names and completed sessions refresh unless a local
  mutation is queued. Snapshots and serialized sessions use local project IDs;
  the earlier snapshot scope is repaired only for an unambiguous existing binding.
- Normal Dexie history, session, snapshot, insight, comment and project-rename
  writes commit with their queue entries. Queue failures roll back the mutation;
  committed writes notify sync, and startup/periodic cycles retry durable entries.
  Insight confidence translates between local fractions and database percentages.
  Initial store hydration no longer creates an autosave/upload echo.
- Before the first cloud binding, sync atomically queues the complete stored
  project, including its manuscript and history. A snapshot/session-only trigger
  cannot create an empty cloud manuscript. Metadata and chapter parents precede
  history in bounded batches; incomplete local manuscripts block initial upload.
  An embedded Postgres round trip verifies reopening every supported entity type
  in a clean local workspace without duplicate uploads.
- Stripe event claims and entitlement writes commit together. Failures roll back
  claims for retry. Per-customer locking and fresh subscription lookup prevent old
  event metadata from controlling the current entitlement.
- Entitlements use configured Stripe price IDs, including annual subscriptions;
  grace access cannot upgrade an account on failed payment.
- Settings loads the actual authenticated plan, rejects failed lookups instead of
  displaying Free, suppresses old-account responses, and supports yearly checkout.
  Customers with ongoing subscriptions are directed to manage their existing one.

## Chapter-history audit checkpoint

Chapter-version creation, rename, canonical selection and deletion now read and
write in one IndexedDB transaction with their durable sync queue. Concurrent
additions retain every version, canonical selection remains unique per chapter,
and simultaneous initial seeding creates one version. Normal history operations
no longer read or write the global legacy localStorage key; dedicated migration
remains the import path. Corrupt records and storage failures reject without
silently discarding history or reporting success.

The history hook captures project scope, suppresses stale chapter/project
responses, and exposes retryable errors. Flow version switching waits for a
recovery snapshot to commit; failure or new typing during the wait keeps the
current editor text. Error messages are available in English and Spanish.
These are local guarantees, not proof of hosted deletion delivery or live
collaboration.

## Session, deletion and checkout audit checkpoint

- Session history uses validated IndexedDB records with atomic queue writes;
  corruption and storage failures are visible rather than treated as empty history.
  Flow-score updates serialize with additions. Completed-session journals retain
  rich metrics after failed writes; per-session WIP heartbeats avoid recovering a
  fresh session in another tab. Project switches retain the session's original scope.
- Legacy migration validates before writing, refuses conflicting existing records,
  commits its marker and queue together, and removes original bytes only after
  success. Raw recovery exports retain malformed legacy data and pending journals.
- Cloud entity deletion now writes permanent database-clock receipts in the same
  transaction as content removal. Chapter dependencies receive receipts, comments
  are removed, and story references are pruned. Stale pushes cannot revive deleted
  IDs. Whole-project removal retains only authorization/deletion metadata after
  cascading manuscript removal; former authorized devices can acknowledge it.
- Pulls preserve durable local manuscript/history before removing cloud-deleted
  rows. Registered pending store/Flow text gets a separate local recovery snapshot;
  failed snapshots roll back removals and the watermark. Cross-tab hydration also
  checkpoints pending text before replacement. Accepted local receipts block stale
  manuscript autosaves from recreating deleted chapter IDs. These recovery copies
  are local-only at creation and intentionally retained until the user removes them.
- Whole-project receipts preserve the disconnected device's local copy and block
  re-upload through the deleted binding. Local project deletion atomically queues
  an account-scoped server deletion outbox; network failures retain it for retry.
  Deleting a shared local copy does not remove its owner's cloud project.
- Checkout reserves immutable parameters and an opaque idempotency key before
  provider side effects, then serializes reconciliation per user. Repeated requests
  reuse an open checkout, completed checkout/payment-in-progress uses the portal,
  and a changed plan replaces a checkout only after confirmed expiration. Unknown
  outcomes beyond the replay window fail closed for operator reconciliation.
  Provider calls hold the user's transaction lock with a five-second lock wait;
  slow providers can produce retryable errors and occupy a DB connection. This is
  a deliberate correctness tradeoff that needs staging latency/load acceptance.

Migration `0006_deletion_and_checkout` must be applied before deploying these
routes. It has been verified against an isolated embedded Postgres instance,
not applied to a hosted database. Receipts are not automatically pruned because
an offline device may reconnect after a long absence.

## Remaining implementation work, in priority order

| Priority | Concrete gap | Acceptance needed |
| --- | --- | --- |
| 1 | Hosted acceptance of the session/deletion/checkout protocol | Dedicated accounts/devices, interrupted writes, quota failures, offline deletion/reconnect, completed checkout/webhook delay and safe migration rollout. Local implementation and regressions are complete in the checkpoint above. |
| 2 | Chat-history storage, local conflict backup delivery and full reconciliation still need end-to-end coverage | Verify all intended history appears after a fresh-device import; make any unsynced recovery records explicit. |
| 2 | Browser project switching and cross-tab hydration need further in-flight save coverage | Rapid switches, pending saves, concurrent tabs, failed hydration and account changes cannot transfer or lose edits. |
| 2 | Notification delivery is best-effort after billing commits | Decide whether reliable email is required; use a durable outbox if it is, with idempotent retry tests. |
| 2 | Snapshot pruning can remove recovery history | Define retention rules for conflict backups and verify predictable, user-visible recovery. |
| 3 | Historical roadmap and counts overstate some completion and understate other shipped features | Keep this inventory and release evidence current; complete accessibility, localization and author usability review. |

## Hosted release gates

Use isolated staging and dedicated test accounts for authenticated onboarding,
account separation, two-device sync/collaboration, Stripe checkout/change/cancel/
payment failure/retry, Redis concurrency/outage, real AI review/save, email and
monitoring, database restore, and deployment rollback. The required staging suite
must not skip when credentials or sessions are missing.

No live payment, hosted migration, production merge or promotion is implied by
local tests. See [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md),
[STAGING.md](STAGING.md) and [LAUNCH_READINESS.md](LAUNCH_READINESS.md).
