'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Play, Pause, Square } from 'lucide-react';
import { useSpeechSynthesis } from '@/hooks/use-speech-synthesis';
import { estimateReadingTime } from '@/lib/reader-utils';

interface AudiobookViewProps {
  title: string;
  content: string;
}

export function AudiobookView({ title, content }: AudiobookViewProps) {
  const t = useTranslations('readerView');
  const tts = useSpeechSynthesis();
  const readingTime = useMemo(() => estimateReadingTime(content), [content]);
  const readTimeLabel = readingTime.minutes < 60
    ? t('readTimeMin', { minutes: readingTime.minutes })
    : t('readTimeHourMin', { hours: Math.floor(readingTime.minutes / 60), minutes: readingTime.minutes % 60 });

  if (!tts.isSupported) {
    return (
      <div className="text-center py-16 text-sepia-600" data-testid="audiobook-unsupported">
        {t('unsupported')}
      </div>
    );
  }

  if (!content.trim()) {
    return <div className="text-center py-16 text-sepia-600">{t('empty')}</div>;
  }

  // Highlight current sentence region
  const afterCurrent = content.slice(tts.currentIndex);
  const sentenceEnd = afterCurrent.search(/[.!?]\s/) + 1;
  const highlightEnd = tts.currentIndex + (sentenceEnd > 0 ? sentenceEnd : Math.min(100, afterCurrent.length));

  return (
    <div className="max-w-3xl mx-auto px-6 py-8" data-testid="audiobook-view">
      <h2 className="text-2xl font-serif text-sepia-900 mb-6 text-center">{title}</h2>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mb-8 p-4 bg-parchment-200/50 rounded-xl">
        {!tts.isSpeaking ? (
          <button onClick={() => tts.speak(content)} className="p-3 rounded-full bg-forest-700 text-white hover:bg-forest-800" aria-label={t('playAria')}>
            <Play size={20} />
          </button>
        ) : tts.isPaused ? (
          <button onClick={tts.resume} className="p-3 rounded-full bg-forest-700 text-white hover:bg-forest-800" aria-label={t('resumeAria')}>
            <Play size={20} />
          </button>
        ) : (
          <button onClick={tts.pause} className="p-3 rounded-full bg-brass-600 text-white hover:bg-brass-700" aria-label={t('pauseAria')}>
            <Pause size={20} />
          </button>
        )}
        <button onClick={tts.cancel} className="p-2 rounded-full bg-sepia-200 text-sepia-600 hover:bg-sepia-300" aria-label={t('stopAria')}>
          <Square size={16} />
        </button>

        {/* Speed */}
        <div className="flex items-center gap-1 text-xs text-sepia-600">
          <span>{t('speed')}</span>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
            <button
              key={r}
              onClick={() => tts.setRate(r)}
              className={`px-1.5 py-0.5 rounded ${tts.rate === r ? 'bg-sepia-300 font-medium' : 'hover:bg-sepia-200'}`}
            >
              {r}x
            </button>
          ))}
        </div>

        {/* Voice selector */}
        {tts.voices.length > 1 && (
          <select
            value={tts.selectedVoice?.name ?? ''}
            onChange={e => {
              const v = tts.voices.find(v => v.name === e.target.value);
              if (v) tts.setVoice(v);
            }}
            className="text-xs bg-parchment-50 border border-sepia-300 rounded px-1 py-0.5 w-full min-w-0 sm:w-auto sm:max-w-[140px]"
            aria-label={t('voiceAria')}
          >
            {tts.voices.map(v => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Text with highlight */}
      <div className="font-serif text-lg leading-relaxed text-sepia-900 whitespace-pre-wrap">
        {tts.isSpeaking && tts.currentIndex > 0 ? (
          <>
            <span>{content.slice(0, tts.currentIndex)}</span>
            <span className="bg-forest-400/20 rounded px-0.5">{content.slice(tts.currentIndex, highlightEnd)}</span>
            <span>{content.slice(highlightEnd)}</span>
          </>
        ) : (
          content
        )}
      </div>

      <div className="text-center mt-8 text-xs text-sepia-600">{readTimeLabel}</div>
    </div>
  );
}
