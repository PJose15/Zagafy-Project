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
} from 'lucide-react';
import { useState } from 'react';
import { useStory } from '@/lib/store';
import { useGamification } from '@/hooks/use-gamification';
import { StreakBadge } from '@/components/gamification/streak-badge';
import { XPBar } from '@/components/gamification/xp-bar';

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Manuscript', href: '/manuscript', icon: BookOpen },
  { name: 'Outline', href: '/outline', icon: LayoutGrid },
  { name: 'Flow Mode', href: '/flow', icon: Zap },
  { name: 'Story Bible', href: '/bible', icon: BookOpen },
  { name: 'Characters', href: '/characters', icon: Users },
  { name: 'Character Chat', href: '/character-chat', icon: MessageCircle },
  { name: 'Timeline', href: '/timeline', icon: Clock },
  { name: 'Conflicts', href: '/conflicts', icon: Swords },
  { name: 'Canon Lock', href: '/canon', icon: Lock },
  { name: 'Assistant', href: '/assistant', icon: MessageSquareText },
  { name: 'Import', href: '/import', icon: UploadCloud },
  { name: 'Writing Map', href: '/writing-map', icon: Map },
  { name: 'Reader Mode', href: '/reader', icon: BookOpenCheck },
  { name: 'Story Brain', href: '/story-brain', icon: BrainCircuit },
  { name: 'Sprints', href: '/sprints', icon: Timer },
  { name: 'Versions', href: '/versions', icon: History },
  { name: 'Publishing', href: '/publishing', icon: Send },
];

export function ParchmentSidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { state } = useStory();
  const { gamification, xpProgress, streak } = useGamification();
  const totalWords = state.chapters.reduce((s, c) => s + (c.content ? c.content.split(/\s+/).filter(Boolean).length : 0), 0);

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-mahogany-900 border-b border-mahogany-700/50">
        <span className="font-serif font-semibold text-cream-100 tracking-tight">Zagafy</span>
        <button onClick={() => setIsOpen(!isOpen)} className="text-cream-300 hover:text-cream-50" aria-label={isOpen ? 'Close navigation' : 'Open navigation'}>
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-mahogany-900 texture-wood border-r border-mahogany-700/50 flex flex-col transition-transform duration-300 md:relative md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 hidden md:block">
          <h1 className="font-serif text-xl font-semibold text-cream-50 tracking-tight letterpress">
            Zagafy
          </h1>
          <div className="mt-1.5 h-0.5 w-10 bg-gradient-to-r from-brass-500 to-brass-500/0 rounded-full" />
          <p className="text-xs text-brass-400/70 mt-2 font-mono">CanonKeeper v1.0</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <motion.div key={item.name} {...stagger.navItems(index)}>
                <Link
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                    isActive
                      ? 'nav-brushstroke-active text-cream-50'
                      : 'text-cream-300/70 hover:bg-mahogany-800/50 hover:text-cream-100'
                  }`}
                >
                  <item.icon size={18} className={isActive ? 'text-cream-50' : 'text-cream-400/50'} />
                  {item.name}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        <div className="px-4 py-3 mx-3 mb-2 bg-mahogany-800/50 rounded-xl border border-mahogany-700/30">
          <div className="text-[10px] font-mono text-brass-400/60 uppercase tracking-widest mb-2">Project</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-cream-300/40 block">Words</span>
              <span className="text-cream-100 font-mono font-medium">{totalWords.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-cream-300/40 block">Chapters</span>
              <span className="text-cream-100 font-mono font-medium">{state.chapters.length}</span>
            </div>
          </div>
          {/* Streak + XP */}
          <div className="grid grid-cols-2 gap-2 text-xs mt-2 pt-2 border-t border-mahogany-700/30">
            <div>
              <span className="text-cream-300/40 block">Streak</span>
              <span className="text-cream-100 font-mono font-medium">{streak.currentStreak}d</span>
            </div>
            <div>
              <span className="text-cream-300/40 block">Level</span>
              <span className="text-cream-100 font-mono font-medium">{gamification.xp.level}</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-mahogany-700/50">
          <Link
            href="/settings"
            onClick={() => setIsOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
              pathname === '/settings'
                ? 'nav-brushstroke-active text-cream-50'
                : 'text-cream-300/70 hover:bg-mahogany-800/50 hover:text-cream-100'
            }`}
          >
            <Settings size={18} className={pathname === '/settings' ? 'text-cream-50' : 'text-cream-400/50'} />
            Settings
          </Link>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          role="button"
          tabIndex={0}
          aria-label="Close navigation"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(false); } }}
        />
      )}
    </>
  );
}
