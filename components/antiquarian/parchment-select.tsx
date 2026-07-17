import { forwardRef } from 'react';

interface ParchmentSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

const baseClasses =
  'w-full bg-parchment-200 border border-sepia-300/60 text-sepia-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brass-400/40 focus:border-brass-500/60 transition-colors appearance-none pr-8';

const errorClasses = 'border-wax-500/60 focus:ring-wax-500/30';

export const ParchmentSelect = forwardRef<HTMLSelectElement, ParchmentSelectProps>(
  function ParchmentSelect({ label, error, className = '', id, children, ...props }, ref) {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const errorId = error && selectId ? `${selectId}-error` : undefined;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-sepia-800">
            {label}
          </label>
        )}
        <div className={`relative ink-underline ${error ? 'ink-tremor' : ''}`}>
          <select
            ref={ref}
            id={selectId}
            className={`${baseClasses} ${error ? errorClasses : ''} ${className}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            {...props}
          >
            {children}
          </select>
          <svg
            className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 ${error ? 'text-wax-600' : 'text-sepia-600'}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
        {error && <p id={errorId} className="text-xs text-wax-700 wax-blot">{error}</p>}
      </div>
    );
  },
);
