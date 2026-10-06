import 'fake-indexeddb/auto';
import {act,renderHook,waitFor,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {db} from '@/lib/storage/dexie-db';
import {defaultState,type ChatMessage} from '@/lib/store';
import {useAssistantHistory} from '@/hooks/use-assistant-history';
import {appendAssistantMessage,clearAssistantHistory} from '@/lib/storage/chat-history';
const legacy:ChatMessage[]=[];
afterEach(cleanup);
beforeEach(async()=>{localStorage.clear();for(const table of [db.stories,db.chatMessages,db.syncQueue,db.syncMeta,db.storySnapshots,db.chapters,db.meta]) await table.clear();for(const id of ['a','b']) await db.stories.put({id,data:JSON.stringify(defaultState),updatedAt:0});});
it('reconciles same-tab writes and clears without retaining stale messages',async()=>{
 const {result}=renderHook(()=>useAssistantHistory('a',legacy));await waitFor(()=>expect(result.current.ready).toBe(true));
 await act(async()=>{await appendAssistantMessage({id:'reply',role:'assistant',content:'Saved reply'},'a');});await waitFor(()=>expect(result.current.messages).toHaveLength(1));
 await act(async()=>{await clearAssistantHistory('a');});await waitFor(()=>expect(result.current.messages).toHaveLength(0));
});
it('rejects stale UI updates after switching but commits the reply to its original project',async()=>{
 const {result,rerender}=renderHook(({id})=>useAssistantHistory(id,legacy),{initialProps:{id:'a'}});await waitFor(()=>expect(result.current.ready).toBe(true));const old=result.current;
 rerender({id:'b'});await act(async()=>{await old.append({id:'late',role:'assistant',content:'A reply'});});await waitFor(()=>expect(result.current.messages).toEqual([]));expect((await db.chatMessages.get('late'))?.projectId).toBe('a');
});
it('replays a completed reply journal on startup without regenerating it',async()=>{
 localStorage.setItem('zagafy_chat_pending:a:reply',JSON.stringify({projectId:'a',message:{id:'reply',role:'assistant',content:'Completed before crash'}}));
 const {result}=renderHook(()=>useAssistantHistory('a',legacy));await waitFor(()=>expect(result.current.messages[0]?.content).toBe('Completed before crash'));expect(localStorage.getItem('zagafy_chat_pending:a:reply')).toBeNull();
});
