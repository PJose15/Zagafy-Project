import 'fake-indexeddb/auto';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {db} from '@/lib/storage/dexie-db';
import {defaultState,type StoryState} from '@/lib/store';
import {persistProjectState} from '@/lib/storage/persist-project';
import {restoreRecoverySnapshot} from '@/lib/storage/restore-snapshot';
const state=(content:string):StoryState=>({...defaultState,title:'Novel',chapters:[{id:'chapter',title:'Chapter',content,summary:''}],scenes:[{id:'scene',chapterId:'chapter',title:'Scene',content:'',summary:''}]});
beforeEach(async()=>{localStorage.clear();localStorage.setItem('zagafy_active_project','a');for(const t of [db.stories,db.chapters,db.chatMessages,db.syncQueue,db.syncMeta,db.storySnapshots]) await t.clear();await persistProjectState(state('Current draft'),'a');await db.storySnapshots.put({id:'snapshot',storyId:'a',name:'Earlier',description:'',createdAt:0,wordCount:2,chapterCount:1,data:JSON.stringify(state('Recovered text'))});await db.syncQueue.clear();});
afterEach(()=>vi.restoreAllMocks());
it('commits restored text and the outgoing queue after preserving current writing',async()=>{const result=await restoreRecoverySnapshot('snapshot','a',state('Unsaved latest text'));expect(result.copied).toBe(false);expect((await db.chapters.get('chapter'))?.content).toBe('Recovered text');expect((await db.storySnapshots.toArray()).some(row=>row.recoveryProtected&&JSON.parse(row.data).chapters[0].content==='Unsaved latest text')).toBe(true);expect(await db.syncQueue.count()).toBeGreaterThan(0);});
it('rolls back restoration and retains current writing on a failed recovery snapshot',async()=>{vi.spyOn(db.storySnapshots,'put').mockRejectedValueOnce(new Error('quota'));await expect(restoreRecoverySnapshot('snapshot','a',state('Current draft'))).rejects.toThrow('quota');expect((await db.chapters.get('chapter'))?.content).toBe('Current draft');expect(await db.syncQueue.count()).toBe(0);});
it('remaps a cloud-deleted chapter ID and its scene references without clearing the receipt',async()=>{await db.syncMeta.put({id:'a',serverStoryId:'cloud',lastPulledAt:null,lastPushedAt:null,serverDeletedEntities:{'chapter:chapter':'2026-10-04T00:00:00Z'}});const result=await restoreRecoverySnapshot('snapshot','a',state('Current draft'));expect(result.state.chapters[0].id).not.toBe('chapter');expect(result.state.scenes[0].chapterId).toBe(result.state.chapters[0].id);expect((await db.syncMeta.get('a'))?.serverDeletedEntities?.['chapter:chapter']).toBeTruthy();expect(await db.chapters.get('chapter')).toBeUndefined();});
it('copies a whole-project recovery into a fresh unbound project and keeps the old local copy',async()=>{await db.syncMeta.put({id:'a',serverStoryId:'cloud',lastPulledAt:null,lastPushedAt:null,serverDeletedAt:'2026-10-04T00:00:00Z'});const result=await restoreRecoverySnapshot('snapshot','a',state('Current draft'));expect(result.copied).toBe(true);expect(result.projectId).not.toBe('a');expect(await db.syncMeta.get(result.projectId)).toBeUndefined();expect((await db.chapters.get('chapter'))?.content).toBe('Current draft');expect(result.state.chapters[0].id).not.toBe('chapter');expect(localStorage.getItem('zagafy_active_project')).toBe(result.projectId);});
it('never activates a partial recovered project after queue failure',async()=>{await db.syncMeta.put({id:'a',serverStoryId:'cloud',lastPulledAt:null,lastPushedAt:null,serverDeletedAt:'2026-10-04T00:00:00Z'});vi.spyOn(db.syncQueue,'bulkPut').mockRejectedValueOnce(new Error('queue'));await expect(restoreRecoverySnapshot('snapshot','a',state('Current draft'))).rejects.toThrow('queue');expect(await db.stories.count()).toBe(1);expect(localStorage.getItem('zagafy_active_project')).toBe('a');expect(await db.storySnapshots.count()).toBe(1);});
it('refuses foreign and corrupt snapshots before changing writing',async()=>{await expect(restoreRecoverySnapshot('snapshot','b',state('Other'))).rejects.toThrow('another project');await db.storySnapshots.update('snapshot',{data:JSON.stringify({chapters:[{id:'bad',content:5}]})});await expect(restoreRecoverySnapshot('snapshot','a',state('Current draft'))).rejects.toThrow('Invalid snapshot');expect((await db.chapters.get('chapter'))?.content).toBe('Current draft');});

it('copies deleted-project chat records with new IDs and keeps insight session references valid',async()=>{
 await db.chatMessages.bulkPut([
  {id:'session',projectId:'a',role:'assistant',content:'',timestamp:1,metadata:{kind:'character-session',payload:{id:'session',characterId:'char',messages:[]}}},
  {id:'insight',projectId:'a',role:'assistant',content:'',timestamp:2,metadata:{kind:'character-insight',payload:{id:'insight',sessionId:'session',characterId:'char'}}}
 ]);
 await db.syncMeta.put({id:'a',serverStoryId:'cloud',lastPulledAt:null,lastPushedAt:null,serverDeletedAt:'2026-10-04T00:00:00Z'});
 const result=await restoreRecoverySnapshot('snapshot','a',state('Current draft'));
 const rows=await db.chatMessages.where('projectId').equals(result.projectId).toArray();
 const session=rows.find(row=>row.metadata?.kind==='character-session')!;const insight=rows.find(row=>row.metadata?.kind==='character-insight')!;
 expect(session.id).not.toBe('session');expect(insight.metadata?.payload).toMatchObject({id:insight.id,sessionId:session.id});expect(await db.chatMessages.where('projectId').equals('a').count()).toBe(2);
});
