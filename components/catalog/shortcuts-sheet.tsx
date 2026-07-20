'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { Keyboard } from 'lucide-react';
import { springs } from '@/lib/animations';
import { useModalHygiene } from '@/hooks/use-modal-hygiene';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-sepia-300/60 bg-parchment-200 px-1.5 py-0.5 font-mono text-[11px] text-sepia-700 shadow-[0_1px_0_rgba(122,90,48,0.25)]">
      {children}
    </kbd>
  );
}

/**
 * G2 — the shortcuts sheet: press ? anywhere (outside a field) and the
 * library's keyboard customs are laid out on one card.
 */
export function ShortcutsSheet() {
  const t = useTranslations('shortcuts');
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useModalHygiene(panelRef, close, open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      setOpen(o => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rows: { keys: React.ReactNode; label: string }[] = [
    { keys: <><Kbd>Ctrl</Kbd> <Kbd>K</Kbd></>, label: t('catalog') },
    { keys: <><Kbd>Ctrl</Kbd> <Kbd>S</Kbd></>, label: t('save') },
    { keys: <><Kbd>Ctrl</Kbd> <Kbd>F</Kbd></>, label: t('find') },
    { keys: <><Kbd>↵</Kbd> / <Kbd>⇧↵</Kbd></>, label: t('composer') },
    { keys: <Kbd>Esc</Kbd>, label: t('escape') },
    { keys: <Kbd>?</Kbd>, label: t('sheet') },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('title')}
        >
          <div className="absolute inset-0 bg-sepia-900/60 backdrop-blur-sm" onClick={close} />
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.97, y: 10, rotateX: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={springs.gentle}
            style={{ transformPerspective: 800, transformOrigin: 'top center' }}
            className="relative w-full max-w-sm rounded-xl border border-sepia-300/50 bg-parchment-100 p-5 shadow-card-hover texture-parchment"
          >
            <div className="mb-4 flex items-center gap-2">
              <Keyboard size={16} aria-hidden="true" className="text-brass-600" />
              <h2 className="font-serif text-lg font-semibold text-sepia-900">{t('title')}</h2>
            </div>
            <dl className="space-y-2.5">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <dt className="text-sm text-sepia-700">{row.label}</dt>
                  <dd className="flex shrink-0 items-center gap-1">{row.keys}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
