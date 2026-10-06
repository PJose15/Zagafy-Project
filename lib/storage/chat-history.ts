import { db, type DexieChatMessage } from './dexie-db';
import { queueLocalMutation, notifyLocalMutation } from '@/lib/sync/local-mutation';
import type { ChatMessage } from '@/lib/store';
export async function readAssistantHistory(projectId: string): Promise<ChatMessage[]> {
  const rows = await db.chatMessages.where('projectId').equals(projectId).sortBy('timestamp');
  return rows.filter(row => !row.metadata?.kind || row.metadata.kind === 'assistant').map(row => {
    if (!row.id || !['user','assistant'].includes(row.role) || typeof row.content !== 'string' || !Number.isFinite(row.timestamp)) throw new Error('Damaged chat history');
    return { ...(row.metadata?.message as Partial<ChatMessage>), id: row.id, role: row.role, content: row.content };
  });
}
export async function appendChatRecord(row: DexieChatMessage, projectId: string): Promise<void> {
  await db.transaction('rw', [db.stories, db.chatMessages, db.syncQueue, db.syncMeta], async () => {
    if (!await db.stories.get(projectId)) throw new Error('Project no longer exists');
    if ((await db.syncMeta.get(projectId))?.serverDeletedEntities?.[`chatMessage:${row.id}`]) throw new Error('Chat record was deleted');
    const existing = await db.chatMessages.get(row.id);
    if (existing && existing.projectId !== projectId) throw new Error('Chat belongs to another project');
    if (existing) return; // immutable assistant messages are never overwritten by a stale UI
    await db.chatMessages.put({ ...row, projectId });
    await queueLocalMutation(projectId, 'chatMessage', row.id);
  });
  notifyLocalMutation();
}
export async function appendAssistantMessage(message: ChatMessage, projectId: string): Promise<void> {
  if (!message.id || !['user','assistant'].includes(message.role) || typeof message.content !== 'string') throw new Error('Invalid chat message');
  const key=`zagafy_chat_pending:${projectId}:${message.id}`;
  try { localStorage.setItem(key,JSON.stringify({projectId,message})); } catch { /* visible memory stays available */ }
  await appendChatRecord({ id: message.id, role: message.role, content: message.content, timestamp: Date.now(), metadata: { kind: 'assistant', message } }, projectId);
  try {localStorage.removeItem(key);} catch { /* replay is idempotent */ }
}
export async function importAssistantHistory(messages: ChatMessage[], projectId: string): Promise<void> {
  const journals: {key:string;message:ChatMessage}[]=[];
  for(let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i); if(!key?.startsWith(`zagafy_chat_pending:${projectId}:`)) continue;
    const value=JSON.parse(localStorage.getItem(key)!);
    if(value.projectId!==projectId || !value.message?.id || key!==`zagafy_chat_pending:${projectId}:${value.message.id}`) throw new Error('Damaged chat recovery journal');
    journals.push({key,message:value.message});
  }
  for(const journal of journals) await appendAssistantMessage(journal.message,projectId);
  // One outer transaction prevents a partial legacy import on quota failures.
  await db.transaction('rw', [db.stories, db.chatMessages, db.syncQueue, db.syncMeta, db.meta], async () => {
    const key = `assistant-history-import:${projectId}`;
    if(await db.meta.get(key)) return;
    const deleted = (await db.syncMeta.get(projectId))?.serverDeletedEntities ?? {};
    for (const message of messages.filter(message=>!deleted[`chatMessage:${message.id}`])) if (message.id !== 'welcome') await appendAssistantMessage(message, projectId);
    await db.meta.put({id:key,completedAt:new Date().toISOString()});
  });
}
export async function clearAssistantHistory(projectId: string): Promise<void> {
  await importAssistantHistory([],projectId);
  await db.transaction('rw', [db.chatMessages, db.syncQueue, db.storySnapshots, db.stories, db.chapters], async () => {
    const rows = (await db.chatMessages.where('projectId').equals(projectId).toArray()).filter(row => !row.metadata?.kind || row.metadata.kind === 'assistant');
    if (rows.length) {
      const story = await db.stories.get(projectId); if (!story) throw new Error('Project no longer exists');
      const chapters=await db.chapters.where('projectId').equals(projectId).toArray();
      await db.storySnapshots.put({ id: crypto.randomUUID(), storyId: projectId, recoveryProtected: true, name: 'Chat clear recovery (local only)', description: 'Conversation retained before clearing history.', createdAt: Date.now(), chapterCount: 0, wordCount: 0, data: JSON.stringify({ ...JSON.parse(story.data), chapters, chatRecoveryRecords: rows }) });
    }
    for (const row of rows) { await db.chatMessages.delete(row.id); await queueLocalMutation(projectId,'chatMessage',row.id,'delete'); }
  });
  notifyLocalMutation();
}
