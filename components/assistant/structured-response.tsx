'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import type { ChatResponseNormal, ChatResponseBlocked } from '@/lib/types/chat-response';

// Lazy-load react-markdown. Structured responses are only rendered after the
// user sends a message and receives a reply, so the first paint of /assistant
// doesn't need the markdown renderer (or remark/rehype/micromark).
const Markdown = dynamic(() => import('react-markdown'), {
  ssr: false,
  loading: () => <span className="text-xs italic text-sepia-600">…</span>,
});

interface StructuredNormalResponseProps {
  data: ChatResponseNormal;
}

interface StructuredBlockedResponseProps {
  data: ChatResponseBlocked & { validationWarnings?: string[] };
}

function CollapsibleSection({ title, children, defaultOpen = false, variant = 'default' }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: 'default' | 'warning' | 'info';
}) {
  const [open, setOpen] = useState(defaultOpen);
  const variantStyles = {
    default: 'text-sepia-600',
    warning: 'text-red-400',
    info: 'text-amber-400',
  };

  return (
    <div className="border-b border-sepia-300/30 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 w-full text-left py-2 text-xs font-medium uppercase tracking-wider ${variantStyles[variant]} hover:text-sepia-800 transition-colors`}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="pb-3 pl-5">{children}</div>}
    </div>
  );
}

export function StructuredNormalResponse({ data }: StructuredNormalResponseProps) {
  const t = useTranslations('assistant');
  const hasConflicts = data.conflictsDetected.length > 0 && data.conflictsDetected[0] !== 'None';
  const hasGaps = data.informationGaps.length > 0 && data.informationGaps[0] !== 'None';
  const hasGenerated = !!data.generatedText;
  const hasAlternatives = data.alternatives.length > 0;
  const validationWarnings = data.confidenceNotes.filter(n => n.startsWith('[Validation]'));
  const confidenceNotes = data.confidenceNotes.filter(n => !n.startsWith('[Validation]'));

  return (
    <div className="space-y-3">
      {/* Canon conflicts — prominent red warning */}
      {hasConflicts && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase tracking-wider mb-2">
            <AlertTriangle size={14} />
            {t('canonConflicts')}
          </div>
          <ul className="text-sm text-red-300 space-y-1">
            {data.conflictsDetected.map((c, i) => (
              <li key={i}>- {c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main recommendation */}
      {data.recommendation && (
        <div className="prose prose-sepia max-w-none text-sm leading-relaxed">
          <Markdown>{data.recommendation}</Markdown>
        </div>
      )}

      {/* Generated text — distinct box */}
      {hasGenerated && (
        <div className="bg-parchment-200 border border-brass-500/20 rounded-lg p-4 mt-2">
          <div className="text-xs font-medium text-brass-500 uppercase tracking-wider mb-2">{t('generatedText')}</div>
          <div className="prose prose-sepia max-w-none text-sm italic leading-relaxed">
            <Markdown>{data.generatedText}</Markdown>
          </div>
        </div>
      )}

      {/* Alternatives */}
      {hasAlternatives && (
        <CollapsibleSection title={t('alternatives', { count: data.alternatives.length })}>
          <ul className="text-sm text-sepia-600 space-y-1">
            {data.alternatives.map((a, i) => (
              <li key={i}>- {a}</li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Information gaps */}
      {hasGaps && (
        <CollapsibleSection title={t('informationGaps')} variant="info">
          <ul className="text-sm text-amber-400/80 space-y-1">
            {data.informationGaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2">
                <Info size={12} className="mt-1 shrink-0" />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      )}

      {/* Sources referenced */}
      {data.contextUsed.length > 0 && data.contextUsed[0] !== 'None' && (
        <CollapsibleSection title={t('sourcesReferenced', { count: data.contextUsed.length })}>
          <div className="flex flex-wrap gap-1.5">
            {data.contextUsed.map((c, i) => (
              <span key={i} className="text-xs bg-parchment-200 text-sepia-600 px-2 py-1 rounded">
                {c}
              </span>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Validation warnings */}
      {validationWarnings.length > 0 && (
        <div className="text-xs text-amber-500/80 space-y-0.5 pt-2 border-t border-sepia-300/30">
          {validationWarnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* Confidence notes — subtle footer */}
      {confidenceNotes.length > 0 && (
        <div className="text-xs text-sepia-600 space-y-0.5 pt-2 border-t border-sepia-300/30">
          {confidenceNotes.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function StructuredBlockedResponse({ data }: StructuredBlockedResponseProps) {
  const t = useTranslations('assistant');
  return (
    <div className="space-y-3">
      {/* Current state */}
      {data.currentState && (
        <div className="text-sm text-sepia-700 leading-relaxed">
          <div className="text-xs font-medium text-sepia-600 uppercase tracking-wider mb-1">{t('whereStory')}</div>
          <Markdown>{data.currentState}</Markdown>
        </div>
      )}

      {/* Diagnosis */}
      {data.diagnosis && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <div className="text-xs font-medium text-amber-400 uppercase tracking-wider mb-1">{t('whyBlocked')}</div>
          <div className="prose prose-sepia max-w-none text-sm leading-relaxed">
            <Markdown>{data.diagnosis}</Markdown>
          </div>
        </div>
      )}

      {/* Next paths */}
      {data.nextPaths.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-sepia-600 uppercase tracking-wider">{t('nextMoves')}</div>
          {data.nextPaths.map((path, i) => (
            <div key={i} className="bg-parchment-200 border border-sepia-300/50 rounded-lg p-3">
              <div className="text-sm font-medium text-brass-500 mb-1">{path.label}</div>
              <p className="text-sm text-sepia-600 leading-relaxed">{path.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Best recommendation */}
      {data.bestRecommendation && (
        <div className="bg-forest-600/5 border border-brass-500/20 rounded-lg p-3">
          <div className="text-xs font-medium text-brass-500 uppercase tracking-wider mb-1">{t('bestMove')}</div>
          <div className="prose prose-sepia max-w-none text-sm leading-relaxed">
            <Markdown>{data.bestRecommendation}</Markdown>
          </div>
        </div>
      )}

      {/* Scene starter */}
      {data.sceneStarter && (
        <div className="bg-parchment-200 border border-sepia-300/40/30 rounded-lg p-4 mt-2">
          <div className="text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">{t('sceneStarter')}</div>
          <div className="prose prose-sepia max-w-none text-sm italic leading-relaxed">
            <Markdown>{data.sceneStarter}</Markdown>
          </div>
        </div>
      )}

      {/* Validation warnings */}
      {data.validationWarnings && data.validationWarnings.length > 0 && (
        <div className="text-xs text-amber-500/80 space-y-0.5 pt-2 border-t border-sepia-300/30">
          {data.validationWarnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
