'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAiStatus } from '@/hooks/use-ai-status';

/**
 * Surfaces a clear banner when Gemini (which powers most AI features) is not
 * configured on this deployment — so AI failures read as "not configured"
 * rather than a silent 500. Character Chat's separate Anthropic dependency is
 * surfaced inline in the chat panel.
 */
export function AiStatusBanner() {
  const t = useTranslations('aiStatus');
  const status = useAiStatus();
  const [dismissed, setDismissed] = useState(false);

  if (!status || dismissed || status.geminiConfigured) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 bg-wax-500/10 border-b border-wax-500/30 text-sm text-wax-800"
    >
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-wax-600" />
      <div className="flex-1">
        <p className="font-medium">{t('title')}</p>
        <p className="text-xs text-wax-700 mt-0.5">
          {t.rich('body', { code: (chunks) => <code className="font-mono">{chunks}</code> })}
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded text-wax-700 hover:bg-wax-500/15 shrink-0"
        aria-label={t('dismiss')}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
