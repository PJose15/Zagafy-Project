'use client';

import { currentCloudAccount, openCloudProject, type CloudProjectResult } from '@/lib/projects/cloud-projects';
export type ImportSharedResult = CloudProjectResult;

/** Shared and owned projects use the same download-before-activation path. */
export async function importSharedStory(
  serverStoryId: string,
  _title: string,
  accountId: string | null = currentCloudAccount(),
): Promise<ImportSharedResult> {
  if (!accountId) throw new Error('Sign in before opening a shared project.');
  return openCloudProject(serverStoryId, accountId);
}
