import { db } from './dexie-db';
/** Preserve raw records without parsing corrupt story/history blobs or mutating storage. */
export async function exportProjectRecovery(projectId: string) {
  const tables = [db.stories, db.chapters, db.chapterVersions, db.sessions, db.chatMessages, db.chapterAnalysis, db.writerInsights, db.storySnapshots, db.comments];
  return db.transaction('r', tables, async () => ({
    format: 'zagafy-raw-recovery', version: 1, projectId, exportedAt: new Date().toISOString(),
    story: await db.stories.get(projectId),
    chapters: await db.chapters.where('projectId').equals(projectId).toArray(),
    chapterVersions: await db.chapterVersions.where('projectId').equals(projectId).toArray(),
    sessions: await db.sessions.where('projectId').equals(projectId).toArray(),
    chatMessages: await db.chatMessages.where('projectId').equals(projectId).toArray(),
    chapterAnalysis: await db.chapterAnalysis.where('projectId').equals(projectId).toArray(),
    writerInsights: await db.writerInsights.where('projectId').equals(projectId).toArray(),
    snapshots: await db.storySnapshots.where('storyId').equals(projectId).toArray(),
    comments: await db.comments.where('projectId').equals(projectId).toArray(),
  }));
}
