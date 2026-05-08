'use client';

import { forwardRef } from 'react';
import { useSpellcheckPreference } from '@/hooks/use-spellcheck-preference';

interface ParchmentInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

interface ParchmentTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const baseClasses =
  'w-full bg-parchment-200 border border-sepia-300/60 text-sepia-900 placeholder:text-sepia-500/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brass-400/40 focus:border-brass-500/60 transition-colors';

const errorClasses = 'border-wax-500/60 focus:ring-wax-500/30';

export const ParchmentInput = forwardRef<HTMLInputElement, ParchmentInputProps>(
  function ParchmentInput({ label, error, className = '', id, ...props }, ref) {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-sepia-800">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${baseClasses} ${error ? errorClasses : ''} ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-wax-500">{error}</p>}
      </div>
    );
  },
);

export const ParchmentTextarea = forwardRef<HTMLTextAreaElement, ParchmentTextareaProps>(
  function ParchmentTextarea({ label, error, className = '', id, spellCheck, ...props }, ref) {
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    // Phase 4.5 / MP-07: respect the user-level spellcheck preference unless
    // the call site explicitly overrides it (e.g. flow-editor sets false).
    const { enabled } = useSpellcheckPreference();
    const effectiveSpellCheck = spellCheck === undefined ? enabled : spellCheck;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-sepia-800">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          spellCheck={effectiveSpellCheck}
          className={`${baseClasses} min-h-[80px] ${error ? errorClasses : ''} ${className}`}
          {...props}
        />
        {error && <p className="text-xs text-wax-500">{error}</p>}
      </div>
    );
  },
);
