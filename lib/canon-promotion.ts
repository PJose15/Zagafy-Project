import type { CanonStatus } from '@/lib/store';

/**
 * Phase 4.8 / CB-05 — promotion ladder for canon-tracked entities.
 *
 *   draft → flexible → confirmed     (forward path)
 *           ↓
 *           discarded                 (side-exit, available from any state)
 *
 * promoteOne advances one rung; demoteOne reverses it. discard moves the
 * item to the discarded side state regardless of where it sits.
 *
 * Promoting to 'confirmed' affects AI canon enforcement, so callers should
 * always run requiresConfirmConfirmation() and gate on a user confirm
 * dialog before dispatching the change.
 */

const ORDER: CanonStatus[] = ['draft', 'flexible', 'confirmed'];

export function promoteOne(status: CanonStatus): CanonStatus {
  const idx = ORDER.indexOf(status);
  if (idx === -1) return status; // discarded — no auto-promote
  if (idx === ORDER.length - 1) return status;
  return ORDER[idx + 1];
}

export function demoteOne(status: CanonStatus): CanonStatus {
  const idx = ORDER.indexOf(status);
  if (idx <= 0) return status;
  return ORDER[idx - 1];
}

export function isDiscarded(status: CanonStatus): boolean {
  return status === 'discarded';
}

export function isConfirmed(status: CanonStatus): boolean {
  return status === 'confirmed';
}

export function isDraft(status: CanonStatus): boolean {
  return status === 'draft';
}

/** True when promoting from `from` to `to` would expose the entry to the AI canon enforcer. */
export function requiresConfirmConfirmation(from: CanonStatus, to: CanonStatus): boolean {
  return to === 'confirmed' && from !== 'confirmed';
}
