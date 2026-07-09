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
  }
}

export const db = new ZagafyDB();

// ─── Migration from localStorage ───

export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const existing = await db.meta.get('migration');
    if (existing) return; // already migrated

    const activeId = getActiveProjectId();

    await db.transaction('rw', [db.chapters, db.chapterVersions, db.sessions, db.meta, db.stories], async () => {
      // 1. Migrate chapters with content from zagafy_state and the whole state blob
      const stateRaw = localStorage.getItem('zagafy_state');
      if (stateRaw) {
        try {
          const state = JSON.parse(stateRaw);
          let chapterCount = 0;
          if (Array.isArray(state.chapters)) {
            chapterCount = state.chapters.length;
            const dexieChapters: DexieChapter[] = state.chapters
              .filter((ch: Record<string, unknown>) => ch && typeof ch.id === 'string')
              .map((ch: Record<string, unknown>) => ({
                id: ch.id as string,
                projectId: activeId,
                title: (ch.title as string) || '',
                content: (ch.content as string) || '',
                summary: (ch.summary as string) || '',
                canonStatus: ch.canonStatus as string | undefined,
                source: ch.source as string | undefined,
                updatedAt: Date.now(),
              }));
            if (dexieChapters.length > 0) {
              await db.chapters.bulkPut(dexieChapters);
            }

            // Strip content from chapters before persisting to stories table
            state.chapters = state.chapters.map((ch: Record<string, unknown>) => ({
              ...ch,
              content: '',
            }));
          }

          // Persist the full state blob (sans chapter contents) into stories table
          await db.stories.put({
            id: activeId,
            data: JSON.stringify(state),
            title: typeof state.title === 'string' ? state.title : 'Untitled Project',
            chapterCount,
            wordCount: 0,
            status: 'draft',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });

          // Remove legacy localStorage key now that data lives in Dexie
          localStorage.removeItem('zagafy_state');
        } catch {
          // Parse error — leave localStorage intact
        }
      }

      // 2. Migrate chapter versions
      const versionsRaw = localStorage.getItem('zagafy_chapter_versions');
      if (versionsRaw) {
        try {
          const versions = JSON.parse(versionsRaw);
          if (Array.isArray(versions)) {
            const dexieVersions: DexieChapterVersion[] = versions
              .filter((v: Record<string, unknown>) => v && typeof v.id === 'string')
              .map((v: Record<string, unknown>) => ({
                id: v.id as string,
                projectId: activeId,
                chapterId: (v.chapterId as string) || '',
                createdAt: (v.createdAt as string) || new Date().toISOString(),
                data: JSON.stringify(v),
              }));
            if (dexieVersions.length > 0) {
              await db.chapterVersions.bulkPut(dexieVersions);
            }
          }
          localStorage.removeItem('zagafy_chapter_versions');
        } catch {
          // Parse error — leave localStorage intact
        }
      }

      // 3. Migrate writing sessions
      const sessionsRaw = localStorage.getItem('zagafy_sessions');
      if (sessionsRaw) {
        try {
          const sessions = JSON.parse(sessionsRaw);
          if (Array.isArray(sessions)) {
            const dexieSessions: DexieSession[] = sessions
              .filter((s: Record<string, unknown>) => s && typeof s.id === 'string')
              .map((s: Record<string, unknown>) => ({
                id: s.id as string,
                projectId: (s.projectId as string) || activeId,
                startedAt: (s.startedAt as string) || '',
                endedAt: (s.endedAt as string) || '',
                wordsAdded: (s.wordsAdded as number) || 0,
                flowScore: (s.flowScore as number) ?? null,
                heteronymId: (s.heteronymId as string) ?? null,
                data: JSON.stringify(s),
              }));
            if (dexieSessions.length > 0) {
              await db.sessions.bulkPut(dexieSessions);
            }
          }
          localStorage.removeItem('zagafy_sessions');
        } catch {
          // Parse error — leave localStorage intact
        }
      }

      // 4. Mark migration complete
      await db.meta.put({ id: 'migration', completedAt: new Date().toISOString() });
    });
  } catch (e) {
    console.error('[dexie] Migration failed, falling back to localStorage', e);
  }
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
  await db.chapters.put({
    id,
    projectId,
    title,
    content,
    summary,
    canonStatus,
    source,
    updatedAt: Date.now(),
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
  await db.chapterVersions.put({
    id: version.id as string,
    projectId,
    chapterId: (version.chapterId as string) || '',
    createdAt: (version.createdAt as string) || new Date().toISOString(),
    data: JSON.stringify(version),
  });
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
  await db.chapterVersions.where('projectId').equals(projectId).delete();
  if (rows.length > 0) {
    await db.chapterVersions.bulkPut(rows);
  }
}

export async function deleteVersionById(id: string): Promise<void> {
  await db.chapterVersions.delete(id);
}

// ─── Sessions CRUD ───

export async function getSessions(
  projectId: string = getActiveProjectId(),
): Promise<Record<string, unknown>[]> {
  const rows = await db.sessions.where('projectId').equals(projectId).toArray();
  return rows.map(r => {
    try { return JSON.parse(r.data); }
    catch { return null; }
  }).filter(Boolean) as Record<string, unknown>[];
}

export async function putSession(
  session: Record<string, unknown>,
  projectId: string = getActiveProjectId(),
): Promise<void> {
  await db.sessions.put({
    id: session.id as string,
    projectId: (session.projectId as string) || projectId,
    startedAt: (session.startedAt as string) || '',
    endedAt: (session.endedAt as string) || '',
    wordsAdded: (session.wordsAdded as number) || 0,
    flowScore: (session.flowScore as number) ?? null,
    heteronymId: (session.heteronymId as string) ?? null,
    data: JSON.stringify(session),
  });
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
  // Replace only this project's sessions.
  await db.sessions.where('projectId').equals(projectId).delete();
  if (rows.length > 0) {
    await db.sessions.bulkPut(rows);
  }
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
  try {
    const row = await db.stories.get(projectId);
    if (!row) return null;
    try {
      return JSON.parse(row.data);
    } catch {
      return null;
    }
  } catch {
    return null;
  }
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
export async function deleteProjectData(projectId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.stories, db.chapters, db.chapterVersions, db.sessions, db.chatMessages, db.chapterAnalysis, db.writerInsights, db.syncQueue, db.syncMeta, db.comments],
    async () => {
      await db.stories.delete(projectId);
      await db.comments.where('projectId').equals(projectId).delete();
      await db.chapters.where('projectId').equals(projectId).delete();
      await db.chapterVersions.where('projectId').equals(projectId).delete();
      await db.sessions.where('projectId').equals(projectId).delete();
      await db.chatMessages.where('projectId').equals(projectId).delete();
      await db.chapterAnalysis.where('projectId').equals(projectId).delete();
      await db.writerInsights.where('projectId').equals(projectId).delete();
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
