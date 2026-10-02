'use client';

import { db } from '@/lib/storage/dexie-db';
import { setActiveProjectId } from './active-project';
import { applyCloudData, cloudTables } from '@/lib/sync/apply-cloud-data';
import { workspaceAllowsSync } from '@/lib/sync/workspace-owner';
import type { PullResponse } from '@/lib/sync/types';

export interface CloudProjectResult { projectId: string; created: boolean }
export function currentCloudAccount(): string | null {
  return (window as Window & { Clerk?: { user?: { id?: string } } }).Clerk?.user?.id ?? null;
}

/** Download and bind before activation: importing never creates an upload delta. */
export async function openCloudProject(
  serverStoryId: string,
  accountId: string,
  currentAccount: () => string | null = currentCloudAccount,
): Promise<CloudProjectResult> {
  const checkAccount = () => {
    if (!accountId || currentAccount() !== accountId || !workspaceAllowsSync(accountId)) {
      throw new Error('Account changed or this browser belongs to another account.');
    }
  };
  checkAccount();
  const findBound = async () => {
    const bound = (await db.syncMeta.toArray()).find(m => m.serverStoryId === serverStoryId);
    if (bound && !(await db.stories.get(bound.id))) throw new Error('Local cloud binding has no project.');
    return bound;
  };
  const existing = await findBound();
  if (existing) {
    checkAccount();
    setActiveProjectId(existing.id);
    return { projectId: existing.id, created: false };
  }
  const response = await fetch(`/api/sync/pull?${new URLSearchParams({ storyId: serverStoryId })}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to download cloud project. Please retry.');
  const { data } = await response.json() as { data: PullResponse };
  checkAccount();
  if (!data || data.accountId !== accountId || data.storyId !== serverStoryId || !data.story ||
      !data.story.state || typeof data.story.state !== 'object' || Array.isArray(data.story.state) ||
      !Number.isFinite(Date.parse(data.serverTimestamp))) throw new Error('Invalid cloud project response.');
  for (const key of ['chapters', 'chapterVersions', 'storySnapshots', 'sessions', 'chatMessages', 'writerInsights', 'comments'] as const) {
    if (!Array.isArray(data[key])) throw new Error('Incomplete cloud project response.');
  }
  const state = data.story.state as Record<string, unknown>;
  if (Array.isArray(state.chapters) && state.chapters.some(ch =>
    !ch || typeof ch !== 'object' || !data.chapters.some(row => row.id === ch.id))) {
    throw new Error('Cloud manuscript is incomplete. Please retry after sync finishes.');
  }
  if (state.chapters !== undefined && !Array.isArray(state.chapters)) throw new Error('Invalid cloud chapters.');
  if (state.chapters === undefined) {
    data.story.state = { ...state, chapters: [...data.chapters].sort((a, b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0))
      .map(row => ({ id: row.id, title: row.title, summary: row.summary ?? '', canonStatus: row.canonStatus ?? 'draft', source: row.source ?? 'manual' })) };
  }
  const result = await db.transaction('rw', cloudTables(), async () => {
    checkAccount();
    const bound = await findBound();
    if (bound) return { projectId: bound.id, created: false };
    const projectId = crypto.randomUUID();
    await db.syncMeta.put({ id: projectId, serverStoryId, lastPulledAt: null, lastPushedAt: null });
    await applyCloudData(data, projectId);
    checkAccount();
    return { projectId, created: true };
  });
  checkAccount();
  setActiveProjectId(result.projectId);
  return result;
}
