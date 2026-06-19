/**
 * Multi-project support — project registry CRUD.
 *
 * A "project" is one row in the Dexie `stories` table (keyed by its project id)
 * plus all the per-project rows in the scoped tables. This module is the single
 * place that creates, lists, renames, and deletes projects, and keeps the
 * active-project pointer in sync.
 */

import {
  getProjectRows,
  getStory,
  putStory,
  deleteProjectData,
  type DexieStory,
} from '@/lib/storage/dexie-db';
import { listSnapshots, deleteSnapshot } from '@/lib/snapshot';
import { defaultState, type StoryState } from '@/lib/store';
import { getActiveProjectId, setActiveProjectId } from '@/lib/projects/active-project';

export interface ProjectSummary {
  id: string;
  title: string;
  wordCount: number;
  chapterCount: number;
  status: string;
  createdAt: number;
  updatedAt: number;
}

function rowToSummary(row: DexieStory): ProjectSummary {
  return {
    id: row.id,
    title: row.title || 'Untitled Project',
    wordCount: row.wordCount ?? 0,
    chapterCount: row.chapterCount ?? 0,
    status: row.status ?? 'draft',
    createdAt: row.createdAt ?? row.updatedAt ?? 0,
    updatedAt: row.updatedAt ?? 0,
  };
}

function safeUUID(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `proj-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

/** Newest-first list of all projects. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await getProjectRows();
  return rows.map(rowToSummary);
}

/** The active project's summary, or null if its row doesn't exist yet. */
export async function getActiveProject(): Promise<ProjectSummary | null> {
  const id = getActiveProjectId();
  const rows = await getProjectRows();
  const row = rows.find(r => r.id === id);
  return row ? rowToSummary(row) : null;
}

/**
 * Guarantee the active project has a `stories` row so it shows up in listings.
 * A freshly-migrated or brand-new install may have an active id with no row yet
 * (the row is normally written on first save). Returns the active project id.
 */
export async function ensureActiveProject(): Promise<string> {
  const id = getActiveProjectId();
  const existing = await getStory(id);
  if (existing === null) {
    await putStory({ ...defaultState } as unknown as Record<string, unknown>, { projectId: id });
  }
  return id;
}

/**
 * Create a blank project, make it active, and return its id. The caller is
 * responsible for navigating/re-hydrating (setActiveProjectId broadcasts the
 * switch, which the store listens for).
 */
export async function createProject(title = 'Untitled Project'): Promise<string> {
  const id = safeUUID();
  const blank: StoryState = { ...defaultState, title };
  await putStory(blank as unknown as Record<string, unknown>, { projectId: id });
  setActiveProjectId(id);
  return id;
}

/** Rename a project (updates both the registry metadata and the blob title). */
export async function renameProject(id: string, title: string): Promise<void> {
  const next = title.trim() || 'Untitled Project';
  const blob = (await getStory(id)) ?? ({ ...defaultState } as unknown as Record<string, unknown>);
  blob.title = next;
  await putStory(blob, { projectId: id });
}

/** Switch the active project. The store re-hydrates off the broadcast. */
export function switchProject(id: string): void {
  setActiveProjectId(id);
}

/**
 * Delete a project and all its data. If it was the active project, switch to
 * the newest remaining project — or mint a fresh blank one so the app always
 * has an active project. Returns the now-active project id.
 */
export async function deleteProject(id: string): Promise<string> {
  // Remove this project's snapshots (separate table keyed by storyId == project id).
  const snaps = await listSnapshots(id);
  for (const s of snaps) await deleteSnapshot(s.id);

  await deleteProjectData(id);

  const wasActive = getActiveProjectId() === id;
  if (!wasActive) return getActiveProjectId();

  const remaining = await getProjectRows();
  if (remaining.length > 0) {
    const next = remaining[0].id; // getProjectRows is newest-first
    setActiveProjectId(next);
    return next;
  }
  const fresh = await createProject();
  return fresh;
}
