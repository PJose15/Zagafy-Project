import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSnapshot,
  listSnapshots,
  getSnapshot,
  deleteSnapshot,
  computeDelta,
  DEFAULT_SNAPSHOT_CAP,
} from '@/lib/snapshot';
import { defaultState, type StoryState, type Chapter } from '@/lib/store';
import { db } from '@/lib/storage/dexie-db';

beforeEach(async () => {
  await db.storySnapshots.clear();
});

function makeState(chapters: Chapter[] = [], overrides: Partial<StoryState> = {}): StoryState {
  return { ...defaultState, chapters, ...overrides };
}

function makeChapter(id: string, content: string, canonStatus: Chapter['canonStatus'] = 'flexible'): Chapter {
  return {
    id,
    title: `Chapter ${id}`,
    content,
    summary: '',
    source: 'user-entered',
    canonStatus,
  };
}

describe('createSnapshot', () => {
  it('persists name, description, word count, and chapter count', async () => {
    const state = makeState([
      makeChapter('a', 'one two three'),
      makeChapter('b', 'four five'),
    ]);
    const meta = await createSnapshot(state, { name: 'First save', description: 'after intro' });
    expect(meta.name).toBe('First save');
    expect(meta.description).toBe('after intro');
    expect(meta.wordCount).toBe(5);
    expect(meta.chapterCount).toBe(2);
    expect(meta.id).toBeTruthy();
  });

  it('discarded chapters are excluded from chapterCount but their words still count', async () => {
    const state = makeState([
      makeChapter('a', 'one two', 'flexible'),
      makeChapter('b', 'three four five', 'discarded'),
    ]);
    const meta = await createSnapshot(state, { name: 'mixed' });
    expect(meta.chapterCount).toBe(1);
    expect(meta.wordCount).toBe(5);
  });

  it('falls back to a timestamped name when name is empty', async () => {
    const meta = await createSnapshot(makeState(), { name: '   ' });
    expect(meta.name).toMatch(/^Snapshot /);
  });

  it('full snapshot round-trips the entire StoryState', async () => {
    const state = makeState([makeChapter('c', 'hello world')], { title: 'My Novel' });
    const meta = await createSnapshot(state, { name: 'rt' });
    const full = await getSnapshot(meta.id);
    expect(full).not.toBeNull();
    expect(full!.payload.title).toBe('My Novel');
    expect(full!.payload.chapters).toHaveLength(1);
    expect(full!.payload.chapters[0].content).toBe('hello world');
  });

  it('prunes the oldest snapshots once the cap is exceeded', async () => {
    const cap = 3;
    for (let i = 0; i < 5; i++) {
      await createSnapshot(makeState(), { name: `snap ${i}`, cap });
      // Advance Date.now slightly so createdAt is monotonic enough for the
      // oldest-first pruning. Most environments give us ms-resolution; the
      // explicit await tick lets the loop iterate cleanly.
      await new Promise(r => setTimeout(r, 2));
    }
    const all = await listSnapshots();
    expect(all).toHaveLength(cap);
    // Survivors should be the three newest names.
    const surviving = all.map(s => s.name);
    expect(surviving).toEqual(expect.arrayContaining(['snap 4', 'snap 3', 'snap 2']));
    expect(surviving).not.toContain('snap 0');
    expect(surviving).not.toContain('snap 1');
  });
});

describe('listSnapshots', () => {
  it('returns newest first', async () => {
    const a = await createSnapshot(makeState(), { name: 'a' });
    await new Promise(r => setTimeout(r, 2));
    const b = await createSnapshot(makeState(), { name: 'b' });
    const list = await listSnapshots();
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  it('only returns snapshots for the given storyId', async () => {
    await createSnapshot(makeState(), { name: 'current', storyId: 'current' });
    await createSnapshot(makeState(), { name: 'other', storyId: 'other' });
    const cur = await listSnapshots('current');
    const oth = await listSnapshots('other');
    expect(cur.map(s => s.name)).toEqual(['current']);
    expect(oth.map(s => s.name)).toEqual(['other']);
  });
});

describe('deleteSnapshot', () => {
  it('removes the entry', async () => {
    const meta = await createSnapshot(makeState(), { name: 'd' });
    await deleteSnapshot(meta.id);
    expect(await getSnapshot(meta.id)).toBeNull();
  });
});

describe('computeDelta', () => {
  it('reports zero delta when the snapshot matches current state', async () => {
    const state = makeState([makeChapter('a', 'word')]);
    const meta = await createSnapshot(state, { name: 'x' });
    const full = await getSnapshot(meta.id);
    const delta = computeDelta({ ...meta, payload: full!.payload }, state);
    expect(delta).toEqual({ chapterDelta: 0, wordDelta: 0, characterDelta: 0, worldBibleDelta: 0 });
  });

  it('reports positive delta when current state has grown', async () => {
    const initial = makeState([makeChapter('a', 'one')]);
    const meta = await createSnapshot(initial, { name: 'before' });
    const current = makeState([makeChapter('a', 'one'), makeChapter('b', 'two three')]);
    const full = await getSnapshot(meta.id);
    const delta = computeDelta({ ...meta, payload: full!.payload }, current);
    expect(delta.chapterDelta).toBe(1);
    expect(delta.wordDelta).toBe(2);
  });
});

describe('DEFAULT_SNAPSHOT_CAP', () => {
  it('is exported as a positive integer', () => {
    expect(DEFAULT_SNAPSHOT_CAP).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_SNAPSHOT_CAP)).toBe(true);
  });
});
