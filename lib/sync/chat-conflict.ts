import { db } from '@/lib/storage/dexie-db';
import { mergeCharacterSession } from '@/lib/storage/character-history';
import { isChatSession, isCharacterInsight } from '@/lib/types/character-chat';
import { queueLocalMutation } from './local-mutation';
import type { ConflictRecord } from './types';
export async function reconcileChatConflict(conflict: ConflictRecord, projectId: string): Promise<void> {
  const server = conflict.serverPayload;
  if (!server || !Number.isSafeInteger(server.version) || typeof server.content !== 'string') throw new Error('Invalid chat conflict');
  await db.transaction('rw',[db.stories,db.chapters,db.chatMessages,db.storySnapshots,db.syncQueue],async () => {
    const local = await db.chatMessages.get(conflict.entityId);
    if (!local || local.projectId !== projectId) throw new Error('Chat conflict belongs to another project');
    const story = await db.stories.get(projectId); if (!story) throw new Error('Missing project recovery');
    const chapters = await db.chapters.where('projectId').equals(projectId).toArray();
    await db.storySnapshots.put({ id:crypto.randomUUID(),storyId:projectId,recoveryProtected:true,name:'Chat conflict recovery (local only)',description:'Conversation retained before reconciliation.',createdAt:Date.now(),chapterCount:chapters.length,wordCount:story.wordCount??0,data:JSON.stringify({...JSON.parse(story.data),chapters,chatRecoveryRecords:[local]}) });
    const incoming = server.metadata as Record<string,unknown> | undefined;
    let metadata = incoming;
    if (local.metadata?.kind === 'character-session' && incoming?.kind === 'character-session') {
      if (!isChatSession(local.metadata.payload) || !isChatSession(incoming.payload)) throw new Error('Invalid character session conflict');
      metadata = {...incoming,payload:mergeCharacterSession(incoming.payload,local.metadata.payload)};
    } else if (local.metadata?.kind === 'character-insight' && incoming?.kind === 'character-insight') {
      if (!isCharacterInsight(local.metadata.payload) || !isCharacterInsight(incoming.payload)) throw new Error('Invalid insight conflict');
      metadata = {...incoming,payload:{...incoming.payload,savedAsCanon:incoming.payload.savedAsCanon||local.metadata.payload.savedAsCanon}};
    } else if(local.content !== server.content) {
      const id=crypto.randomUUID();
      await db.chatMessages.put({...local,id,version:0,metadata:{...local.metadata,message:{...local.metadata?.message as object,id}}});
      await queueLocalMutation(projectId,'chatMessage',id);
    }
    await db.chatMessages.put({...local,content:server.content as string,metadata,version:server.version as number});
    if(JSON.stringify(metadata)!==JSON.stringify(incoming)) await queueLocalMutation(projectId,'chatMessage',local.id);
  });
}
