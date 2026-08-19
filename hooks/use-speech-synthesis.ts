'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseSpeechSynthesisReturn {
  isSupported: boolean;
  isSpeaking: boolean;
  isPaused: boolean;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  rate: number;
  currentIndex: number;
  speak: (text: string) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  setVoice: (voice: SpeechSynthesisVoice) => void;
  setRate: (rate: number) => void;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSupported] = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!isSupported) return;
    const loadVoices = () => {
      const v = speechSynthesis.getVoices();
      setVoices(v);
      if (!selectedVoice && v.length > 0) {
        setSelectedVoice(v.find(voice => voice.default) ?? v[0]);
      }
    };
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [isSupported, selectedVoice]);

  const speak = useCallback((text: string) => {
    if (!isSupported) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = rate;
    utterance.onstart = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend = () => { setIsSpeaking(false); setIsPaused(false); setCurrentIndex(0); };
    utterance.onpause = () => setIsPaused(true);
    utterance.onresume = () => setIsPaused(false);
    utterance.onboundary = (e) => { if (e.name === 'word') setCurrentIndex(e.charIndex); };
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
  }, [isSupported, selectedVoice, rate]);

  const pause = useCallback(() => { if (isSupported) speechSynthesis.pause(); }, [isSupported]);
  const resume = useCallback(() => { if (isSupported) speechSynthesis.resume(); }, [isSupported]);
  const cancel = useCallback(() => {
    if (isSupported) { speechSynthesis.cancel(); setIsSpeaking(false); setIsPaused(false); setCurrentIndex(0); }
  }, [isSupported]);

  const setVoice = useCallback((voice: SpeechSynthesisVoice) => setSelectedVoice(voice), []);

  // Stop any in-progress speech when the hook unmounts — speechSynthesis is a
  // global singleton, so without this it keeps reading after the view is gone.
  useEffect(() => {
    if (!isSupported) return;
    return () => { speechSynthesis.cancel(); };
  }, [isSupported]);

  return {
    isSupported, isSpeaking, isPaused, voices, selectedVoice, rate, currentIndex,
    speak, pause, resume, cancel, setVoice, setRate,
  };
}
