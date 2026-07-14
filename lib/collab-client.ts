'use client';

/**
 * Client-side collaboration helpers.
 *
 * importSharedStory() is the sanctioned REG-4 binding path: a collaborator
 * imports a shared server story as a NEW local project explicitly bound to
 * that serverStoryId, so the sync engine's pull (which only runs for bound
 * projects) fetches it.
 */

import { db } from '@/lib/storage/dexie-db';
import { createProject, switchProject } from '@/lib/projects/projects';
import { updateSyncMeta } from '@/lib/sync/sync-queue';
import type { SyncMeta } from '@/lib/sync/types';

export interface ImportSharedResult {
  projectId: string;
  /** false when a local project was already bound to this server story. */
  created: boolean;
}

/**
 * Import a shared server story as a local project.
 *
 * If a local project is already bound to `serverStoryId`, just switches to
 * it. Otherwise creates a new local project titled `title`, makes it active
 * (createProject sets the active project), then binds its sync meta to the
 * shared serverStoryId — updateSyncMeta keys off the ACTIVE project, so the
 * order create → (implicit switch) → bind matters.
 *
 * The caller is responsible for triggering a sync (syncNow) or reloading so
 * the SyncProvider pulls the story content.
 */
export async function importSharedStory(
  serverStoryId: string,
  title: string,
): Promise<ImportSharedResult> {
  // Already imported? Scan syncMeta for an existing binding.
  const metas = (await db.syncMeta.toArray()) as SyncMeta[];
  const bound = metas.find((m) => m.serverStoryId === serverStoryId);
  if (bound) {
    switchProject(bound.id);
    return { projectId: bound.id, created: false };
  }

  // createProject() sets the new project active, so updateSyncMeta binds
  // the serverStoryId to the NEW project.
  const projectId = await createProject(title || 'Shared story');
  await updateSyncMeta({ serverStoryId });
  return { projectId, created: true };
}
