'use client';

import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import { DiagnosticOverlay } from './diagnostic-overlay';
import { RitualOverlay } from '@/components/ritual/ritual-overlay';

/**
 * Setup / library / utility routes that must NOT be gated by the pre-write
 * mood check-in + entry ritual. Gating these traps new users — e.g. Genesis
 * (and its Import/Exit escapes) and the project library were unreachable until
 * the writer completed a ritual meant for actual writing sessions.
 */
const UNGATED_PREFIXES = ['/genesis', '/projects', '/settings', '/import'];

export function DiagnosticGate({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const pathname = usePathname();

  const ungated = UNGATED_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p + '/'),
  );
  if (ungated) return <>{children}</>;

  if (!session.diagnosticCompleted) {
    return <DiagnosticOverlay />;
  }

  if (!session.ritualCompleted) {
    return <RitualOverlay />;
  }

  return <>{children}</>;
}
