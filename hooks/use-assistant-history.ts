'use client';
import { useEffect,useLayoutEffect,useRef,useState,useCallback } from 'react';
import { appendAssistantMessage,readAssistantHistory,importAssistantHistory,clearAssistantHistory } from '@/lib/storage/chat-history';
import { LOCAL_MUTATION_EVENT } from '@/lib/sync/local-mutation';
import type { ChatMessage } from '@/lib/store';
export function useAssistantHistory(projectId:string,legacy:ChatMessage[]) {
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [error,setError]=useState(false);
  const [ready,setReady]=useState(false);
  const current=useRef(projectId);
  useLayoutEffect(()=>{current.current=projectId;},[projectId]);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++generation.current;
    try {
      await importAssistantHistory(legacy,projectId);
      const rows=await readAssistantHistory(projectId);
      if(current.current!==projectId || generation.current!==request) return;
      setMessages(rows);setError(false);setReady(true);
    } catch {if(current.current===projectId&&generation.current===request) {setError(true);setReady(false);} }
  },[projectId,legacy]);
  const invalidate=useCallback(()=>{generation.current++;},[]);
  useEffect(()=>{
    let active=true;
    void Promise.resolve().then(()=>{if(active) void refresh();});
    let channel:BroadcastChannel|null=null;
    const onMutation=()=>void refresh();
    window.addEventListener(LOCAL_MUTATION_EVENT,onMutation);
    if(typeof BroadcastChannel!=='undefined') {try {channel=new BroadcastChannel('zagafy_sync');channel.addEventListener('message',onMutation);} catch { /* same-tab and explicit retry still work */ }}
    return()=>{active=false;invalidate();window.removeEventListener(LOCAL_MUTATION_EVENT,onMutation);channel?.close();};
  },[refresh,invalidate]);
  const append=useCallback(async(message:ChatMessage)=>{
    try {await appendAssistantMessage(message,projectId);if(current.current===projectId) {setMessages(prev=>prev.some(m=>m.id===message.id)?prev:[...prev,message]);setError(false);} }
    catch(error) {if(current.current===projectId)setError(true);throw error;}
  },[projectId]);
  const clear=useCallback(async()=>{await clearAssistantHistory(projectId);if(current.current===projectId)setMessages([]);},[projectId]);
  return {messages,error,ready,refresh,append,clear};
}
