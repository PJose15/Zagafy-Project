import { db, type DexieWriterInsight } from '@/lib/storage/dexie-db';
import { getActiveProjectId } from '@/lib/projects/active-project';

/**
 * Phase 4.12 / MP-11 — long-term observations about how this writer works.
 *
 * Insights are aggregated from coach / audit signals over time and surfaced
 * back to the writer (in the writing-map view) and to the AI (top-N
 * insights are injected into chat / coach / micro-prompt system prompts).
 *
 * Storage is local-only until Phase 5 introduces sync. Writers can clear
 * the memory or pin specific insights to weight injection priority.
 */

export const WRITER_INSIGHT_CATEGORIES = [
  'pacing',
  'dialogue',
  'description',
  'plot',
  'voice',
] as const;

export type WriterInsightCategory = (typeof WRITER_INSIGHT_CATEGORIES)[number];

export interface WriterInsight {
  id: string;
  category: WriterInsightCategory;
  observation: string;
  evidenceCount: number;
  /** epoch ms */
  lastObservedAt: number;
  /** 0–1 — bumps with evidenceCount, decays with age. */
  confidence: number;
  pinned: boolean;
}

/** Top-N insights injected into AI prompts. Keep small to avoid bloating the context. */
export const PROMPT_INJECTION_LIMIT = 3;

const MAX_OBSERVATION_CHARS = 240;

function isCategory(v: unknown): v is WriterInsightCategory {
  return typeof v === 'string' && (WRITER_INSIGHT_CATEGORIES as readonly string[]).includes(v);
}

function rowToInsight(row: DexieWriterInsight): WriterInsight | null {
  if (!isCategory(row.category)) return null;
  return {
    id: row.id,
    category: row.category,
    observation: row.observation,
    evidenceCount: row.evidenceCount,
    lastObservedAt: row.lastObservedAt,
    confidence: row.confidence,
    pinned: row.pinned === 1,
  };
}

function insightToRow(insight: WriterInsight, projectId: string = getActiveProjectId()): DexieWriterInsight {
  return {
    id: insight.id,
    projectId,
    category: insight.category,
    observation: insight.observation,
    evidenceCount: insight.evidenceCount,
    lastObservedAt: insight.lastObservedAt,
    confidence: insight.confidence,
    pinned: insight.pinned ? 1 : 0,
  };
}

/**
 * Confidence rises with evidence and decays with age. Bounded to [0, 1].
 *
 *   confidence = clamp(0, 1, 1 - exp(-evidenceCount / 4)) * recencyDecay
 *
 * recencyDecay halves every 30 days.
 */
function computeConfidence(evidenceCount: number, lastObservedAt: number, now = Date.now()): number {
  const evidenceTerm = 1 - Math.exp(-evidenceCount / 4);
  const ageDays = Math.max(0, (now - lastObservedAt) / (1000 * 60 * 60 * 24));
  const recencyDecay = Math.pow(0.5, ageDays / 30);
  return Math.max(0, Math.min(1, evidenceTerm * recencyDecay));
}

function makeKey(category: WriterInsightCategory, observation: string): string {
  return `${category}::${observation.toLowerCase().trim()}`;
}

/** Read every insight, newest-first. Filters out rows whose category is no longer recognized. */
export async function readWriterInsights(): Promise<WriterInsight[]> {
  const rows = await db.writerInsights.where('projectId').equals(getActiveProjectId()).toArray();
  return rows
    .map(rowToInsight)
    .filter((x): x is WriterInsight => x !== null)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.lastObservedAt - a.lastObservedAt;
    });
}

/**
 * Top-N insights ordered by pinned-first → confidence → recency. Used to
 * pull a small set into AI prompt contexts.
 */
export async function topWriterInsights(limit = PROMPT_INJECTION_LIMIT): Promise<WriterInsight[]> {
  const all = await readWriterInsights();
  return all.slice(0, limit);
}

/**
 * Build the prompt-fragment that gets injected into chat / coach / micro-prompt
 * system prompts. Empty string when there are no insights.
 */
export function formatInsightsForPrompt(insights: WriterInsight[]): string {
  if (insights.length === 0) return '';
  const bullets = insights
    .map(i => `- (${i.category}) ${i.observation}`)
    .join('\n');
  return [
    'Writer-memory observations (use as soft context; the writer values these but they are not canon):',
    bullets,
  ].join('\n');
}

export interface ObserveInput {
  category: WriterInsightCategory;
  observation: string;
  /** Optional: how many pieces of evidence this single record contributes. Defaults to 1. */
  evidenceWeight?: number;
}

/**
 * Record an observation. Folds into an existing insight when the
 * (category, observation) pair already exists — bumps evidenceCount,
 * touches lastObservedAt, and recomputes confidence.
 */
export async function observe(input: ObserveInput): Promise<WriterInsight> {
  const observation = input.observation.trim().slice(0, MAX_OBSERVATION_CHARS);
  if (!observation) {
    throw new Error('observation must be a non-empty string');
  }
  const key = makeKey(input.category, observation);
  const weight = input.evidenceWeight ?? 1;

  const projectId = getActiveProjectId();
  return db.transaction('rw', db.writerInsights, async () => {
    const existingRows = await db.writerInsights
      .where('category')
      .equals(input.category)
      .toArray();
    const match = existingRows.find(
      r => r.projectId === projectId && makeKey(input.category, r.observation) === key,
    );

    if (match) {
      const updated: WriterInsight = {
        id: match.id,
        category: input.category,
        observation: match.observation,
        evidenceCount: match.evidenceCount + weight,
        lastObservedAt: Date.now(),
        confidence: computeConfidence(match.evidenceCount + weight, Date.now()),
        pinned: match.pinned === 1,
      };
      await db.writerInsights.put(insightToRow(updated, projectId));
      return updated;
    }

    const fresh: WriterInsight = {
      id: crypto.randomUUID(),
      category: input.category,
      observation,
      evidenceCount: weight,
      lastObservedAt: Date.now(),
      confidence: computeConfidence(weight, Date.now()),
      pinned: false,
    };
    await db.writerInsights.put(insightToRow(fresh, projectId));
    return fresh;
  });
}

/** Delete a single writer insight by ID. */
export async function deleteInsight(id: string): Promise<void> {
  await db.writerInsights.delete(id);
}

/** Pin or unpin an insight, affecting its injection priority in AI prompts. */
export async function setInsightPinned(id: string, pinned: boolean): Promise<void> {
  const row = await db.writerInsights.get(id);
  if (!row) return;
  await db.writerInsights.put({ ...row, pinned: pinned ? 1 : 0 });
}

/** Remove the active project's writer insights from the local database. */
export async function clearAllInsights(): Promise<void> {
  await db.writerInsights.where('projectId').equals(getActiveProjectId()).delete();
}

/**
 * Recompute confidence for every insight in the active project (e.g. after a
 * long pause). Called from the writing-map view so age-decayed scores stay current.
 */
export async function refreshConfidences(): Promise<void> {
  const rows = await db.writerInsights.where('projectId').equals(getActiveProjectId()).toArray();
  const now = Date.now();
  await db.writerInsights.bulkPut(
    rows.map(r => ({
      ...r,
      confidence: computeConfidence(r.evidenceCount, r.lastObservedAt, now),
    })),
  );
}
