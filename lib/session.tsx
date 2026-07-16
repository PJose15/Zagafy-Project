'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type BlockType = 'fear' | 'perfectionism' | 'direction' | 'exhaustion' | null;

export interface SessionState {
  blockType: BlockType;
  diagnosticCompleted: boolean;
  diagnosticSkipped: boolean;
  ritualCompleted: boolean;
  ritualMode: 'quote' | 'mindfulness' | null;
  sessionStartedAt: string;
  flowChapterId: string | null;
}

interface SessionContextType {
  session: SessionState;
  setBlockType: (type: BlockType) => void;
  completeDiagnostic: (skipped?: boolean) => void;
  completeRitual: (mode: 'quote' | 'mindfulness') => void;
  setFlowChapterId: (id: string | null) => void;
  resetSession: () => void;
}

const defaultSession: SessionState = {
  blockType: null,
  diagnosticCompleted: false,
  diagnosticSkipped: false,
  ritualCompleted: false,
  ritualMode: null,
  sessionStartedAt: new Date().toISOString(),
  flowChapterId: null,
};

const SessionContext = createContext<SessionContextType | undefined>(undefined);

/**
 * Gate persistence (F5): without it every hard refresh re-armed both intake
 * overlays — four clicks before the writer could touch their manuscript.
 * The check-in is a daily ritual → localStorage, stamped with the local
 * calendar day. The entry ritual belongs to a sitting → sessionStorage.
 */
const CHECKIN_KEY = 'zagafy_checkin';
const RITUAL_KEY = 'zagafy_ritual';

function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Build the initial session. Automated runs (E2E) can set the
 * `zagafy_skip_intake` localStorage flag to start with the diagnostic + ritual
 * gates already cleared, so tests reach the app without driving the intake
 * overlays. Normal users never set this flag, so production UX is unchanged.
 */
function readInitialSession(): SessionState {
  const base: SessionState = { ...defaultSession, sessionStartedAt: new Date().toISOString() };
  if (typeof window === 'undefined') return base;
  try {
    if (window.localStorage.getItem('zagafy_skip_intake') === 'true') {
      return { ...base, diagnosticCompleted: true, ritualCompleted: true };
    }
  } catch {
    // localStorage unavailable — fall through to the default gated session
  }
  return base;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState>(readInitialSession);

  // Restore persisted gates on mount (not in the initializer — the server
  // render must match the first client render, and storage only exists on
  // the client). Worst case is one animation-frame of overlay before the
  // effect clears it, hidden inside the overlay's own fade-in.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHECKIN_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          day?: string;
          blockType?: BlockType;
          skipped?: boolean;
        };
        if (saved.day === todayStamp()) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- two-pass hydration-safe restore: storage only exists on the client, so the armed SSR markup must render once before we can lower the gate
          setSession(prev =>
            prev.diagnosticCompleted
              ? prev
              : {
                  ...prev,
                  diagnosticCompleted: true,
                  diagnosticSkipped: !!saved.skipped,
                  blockType: saved.blockType ?? prev.blockType,
                },
          );
        } else {
          window.localStorage.removeItem(CHECKIN_KEY);
        }
      }
      const ritual = window.sessionStorage.getItem(RITUAL_KEY);
      if (ritual === 'quote' || ritual === 'mindfulness') {
         
        setSession(prev =>
          prev.ritualCompleted
            ? prev
            : { ...prev, ritualCompleted: true, ritualMode: ritual },
        );
      }
    } catch {
      // storage unavailable — gates stay armed, same as before F5
    }
  }, []);

  const setBlockType = useCallback((type: BlockType) => {
    setSession(prev => ({ ...prev, blockType: type }));
  }, []);

  const completeDiagnostic = useCallback((skipped = false) => {
    setSession(prev => {
      const next = { ...prev, diagnosticCompleted: true, diagnosticSkipped: skipped };
      try {
        // Idempotent write, safe under StrictMode double-invoke; lives in the
        // updater because it needs the blockType the diagnostic just chose.
        window.localStorage.setItem(
          CHECKIN_KEY,
          JSON.stringify({ day: todayStamp(), blockType: next.blockType, skipped }),
        );
      } catch {
        // best-effort — the gate simply re-arms next reload
      }
      return next;
    });
  }, []);

  const completeRitual = useCallback((mode: 'quote' | 'mindfulness') => {
    try {
      window.sessionStorage.setItem(RITUAL_KEY, mode);
    } catch {
      // best-effort — the gate simply re-arms next reload
    }
    setSession(prev => ({
      ...prev,
      ritualCompleted: true,
      ritualMode: mode,
    }));
  }, []);

  const setFlowChapterId = useCallback((id: string | null) => {
    setSession(prev => ({ ...prev, flowChapterId: id }));
  }, []);

  const resetSession = useCallback(() => {
    try {
      window.localStorage.removeItem(CHECKIN_KEY);
      window.sessionStorage.removeItem(RITUAL_KEY);
    } catch {
      // storage unavailable — nothing to clear
    }
    setSession({
      ...defaultSession,
      sessionStartedAt: new Date().toISOString(),
    });
  }, []);

  return (
    <SessionContext.Provider
      value={{
        session,
        setBlockType,
        completeDiagnostic,
        completeRitual,
        setFlowChapterId,
        resetSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
