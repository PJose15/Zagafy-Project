import { getActiveProjectId } from '@/lib/projects/active-project';
import { db } from '@/lib/storage/dexie-db';
import { queueLocalMutation, notifyLocalMutation } from '@/lib/sync/local-mutation';

export type VersionSource = 'manual' | 'scene-change' | 'auto-snapshot';

export interface ChapterVersion {
  id: string;
  chapterId: string;
  label: string;
  content: string;
  createdAt: string; // ISO 8601
  isCanonical: boolean;
  source: VersionSource;
  wordCount: number;
}

function isVersionSource(v: unknown): v is VersionSource {
  return v === 'manual' || v === 'scene-change' || v === 'auto-snapshot';
}

function isChapterVersion(v: unknown): v is ChapterVersion {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.chapterId === 'string' &&
    typeof o.label === 'string' &&
    typeof o.content === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.isCanonical === 'boolean' &&
    isVersionSource(o.source) &&
    typeof o.wordCount === 'number'
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Legacy localStorage history is imported by migrateFromLocalStorage, never
 * treated as an alternate live store. A failed IndexedDB write must reject. */
export async function readAllVersions(projectId: string = getActiveProjectId()): Promise<ChapterVersion[]> {
  const rows = await db.chapterVersions.where('projectId').equals(projectId).toArray();
  return rows.map(row => {
    const value: unknown = JSON.parse(row.data);
    if (!isChapterVersion(value) || value.id !== row.id || value.chapterId !== row.chapterId) {
      throw new Error('Chapter history is damaged. Export a recovery backup before editing history.');
    }
    return value;
  });
}

/** Serialize the read and write together across tabs. Only changed rows are
 * written, and their cloud queue entries commit in the same transaction. */
async function mutateVersions<T>(projectId: string, change: (versions: ChapterVersion[]) => T): Promise<T> {
  const result = await db.transaction('rw', [db.chapterVersions, db.syncQueue], async () => {
    const versions = await readAllVersions(projectId);
    const previous = new Map(versions.map(version => [version.id, JSON.stringify(version)]));
    const result = change(versions);
    const remaining = new Set(versions.map(version => version.id));
    for (const version of versions) {
      const data = JSON.stringify(version);
      if (previous.get(version.id) === data) continue;
      const existing = await db.chapterVersions.get(version.id);
      if (existing && existing.projectId !== projectId) throw new Error('Version belongs to another project');
      await db.chapterVersions.put({ id: version.id, projectId, chapterId: version.chapterId, createdAt: version.createdAt, data });
      await queueLocalMutation(projectId, 'chapterVersion', version.id);
    }
    for (const id of previous.keys()) {
      if (remaining.has(id)) continue;
      await db.chapterVersions.delete(id);
      await queueLocalMutation(projectId, 'chapterVersion', id, 'delete');
    }
    return result;
  });
  notifyLocalMutation();
  return result;
}

function makeVersion(chapterId: string, content: string, label: string, source: VersionSource, isCanonical: boolean): ChapterVersion {
  return { id: crypto.randomUUID(), chapterId, label, content, createdAt: new Date().toISOString(), isCanonical, source, wordCount: countWords(content) };
}

export async function readVersions(chapterId: string, projectId: string = getActiveProjectId()): Promise<ChapterVersion[]> {
  const all = await readAllVersions(projectId);
  return all.filter(v => v.chapterId === chapterId);
}

export async function addVersion(
  chapterId: string,
  content: string,
  label: string,
  source: VersionSource,
  isCanonical = false,
  projectId: string = getActiveProjectId(),
): Promise<ChapterVersion> {
  return mutateVersions(projectId, versions => {
    if (isCanonical) {
      for (const version of versions) if (version.chapterId === chapterId) version.isCanonical = false;
    }
    const version = makeVersion(chapterId, content, label, source, isCanonical);
    versions.push(version);
    return version;
  });
}

export async function setCanonical(versionId: string, projectId: string = getActiveProjectId()): Promise<void> {
  await mutateVersions(projectId, versions => {
    const target = versions.find(version => version.id === versionId);
    if (!target) return;
    for (const version of versions) if (version.chapterId === target.chapterId) version.isCanonical = version.id === versionId;
  });
}

export async function deleteVersion(versionId: string, projectId: string = getActiveProjectId()): Promise<void> {
  await mutateVersions(projectId, versions => {
    const index = versions.findIndex(version => version.id === versionId);
    if (index !== -1) versions.splice(index, 1);
  });
}

export async function renameVersion(versionId: string, newLabel: string, projectId: string = getActiveProjectId()): Promise<void> {
  await mutateVersions(projectId, versions => {
    const target = versions.find(version => version.id === versionId);
    if (target) target.label = newLabel;
  });
}

/** Concurrent mounts/tabs seed a chapter only once. */
export async function ensureInitialVersion(chapterId: string, currentContent: string, projectId: string = getActiveProjectId()): Promise<ChapterVersion[]> {
  return mutateVersions(projectId, versions => {
    const existing = versions.filter(version => version.chapterId === chapterId);
    if (existing.length > 0 || !currentContent.trim()) return existing;
    const version = makeVersion(chapterId, currentContent, 'Version A', 'auto-snapshot', true);
    versions.push(version);
    return [version];
  });
}

export async function getCanonicalVersion(chapterId: string, projectId: string = getActiveProjectId()): Promise<ChapterVersion | null> {
  const versions = await readVersions(chapterId, projectId);
  return versions.find(version => version.isCanonical) ?? null;
}
