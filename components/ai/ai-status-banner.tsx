'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useAiStatus } from '@/hooks/use-ai-status';

/**
 * Surfaces a clear banner when Gemini (which powers most AI features) is not
 * configured on this deployment — so AI failures read as "not configured"
 * rather than a silent 500. Character Chat's separate Anthropic dependency is
 * surfaced inline in the chat panel.
 */
export function AiStatusBanner() {
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
        <p className="font-medium">AI features are unavailable on this deployment.</p>
        <p className="text-xs text-wax-700 mt-0.5">
          <code className="font-mono">GEMINI_API_KEY</code> isn&apos;t configured. Set it in your
          hosting provider&apos;s environment variables (and redeploy) to enable the assistant,
          coaching, publishing, and ingestion.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded text-wax-700 hover:bg-wax-500/15 shrink-0"
        aria-label="Dismiss"
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>
  );
}
