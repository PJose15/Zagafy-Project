'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toastSlam } from '@/lib/animations';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    const timer = setTimeout(() => removeToast(id), 5000);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map(t => {
            const Icon = icons[t.type];
            return (
              <motion.div
                key={t.id}
                {...toastSlam}
                className={`flex items-start gap-3 border rounded-xl px-4 py-3 shadow-parchment texture-parchment ${styles[t.type]}`}
              >
                <Icon size={18} className={`shrink-0 mt-0.5 ${iconColors[t.type]}`} />
                <p className="text-sm flex-1 font-medium">{t.message}</p>
                <button
                  onClick={() => removeToast(t.id)}
                  className="shrink-0 p-0.5 rounded hover:bg-sepia-300/30 transition-colors text-sepia-600"
                  aria-label="Dismiss notification"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
