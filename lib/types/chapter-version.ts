import {
  getAllVersions as dexieGetAll,
  putAllVersions as dexiePutAll,
  putVersion as dexiePut,
  deleteVersionById as dexieDelete,
} from '@/lib/storage/dexie-db';

const VERSIONS_KEY = 'zagafy_chapter_versions';

// Cap versions kept per chapter. Without this the table grows without bound —
// e.g. an auto-snapshot on every version switch — eventually exhausting storage
// quota and slowing every full-table rewrite.
const MAX_VERSIONS_PER_CHAPTER = 50;

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

// ─── localStorage fallback (sync) ───

function readAllVersionsSync(): ChapterVersion[] {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChapterVersion);
  } catch {
    return [];
  }
}

function writeAllVersionsSync(versions: ChapterVersion[]): void {
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
  } catch {
    // Quota exceeded — best effort
  }
}

// ─── Async Dexie-backed public API ───

export async function readAllVersions(): Promise<ChapterVersion[]> {
  try {
    const rows = await dexieGetAll();
    const versions = (rows as unknown[]).filter(isChapterVersion);
    if (versions.length > 0) return versions;
    // Fallback: read from localStorage if Dexie is empty (pre-migration)
    return readAllVersionsSync();
  } catch {
    return readAllVersionsSync();
  }
}

async function writeAllVersions(versions: ChapterVersion[]): Promise<void> {
  try {
    await dexiePutAll(versions as unknown[] as Record<string, unknown>[]);
  } catch {
    writeAllVersionsSync(versions);
  }
}

export async function readVersions(chapterId: string): Promise<ChapterVersion[]> {
  const all = await readAllVersions();
  return all.filter(v => v.chapterId === chapterId);
}

export async function addVersion(
  chapterId: string,
  content: string,
  label: string,
  source: VersionSource,
  isCanonical = false
): Promise<ChapterVersion> {
  const all = await readAllVersions();

  // Dedup: an auto-snapshot whose content is byte-identical to an existing
  // version for this chapter adds nothing — return the existing one instead of
  // piling up duplicates (this fires on every version switch).
  if (source === 'auto-snapshot') {
    const duplicate = all.find(v => v.chapterId === chapterId && v.content === content);
    if (duplicate) return duplicate;
  }

  // If marking as canonical, unmark existing canonical for this chapter
  if (isCanonical) {
    for (const v of all) {
      if (v.chapterId === chapterId && v.isCanonical) {
        v.isCanonical = false;
      }
    }
  }

  const version: ChapterVersion = {
    id: crypto.randomUUID(),
    chapterId,
    label,
    content,
    createdAt: new Date().toISOString(),
    isCanonical,
    source,
    wordCount: countWords(content),
  };

  all.push(version);
  await writeAllVersions(pruneChapterVersions(all, chapterId));
  return version;
}

/**
 * Enforce MAX_VERSIONS_PER_CHAPTER for one chapter by dropping the oldest
 * non-canonical versions. The canonical version and versions of other chapters
 * are always kept.
 */
function pruneChapterVersions(all: ChapterVersion[], chapterId: string): ChapterVersion[] {
  const forChapter = all.filter(v => v.chapterId === chapterId);
  if (forChapter.length <= MAX_VERSIONS_PER_CHAPTER) return all;

  // Oldest first; canonical is protected from pruning.
  const prunable = forChapter
    .filter(v => !v.isCanonical)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const removeCount = forChapter.length - MAX_VERSIONS_PER_CHAPTER;
  const toRemove = new Set(prunable.slice(0, removeCount).map(v => v.id));
  if (toRemove.size === 0) return all;

  return all.filter(v => !toRemove.has(v.id));
}

export async function setCanonical(versionId: string): Promise<void> {
  const all = await readAllVersions();
  const target = all.find(v => v.id === versionId);
  if (!target) return;

  for (const v of all) {
    if (v.chapterId === target.chapterId) {
      v.isCanonical = v.id === versionId;
    }
  }
  await writeAllVersions(all);
}

export async function deleteVersion(versionId: string): Promise<void> {
  try {
    const all = await readAllVersions();
    const filtered = all.filter(v => v.id !== versionId);
    await writeAllVersions(filtered);
  } catch {
    // Fallback: delete from localStorage
    const all = readAllVersionsSync();
    const filtered = all.filter(v => v.id !== versionId);
    writeAllVersionsSync(filtered);
  }
}

export async function renameVersion(versionId: string, newLabel: string): Promise<void> {
  const all = await readAllVersions();
  const target = all.find(v => v.id === versionId);
  if (target) {
    target.label = newLabel;
    await writeAllVersions(all);
  }
}

/**
 * Auto-migrate: creates "Version A" from existing chapter content
 * if no versions exist for this chapter yet.
 */
export async function ensureInitialVersion(chapterId: string, currentContent: string): Promise<ChapterVersion[]> {
  const existing = await readVersions(chapterId);
  if (existing.length > 0) return existing;

  if (currentContent.trim().length === 0) return [];

  const version = await addVersion(chapterId, currentContent, 'Version A', 'auto-snapshot', true);
  return [version];
}

export async function getCanonicalVersion(chapterId: string): Promise<ChapterVersion | null> {
  const versions = await readVersions(chapterId);
  return versions.find(v => v.isCanonical) ?? null;
}
