import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Avoid pulling the React store; projects.ts only needs a blank state shape.
vi.mock('@/lib/store', () => ({
  defaultState: { title: 'Untitled Project', chapters: [] },
}));

import { db, putChapterContent, getAllChapterContents } from '@/lib/storage/dexie-db';
import {
  ensureActiveProject,
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  getActiveProject,
} from '@/lib/projects/projects';
import { getActiveProjectId, setActiveProjectId } from '@/lib/projects/active-project';

describe('projects registry', () => {
  let storage: Record<string, string>;

  beforeEach(async () => {
    await db.stories.clear();
    await db.chapters.clear();
    await db.sessions.clear();
    await db.chapterVersions.clear();
    await db.writerInsights.clear();
    await db.syncQueue.clear();
    await db.syncMeta.clear();

    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => { storage[k] = v; },
      removeItem: (k: string) => { delete storage[k]; },
      clear: () => { storage = {}; },
      get length() { return Object.keys(storage).length; },
      key: (i: number) => Object.keys(storage)[i] ?? null,
    } as Storage);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ensureActiveProject creates a listable row for a fresh install', async () => {
    const id = await ensureActiveProject();
    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].title).toBe('Untitled Project');
  });

  it('createProject adds a project and makes it active', async () => {
    const aId = await ensureActiveProject();
    const bId = await createProject('Novel B');

    expect(getActiveProjectId()).toBe(bId);
    const list = await listProjects();
    expect(list.map(p => p.id).sort()).toEqual([aId, bId].sort());
    const active = await getActiveProject();
    expect(active?.title).toBe('Novel B');
  });

  it('renameProject updates the registry title', async () => {
    const id = await ensureActiveProject();
    await renameProject(id, 'Renamed Saga');
    const list = await listProjects();
    expect(list.find(p => p.id === id)?.title).toBe('Renamed Saga');
  });

  it('isolates chapter content per project', async () => {
    const aId = await ensureActiveProject();
    await putChapterContent('chA', 'Belongs to A', 'Ch A', '', undefined, undefined, aId);

    const bId = await createProject('Novel B'); // now active
    expect(getActiveProjectId()).toBe(bId);

    // Active project B sees no chapters from A.
    const bContents = await getAllChapterContents();
    expect(bContents.size).toBe(0);

    // A still owns its chapter.
    const aContents = await getAllChapterContents(aId);
    expect(aContents.get('chA')).toBe('Belongs to A');
  });

  it('deleteProject removes its data and switches to a remaining project', async () => {
    const aId = await ensureActiveProject();
    await putChapterContent('chA', 'A content', 'Ch A', '', undefined, undefined, aId);
    const bId = await createProject('Novel B');
    await putChapterContent('chB', 'B content', 'Ch B', '', undefined, undefined, bId);

    setActiveProjectId(bId);
    const nextActive = await deleteProject(bId);

    expect(nextActive).toBe(aId);
    expect(getActiveProjectId()).toBe(aId);

    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(aId);

    // B's chapter content is gone; A's survives.
    expect((await getAllChapterContents(bId)).size).toBe(0);
    expect((await getAllChapterContents(aId)).get('chA')).toBe('A content');
  });

  it('deleteProject mints a fresh project when the last one is removed', async () => {
    const only = await ensureActiveProject();
    const next = await deleteProject(only);

    expect(next).not.toBe(only);
    expect(getActiveProjectId()).toBe(next);
    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(next);
  });
});
