'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Download, Feather, History, Library, PenLine, Replace, Search, Timer } from 'lucide-react';
import { springs } from '@/lib/animations';
import { useStory } from '@/lib/store';
import { useSession } from '@/lib/session';
import { wordCount } from '@/lib/editor/serialization';
import { useModalHygiene } from '@/hooks/use-modal-hygiene';
import { navItems } from '@/components/antiquarian/parchment-sidebar';

/** Anything (the sidebar hint chip, a future button) can open the catalog by
    dispatching this event — avoids threading state through the shell. */
export const OPEN_CATALOG_EVENT = 'zagafy:open-catalog';

/** G1: cross-page action handshake — the catalog stamps an intent here and
    the destination page performs it on mount (post-hydration, so it's safe). */
export const PENDING_ACTION_KEY = 'zagafy_pending_action';
const RECENT_ROOMS_KEY = 'zagafy_recent_rooms';

interface CatalogEntry {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  section: 'recent' | 'actions' | 'pages' | 'chapters';
  /** P10: right-hand meta on the index card (a chapter's word count). */
  meta?: string;
  /** G1: verbs run instead of merely navigating. */
  run?: () => void;
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
  const { setFlowChapterId } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recentKeys, setRecentKeys] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // G20: Escape clears the query first; a second Escape closes the drawer.
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });
  const handleEscape = useCallback(() => {
    if (queryRef.current) {
      setQuery('');
      setActive(0);
      return;
    }
    setOpen(false);
  }, []);
  useModalHygiene(panelRef, handleEscape, open);

  const openCatalog = useCallback(() => {
    setQuery('');
    setActive(0);
    // G3: pull the recent-rooms ledger fresh each time the drawer opens.
    try {
      const raw = localStorage.getItem(RECENT_ROOMS_KEY);
      setRecentKeys(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setRecentKeys([]);
    }
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

    // G1: verbs — the catalog can do things, not just go places.
    const stampIntent = (intent: string) => {
      try {
        sessionStorage.setItem(PENDING_ACTION_KEY, intent);
      } catch {
        /* the navigation still lands on the right page */
      }
    };
    const lastWritten = [...state.chapters].reverse().find(c => c.content.trim());
    const allActions: CatalogEntry[] = [
      ...(lastWritten
        ? [{
            id: 'action-continue',
            href: '/flow',
            label: t('actionContinue', { title: lastWritten.title }),
            icon: <PenLine size={15} aria-hidden="true" className="text-forest-700 shrink-0" />,
            section: 'actions' as const,
            run: () => {
              setFlowChapterId(lastWritten.id);
              router.push('/flow');
            },
          }]
        : []),
      {
        id: 'action-new-chapter',
        href: '/manuscript',
        label: t('actionNewChapter'),
        icon: <Feather size={15} aria-hidden="true" className="text-forest-700 shrink-0" />,
        section: 'actions',
        run: () => {
          stampIntent('new-chapter');
          router.push('/manuscript');
        },
      },
      {
        id: 'action-find-replace',
        href: '/manuscript',
        label: t('actionFindReplace'),
        icon: <Replace size={15} aria-hidden="true" className="text-forest-700 shrink-0" />,
        section: 'actions',
        run: () => {
          stampIntent('find-replace');
          router.push('/manuscript');
        },
      },
      {
        id: 'action-sprint',
        href: '/sprints',
        label: t('actionSprint'),
        icon: <Timer size={15} aria-hidden="true" className="text-forest-700 shrink-0" />,
        section: 'actions',
      },
      {
        id: 'action-export',
        href: '/publishing',
        label: t('actionExport'),
        icon: <Download size={15} aria-hidden="true" className="text-forest-700 shrink-0" />,
        section: 'actions',
      },
      {
        // G23: back up the library — settings hosts export/import.
        id: 'action-backup',
        href: '/settings',
        label: t('actionBackup'),
        icon: <Library size={15} aria-hidden="true" className="text-forest-700 shrink-0" />,
        section: 'actions',
      },
    ];
    const actions = allActions.filter(a => !q || a.label.toLowerCase().includes(q));

    // G3: recently visited rooms lead the drawer when it opens un-queried.
    const recent: CatalogEntry[] = q
      ? []
      : recentKeys
          .map(key => navItems.find(n => n.key === key))
          .filter((n): n is (typeof navItems)[number] => !!n)
          .slice(0, 4)
          .map(n => ({
            id: `recent-${n.key}`,
            href: n.href,
            label: tNav(n.key),
            icon: <History size={15} aria-hidden="true" className="text-sepia-500 shrink-0" />,
            section: 'recent' as const,
          }));

    return [...recent, ...actions.slice(0, q ? 8 : 5), ...pages.slice(0, q ? 12 : 7), ...chapters.slice(0, 8)];
  }, [query, state.chapters, recentKeys, tNav, t, router, setFlowChapterId]);

  const clamped = Math.min(active, Math.max(results.length - 1, 0));

  const go = (entry: CatalogEntry) => {
    close();
    if (entry.run) entry.run();
    else router.push(entry.href);
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
      if (r) go(r);
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
                      onClick={() => go(r)}
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
              {/* G22: the sheet of customs is one keystroke away */}
              <span className="mr-auto">? {t('hintShortcuts')}</span>
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
