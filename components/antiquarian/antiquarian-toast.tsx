'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toastSlam } from '@/lib/animations';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
  /** Auto-dismiss lifetime, driving both the timer and the drain bar. */
  lifetimeMs: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const icons: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const styles: Record<ToastType, string> = {
  success: 'border-forest-600/40 bg-parchment-100 text-forest-700',
  error: 'border-wax-500/40 bg-parchment-100 text-wax-700',
  warning: 'border-brass-500/40 bg-parchment-100 text-brass-800',
  info: 'border-sepia-400/40 bg-parchment-100 text-sepia-700',
};

const iconColors: Record<ToastType, string> = {
  success: 'text-forest-600',
  error: 'text-wax-500',
  warning: 'text-brass-600',
  info: 'text-sepia-600',
};

const barColors: Record<ToastType, string> = {
  success: 'bg-forest-600/50',
  error: 'bg-wax-500/50',
  warning: 'bg-brass-500/60',
  info: 'bg-sepia-400/50',
};

const TOAST_LIFETIME_MS = 5000;
// Actionable toasts (e.g. Undo) linger longer so the offer can be taken.
const ACTION_TOAST_LIFETIME_MS = 8000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const tr = useTranslations('common');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, { timer: ReturnType<typeof setTimeout>; expiresAt: number }>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const entry = timersRef.current.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = crypto.randomUUID();
    const lifetimeMs = action ? ACTION_TOAST_LIFETIME_MS : TOAST_LIFETIME_MS;
    setToasts(prev => [...prev.slice(-4), { id, message, type, action, lifetimeMs }]);
    const timer = setTimeout(() => removeToast(id), lifetimeMs);
    timersRef.current.set(id, { timer, expiresAt: Date.now() + lifetimeMs });
  }, [removeToast]);

  // P6 — hovering a toast holds it open: the timer pauses (remaining time is
  // banked) and the drain bar freezes via CSS; leaving resumes both.
  const pauseToast = useCallback((id: string) => {
    const entry = timersRef.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.expiresAt = Math.max(entry.expiresAt - Date.now(), 1200);
  }, []);

  const resumeToast = useCallback((id: string) => {
    const entry = timersRef.current.get(id);
    if (!entry) return;
    const remaining = entry.expiresAt;
    entry.timer = setTimeout(() => removeToast(id), remaining);
    entry.expiresAt = Date.now() + remaining;
  }, [removeToast]);

  const renderToast = (t: Toast) => {
    const Icon = icons[t.type];
    return (
      <motion.div
        key={t.id}
        {...toastSlam}
        onMouseEnter={() => pauseToast(t.id)}
        onMouseLeave={() => resumeToast(t.id)}
        className={`toast-card relative overflow-hidden flex items-start gap-3 border rounded-xl px-4 py-3 shadow-parchment texture-parchment ${styles[t.type]}`}
      >
        <Icon size={18} aria-hidden="true" className={`shrink-0 mt-0.5 ${iconColors[t.type]}`} />
        <p className="text-sm flex-1 font-medium break-words min-w-0">{t.message}</p>
        {t.action && (
          <button
            onClick={() => {
              t.action?.onClick();
              removeToast(t.id);
            }}
            className="shrink-0 text-xs font-semibold text-brass-700 underline underline-offset-2 hover:text-brass-600 transition-colors"
          >
            {t.action.label}
          </button>
        )}
        <button
          onClick={() => removeToast(t.id)}
          className="shrink-0 p-0.5 rounded hover:bg-sepia-300/30 transition-colors text-sepia-600"
          aria-label={tr('dismissNotification')}
        >
          <X size={14} aria-hidden="true" />
        </button>
        {/* Ink drain — shows how long the toast will stay; CSS-driven so
            hover can freeze it in place alongside the paused timer (P6). */}
        <span
          aria-hidden="true"
          style={{ animationDuration: `${t.lifetimeMs}ms` }}
          className={`toast-drain absolute bottom-0 left-0 right-0 h-0.5 origin-left ${barColors[t.type]}`}
        />
      </motion.div>
    );
  };

  // Errors interrupt (assertive); everything else is announced politely.
  // Two sibling live regions so each carries the right politeness — nesting a
  // single container can't vary politeness per toast.
  const assertiveToasts = toasts.filter(t => t.type === 'error');
  const politeToasts = toasts.filter(t => t.type !== 'error');

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="print:hidden fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
          <AnimatePresence>{assertiveToasts.map(renderToast)}</AnimatePresence>
        </div>
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <AnimatePresence>{politeToasts.map(renderToast)}</AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
