'use client';

import { useState, useEffect, useRef } from 'react';
import type { HeteronymVoice, VoiceTone, VoiceVocabulary, VoicePacing } from '@/lib/heteronym-voice';
import { TONE_LABELS, VOCABULARY_LABELS, PACING_LABELS } from '@/lib/heteronym-voice';

interface VoiceToneEditorProps {
  initialVoice?: HeteronymVoice | null;
  styleNote: string;
  onVoiceChange: (voice: HeteronymVoice) => void;
  onStyleNoteChange: (note: string) => void;
}

const TONES: VoiceTone[] = ['formal', 'casual', 'poetic', 'raw', 'clinical', 'playful'];
const VOCABULARIES: VoiceVocabulary[] = ['simple', 'literary', 'technical', 'archaic', 'slang', 'mixed'];
const PACINGS: VoicePacing[] = ['staccato', 'flowing', 'measured', 'breathless', 'languid'];

export function VoiceToneEditor({ initialVoice, styleNote, onVoiceChange, onStyleNoteChange }: VoiceToneEditorProps) {
  const [tone, setTone] = useState<VoiceTone>(initialVoice?.tone || 'casual');
  const [vocabulary, setVocabulary] = useState<VoiceVocabulary>(initialVoice?.vocabulary || 'mixed');
  const [pacing, setPacing] = useState<VoicePacing>(initialVoice?.pacing || 'measured');
  const [freeformNote, setFreeformNote] = useState(initialVoice?.freeformNote || '');

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onVoiceChange({ tone, vocabulary, pacing, freeformNote });
  }, [tone, vocabulary, pacing, freeformNote, onVoiceChange]);

  return (
    <div className="space-y-4">
      {/* Tone */}
      <div>
        <label className="block text-sm font-medium text-sepia-700 mb-1.5">Tone</label>
        <div className="grid grid-cols-3 gap-1.5">
          {TONES.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              className={`px-2 py-1.5 rounded-lg text-xs transition-colors ${
                tone === t ? 'bg-brass-500 text-cream-50' : 'bg-parchment-200 text-sepia-600 hover:bg-parchment-300'
              }`}
            >
              {TONE_LABELS[t].split(' & ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Vocabulary */}
      <div>
        <label className="block text-sm font-medium text-sepia-700 mb-1.5">Vocabulary</label>
        <div className="grid grid-cols-3 gap-1.5">
          {VOCABULARIES.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => setVocabulary(v)}
              className={`px-2 py-1.5 rounded-lg text-xs transition-colors ${
                vocabulary === v ? 'bg-brass-500 text-cream-50' : 'bg-parchment-200 text-sepia-600 hover:bg-parchment-300'
              }`}
            >
              {VOCABULARY_LABELS[v].split(' & ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Pacing */}
      <div>
        <label className="block text-sm font-medium text-sepia-700 mb-1.5">Pacing</label>
        <div className="grid grid-cols-3 gap-1.5">
          {PACINGS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPacing(p)}
              className={`px-2 py-1.5 rounded-lg text-xs transition-colors ${
                pacing === p ? 'bg-brass-500 text-cream-50' : 'bg-parchment-200 text-sepia-600 hover:bg-parchment-300'
              }`}
            >
              {PACING_LABELS[p].split(' — ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Freeform note */}
      <div>
        <label className="block text-sm font-medium text-sepia-700 mb-1">Additional Voice Notes</label>
        <textarea
          value={freeformNote}
          onChange={(e) => setFreeformNote(e.target.value.slice(0, 200))}
          maxLength={200}
          rows={2}
          className="w-full bg-parchment-200 border border-sepia-300/40 rounded-lg px-3 py-2 text-sepia-900 text-sm resize-none focus:outline-none focus:border-brass-500/60"
          placeholder="e.g. 'Uses metaphors from the sea, avoids contractions'"
        />
        <p className="text-xs text-sepia-600 text-right mt-1">{freeformNote.length}/200</p>
      </div>

      {/* Legacy style note */}
      <div>
        <label className="block text-sm font-medium text-sepia-700 mb-1">Style Note (legacy)</label>
        <textarea
          value={styleNote}
          onChange={(e) => onStyleNoteChange(e.target.value.slice(0, 200))}
          maxLength={200}
          rows={2}
          className="w-full bg-parchment-200 border border-sepia-300/40 rounded-lg px-3 py-2 text-sepia-900 text-sm resize-none focus:outline-none focus:border-brass-500/60"
          placeholder="How do they write? e.g. 'Fragmented sentences, raw emotion'"
        />
        <p className="text-xs text-sepia-600 text-right mt-1">{styleNote.length}/200</p>
      </div>
    </div>
  );
}
