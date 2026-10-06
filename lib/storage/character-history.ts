import { db } from './dexie-db';
import { queueLocalMutation, notifyLocalMutation } from '@/lib/sync/local-mutation';
import { isChatSession, isCharacterInsight, type CharacterChatSession, type CharacterInsight } from '@/lib/types/character-chat';
import { getActiveProjectId } from '@/lib/projects/active-project';
export async function readCharacterRecords(kind: string, projectId = getActiveProjectId()): Promise<unknown[]> {
  await recoverCharacterRecords(projectId);
  await importLegacyCharacterHistory(projectId);
  return (await db.chatMessages.where('projectId').equals(projectId).toArray()).filter(row => row.metadata?.kind === kind).map(row => {
    const payload = row.metadata!.payload;
    if (row.id !== (payload as {id?: string})?.id || !(kind === 'character-session' ? isChatSession(payload) : isCharacterInsight(payload))) throw new Error('Damaged character history');
    return payload;
  });
}
export function mergeCharacterSession(old: CharacterChatSession, next: CharacterChatSession): CharacterChatSession {
  const clearedAt = [old.clearedAt, next.clearedAt].filter(Boolean).sort().at(-1);
  const messages = new Map(old.messages.map(m => [m.id,m]));
  for (const message of next.messages) { if (!messages.has(message.id)) messages.set(message.id,message); }
  const newer=next.updatedAt>=old.updatedAt ? next : old;
  return { ...old, ...newer, clearedAt, messages: [...messages.values()].filter(m => !clearedAt || m.timestamp > clearedAt).sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id)) };
}
export async function mutateCharacterRecord(id: string, kind: string, mutate: (old: unknown) => unknown, projectId = getActiveProjectId()): Promise<void> {
  const key=`zagafy_character_pending:${projectId}:${id}`;
  let journal='';
  await db.transaction('rw',[db.stories,db.chapters,db.storySnapshots,db.chatMessages,db.syncQueue,db.syncMeta],async () => {
    if (!await db.stories.get(projectId)) throw new Error('Project no longer exists');
    if ((await db.syncMeta.get(projectId))?.serverDeletedEntities?.[`chatMessage:${id}`]) throw new Error('Character history was deleted');
    const row = await db.chatMessages.get(id);
    if (row && (row.projectId !== projectId || row.metadata?.kind !== kind)) throw new Error('History belongs to another project');
    const payload = mutate(row?.metadata?.payload);
    if (!(kind === 'character-session' ? isChatSession(payload) : isCharacterInsight(payload))) throw new Error('Invalid character history');
    if(kind==='character-session' && isChatSession(payload) && isChatSession(row?.metadata?.payload) && payload.clearedAt && payload.clearedAt!==row.metadata.payload.clearedAt) {
      const story=await db.stories.get(projectId);const chapters=await db.chapters.where('projectId').equals(projectId).toArray();
      await db.storySnapshots.put({id:crypto.randomUUID(),storyId:projectId,recoveryProtected:true,name:'Character chat clear recovery (local only)',description:'Conversation retained before clearing.',createdAt:Date.now(),chapterCount:chapters.length,wordCount:0,data:JSON.stringify({...JSON.parse(story!.data),chapters,chatRecoveryRecords:[row]})});
    }
    journal=JSON.stringify({id,kind,payload,projectId});
    try {localStorage.setItem(key,journal);} catch { /* storage errors remain visible */ }
    await db.chatMessages.put({ id, projectId, role: 'assistant', content: '', timestamp: Date.now(), version: row?.version ?? 0, metadata: {kind,payload} });
    await queueLocalMutation(projectId,'chatMessage',id);
  });
  try {if(localStorage.getItem(key)===journal) localStorage.removeItem(key);} catch { /* idempotent replay */ }
  notifyLocalMutation();
}
/** Infer legacy ownership only when exactly one stored project has the character.
 * Ambiguous/orphan bytes stay available for raw export, never assigned globally. */
export async function importLegacyCharacterHistory(projectId: string): Promise<void> {
  const key = `character-history-import:${projectId}`;
  if (await db.meta.get(key)) return;
  const chatsRaw = localStorage.getItem('zagafy_character_chats');
  const insightsRaw = localStorage.getItem('zagafy_character_insights');
  if (!chatsRaw && !insightsRaw) return;
  const chats: unknown = JSON.parse(chatsRaw ?? '[]'); const insights: unknown = JSON.parse(insightsRaw ?? '[]');
  if (!Array.isArray(chats) || !chats.every(isChatSession) || !Array.isArray(insights) || !insights.every(isCharacterInsight)) throw new Error('Damaged legacy character history; export recovery before repair');
  await db.transaction('rw',[db.stories,db.chapters,db.storySnapshots,db.chatMessages,db.syncQueue,db.syncMeta,db.meta],async () => {
    const stories = await db.stories.toArray();
    const owns = (characterId: string) => {
      const owners = stories.filter(row => { const state = JSON.parse(row.data); return Array.isArray(state.characters) && state.characters.some((c: {id: string}) => c.id === characterId); });
      return owners.length === 1 && owners[0].id === projectId;
    };
    for (const chat of chats) if (owns(chat.characterId)) await mutateCharacterRecord(chat.id,'character-session',old => old ?? chat,projectId);
    for (const insight of insights) if (owns(insight.characterId) && chats.some(chat => chat.id === insight.sessionId && chat.characterId === insight.characterId)) await mutateCharacterRecord(insight.id,'character-insight',old=>old??insight,projectId);
    await db.meta.put({ id:key,completedAt:new Date().toISOString() });
  });
  // Source keys are intentionally retained for ambiguous ownership/raw recovery.
}

async function recoverCharacterRecords(projectId:string):Promise<void> {
  const rows: {id:string;kind:string;payload:unknown;projectId:string}[]=[];
  for(let i=0;i<localStorage.length;i++) {
    const key=localStorage.key(i);if(!key?.startsWith(`zagafy_character_pending:${projectId}:`)) continue;
    const row=JSON.parse(localStorage.getItem(key)!);
    if(row.projectId!==projectId || row.id==null || !['character-session','character-insight'].includes(row.kind) || key!==`zagafy_character_pending:${projectId}:${row.id}`) throw new Error('Damaged character recovery journal');
    rows.push(row);
  }
  for(const row of rows) await mutateCharacterRecord(row.id,row.kind,old=>{
    if(row.kind==='character-session') {
      if(!isChatSession(row.payload)) throw new Error('Damaged session recovery');
      return isChatSession(old)?mergeCharacterSession(old,row.payload):row.payload;
    }
    if(!isCharacterInsight(row.payload)) throw new Error('Damaged insight recovery');
    return isCharacterInsight(old)?{...old,savedAsCanon:old.savedAsCanon||row.payload.savedAsCanon}:row.payload;
  },projectId);
}
