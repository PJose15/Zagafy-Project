'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Library, Search } from 'lucide-react';
import { springs } from '@/lib/animations';
import { useStory } from '@/lib/store';
import { wordCount } from '@/lib/editor/serialization';
import { useModalHygiene } from '@/hooks/use-modal-hygiene';
import { navItems } from '@/components/antiquarian/parchment-sidebar';

/** Anything (the sidebar hint chip, a future button) can open the catalog by
    dispatching this event — avoids threading state through the shell. */
export const OPEN_CATALOG_EVENT = 'zagafy:open-catalog';

interface CatalogEntry {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  section: 'pages' | 'chapters';
  /** P10: right-hand meta on the index card (a chapter's word count). */
  meta?: string;
}

/**
 * A1 — the Card Catalog: Ctrl/Cmd+K opens a drawer of index cards over the
 * library. Type to filter rooms (pages) and chapters; arrows walk the cards,
 * Enter pulls the one you're on.
 */
export function CardCatalog() {
  const t = useTranslations('catalog');
  const tNav = useTranslations('nav');
  const router = useRouter();
  const { state } = useStory();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useModalHygiene(panelRef, close, open);

  const openCatalog = useCallback(() => {
    setQuery('');
    setActive(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) close();
        else openCatalog();
      }
    };
    const onOpenEvent = () => openCatalog();
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_CATALOG_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_CATALOG_EVENT, onOpenEvent);
    };
  }, [open, openCatalog, close]);

  const results = useMemo<CatalogEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const pages = navItems
      .map(n => ({
        id: `page-${n.key}`,
        href: n.href,
        label: tNav(n.key),
        icon: <n.icon size={15} aria-hidden="true" className="text-brass-600 shrink-0" />,
        section: 'pages' as const,
      }))
      .filter(p => !q || p.label.toLowerCase().includes(q));
    const chapters = state.chapters
      .map((c, i) => ({
        id: `chapter-${c.id}`,
        href: '/manuscript',
        label: `${i + 1}. ${c.title}`,
        icon: <BookOpen size={15} aria-hidden="true" className="text-sepia-500 shrink-0" />,
        section: 'chapters' as const,
        meta: t('wordsShort', { count: wordCount(c.content) }),
      }))
      .filter(c => !q || c.label.toLowerCase().includes(q));
    return [...pages.slice(0, q ? 12 : 7), ...chapters.slice(0, 8)];
  }, [query, state.chapters, tNav, t]);

  const clamped = Math.min(active, Math.max(results.length - 1, 0));

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(clamped + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(clamped - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = results[clamped];
      if (r) go(r.href);
    }
  };

  let lastSection: CatalogEntry['section'] | null = null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[14vh]"
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
            className="relative w-full max-w-lg rounded-xl border border-sepia-300/50 bg-parchment-100 shadow-card-hover texture-parchment overflow-hidden"
          >
            <div className="flex items-center gap-2.5 border-b border-sepia-300/40 px-4 py-3">
              <Search size={16} aria-hidden="true" className="text-brass-600 shrink-0" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="catalog-results"
                aria-activedescendant={results[clamped]?.id}
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('placeholder')}
                className="w-full bg-transparent text-sm text-sepia-900 placeholder:text-sepia-500 focus:outline-none"
              />
              <kbd className="shrink-0 rounded border border-sepia-300/50 bg-parchment-200 px-1.5 py-0.5 font-mono text-[10px] text-sepia-600">esc</kbd>
            </div>

            <div id="catalog-results" role="listbox" className="max-h-[46vh] overflow-y-auto py-2 custom-scrollbar">
              {results.length === 0 && (
                <p className="px-4 py-6 text-center text-sm italic text-sepia-600">{t('noResults')}</p>
              )}
              {results.map((r, i) => {
                const header = r.section !== lastSection ? r.section : null;
                lastSection = r.section;
                return (
                  <div key={r.id}>
                    {header && (
                      <p className="label-caps px-4 pb-1 pt-2 text-[10px] text-sepia-500">
                        {t(header)}
                      </p>
                    )}
                    <button
                      type="button"
                      id={r.id}
                      role="option"
                      aria-selected={i === clamped}
                      onClick={() => go(r.href)}
                      onMouseMove={() => setActive(i)}
                      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                        i === clamped
                          ? 'bg-parchment-200 text-sepia-900 shadow-[inset_2px_0_0_var(--color-brass-600)]'
                          : 'text-sepia-700'
                      }`}
                    >
                      {r.icon}
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      {r.meta && (
                        <span className="shrink-0 font-mono text-[10px] text-sepia-500">{r.meta}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-sepia-300/40 bg-parchment-200/50 px-4 py-2 font-mono text-[10px] text-sepia-600">
              <span>↑↓ {t('hintNavigate')}</span>
              <span>↵ {t('hintOpen')}</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small sidebar chip advertising the catalog; clicking it opens the palette. */
export function CatalogHint() {
  const t = useTranslations('catalog');
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CATALOG_EVENT))}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-cream-300/60 transition-colors hover:bg-mahogany-800/50 hover:text-cream-100"
    >
      <Library size={13} aria-hidden="true" className="text-brass-400/70" />
      <span className="flex-1 text-left">{t('title')}</span>
      <kbd className="rounded border border-mahogany-700/60 bg-mahogany-800/60 px-1.5 py-0.5 font-mono text-[10px] text-cream-300/70">Ctrl K</kbd>
    </button>
  );
}
