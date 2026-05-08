import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  observe,
  readWriterInsights,
  topWriterInsights,
  deleteInsight,
  setInsightPinned,
  clearAllInsights,
  formatInsightsForPrompt,
  PROMPT_INJECTION_LIMIT,
} from '@/lib/writer-memory';
import { db } from '@/lib/storage/dexie-db';

beforeEach(async () => {
  await db.writerInsights.clear();
});

describe('observe', () => {
  it('creates a new insight with evidenceCount=1 and confidence>0', async () => {
    const insight = await observe({
      category: 'pacing',
      observation: 'tends to over-explain in act 2',
    });
    expect(insight.evidenceCount).toBe(1);
    expect(insight.confidence).toBeGreaterThan(0);
    expect(insight.pinned).toBe(false);
  });

  it('folds duplicate observations and bumps evidenceCount', async () => {
    const a = await observe({ category: 'pacing', observation: 'tends to over-explain' });
    const b = await observe({ category: 'pacing', observation: 'TENDS TO OVER-EXPLAIN  ' });
    expect(b.id).toBe(a.id);
    expect(b.evidenceCount).toBe(2);
  });

  it('tracks separate observations even within the same category', async () => {
    await observe({ category: 'pacing', observation: 'over-explains' });
    await observe({ category: 'pacing', observation: 'rushes the climax' });
    const all = await readWriterInsights();
    expect(all).toHaveLength(2);
  });

  it('rejects empty observations', async () => {
    await expect(
      observe({ category: 'plot', observation: '   ' }),
    ).rejects.toThrow();
  });

  it('caps observation length to keep prompt context manageable', async () => {
    const long = 'a'.repeat(500);
    const insight = await observe({ category: 'voice', observation: long });
    expect(insight.observation.length).toBeLessThanOrEqual(240);
  });

  it('honors evidenceWeight overrides', async () => {
    const insight = await observe({
      category: 'description',
      observation: 'sensory grounding strong',
      evidenceWeight: 3,
    });
    expect(insight.evidenceCount).toBe(3);
  });
});

describe('readWriterInsights ordering', () => {
  it('pinned insights come first regardless of confidence', async () => {
    const high = await observe({ category: 'plot', observation: 'high evidence', evidenceWeight: 10 });
    const low = await observe({ category: 'plot', observation: 'low evidence' });
    await setInsightPinned(low.id, true);
    const all = await readWriterInsights();
    expect(all[0].id).toBe(low.id);
    expect(all[1].id).toBe(high.id);
  });

  it('within unpinned, higher confidence wins', async () => {
    const a = await observe({ category: 'voice', observation: 'A', evidenceWeight: 1 });
    const b = await observe({ category: 'voice', observation: 'B', evidenceWeight: 8 });
    const all = await readWriterInsights();
    expect(all[0].id).toBe(b.id);
    expect(all[1].id).toBe(a.id);
  });
});

describe('topWriterInsights', () => {
  it('limits to PROMPT_INJECTION_LIMIT by default', async () => {
    for (let i = 0; i < 6; i++) {
      await observe({ category: 'voice', observation: `obs ${i}`, evidenceWeight: i + 1 });
    }
    const top = await topWriterInsights();
    expect(top.length).toBe(PROMPT_INJECTION_LIMIT);
  });

  it('honors a custom limit', async () => {
    for (let i = 0; i < 6; i++) {
      await observe({ category: 'voice', observation: `obs ${i}`, evidenceWeight: i + 1 });
    }
    const top = await topWriterInsights(2);
    expect(top.length).toBe(2);
  });
});

describe('formatInsightsForPrompt', () => {
  it('returns empty string for an empty list', () => {
    expect(formatInsightsForPrompt([])).toBe('');
  });

  it('formats with one bullet per insight, tagged by category', () => {
    const out = formatInsightsForPrompt([
      {
        id: '1',
        category: 'voice',
        observation: 'prefers minimalist prose',
        evidenceCount: 2,
        lastObservedAt: Date.now(),
        confidence: 0.5,
        pinned: false,
      },
    ]);
    expect(out).toContain('Writer-memory observations');
    expect(out).toContain('(voice)');
    expect(out).toContain('prefers minimalist prose');
  });
});

describe('deleteInsight / setInsightPinned / clearAllInsights', () => {
  it('deleteInsight removes an entry', async () => {
    const insight = await observe({ category: 'plot', observation: 'x' });
    await deleteInsight(insight.id);
    expect(await readWriterInsights()).toHaveLength(0);
  });

  it('setInsightPinned toggles the flag', async () => {
    const insight = await observe({ category: 'plot', observation: 'y' });
    await setInsightPinned(insight.id, true);
    const all1 = await readWriterInsights();
    expect(all1[0].pinned).toBe(true);
    await setInsightPinned(insight.id, false);
    const all2 = await readWriterInsights();
    expect(all2[0].pinned).toBe(false);
  });

  it('clearAllInsights removes everything', async () => {
    await observe({ category: 'plot', observation: 'a' });
    await observe({ category: 'voice', observation: 'b' });
    await clearAllInsights();
    expect(await readWriterInsights()).toHaveLength(0);
  });
});
