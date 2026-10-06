import 'fake-indexeddb/auto';
import React from 'react';
import {act,renderHook,waitFor,screen,fireEvent,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {StoryProvider,useStory,defaultState} from '@/lib/store';
import {db} from '@/lib/storage/dexie-db';
import {persistProjectState} from '@/lib/storage/persist-project';
import {setActiveProjectId} from '@/lib/projects/active-project';
import {registerPendingRecovery} from '@/lib/storage/pending-recovery';
import {useManuscriptRecovery} from '@/hooks/use-manuscript-recovery';
import type {Chapter} from '@/lib/store';
const wrapper=({children}:{children:React.ReactNode})=><StoryProvider>{children}</StoryProvider>;
beforeEach(async()=>{localStorage.clear();localStorage.setItem('zagafy_active_project','a');for(const t of [db.stories,db.chapters,db.chatMessages,db.syncQueue,db.syncMeta,db.storySnapshots,db.meta]) await t.clear();for(const id of ['a','b','c']) await persistProjectState({...defaultState,title:id},id);});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

function useManuscriptDraft() {
 const story = useStory();
 const [draft, setDraft] = React.useState<Partial<Chapter>>({});
 const [editingId, setEditingId] = React.useState<string|null>(null);
 useManuscriptRecovery(story.projectId, story.state, editingId, draft);
 return {...story, setDraft, setEditingId};
}
async function openManuscriptDraft() {
 const chapter = {id:'manuscript-a',title:'Saved title',content:'Saved text',summary:''};
 await persistProjectState({...defaultState,title:'a',chapters:[chapter]},'a');
 const hook = renderHook(useManuscriptDraft,{wrapper});
 await waitFor(()=>expect(hook.result.current?.projectId).toBe('a'));
 act(()=>{hook.result.current.setEditingId(chapter.id);hook.result.current.setDraft({...chapter,title:'Draft title',content:'Unsaved manuscript prose',summary:'Draft summary'});});
 return hook;
}
it('preserves the Manuscript form before switching without changing the destination',async()=>{
 const {result}=await openManuscriptDraft();
 act(()=>setActiveProjectId('b'));
 await waitFor(()=>expect(result.current?.projectId).toBe('b'));
 expect(result.current.state.title).toBe('b');
 expect(result.current.state.chapters).toEqual([]);
 expect(await db.chapters.get('manuscript-a')).toMatchObject({projectId:'a',title:'Draft title',content:'Unsaved manuscript prose',summary:'Draft summary'});
 expect((await db.storySnapshots.where('storyId').equals('a').toArray()).some(row=>row.recoveryProtected && row.data.includes('Unsaved manuscript prose'))).toBe(true);
});
it('retains the Manuscript buffer after a failed checkpoint and commits it on retry',async()=>{
 const {result}=await openManuscriptDraft();
 const failure=vi.spyOn(db.storySnapshots,'put').mockRejectedValue(new Error('quota'));
 act(()=>setActiveProjectId('b'));
 const retry=await screen.findByRole('button',{name:'Retry loading'});
 expect((await db.chapters.get('manuscript-a'))?.content).toBe('Saved text');
 failure.mockRestore();fireEvent.click(retry);
 await waitFor(()=>expect(result.current?.projectId).toBe('b'));
 expect((await db.chapters.get('manuscript-a'))?.content).toBe('Unsaved manuscript prose');
});
it('keeps a cloud-deleted Manuscript draft in recovery without resurrecting the chapter',async()=>{
 const {result}=await openManuscriptDraft();
 await db.syncMeta.put({id:'a',serverStoryId:'cloud',lastPulledAt:null,lastPushedAt:null,serverDeletedEntities:{'chapter:manuscript-a':'2026-10-05T00:00:00Z'}});
 await db.chapters.delete('manuscript-a');
 act(()=>setActiveProjectId('b'));
 await waitFor(()=>expect(result.current?.projectId).toBe('b'));
 expect(await db.chapters.get('manuscript-a')).toBeUndefined();
 expect((await db.storySnapshots.where('storyId').equals('a').toArray()).some(row=>row.recoveryProtected && row.data.includes('Unsaved manuscript prose'))).toBe(true);
});
it('awaits the old project save, then rejects its stale setter and save closure',async()=>{const {result}=renderHook(()=>useStory(),{wrapper});await waitFor(()=>expect(result.current?.state.title).toBe('a'));const old=result.current;act(()=>old.updateField('title','Pending A'));await act(async()=>{setActiveProjectId('b');});await waitFor(()=>expect(result.current?.state.title).toBe('b'));expect(JSON.parse((await db.stories.get('a'))!.data).title).toBe('Pending A');act(()=>old.updateField('title','Late reply from A'));expect(result.current.state.title).toBe('b');await expect(old.saveNow({...defaultState,title:'Late A'})).rejects.toThrow('Project changed');});
it('rapid B then C requests adopt C and preserve A instead of overwriting C with B hydration',async()=>{const {result}=renderHook(()=>useStory(),{wrapper});await waitFor(()=>expect(result.current?.state.title).toBe('a'));act(()=>result.current.updateField('title','A draft'));act(()=>{setActiveProjectId('b');setActiveProjectId('c');});await waitFor(()=>expect(result.current?.projectId).toBe('c'));expect(result.current.state.title).toBe('c');expect(JSON.parse((await db.stories.get('a'))!.data).title).toBe('A draft');});
it('captures unsaved Flow text before unmounting and hydrates the destination afterward',async()=>{const {result}=renderHook(()=>useStory(),{wrapper});await waitFor(()=>expect(result.current?.projectId).toBe('a'));const unregister=registerPendingRecovery({projectId:'a',priority:1,capture:()=>({state:{...defaultState,title:'a',chapters:[{id:'flow',title:'Flow',content:'Newest textarea text',summary:''}]},committed:vi.fn()})});try{act(()=>setActiveProjectId('b'));await waitFor(()=>expect(result.current?.projectId).toBe('b'));expect((await db.chapters.get('flow'))?.content).toBe('Newest textarea text');expect((await db.chapters.get('flow'))?.projectId).toBe('a');}finally{unregister();}});

it('handles a rapid A to B to A switch without applying stale hydration',async()=>{const {result}=renderHook(()=>useStory(),{wrapper});await waitFor(()=>expect(result.current?.state.title).toBe('a'));act(()=>result.current.updateField('title','Latest A'));act(()=>{setActiveProjectId('b');setActiveProjectId('a');});await waitFor(()=>expect(result.current?.state.title).toBe('Latest A'));expect(result.current.projectId).toBe('a');expect(JSON.parse((await db.stories.get('b'))!.data).title).toBe('b');});
it('preserves a deleted chapter buffer before leaving and does not resurrect its ID',async()=>{const {result}=renderHook(()=>useStory(),{wrapper});await waitFor(()=>expect(result.current?.projectId).toBe('a'));await db.syncMeta.put({id:'a',serverStoryId:'cloud',lastPulledAt:null,lastPushedAt:null,serverDeletedEntities:{'chapter:gone':'2026-10-04T00:00:00Z'}});const unregister=registerPendingRecovery({projectId:'a',priority:1,capture:()=>({state:{...defaultState,chapters:[{id:'gone',title:'Removed',content:'Unsaved deleted writing',summary:''}]},committed:vi.fn()})});try{act(()=>setActiveProjectId('b'));await waitFor(()=>expect(result.current?.projectId).toBe('b'));expect(await db.chapters.get('gone')).toBeUndefined();expect((await db.storySnapshots.toArray()).some(row=>row.data.includes('Unsaved deleted writing'))).toBe(true);}finally{unregister();}});

it('retries a failed switch checkpoint without resurrecting cloud-deleted IDs',async()=>{
 const {result}=renderHook(()=>useStory(),{wrapper});await waitFor(()=>expect(result.current?.projectId).toBe('a'));
 await db.syncMeta.put({id:'a',serverStoryId:'cloud',lastPulledAt:null,lastPushedAt:null,serverDeletedEntities:{'chapter:gone':'2026-10-04T00:00:00Z'}});
 const unregister=registerPendingRecovery({projectId:'a',priority:1,capture:()=>({state:{...defaultState,title:'a',chapters:[{id:'gone',title:'Removed',content:'Retry recovery text',summary:''}]},committed:vi.fn()})});
 const failure=vi.spyOn(db.storySnapshots,'put').mockRejectedValue(new Error('quota'));
 try {act(()=>setActiveProjectId('b'));const retry=await screen.findByRole('button',{name:'Retry loading'});failure.mockRestore();fireEvent.click(retry);await waitFor(()=>expect(result.current?.projectId).toBe('b'));expect(await db.chapters.get('gone')).toBeUndefined();expect((await db.storySnapshots.toArray()).some(row=>row.data.includes('Retry recovery text'))).toBe(true);}
 finally {failure.mockRestore();unregister();}
});
it('checkpoints a whole-project deletion buffer without queuing a stale manuscript upload',async()=>{
 const {result}=renderHook(()=>useStory(),{wrapper});await waitFor(()=>expect(result.current?.projectId).toBe('a'));
 await db.syncMeta.put({id:'a',serverStoryId:'cloud',lastPulledAt:null,lastPushedAt:null,serverDeletedAt:'2026-10-04T00:00:00Z'});await db.syncQueue.clear();
 act(()=>result.current.updateField('title','Deleted project unsaved title'));act(()=>setActiveProjectId('b'));await waitFor(()=>expect(result.current?.projectId).toBe('b'));
 expect(JSON.parse((await db.stories.get('a'))!.data).title).toBe('a');expect(await db.syncQueue.where('projectId').equals('a').count()).toBe(0);expect((await db.storySnapshots.toArray()).some(row=>row.data.includes('Deleted project unsaved title'))).toBe(true);
});
