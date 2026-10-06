# UI and UX launch audit — October 5, 2026

## Scope and changes

These batches check local project creation, mobile navigation, bilingual writing and cross-chapter replacement. It does not
establish hosted authentication, payment, collaboration or full accessibility.

- The mobile drawer now exposes the active project and project menu, previously
  confined to the desktop header. The navigation trigger communicates its state.
- The drawer uses the existing modal stack for Escape, keyboard containment,
  scroll locking and opener focus restoration. A visible close control starts
  keyboard focus. Resizing to desktop clears the mobile open state.
- Escape first closes the project menu without closing its parent drawer.
- Genesis acceptance now completes every required step, creates the project,
  confirms both characters after reload, and saves/reopens a first chapter.
  Missing controls fail assertions. This is project setup, not a sign-up test.
- Accessibility smoke visits the intended routes directly. Its dashboard fixture
  has a saved chapter, avoiding the empty dashboard redirect to Genesis. Every
  violation and incomplete result is attached to the browser report, including
  serious/moderate findings. CI retains artifacts on success as well as failure.

- Spanish navigation now has a translated screen-reader name. Acceptance writes
  accented prose and a long title at phone/tablet widths, reloads the saved locale
  and chapter, then switches back to English without altering the manuscript.
- Find/replace awaits an explicit local save before acknowledging completion and
  reports failed writes. Acceptance creates two chapters, cancels a replacement,
  confirms it, and reloads immediately after the saved acknowledgement. Unit
  regressions cover pending and rejected persistence callbacks. Replacement
  backups also retain the original project ID across awaited writes and switches.

## Mobile save obstruction — October 5 continuation

CI on `704c040` passed build, lint, TypeScript, tests and dependency audit, but
failed the 390px Spanish writing journey on all three attempts. The fixed
Comments button intercepted the ordinary Save Chapter click. The tablet journey
and 18 other browser tests passed; eight hosted/legacy cases skipped.

The Comments trigger now occupies its own row below the editor on phone/tablet,
and chapter actions wrap when translated labels need more room. The bottom sheet
uses the shared modal stack for focus containment, Escape, body scroll locking
and return focus. Resizing to desktop dismisses the sheet and releases its lock.
Both Spanish journeys assert sheet keyboard/resize behavior before clicking
Save normally and reloading the persisted writing. Exact-commit browser
verification is required before treating this failure as resolved.

## Manuscript project-switch recovery

The Manuscript form held title, prose and summary edits outside the story store,
but did not register them with the switch/cloud-update checkpoint protocol.
It now registers that buffer under its original project. Real IndexedDB/provider
regressions cover a switch preserving the form, failed checkpoint/retry, and
cloud-deleted chapter recovery without reviving its ID. The destination remains
unchanged. Unedited forms do not create an extra checkpoint.

Local continuation verification: 230 test files / 3,084 tests, TypeScript,
production build and lint pass (six existing warnings). The final build completed
with Next telemetry disabled after the first attempt stalled. Chromium could
not be installed in this workspace because its download returned an invalid
archive, so the new browser assertions have not run here. The user explicitly
approved publishing this continuation to PR #121 after the initial approval
review block. The uploaded commit requires its own CI/browser verification.
Hosted acceptance, migration and production promotion remain outstanding.

## Verification contract

Ordinary browser CI exercises the keyless local product. The new mobile tests
cover project-menu Escape, drawer focus wrapping, Escape/return focus, link
navigation, horizontal overflow, and desktop/mobile resizing at 390 pixels wide.
Desktop visual baselines still apply. Unit/integration tests and build/type/lint
checks must pass on the same uploaded release candidate.

The initial reports exposed 13 serious contrast failures: nine on the populated
dashboard, one on Genesis and three on Settings. Targeted labels now use light
text on wood and dark text on parchment; the danger title uses a light wax token.
All reported violations now fail these five fixture-specific page scans. Green
automated scans are **not WCAG AA compliance**: incomplete findings, additional
page states, targets, keyboard behavior and screen-reader usability still need
manual acceptance.

## Remaining launch work

1. Review populated writing/recovery screens on mobile, tablet and desktop,
   including touch keyboards, long manuscripts, long titles and Spanish.
2. Run an author usability session through setup, writing, AI suggestions,
   recovery and publishing; verify navigation and local/cloud expectations.
3. Replace remaining legacy conditional import/Flow/billing/collaboration
   smoke tests with concrete fixtures and unconditional success assertions.
4. Execute isolated authenticated staging without required-flow skips. Account
   registration, invitations/revocation, two-device sync and Stripe lifecycle
   are still live acceptance gates.
5. Verify real AI quality/cost, Redis outages, alerts, database restore and rollback.

No hosted migration, production merge or promotion is part of this batch.
