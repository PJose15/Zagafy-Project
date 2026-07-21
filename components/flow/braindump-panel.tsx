'use client';

import { Mic, MicOff, Pause, Play, X, Sparkles, Type, RotateCcw, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { UseBraindumpReturn } from '@/hooks/use-braindump';

// Speech-recognition locale choices, labelled in each language's own (native)
// name — self-describing in every UI locale, so no catalog entry is needed.
const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'pt-BR', label: 'Português (BR)' },
  { value: 'pt-PT', label: 'Português (PT)' },
  { value: 'es-ES', label: 'Español' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-CN', label: '中文' },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface BraindumpPanelProps {
  braindump: UseBraindumpReturn;
}

export function BraindumpPanel({ braindump }: BraindumpPanelProps) {
  const t = useTranslations('flow.braindumpPanel');
  const { speech, isStopped, isPolishing, polishError, polishProgress } = braindump;
  const hasTranscript = speech.finalTranscript.trim().length > 0;
  const isEmpty = !hasTranscript && !speech.interimTranscript;

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[160] bg-parchment-200/90 backdrop-blur-lg border-t border-sepia-300/30"
      style={{ height: '38%' }}
      role="region"
      aria-label={t('ariaLabel')}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-sepia-300/30">
        <div className="flex items-center gap-3">
          {/* Recording indicator */}
          {speech.isRecording && !speech.isPaused && (
            <div className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full bg-wax-500"
                style={{ animation: 'braindump-pulse 1.5s ease-in-out infinite' }}
              />
              <span className="text-xs text-wax-500 font-medium">{t('recording')}</span>
            </div>
          )}
          {speech.isPaused && (
            <span className="text-xs text-brass-400 font-medium">{t('paused')}</span>
          )}
          {isStopped && (
            <span className="text-xs text-sepia-600 font-medium">{t('stopped')}</span>
          )}

          {/* Timer */}
          <span className="text-xs text-sepia-600 tabular-nums">
            {formatTime(speech.elapsedSeconds)}
          </span>

          {/* Language selector */}
          <select
            value={speech.language}
            onChange={(e) => speech.setLanguage(e.target.value)}
            className="text-xs bg-parchment-200/50 border border-sepia-300/30 rounded px-1.5 py-0.5 text-sepia-700"
            aria-label={t('recognitionLanguage')}
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Recording controls */}
          {speech.isRecording && !speech.isPaused && (
            <>
              <button
                onClick={speech.pause}
                className="p-1.5 rounded-lg text-sepia-600 hover:text-sepia-800 hover:bg-parchment-200 transition-colors"
                aria-label={t('pauseRecording')}
              >
                <Pause size={14} />
              </button>
              <button
                onClick={speech.stop}
                className="p-1.5 rounded-lg text-sepia-600 hover:text-wax-500 hover:bg-parchment-200 transition-colors"
                aria-label={t('stopRecording')}
              >
                <MicOff size={14} />
              </button>
            </>
          )}

          {speech.isPaused && (
            <>
              <button
                onClick={speech.resume}
                className="p-1.5 rounded-lg text-sepia-600 hover:text-forest-400 hover:bg-parchment-200 transition-colors"
                aria-label={t('resumeRecording')}
              >
                <Play size={14} />
              </button>
              <button
                onClick={speech.stop}
                className="p-1.5 rounded-lg text-sepia-600 hover:text-wax-500 hover:bg-parchment-200 transition-colors"
                aria-label={t('stopRecording')}
              >
                <MicOff size={14} />
              </button>
            </>
          )}

          {/* Close */}
          <button
            onClick={braindump.closePanel}
            className="p-1.5 rounded-lg text-sepia-600 hover:text-sepia-700 hover:bg-parchment-200 transition-colors"
            aria-label={t('closePanel')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Transcript area */}
      <div className="flex-1 overflow-y-auto px-6 py-4" style={{ height: 'calc(100% - 84px)' }}>
        {isEmpty && speech.isRecording && (
          <p className="text-sepia-600 text-sm italic">{t('listening')}</p>
        )}

        {speech.error && !isStopped && (
          <p className="text-brass-400/80 text-xs mb-2">{speech.error}</p>
        )}

        <div className="text-sepia-800 text-base leading-relaxed font-serif whitespace-pre-wrap" aria-live="polite">
          {speech.finalTranscript}
          {speech.interimTranscript && (
            <span className="text-sepia-600">
              {speech.finalTranscript ? ' ' : ''}{speech.interimTranscript}
              <span style={{ animation: 'braindump-cursor-blink 1s step-end infinite' }}>|</span>
            </span>
          )}
        </div>

        {isStopped && !hasTranscript && (
          <p className="text-sepia-600 text-sm mt-2">{t('noWords')}</p>
        )}
      </div>

      {/* Action buttons — shown when stopped with transcript */}
      {isStopped && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 border-t border-sepia-300/30">
          {polishError && (
            <span className="text-wax-500 text-xs mr-2">{polishError}</span>
          )}

          {isPolishing ? (
            <div className="flex items-center gap-2 text-sepia-600 text-sm">
              <Loader2 size={14} className="animate-spin" />
              <span>{polishProgress}</span>
            </div>
          ) : (
            <>
              <button
                onClick={braindump.insertAsIs}
                disabled={!hasTranscript}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-parchment-200 text-sepia-700 hover:bg-parchment-300 hover:text-sepia-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Type size={14} />
                {t('insertAsIs')}
              </button>
              <button
                onClick={braindump.polishAndInsert}
                disabled={!hasTranscript}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-forest-700 text-cream-50 hover:bg-forest-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={14} />
                {t('polishInsert')}
              </button>
              <button
                onClick={braindump.reRecord}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-sepia-600 hover:text-sepia-700 hover:bg-parchment-200 transition-colors"
              >
                <RotateCcw size={14} />
                {t('reRecord')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
