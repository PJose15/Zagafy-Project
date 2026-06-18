'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { springs } from '@/lib/animations';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleResponse = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  };

  useEffect(() => {
    if (!options) return;
    setTimeout(() => cancelBtnRef.current?.focus(), 50);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleResponse(false);
        return;
      }
      // Trap Tab within the dialog so focus can't escape to the page behind it.
      if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !root.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [options]);

  const isDanger = options?.variant === 'danger';

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AnimatePresence>
        {options && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
          >
            {/* Backdrop — sepia tint */}
            <div className="absolute inset-0 bg-sepia-900/60 backdrop-blur-sm" onClick={() => handleResponse(false)} />

            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={springs.gentle}
              className="relative bg-parchment-100 border border-sepia-300/50 rounded-xl shadow-card-hover max-w-md w-full p-6 texture-parchment"
            >
              {/* Close button */}
              <button
                onClick={() => handleResponse(false)}
                className="absolute top-3 right-3 p-1 rounded-full text-sepia-600 hover:text-sepia-800 hover:bg-sepia-300/30 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>

              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-full shrink-0 ${isDanger ? 'bg-wax-500/10 text-wax-600' : 'bg-brass-500/10 text-brass-700'}`}>
                  <AlertTriangle size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id="confirm-title" className="text-lg font-serif font-semibold text-sepia-900">
                    {options.title}
                  </h3>
                  <p id="confirm-message" className="text-sm text-sepia-600 mt-2 leading-relaxed">
                    {options.message}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  ref={cancelBtnRef}
                  onClick={() => handleResponse(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-sepia-700 hover:bg-sepia-300/30 transition-colors"
                >
                  {options.cancelLabel || 'Cancel'}
                </button>
                <button
                  onClick={() => handleResponse(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isDanger
                      ? 'bg-wax-600 text-cream-50 hover:bg-wax-500 border border-wax-700'
                      : 'bg-forest-700 text-cream-50 hover:bg-forest-600 border border-forest-800'
                  }`}
                >
                  {options.confirmLabel || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within a ConfirmProvider');
  return context;
}
