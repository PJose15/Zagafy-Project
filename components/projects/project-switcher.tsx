'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronsUpDown, Check, Library, Plus } from 'lucide-react';
import { useProjects } from '@/hooks/use-projects';
import { createProject, switchProject } from '@/lib/projects/projects';

/**
 * Compact active-project switcher for the sidebar header. Lists projects to
 * switch between, links to the full library, and can spin up a new project.
 */
export function ProjectSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('projectSwitcher');
  const router = useRouter();
  const { projects, activeId } = useProjects();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const active = projects.find(p => p.id === activeId);
  const activeTitle = active?.title || t('untitled');

  useEffect(() => {
    if (!open) return;
    // WAI-ARIA menu pattern: focus lands on the first item when the menu opens.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Arrow keys walk the menu (wrapping); Home/End jump to the edges.
  const handleMenuKey = (e: React.KeyboardEvent) => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  };

  const go = (path: string) => {
    setOpen(false);
    onNavigate?.();
    router.push(path);
  };

  const handleSwitch = (id: string) => {
    if (id !== activeId) switchProject(id);
    go('/');
  };

  const handleCreate = async () => {
    await createProject('Untitled Project');
    go('/');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-mahogany-800/50 border border-mahogany-700/40 text-left hover:bg-mahogany-800/80 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('activeAria', { title: activeTitle })}
      >
        <Library size={14} aria-hidden="true" className="text-brass-400/70 shrink-0" />
        <span className="flex-1 min-w-0 truncate text-sm text-cream-100">{activeTitle}</span>
        <ChevronsUpDown size={14} aria-hidden="true" className="text-cream-400/50 shrink-0" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKey}
          className="absolute left-0 right-0 mt-1 z-50 rounded-lg bg-mahogany-900 border border-mahogany-700/60 shadow-card-hover py-1 max-h-72 overflow-y-auto"
        >
          <p className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-brass-400/50">{t('projects')}</p>
          {projects.map(p => {
            const isActive = p.id === activeId;
            return (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                onClick={() => handleSwitch(p.id)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                  isActive ? 'text-cream-50 bg-mahogany-800/60' : 'text-cream-300/80 hover:bg-mahogany-800/50 hover:text-cream-100'
                }`}
                aria-current={isActive ? 'true' : undefined}
              >
                <Check size={13} aria-hidden="true" className={isActive ? 'text-brass-400' : 'text-transparent'} />
                <span className="flex-1 min-w-0 truncate">{p.title || t('untitled')}</span>
                <span className="text-[10px] font-mono text-cream-400/40 shrink-0">{t('chaptersShort', { count: p.chapterCount })}</span>
              </button>
            );
          })}

          <div className="my-1 border-t border-mahogany-700/40" />
          <button
            type="button"
            role="menuitem"
            onClick={handleCreate}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-cream-300/80 hover:bg-mahogany-800/50 hover:text-cream-100 transition-colors"
          >
            <Plus size={13} aria-hidden="true" className="text-brass-400/70" />
            {t('newProject')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => go('/projects')}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-cream-300/80 hover:bg-mahogany-800/50 hover:text-cream-100 transition-colors"
          >
            <Library size={13} aria-hidden="true" className="text-brass-400/70" />
            {t('manageProjects')}
          </button>
        </div>
      )}
    </div>
  );
}
