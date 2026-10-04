import { appendAssistantMessage } from './chat-history';
import { db } from './dexie-db';
import { defaultState, type StoryState } from '@/lib/store';
import { persistProjectState } from './persist-project';
import { capturePendingRecovery, preservePendingRecovery } from './pending-recovery';
import { notifyLocalMutation } from '@/lib/sync/local-mutation';
import { setActiveProjectId, getActiveProjectId } from '@/lib/projects/active-project';

export function validateSnapshotPayload(value: unknown): StoryState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid recovery snapshot');
  const payload = value as Record<string,unknown>;
  const next = {...defaultState};
  for(const [key, fallback] of Object.entries(defaultState)) if(payload[key]!==undefined) {
    if(Array.isArray(fallback) ? !Array.isArray(payload[key]) : typeof payload[key]!==typeof fallback) throw new Error(`Invalid snapshot field: ${key}`);
    (next as unknown as Record<string,unknown>)[key]=payload[key];
  }
  const ids = new Set<string>();
  for(const chapter of next.chapters) {
    if(!chapter || typeof chapter.id!=='string' || !chapter.id || ids.has(chapter.id) || typeof chapter.content!=='string' || typeof chapter.title!=='string' || typeof chapter.summary!=='string') throw new Error('Invalid snapshot chapter');
    ids.add(chapter.id);
  }
  for(const scene of next.scenes) if(!scene || typeof scene.chapterId!=='string' || !ids.has(scene.chapterId)) throw new Error('Invalid snapshot scene reference');
  return next;
}
function remapIds<T>(value:T, ids: Map<string,string>):T {
  if(typeof value==='string') return (ids.get(value)??value) as T;
  if(Array.isArray(value)) return value.map(v=>remapIds(v,ids)) as T;
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remapIds(v,ids)])) as T;
  return value;
}
/** Validate, preserve current buffers, remap deleted IDs and save atomically.
 * Whole-project deletion restores into a fresh unbound project, preserving the
 * deleted cloud binding and its local recovery copies. Activation follows commit. */
export async function restoreRecoverySnapshot(id:string,projectId:string,current:StoryState):Promise<{projectId:string;state:StoryState;copied:boolean}> {
  const captures = capturePendingRecovery(projectId);
  const result = await db.transaction('rw',[db.stories,db.chapters,db.chatMessages,db.syncQueue,db.syncMeta,db.storySnapshots],async()=>{
    const snapshot = await db.storySnapshots.get(id);
    if(!snapshot || snapshot.storyId!==projectId) throw new Error('Snapshot belongs to another project or no longer exists');
    const payload = JSON.parse(snapshot.data);
    let next = validateSnapshotPayload(payload);
    const meta = await db.syncMeta.get(projectId);
    const copied = Boolean(meta?.serverDeletedAt);
    const target = copied ? crypto.randomUUID() : projectId;
    const ids = new Map<string,string>();
    for(const ch of next.chapters) if(copied || meta?.serverDeletedEntities?.[`chapter:${ch.id}`]) ids.set(ch.id,crypto.randomUUID());
    if(copied) for(const array of Object.values(next)) if(Array.isArray(array)) for(const row of array) if(row && typeof row==='object' && typeof row.id==='string') ids.set(row.id,crypto.randomUUID());
    next = remapIds(next,ids);
    await preservePendingRecovery(projectId,captures);
    await db.storySnapshots.put({id:crypto.randomUUID(),storyId:projectId,recoveryProtected:true,name:'Before recovery restore (local only)',description:'Current manuscript retained before restoring a snapshot.',createdAt:Date.now(),chapterCount:current.chapters.length,wordCount:0,data:JSON.stringify(current)});
    await persistProjectState(next,target);
    for(const message of next.chat_messages) if(message.id!=='welcome') await appendAssistantMessage({...message,id:crypto.randomUUID()},target);
    // Raw removed conversations remain recoverable without reviving their IDs.
    const rawRecords = [...(copied ? await db.chatMessages.where('projectId').equals(projectId).toArray() : []),...(Array.isArray(payload.chatRecoveryRecords)?payload.chatRecoveryRecords:[]),...(Array.isArray(payload.deletionRecoveryRecords)?payload.deletionRecoveryRecords.filter((r:{type?:string})=>r.type==='chatMessage').map((r:{row:unknown})=>r.row):[])];
    const records = [...new Map(rawRecords.map(row=>[row.id,row])).values()];
    for(const source of records) {
      if(typeof source?.id!=='string') throw new Error('Invalid recovery chat identity');
      ids.set(source.id,crypto.randomUUID());
    }
    for(const source of records) {
      if(!source || !['user','assistant'].includes(source.role) || typeof source.content!=='string') throw new Error('Invalid recovery chat record');
      const messageId=ids.get(source.id)!; const metadata=remapIds(source.metadata,ids);
      if(metadata?.message) metadata.message={...metadata.message,id:messageId};
      if(metadata?.payload) metadata.payload={...metadata.payload,id:messageId};
      await db.chatMessages.put({...source,id:messageId,projectId:target,version:0,metadata});
      await db.syncQueue.put({id:crypto.randomUUID(),projectId:target,entityType:'chatMessage',entityId:messageId,op:'upsert',timestamp:Date.now()});
    }
    return {projectId:target,state:next,copied};
  });
  captures.forEach(capture=>capture.committed()); notifyLocalMutation();
  if(result.copied && getActiveProjectId()===projectId) setActiveProjectId(result.projectId);
  return result;
}
