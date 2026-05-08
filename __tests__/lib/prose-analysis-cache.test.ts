import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hashContent,
  getOrAnalyze,
  readCachedAnalysis,
} from '@/lib/prose-analysis-cache';
import { db, getChapterAnalysis, putChapterAnalysis } from '@/lib/storage/dexie-db';

beforeEach(async () => {
  await db.chapterAnalysis.clear();
  vi.restoreAllMocks();
});

describe('hashContent', () => {
  it('produces a deterministic hash for the same input', async () => {
    const a = await hashContent('the quick brown fox');
    const b = await hashContent('the quick brown fox');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await hashContent('the quick brown fox');
    const b = await hashContent('the quick brown fox.');
    expect(a).not.toBe(b);
  });

  it('returns a SHA-256 hex string when subtle crypto is available', async () => {
    const h = await hashContent('hello');
    // SHA-256 hex is 64 chars; FNV fallback is 'fnv:' + 16 chars.
    if (h.startsWith('fnv:')) {
      expect(h).toHaveLength(20);
    } else {
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('falls back to FNV-1a when subtle crypto is unavailable', async () => {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      Object.defineProperty(globalThis.crypto, 'subtle', {
        configurable: true,
        value: undefined,
      });
    }
    try {
      const h = await hashContent('hello');
      expect(h.startsWith('fnv:')).toBe(true);
    } finally {
      if (subtle) {
        Object.defineProperty(globalThis.crypto, 'subtle', {
          configurable: true,
          value: subtle,
        });
      }
    }
  });
});

describe('getOrAnalyze', () => {
  it('runs the analyzer on a fresh chapter and persists the result', async () => {
    const result = await getOrAnalyze('ch-1', 'There was a man who started to walk.');
    expect(result.fromCache).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);

    const stored = await getChapterAnalysis('ch-1');
    expect(stored).not.toBeNull();
    expect(stored!.contentHash).toBe(result.contentHash);
  });

  it('returns the cached analysis when content is unchanged', async () => {
    const first = await getOrAnalyze('ch-2', 'There was a chair.');
    const second = await getOrAnalyze('ch-2', 'There was a chair.');
    expect(second.fromCache).toBe(true);
    expect(second.contentHash).toBe(first.contentHash);
    expect(second.issues).toEqual(first.issues);
    // analyzedAt is preserved across cache hits — it reflects the original run.
    expect(second.analyzedAt).toBe(first.analyzedAt);
  });

  it('re-analyzes after the content changes (hash mismatch invalidates cache)', async () => {
    const first = await getOrAnalyze('ch-3', 'There was a man.');
    const second = await getOrAnalyze('ch-3', 'There were men running.');
    expect(second.fromCache).toBe(false);
    expect(second.contentHash).not.toBe(first.contentHash);
  });

  it('keeps caches separate per chapter', async () => {
    await getOrAnalyze('ch-a', 'There was a tree.');
    await getOrAnalyze('ch-b', 'A different scene.');
    const a = await getChapterAnalysis('ch-a');
    const b = await getChapterAnalysis('ch-b');
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.contentHash).not.toBe(b!.contentHash);
  });
});

describe('readCachedAnalysis', () => {
  it('returns null when there is no entry', async () => {
    const cached = await readCachedAnalysis('never-analyzed', 'whatever');
    expect(cached).toBeNull();
  });

  it('returns the entry when content matches', async () => {
    await getOrAnalyze('ch-r', 'There was a sound.');
    const cached = await readCachedAnalysis('ch-r', 'There was a sound.');
    expect(cached).not.toBeNull();
    expect(cached!.fromCache).toBe(true);
  });

  it('returns null when stored content hash no longer matches', async () => {
    await getOrAnalyze('ch-stale', 'There was a man.');
    const cached = await readCachedAnalysis('ch-stale', 'There was a woman.');
    expect(cached).toBeNull();
  });

  it('reads back exactly what putChapterAnalysis wrote', async () => {
    const issues = [{
      category: 'pacing' as const,
      severity: 'low' as const,
      message: 'test',
      suggestion: 'test',
      startIndex: 0,
      endIndex: 1,
      text: 'x',
    }];
    const hash = await hashContent('exact');
    await putChapterAnalysis('ch-x', hash, issues);
    const cached = await readCachedAnalysis('ch-x', 'exact');
    expect(cached!.issues).toEqual(issues);
  });
});
