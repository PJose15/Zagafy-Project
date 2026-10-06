import {
  db,
  getSessions as dexieGetSessions,
  updateSessionScore,
  putSession as dexiePutSession,
  putAllSessions as dexiePutAllSessions,
} from '@/lib/storage/dexie-db';
import { getActiveProjectId } from '@/lib/projects/active-project';

const WIP_KEY = 'zagafy_session_wip';
const WIP_PREFIX = WIP_KEY + ':';
const PENDING_PREFIX = 'zagafy_session_pending:';

export type FlowScore = 1 | 2 | 3 | 4 | 5;

export interface SessionKeystrokeMetrics {
  avgWPM: number;
  peakWPM: number;
  totalPauses: number;
  avgPauseDuration: number;
  deletionAttempts: number;
  deletionRatio: number;
  totalKeystrokes: number;
}

export interface SessionFlowMoment {
  startTime: number;
  endTime: number;
  avgWPM: number;
  peakWPM: number;
}

export interface WritingSession {
  id: string;
  projectId: string;
  projectName: string;
  startedAt: string; // ISO 8601
  endedAt: string;   // ISO 8601
  wordsStart: number;
  wordsEnd: number;
  wordsAdded: number;
  flowScore: FlowScore | null;
  heteronymId: string | null;
  heteronymName: string | null;
  keystrokeMetrics: SessionKeystrokeMetrics | null;
  autoFlowScore: number | null; // 0-100
  flowMoments: SessionFlowMoment[] | null;
}

function isFlowScore(v: unknown): v is FlowScore | null {
  return v === null || (typeof v === 'number' && v >= 1 && v <= 5 && Number.isInteger(v));
}

function isNullableString(v: unknown): boolean {
  return v === null || v === undefined || typeof v === 'string';
}

function isNullableObject(v: unknown): boolean {
  return v === null || v === undefined || typeof v === 'object';
}

function isNullableNumber(v: unknown): boolean {
  return v === null || v === undefined || typeof v === 'number';
}

function isNullableArray(v: unknown): boolean {
  return v === null || v === undefined || Array.isArray(v);
}

export function isWritingSession(v: unknown): v is WritingSession {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id !== 'string' ||
    typeof o.projectId !== 'string' ||
    typeof o.projectName !== 'string' ||
    typeof o.startedAt !== 'string' ||
    typeof o.endedAt !== 'string' ||
    typeof o.wordsStart !== 'number' ||
    typeof o.wordsEnd !== 'number' ||
    typeof o.wordsAdded !== 'number' ||
    !isFlowScore(o.flowScore)
  ) {
    return false;
  }
  // Backward compatible: existing sessions without heteronym fields are valid
  if (!isNullableString(o.heteronymId) || !isNullableString(o.heteronymName)) {
    return false;
  }
  // Backward compatible: existing sessions without metrics fields are valid
  if (!isNullableObject(o.keystrokeMetrics) || !isNullableNumber(o.autoFlowScore) || !isNullableArray(o.flowMoments)) {
    return false;
  }
  // Normalize missing fields to null
  o.heteronymId = o.heteronymId ?? null;
  o.heteronymName = o.heteronymName ?? null;
  o.keystrokeMetrics = o.keystrokeMetrics ?? null;
  o.autoFlowScore = o.autoFlowScore ?? null;
  o.flowMoments = o.flowMoments ?? null;
  return true;
}

/** IndexedDB is authoritative. Legacy history is imported by migration only. */
export async function readSessions(projectId: string = getActiveProjectId()): Promise<WritingSession[]> {
  const rows = await dexieGetSessions(projectId);
  return rows.map(value => {
    if (!isWritingSession(value) || value.projectId !== projectId) throw new Error('Session history is damaged');
    return value;
  });
}

export async function writeSessions(sessions: WritingSession[], projectId: string = getActiveProjectId()): Promise<void> {
  if (sessions.some(session => !isWritingSession(session) || session.projectId !== projectId)) throw new Error('Invalid session project');
  await dexiePutAllSessions(sessions as unknown as Record<string, unknown>[], projectId);
}

export async function addSession(session: WritingSession, recovery = false): Promise<void> {
  if (!isWritingSession(session)) throw new Error('Invalid writing session');
  // Replaying a recovery checkpoint cannot overwrite a later flow score or metrics.
  await dexiePutSession(session as unknown as Record<string, unknown>, session.projectId, recovery);
}

export async function updateSessionFlowScore(sessionId: string, score: FlowScore, projectId: string = getActiveProjectId()): Promise<void> {
  if (!isFlowScore(score) || score === null) throw new Error('Invalid flow score');
  await updateSessionScore(sessionId, score, projectId);
}

/** Preserve the full completed session until both the row and queue commit.
 * The journal is recovery data, never an alternate successful history store. */
export async function saveCompletedSession(session: WritingSession, recovery = false): Promise<void> {
  const journalKey = PENDING_PREFIX + crypto.randomUUID();
  try { localStorage.setItem(journalKey, JSON.stringify(session)); } catch { /* IndexedDB may still succeed */ }
  await addSession(session, recovery);
  try { localStorage.removeItem(journalKey); } catch { /* idempotent recovery on next mount */ }
  clearWipSession(session.id, session.wordsEnd);
}

export async function recoverSessions(): Promise<void> {
  const pending = new Map<string, WritingSession>();
  const journalKeys: { key: string; raw: string; id: string }[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(PENDING_PREFIX)) continue;
    const raw = localStorage.getItem(key)!;
    const session: unknown = JSON.parse(raw);
    if (!isWritingSession(session)) throw new Error('Session recovery record is damaged');
    const prior = pending.get(session.id);
    if (!prior || session.endedAt > prior.endedAt) pending.set(session.id, session);
    journalKeys.push({ key, raw, id: session.id });
  }
  for (const wip of readWipSessions()) {
    if (pending.has(wip.id) || (wip.heartbeatAt && !wip.abandoned && Date.now() - wip.heartbeatAt < 90_000)) continue;
    const wordsAdded = wip.currentWords - wip.wordsStart;
    if (wordsAdded < 5) { clearWipSession(wip.id); continue; }
    pending.set(wip.id, { ...wip, endedAt: new Date().toISOString(), wordsEnd: wip.currentWords, wordsAdded,
      flowScore: null, keystrokeMetrics: null, autoFlowScore: null, flowMoments: null });
  }
  for (const session of pending.values()) {
    // Only recover into a project that still exists. A deleted project must not
    // reappear just because an old WIP checkpoint remains on this browser.
    if (!await db.stories.get(session.projectId)) continue;
    await saveCompletedSession(session, true);
    for (const journal of journalKeys.filter(record => record.id === session.id)) {
      try { if (localStorage.getItem(journal.key) === journal.raw) localStorage.removeItem(journal.key); } catch { /* keep for idempotent retry */ }
    }
  }
}

/**
 * The current project id used to tag sessions/braindumps. Delegates to the
 * multi-project active-project pointer so this value follows project switches.
 */
export function getProjectId(): string {
  return getActiveProjectId();
}

type WipSession = Omit<WritingSession, 'endedAt' | 'wordsEnd' | 'wordsAdded' | 'flowScore' | 'keystrokeMetrics' | 'autoFlowScore' | 'flowMoments'> & { currentWords: number; heartbeatAt?: number; abandoned?: boolean };

export function saveWipSession(session: WipSession): boolean {
  try { localStorage.setItem(WIP_PREFIX + session.id, JSON.stringify({ ...session, heartbeatAt: Date.now() })); return true; }
  catch { return false; }
}

function parseWip(raw: string | null): WipSession | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string' || typeof parsed.projectId !== 'string' ||
      typeof parsed.projectName !== 'string' || typeof parsed.startedAt !== 'string' || typeof parsed.wordsStart !== 'number' ||
      typeof parsed.currentWords !== 'number') throw new Error('Session recovery record is damaged');
  return { ...parsed, heteronymId: parsed.heteronymId ?? null, heteronymName: parsed.heteronymName ?? null };
}

export function readWipSessions(): WipSession[] {
  const records = new Map<string, WipSession>();
  const legacy = parseWip(localStorage.getItem(WIP_KEY));
  if (legacy) records.set(legacy.id, legacy);
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (!key?.startsWith(WIP_PREFIX)) continue;
    const value = parseWip(localStorage.getItem(key));
    if (value) {
      if (key !== WIP_PREFIX + value.id) throw new Error('Session recovery identity is damaged');
      records.set(value.id, value);
    }
  }
  return [...records.values()];
}

/** Compatibility reader; recovery uses every record and reports corruption. */
export function readWipSession(): WipSession | null {
  try { return readWipSessions()[0] ?? null; } catch { return null; }
}

export function clearWipSession(id?: string, wordsEnd?: number): void {
  try {
    if (id) {
      const current = parseWip(localStorage.getItem(WIP_PREFIX + id));
      if (wordsEnd === undefined || !current || current.currentWords <= wordsEnd) localStorage.removeItem(WIP_PREFIX + id);
      const legacy = parseWip(localStorage.getItem(WIP_KEY));
      if (legacy?.id === id && (wordsEnd === undefined || legacy.currentWords <= wordsEnd)) localStorage.removeItem(WIP_KEY);
    } else {
      for (const wip of readWipSessions()) clearWipSession(wip.id);
    }
  } catch { /* Keep corrupt/unreadable recovery records for export. */ }
}
