import { queueLocalMutation, notifyLocalMutation } from '@/lib/sync/local-mutation';
import Dexie, { type Table } from 'dexie';
import { getActiveProjectId } from '@/lib/projects/active-project';
import type { ManuscriptComment } from '@/lib/types/comment';

export interface DexieChapter {
  id: string;
  /** Multi-project scope. Backfilled to the active project in the v8 upgrade. */
  projectId?: string;
  title: string;
  content: string;
  summary: string;
  canonStatus?: string;
  source?: string;
  updatedAt: number;
  /** Server optimistic-concurrency version (round-tripped through sync push/pull).
   *  Absent on legacy rows — the server treats missing as 1. */
  version?: number;
}

export interface DexieSession {
  id: string;
  projectId?: string;
  startedAt: string;
  endedAt: string;
  wordsAdded: number;
  flowScore: number | null;
  heteronymId: string | null;
  // Full WritingSession fields stored as JSON blob for forward compat
  data: string;
}

export interface DexieChapterVersion {
  id: string;
  projectId?: string;
  chapterId: string;
  createdAt: string;
  // Full ChapterVersion fields stored as JSON blob
  data: string;
}

export interface DexieMeta {
  id: string;
  completedAt: string;
}

export interface DexieChatMessage {
  metadata?: Record<string, unknown>;
  version?: number;
  id: string;
  projectId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  chapterId?: string;
}

export interface DexieStory {
  id: string; // the project id (one row per project; 'backup' is reserved)
  data: string; // JSON-serialized StoryState with chapter contents stripped
  updatedAt: number;
  // ─── Project registry metadata (multi-project) ───
  title?: string;
  createdAt?: number;
  wordCount?: number;
  chapterCount?: number;
  status?: string; // 'draft' | 'editing' | 'complete' (free-form for now)
}

export interface DexieChapterAnalysis {
  chapterId: string;
  projectId?: string;
  contentHash: string;
  analyzedAt: number;
  // Serialized ProseIssue[] — keep it loose so the prose-analysis schema can
  // evolve without a Dexie version bump (we revalidate at read time).
  data: string;
}

export interface DexieStorySnapshot {
  recoveryProtected?: boolean;
  id: string;
  storyId: string;
  name: string;
  description: string;
  createdAt: number;
  wordCount: number;
  chapterCount: number;
  // JSON-serialized StoryState payload — includes chapter contents at the
  // moment the snapshot was taken.
  data: string;
}

export interface DexieWriterInsight {
  id: string;
  projectId?: string;
  category: string;
  observation: string;
  evidenceCount: number;
  lastObservedAt: number;
  confidence: number;
  /** True when the writer has marked this insight as informative — used to
   *  weight injection priority. */
  pinned: number; // 0/1 (Dexie indexable)
}

// ─── Phase 5.4 — Sync engine tables ───

export interface DexieSyncQueueEntry {
  id: string;
  projectId?: string;
  entityType: string;
  entityId: string;
  op: 'upsert' | 'delete';
  timestamp: number;
}

export interface DexieSyncMeta {
  id: string; // the project id (one sync-meta row per project)
  serverStoryId: string | null;
  lastPulledAt: string | null;
  lastPushedAt: string | null;
  /** Server optimistic-concurrency version of the story `state` blob. */
  serverStoryVersion?: number | null;
  serverDeletedAt?: string | null;
  serverDeletedEntities?: Record<string, string>;
}

class ZagafyDB extends Dexie {
  chapters!: Table<DexieChapter, string>;
  sessions!: Table<DexieSession, string>;
  chapterVersions!: Table<DexieChapterVersion, string>;
  meta!: Table<DexieMeta, string>;
  chatMessages!: Table<DexieChatMessage, string>;
  stories!: Table<DexieStory, string>;
  chapterAnalysis!: Table<DexieChapterAnalysis, string>;
  storySnapshots!: Table<DexieStorySnapshot, string>;
  writerInsights!: Table<DexieWriterInsight, string>;
  syncQueue!: Table<DexieSyncQueueEntry, string>;
  syncMeta!: Table<DexieSyncMeta, string>;
  cloudDeleteQueue!: Table<{ id: string; accountId: string; projectId: string; createdAt: number }, string>;
  comments!: Table<ManuscriptComment, string>;

  constructor() {
    super('zagafy');
    this.version(1).stores({
      chapters: 'id, title, updatedAt',
      sessions: 'id, startedAt',
      chatMessages: 'id, timestamp, chapterId',
    });
    this.version(2).stores({
      chapters: 'id, title, updatedAt',
      sessions: 'id, startedAt',
      chapterVersions: 'id, chapterId, createdAt',
      meta: 'id',
      chatMessages: 'id, timestamp, chapterId',
    });
    this.version(3).stores({
      chapters: 'id, title, updatedAt',
      sessions: 'id, startedAt',
      chapterVersions: 'id, chapterId, createdAt',
      meta: 'id',
      chatMessages: 'id, timestamp, chapterId',
      stories: 'id, updatedAt',
    });
    // Version 4 (Phase 4.11 / CB-08): per-chapter prose-analysis cache
    // keyed by content hash so re-analyzing unchanged content is instant.
    this.version(4).stores({
      chapters: 'id, title, updatedAt',
      sessions: 'id, startedAt',
      chapterVersions: 'id, chapterId, createdAt',
      meta: 'id',
      chatMessages: 'id, timestamp, chapterId',
      stories: 'id, updatedAt',
      chapterAnalysis: 'chapterId, contentHash, analyzedAt',
    });
    // Version 5 (Phase 4.7 / MP-03): manuscript-wide snapshots store.
    this.version(5).stores({
      chapters: 'id, title, updatedAt',
      sessions: 'id, startedAt',
      chapterVersions: 'id, chapterId, createdAt',
      meta: 'id',
      chatMessages: 'id, timestamp, chapterId',
      stories: 'id, updatedAt',
      chapterAnalysis: 'chapterId, contentHash, analyzedAt',
      storySnapshots: 'id, storyId, createdAt',
    });
    // Version 6 (Phase 4.12 / MP-11): writer-memory insight store.
    this.version(6).stores({
      chapters: 'id, title, updatedAt',
      sessions: 'id, startedAt',
      chapterVersions: 'id, chapterId, createdAt',
      meta: 'id',
      chatMessages: 'id, timestamp, chapterId',
      stories: 'id, updatedAt',
      chapterAnalysis: 'chapterId, contentHash, analyzedAt',
      storySnapshots: 'id, storyId, createdAt',
      writerInsights: 'id, category, lastObservedAt, evidenceCount, pinned',
    });
    // Version 7 (Phase 5.4): sync engine queue + metadata.
    this.version(7).stores({
      chapters: 'id, title, updatedAt',
      sessions: 'id, startedAt',
      chapterVersions: 'id, chapterId, createdAt',
      meta: 'id',
      chatMessages: 'id, timestamp, chapterId',
      stories: 'id, updatedAt',
      chapterAnalysis: 'chapterId, contentHash, analyzedAt',
      storySnapshots: 'id, storyId, createdAt',
      writerInsights: 'id, category, lastObservedAt, evidenceCount, pinned',
      syncQueue: 'id, entityType, entityId, timestamp',
      syncMeta: 'id',
    });
    // Version 8 (Multi-project): add projectId scoping to every per-story
    // table and project-registry metadata to `stories`. The upgrade backfills
    // existing rows onto the active project so a single-story install becomes
    // that project with all its history intact.
    this.version(8)
      .stores({
        chapters: 'id, projectId, title, updatedAt',
        sessions: 'id, projectId, startedAt',
        chapterVersions: 'id, projectId, chapterId, createdAt',
        meta: 'id',
        chatMessages: 'id, projectId, timestamp, chapterId',
        stories: 'id, updatedAt',
        chapterAnalysis: 'chapterId, projectId, contentHash, analyzedAt',
        storySnapshots: 'id, storyId, createdAt',
        writerInsights: 'id, projectId, category, lastObservedAt, evidenceCount, pinned',
        syncQueue: 'id, projectId, entityType, entityId, timestamp',
        syncMeta: 'id',
      })
      .upgrade(async (tx) => {
        const activeId = getActiveProjectId();

        // Tag every existing row in the scoped tables with the active project.
        const scoped = ['chapters', 'sessions', 'chapterVersions', 'chatMessages', 'chapterAnalysis', 'writerInsights', 'syncQueue'];
        for (const name of scoped) {
          await tx.table(name).toCollection().modify((row: { projectId?: string }) => {
            if (!row.projectId) row.projectId = activeId;
          });
        }

        // Rename the single 'current' story row → the active project id and
        // populate registry metadata derived from its blob + chapter rows.
        const current = await tx.table('stories').get('current');
        if (current) {
          let title = 'Untitled Project';
          let chapterCount = 0;
          try {
            const parsed = JSON.parse(current.data);
            if (typeof parsed?.title === 'string') title = parsed.title;
            if (Array.isArray(parsed?.chapters)) chapterCount = parsed.chapters.length;
          } catch {
            // Unparseable blob — keep defaults.
          }
          await tx.table('stories').put({
            ...current,
            id: activeId,
            title,
            chapterCount,
            wordCount: current.wordCount ?? 0,
            status: current.status ?? 'draft',
            createdAt: current.createdAt ?? (current.updatedAt ?? Date.now()),
            updatedAt: current.updatedAt ?? Date.now(),
          });
          if (activeId !== 'current') await tx.table('stories').delete('current');
        }

        // Re-key the single sync-meta row ('sync') onto the active project.
        const syncMetaRow = await tx.table('syncMeta').get('sync');
        if (syncMetaRow) {
          await tx.table('syncMeta').put({ ...syncMetaRow, id: activeId });
          await tx.table('syncMeta').delete('sync');
        }
      });
    // Version 9 (Phase 4 / MP-05): margin comments anchored to chapter text.
    // Note: `resolved` is a boolean, which IndexedDB cannot index — the schema
    // entry is a documented no-op and reads filter in JS after the chapterId
    // lookup (same trade-off writerInsights avoided with a 0/1 `pinned`).
    this.version(9).stores({
      chapters: 'id, projectId, title, updatedAt',
      sessions: 'id, projectId, startedAt',
      chapterVersions: 'id, projectId, chapterId, createdAt',
      meta: 'id',
      chatMessages: 'id, projectId, timestamp, chapterId',
      stories: 'id, updatedAt',
      chapterAnalysis: 'chapterId, projectId, contentHash, analyzedAt',
      storySnapshots: 'id, storyId, createdAt',
      writerInsights: 'id, projectId, category, lastObservedAt, evidenceCount, pinned',
      syncQueue: 'id, projectId, entityType, entityId, timestamp',
      syncMeta: 'id',
      comments: 'id, projectId, chapterId, resolved, createdAt',
    });
    this.version(10).stores({ cloudDeleteQueue: 'id, accountId' });
  }
}

export const db = new ZagafyDB();

// ─── Migration from localStorage ───

export async function migrateFromLocalStorage(): Promise<void> {
  if (await db.meta.get('migration')) return;
  const activeId = getActiveProjectId();
  const keys = ['zagafy_state', 'zagafy_chapter_versions', 'zagafy_sessions'] as const;
  const originals = keys.map(key => ({ key, raw: localStorage.getItem(key) }));
  const parsed = originals.map(({ raw }) => raw === null ? null : JSON.parse(raw));
  const [legacyState, legacyVersions, legacySessions] = parsed;
  if (legacyState !== null && (!legacyState || typeof legacyState !== 'object' || Array.isArray(legacyState))) throw new Error('Legacy manuscript is damaged');
  for (const value of [legacyVersions, legacySessions]) if (value !== null && !Array.isArray(value)) throw new Error('Legacy history is damaged');
  const { isWritingSession } = await import('@/lib/types/writing-session');
  const versions = (legacyVersions ?? []) as Record<string, unknown>[];
  for (const v of versions) {
    if (!v || typeof v.id !== 'string' || typeof v.chapterId !== 'string' || typeof v.content !== 'string' ||
        typeof v.label !== 'string' || typeof v.createdAt !== 'string' || typeof v.isCanonical !== 'boolean' ||
        typeof v.wordCount !== 'number' || !['manual', 'scene-change', 'auto-snapshot'].includes(v.source as string)) throw new Error('Legacy chapter history is damaged');
  }
  const sessions = (legacySessions ?? []) as Record<string, unknown>[];
  for (const session of sessions) {
    if (!isWritingSession(session)) throw new Error('Legacy session history is damaged');
  }
  const chapters = legacyState?.chapters ?? [];
  if (!Array.isArray(chapters) || chapters.some(ch => !ch || typeof ch.id !== 'string' || typeof ch.content !== 'string')) throw new Error('Legacy chapters are damaged');
  await db.transaction('rw', [db.chapters, db.chapterVersions, db.sessions, db.meta, db.stories, db.syncQueue], async () => {
    if (await db.meta.get('migration')) return;
    // A retry must never overwrite newer IndexedDB records. Conflicting legacy
    // data stays intact for recovery instead of silently winning or disappearing.
    const putMissing = async <T extends { id: string }>(table: Table<T, string>, row: T, type: 'chapter' | 'chapterVersion' | 'session') => {
      const existing = await table.get(row.id);
      if (existing) {
        const oldData = existing as T & { projectId?: string; data?: string; content?: string };
        const newData = row as T & { projectId?: string; data?: string; content?: string };
        if (oldData.projectId !== newData.projectId || oldData.data !== newData.data || oldData.content !== newData.content) throw new Error('Legacy data conflicts with current storage; export recovery before continuing');
        return;
      }
      await table.put(row);
      await queueLocalMutation((row as T & { projectId?: string }).projectId ?? activeId, type, row.id);
    };
    for (const ch of chapters) await putMissing(db.chapters, { id: ch.id, projectId: activeId, title: ch.title ?? '', content: ch.content,
      summary: ch.summary ?? '', canonStatus: ch.canonStatus, source: ch.source, updatedAt: Date.now() }, 'chapter');
    for (const v of versions) await putMissing(db.chapterVersions, { id: v.id as string, projectId: activeId,
      chapterId: v.chapterId as string, createdAt: v.createdAt as string, data: JSON.stringify(v) }, 'chapterVersion');
    for (const session of sessions) await putMissing(db.sessions, { id: session.id as string, projectId: session.projectId as string,
      startedAt: session.startedAt as string, endedAt: session.endedAt as string, wordsAdded: session.wordsAdded as number,
      flowScore: session.flowScore as number | null, heteronymId: session.heteronymId as string | null, data: JSON.stringify(session) }, 'session');
    if (legacyState) {
      const state = { ...legacyState, chapters: chapters.map(ch => ({ ...ch, content: '' })) };
      const existing = await db.stories.get(activeId);
      if (existing && existing.data !== JSON.stringify(state)) throw new Error('Legacy manuscript conflicts with current storage; export recovery before continuing');
      if (!existing) {
        await db.stories.put({ id: activeId, data: JSON.stringify(state), title: state.title ?? 'Untitled Project', chapterCount: chapters.length,
          wordCount: 0, status: 'draft', createdAt: Date.now(), updatedAt: Date.now() });
        await queueLocalMutation(activeId, 'story', activeId);
      }
    }
    await db.meta.put({ id: 'migration', completedAt: new Date().toISOString() });
  });
  // Never remove recovery bytes before the entire IndexedDB transaction commits.
  for (const { key, raw } of originals) {
    try { if (raw !== null && localStorage.getItem(key) === raw) localStorage.removeItem(key); } catch { /* safely retry cleanup later */ }
  }
  notifyLocalMutation();
}

// ─── Chapter Content CRUD ───

export async function getChapterContent(id: string): Promise<string> {
  const row = await db.chapters.get(id);
  return row?.content ?? '';
}

export async function putChapterContent(
  id: string,
  content: string,
  title = '',
  summary = '',
  canonStatus?: string,
  source?: string,
  projectId: string = getActiveProjectId(),
): Promise<void> {
  // Carry the sync version across content saves — a plain put would strip it
  // and reset the chapter to version 1 on the server's next push check.
  const existing = await db.chapters.get(id);
  await db.chapters.put({
    id,
    projectId,
    title,
    content,
    summary,
    canonStatus,
    source,
    updatedAt: Date.now(),
    version: existing?.version,
  });
}

/** Chapter contents for one project, keyed by chapter id. */
export async function getAllChapterContents(
  projectId: string = getActiveProjectId(),
): Promise<Map<string, string>> {
  const all = await db.chapters.where('projectId').equals(projectId).toArray();
  const map = new Map<string, string>();
  for (const ch of all) {
    map.set(ch.id, ch.content);
  }
  return map;
}

export async function deleteChapterContent(id: string): Promise<void> {
  await db.chapters.delete(id);
}

// ─── Chapter Versions CRUD ───

export async function getVersions(chapterId: string): Promise<Record<string, unknown>[]> {
  const rows = await db.chapterVersions.where('chapterId').equals(chapterId).toArray();
  return rows.map(r => {
    try { return JSON.parse(r.data); }
    catch { return null; }
  }).filter(Boolean) as Record<string, unknown>[];
}

export async function getAllVersions(
  projectId: string = getActiveProjectId(),
): Promise<Record<string, unknown>[]> {
  const rows = await db.chapterVersions.where('projectId').equals(projectId).toArray();
  return rows.map(r => {
    try { return JSON.parse(r.data); }
    catch { return null; }
  }).filter(Boolean) as Record<string, unknown>[];
}

export async function putVersion(
  version: Record<string, unknown>,
  projectId: string = getActiveProjectId(),
): Promise<void> {
  await db.transaction('rw', [db.chapterVersions, db.syncQueue], async () => {
    const existing = await db.chapterVersions.get(version.id as string);
    if (existing && existing.projectId !== projectId) throw new Error('Version belongs to another project');
    await db.chapterVersions.put({
      id: version.id as string,
      projectId,
      chapterId: (version.chapterId as string) || '',
      createdAt: (version.createdAt as string) || new Date().toISOString(),
      data: JSON.stringify(version),
    });
    await queueLocalMutation(projectId, 'chapterVersion', version.id as string);
  });
  notifyLocalMutation();
}

export async function putAllVersions(
  versions: Record<string, unknown>[],
  projectId: string = getActiveProjectId(),
): Promise<void> {
  const rows: DexieChapterVersion[] = versions.map(v => ({
    id: v.id as string,
    projectId,
    chapterId: (v.chapterId as string) || '',
    createdAt: (v.createdAt as string) || new Date().toISOString(),
    data: JSON.stringify(v),
  }));
  // Replace only this project's versions — other projects' history is untouched.
  // Transactional: a failure between delete and bulkPut must not destroy the
  // project's entire version history.
  await db.transaction('rw', [db.chapterVersions, db.syncQueue], async () => {
    const previous = await db.chapterVersions.where('projectId').equals(projectId).toArray();
    for (const row of rows) {
      const existing = await db.chapterVersions.get(row.id);
      if (existing && existing.projectId !== projectId) throw new Error('Version belongs to another project');
    }
    await db.chapterVersions.where('projectId').equals(projectId).delete();
    if (rows.length > 0) {
      await db.chapterVersions.bulkPut(rows);
    }
    for (const row of rows) await queueLocalMutation(projectId, 'chapterVersion', row.id);
    for (const row of previous) if (!rows.some(next => next.id === row.id)) await queueLocalMutation(projectId, 'chapterVersion', row.id, 'delete');
  });
  notifyLocalMutation();
}

export async function deleteVersionById(id: string): Promise<void> {
  await db.transaction('rw', [db.chapterVersions, db.syncQueue], async () => {
    const row = await db.chapterVersions.get(id);
    if (!row) return;
    await db.chapterVersions.delete(id);
    await queueLocalMutation(row.projectId ?? getActiveProjectId(), 'chapterVersion', id, 'delete');
  });
  notifyLocalMutation();
}

// ─── Sessions CRUD ───

export async function getSessions(
  projectId: string = getActiveProjectId(),
): Promise<Record<string, unknown>[]> {
  const rows = await db.sessions.where('projectId').equals(projectId).toArray();
  return rows.map(row => {
    const value = JSON.parse(row.data);
    if (!value || value.id !== row.id || value.projectId !== projectId) throw new Error('Session history is damaged');
    return value;
  });
}

export async function putSession(
  session: Record<string, unknown>,
  projectId: string = getActiveProjectId(),
  onlyIfMissing = false,
): Promise<void> {
  const targetProjectId = (session.projectId as string) || projectId;
  await db.transaction('rw', [db.sessions, db.syncQueue], async () => {
    const existing = await db.sessions.get(session.id as string);
    if (existing && existing.projectId !== targetProjectId) throw new Error('Session belongs to another project');
    if (existing && onlyIfMissing) return;
    if (existing && Date.parse(existing.endedAt) >= Date.parse(session.endedAt as string)) return;
    if (existing?.flowScore != null) session = { ...session, flowScore: existing.flowScore };
    await db.sessions.put({
      id: session.id as string,
      projectId: targetProjectId,
      startedAt: (session.startedAt as string) || '',
      endedAt: (session.endedAt as string) || '',
      wordsAdded: (session.wordsAdded as number) || 0,
      flowScore: (session.flowScore as number) ?? null,
      heteronymId: (session.heteronymId as string) ?? null,
      data: JSON.stringify({ ...session, projectId: targetProjectId }),
    });
    await queueLocalMutation(targetProjectId, 'session', session.id as string);
  });
  notifyLocalMutation();
}

/** A flow-score update cannot replace a concurrently added session list. */
export async function updateSessionScore(id: string, score: number, projectId: string): Promise<void> {
  const { isWritingSession } = await import('@/lib/types/writing-session');
  await db.transaction('rw', [db.sessions, db.syncQueue], async () => {
    const row = await db.sessions.get(id);
    if (!row || row.projectId !== projectId) return;
    const value = JSON.parse(row.data);
    if (!isWritingSession(value) || value.id !== id || value.projectId !== projectId) throw new Error('Session history is damaged');
    await db.sessions.put({ ...row, flowScore: score, data: JSON.stringify({ ...value, flowScore: score }) });
    await queueLocalMutation(projectId, 'session', id);
  });
  notifyLocalMutation();
}

export async function putAllSessions(
  sessions: Record<string, unknown>[],
  projectId: string = getActiveProjectId(),
): Promise<void> {
  const rows: DexieSession[] = sessions.map(s => ({
    id: s.id as string,
    projectId: (s.projectId as string) || projectId,
    startedAt: (s.startedAt as string) || '',
    endedAt: (s.endedAt as string) || '',
    wordsAdded: (s.wordsAdded as number) || 0,
    flowScore: (s.flowScore as number) ?? null,
    heteronymId: (s.heteronymId as string) ?? null,
    data: JSON.stringify(s),
  }));
  await db.transaction('rw', [db.sessions, db.syncQueue], async () => {
    const previous = await db.sessions.where('projectId').equals(projectId).toArray();
    for (const row of rows) {
      if (row.projectId !== projectId) throw new Error('Sessions must belong to the target project');
      const existing = await db.sessions.get(row.id);
      if (existing && existing.projectId !== projectId) throw new Error('Session belongs to another project');
    }
    await db.sessions.where('projectId').equals(projectId).delete();
    if (rows.length) await db.sessions.bulkPut(rows);
    for (const row of rows) await queueLocalMutation(projectId, 'session', row.id);
    for (const row of previous) if (!rows.some(next => next.id === row.id)) await queueLocalMutation(projectId, 'session', row.id, 'delete');
  });
  notifyLocalMutation();
}

// ─── Story state CRUD ───

/** Story-row ids that are not user projects and must be excluded from listings. */
export const RESERVED_STORY_IDS = new Set(['backup', 'current']);

/**
 * Reads one project's story state blob from Dexie. Returns null if not yet
 * persisted. Chapter contents live in the `chapters` table — caller must merge
 * them in.
 */
export async function getStory(
  projectId: string = getActiveProjectId(),
): Promise<Record<string, unknown> | null> {
  const row = await db.stories.get(projectId);
  if (!row) return null;
  // A failed read or corrupt record is not a missing project. Keep the original
  // row intact and block callers from replacing it with an empty default.
  const parsed: unknown = JSON.parse(row.data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored project is not an object');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Writes one project's story state blob to Dexie plus its registry metadata.
 * Caller should strip chapter contents (store them via putChapterContent)
 * before passing the state here. `wordCount` is supplied by the caller because
 * the persisted state has chapter contents stripped.
 */
export async function putStory(
  state: Record<string, unknown>,
  opts: { projectId?: string; wordCount?: number; status?: string } = {},
): Promise<void> {
  const projectId = opts.projectId ?? getActiveProjectId();
  const existing = await db.stories.get(projectId);
  const chapters = Array.isArray((state as { chapters?: unknown[] }).chapters)
    ? (state as { chapters: unknown[] }).chapters
    : [];
  const title = typeof (state as { title?: unknown }).title === 'string'
    ? (state as { title: string }).title
    : 'Untitled Project';
  await db.stories.put({
    id: projectId,
    data: JSON.stringify(state),
    title,
    chapterCount: chapters.length,
    wordCount: opts.wordCount ?? existing?.wordCount ?? 0,
    status: opts.status ?? existing?.status ?? 'draft',
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
}

/** All project rows (registry metadata), newest-first, excluding reserved ids. */
export async function getProjectRows(): Promise<DexieStory[]> {
  const rows = await db.stories.toArray();
  return rows
    .filter(r => !RESERVED_STORY_IDS.has(r.id))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** Delete every row belonging to one project across all scoped tables + its story row. */
export async function deleteProjectData(projectId: string, deletion?: { storyId: string; accountId: string }): Promise<void> {
  await db.transaction(
    'rw',
    [db.stories, db.chapters, db.chapterVersions, db.sessions, db.chatMessages, db.chapterAnalysis, db.writerInsights, db.storySnapshots, db.syncQueue, db.syncMeta, db.comments, db.cloudDeleteQueue],
    async () => {
      if (deletion) await db.cloudDeleteQueue.put({ id: deletion.storyId, accountId: deletion.accountId, projectId, createdAt: Date.now() });
      await db.stories.delete(projectId);
      await db.comments.where('projectId').equals(projectId).delete();
      await db.chapters.where('projectId').equals(projectId).delete();
      await db.chapterVersions.where('projectId').equals(projectId).delete();
      await db.sessions.where('projectId').equals(projectId).delete();
      await db.chatMessages.where('projectId').equals(projectId).delete();
      await db.chapterAnalysis.where('projectId').equals(projectId).delete();
      await db.writerInsights.where('projectId').equals(projectId).delete();
      // Snapshots are keyed by storyId (== projectId). Including them here makes
      // project deletion atomic (previously the caller looped deleteSnapshot
      // outside any transaction, so a mid-loop failure orphaned snapshots).
      await db.storySnapshots.where('storyId').equals(projectId).delete();
      await db.syncQueue.where('projectId').equals(projectId).delete();
      await db.syncMeta.delete(projectId);
    }
  );
}

/** Clears all project data (stories blob, chapters, versions, sessions, chat, analysis cache, snapshots, insights, sync state). */
export async function clearAllStoryData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.stories, db.chapters, db.chapterVersions, db.sessions, db.chatMessages, db.meta, db.chapterAnalysis, db.storySnapshots, db.writerInsights, db.syncQueue, db.syncMeta, db.comments],
    async () => {
      await db.stories.clear();
      await db.comments.clear();
      await db.chapters.clear();
      await db.chapterVersions.clear();
      await db.sessions.clear();
      await db.chatMessages.clear();
      await db.meta.clear();
      await db.chapterAnalysis.clear();
      await db.storySnapshots.clear();
      await db.writerInsights.clear();
      await db.syncQueue.clear();
      await db.syncMeta.clear();
    }
  );
}

// ─── Chapter prose-analysis cache (Phase 4.11 / CB-08) ───

export interface ChapterAnalysisRow<T = unknown> {
  chapterId: string;
  contentHash: string;
  analyzedAt: number;
  data: T;
}

export async function getChapterAnalysis<T>(chapterId: string): Promise<ChapterAnalysisRow<T> | null> {
  const row = await db.chapterAnalysis.get(chapterId);
  if (!row) return null;
  try {
    return {
      chapterId: row.chapterId,
      contentHash: row.contentHash,
      analyzedAt: row.analyzedAt,
      data: JSON.parse(row.data) as T,
    };
  } catch {
    return null;
  }
}

export async function putChapterAnalysis<T>(
  chapterId: string,
  contentHash: string,
  data: T,
  analyzedAt: number = Date.now(),
  projectId: string = getActiveProjectId(),
): Promise<void> {
  await db.chapterAnalysis.put({
    chapterId,
    projectId,
    contentHash,
    analyzedAt,
    data: JSON.stringify(data),
  });
}

export async function clearChapterAnalysis(chapterId: string): Promise<void> {
  await db.chapterAnalysis.delete(chapterId);
}
