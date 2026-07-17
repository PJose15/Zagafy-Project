'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import { stagger } from '@/lib/animations';
import {
  BookOpen,
  LayoutDashboard,
  Users,
  Clock,
  Swords,
  MessageSquareText,
  Settings,
  Menu,
  X,
  Lock,
  UploadCloud,
  Zap,
  Map,
  BookOpenCheck,
  BrainCircuit,
  Timer,
  MessageCircle,
  History,
  LayoutGrid,
  Send,
  Library,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatedNumber } from './animated-number';
import { useStory } from '@/lib/store';
import { useGamification } from '@/hooks/use-gamification';
import { StreakBadge } from '@/components/gamification/streak-badge';
import { XPBar } from '@/components/gamification/xp-bar';
import { ProjectSwitcher } from '@/components/projects/project-switcher';
import { ProfileBadge } from '@/components/profile/profile-badge';
import { CatalogHint } from '@/components/catalog/card-catalog';

export const navItems = [
  { key: 'dashboard', href: '/', icon: LayoutDashboard },
  { key: 'projects', href: '/projects', icon: Library },
  { key: 'manuscript', href: '/manuscript', icon: BookOpen },
  { key: 'outline', href: '/outline', icon: LayoutGrid },
  { key: 'flow', href: '/flow', icon: Zap },
  { key: 'bible', href: '/bible', icon: BookOpen },
  { key: 'characters', href: '/characters', icon: Users },
  { key: 'characterChat', href: '/character-chat', icon: MessageCircle },
  { key: 'timeline', href: '/timeline', icon: Clock },
  { key: 'conflicts', href: '/conflicts', icon: Swords },
  { key: 'canon', href: '/canon', icon: Lock },
  { key: 'assistant', href: '/assistant', icon: MessageSquareText },
  { key: 'import', href: '/import', icon: UploadCloud },
  { key: 'writingMap', href: '/writing-map', icon: Map },
  { key: 'reader', href: '/reader', icon: BookOpenCheck },
  { key: 'storyBrain', href: '/story-brain', icon: BrainCircuit },
  { key: 'sprints', href: '/sprints', icon: Timer },
  { key: 'versions', href: '/versions', icon: History },
  { key: 'publishing', href: '/publishing', icon: Send },
] as const;

export function ParchmentSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('nav');
  const tSide = useTranslations('sidebar');
  const tApp = useTranslations('app');
  const { state } = useStory();
  const { gamification, xpProgress, streak } = useGamification();

  // M19: catch the level crossing without an effect (adjust-state-during-
  // render, same pattern as XPBar). A positive burstId keys the gold-leaf
  // rays + numeral stamp; it never fires on plain mount.
  const level = gamification.xp.level;
  const [prevLevel, setPrevLevel] = useState(level);
  const [burstId, setBurstId] = useState(0);
  if (level !== prevLevel) {
    setPrevLevel(level);
    if (level > prevLevel) setBurstId(burstId + 1);
  }
  const totalWords = state.chapters.reduce((s, c) => s + (c.content ? c.content.split(/\s+/).filter(Boolean).length : 0), 0);

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden print:hidden flex items-center justify-between p-4 bg-mahogany-900 border-b border-mahogany-700/50">
        <span className="font-serif font-semibold text-cream-100 tracking-tight">{tApp('name')}</span>
        <button onClick={() => setIsOpen(!isOpen)} className="text-cream-300 hover:text-cream-50" aria-label={isOpen ? tSide('closeNav') : tSide('openNav')}>
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar — sticky on desktop so the menu follows you down the page;
          the nav list scrolls internally when it outgrows the viewport. */}
      <aside
        className={`print:hidden fixed inset-y-0 left-0 z-50 w-64 bg-mahogany-900 texture-wood border-r border-mahogany-700/50 flex flex-col transition-transform duration-[380ms] ease-[cubic-bezier(0.34,1.25,0.64,1)] md:sticky md:top-0 md:h-screen md:shrink-0 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 hidden md:block">
          <p className="font-serif text-xl font-semibold text-cream-50 tracking-tight letterpress">
            {tApp('name')}
          </p>
          <div className="mt-1.5 h-0.5 w-10 bg-gradient-to-r from-brass-500 to-brass-500/0 rounded-full" />
          <p className="text-xs text-brass-400/70 mt-2 font-mono">{tApp('version')}</p>
          <div className="mt-4">
            <ProjectSwitcher onNavigate={() => setIsOpen(false)} />
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto" aria-label="Primary">
          {navItems.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <motion.div
                key={item.key}
                {...stagger.navItems(index)}
                // Own transitions here — the stagger transition carries a
                // per-index delay that would otherwise lag hover/tap feedback.
                whileHover={{ x: 3, transition: { type: 'spring', stiffness: 300, damping: 20, delay: 0 } }}
                whileTap={{ scale: 0.97, transition: { type: 'spring', stiffness: 400, damping: 25, delay: 0 } }}
              >
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                    isActive
                      ? 'nav-brushstroke-active text-cream-50'
                      : 'nav-brushstroke-hover text-cream-300/70 hover:text-cream-100'
                  }`}
                >
                  <item.icon size={18} aria-hidden="true" className={isActive ? 'text-cream-50' : 'text-cream-400/50'} />
                  {t(item.key)}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        <div className="px-4 py-3 mx-3 mb-2 bg-mahogany-800/50 rounded-xl border border-mahogany-700/30">
          <div className="text-[10px] font-mono text-brass-400/60 uppercase tracking-widest mb-2">{tSide('project')}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-cream-300/40 block">{tSide('words')}</span>
              {/* M10: the ledger updates itself — the count rolls to its new
                  value and ticks when a save lands. */}
              <span className="text-cream-100 font-mono font-medium">
                <AnimatedNumber value={totalWords} pulseOnChange />
              </span>
            </div>
            <div>
              <span className="text-cream-300/40 block">{tSide('chapters')}</span>
              <span className="text-cream-100 font-mono font-medium">{state.chapters.length}</span>
            </div>
          </div>
          {/* Streak + XP */}
          <div className="grid grid-cols-2 gap-2 text-xs mt-2 pt-2 border-t border-mahogany-700/30">
            <div>
              <span className="text-cream-300/40 block">{tSide('streak')}</span>
              <span className="text-cream-100 font-mono font-medium">{tSide('streakDays', { count: streak.currentStreak })}</span>
            </div>
            <div>
              <span className="text-cream-300/40 block">{tSide('level')}</span>
              <span className="relative inline-block text-cream-100 font-mono font-medium">
                {/* M19: on level-up the numeral stamps in under a burst of
                    gold-leaf rays; before the first level-up it's static. */}
                {burstId > 0 ? (
                  <motion.span
                    key={burstId}
                    initial={{ scale: 1.7, rotate: -8, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    className="inline-block gold-leaf"
                  >
                    {level}
                  </motion.span>
                ) : (
                  <span>{level}</span>
                )}
                {burstId > 0 && (
                  <span key={`rays-${burstId}`} aria-hidden="true" className="pointer-events-none absolute inset-0">
                    {Array.from({ length: 8 }, (_, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0.9, rotate: i * 45, scaleX: 0.15 }}
                        animate={{ opacity: 0, rotate: i * 45, scaleX: 1.6 }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.08 }}
                        className="absolute left-1/2 top-1/2 h-[2px] w-4 origin-left rounded-full bg-brass-400"
                      />
                    ))}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-mahogany-700/50">
          {/* A1: card catalog quick-open (Ctrl/Cmd+K) */}
          <CatalogHint />
          <ProfileBadge onNavigate={() => setIsOpen(false)} />
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            aria-current={pathname === '/settings' ? 'page' : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
              pathname === '/settings'
                ? 'nav-brushstroke-active text-cream-50'
                : 'nav-brushstroke-hover text-cream-300/70 hover:text-cream-100'
            }`}
          >
            <Settings size={18} aria-hidden="true" className={pathname === '/settings' ? 'text-cream-50' : 'text-cream-400/50'} />
            {t('settings')}
          </Link>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          role="button"
          tabIndex={0}
          aria-label={tSide('closeNav')}
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(false); } }}
        />
      )}
    </>
  );
}
