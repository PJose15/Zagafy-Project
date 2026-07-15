'use client';

import { useStory, CanonStatus, StoryState } from '@/lib/store';
import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, ShieldCheck, ShieldAlert, Shield, ShieldOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fadeUp, springs, stagger } from '@/lib/animations';
import { CarvedHeader, EmptyState, ParchmentCard, ParchmentSelect, WaxSealBadge } from '@/components/antiquarian';

type ItemType = 'character' | 'timeline' | 'conflict' | 'chapter' | 'scene' | 'world_rule' | 'location' | 'theme' | 'open_loop' | 'foreshadowing';

interface CanonItem {
  id: string;
  type: ItemType;
  title: string;
  description: string;
  status: CanonStatus;
}

const statusConfig = {
  confirmed: { icon: ShieldCheck, color: 'text-forest-700', bg: 'bg-forest-700/10', border: 'border-forest-600/30' },
  flexible: { icon: Shield, color: 'text-brass-600', bg: 'bg-brass-500/10', border: 'border-brass-500/30' },
  draft: { icon: ShieldAlert, color: 'text-brass-800', bg: 'bg-brass-400/10', border: 'border-brass-400/30' },
  discarded: { icon: ShieldOff, color: 'text-wax-600', bg: 'bg-wax-500/10', border: 'border-wax-500/30' },
};

export default function CanonLockPage() {
  const t = useTranslations('canon');
  const tStatus = useTranslations('canonStatus');
  const { state, updateField } = useStory();
  const [filterStatus, setFilterStatus] = useState<CanonStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<ItemType | 'all'>('all');

  const allItems = useMemo<CanonItem[]>(() => [
    ...state.characters.map(c => ({ id: c.id, type: 'character' as ItemType, title: c.name, description: c.description, status: c.canonStatus || 'draft' })),
    ...state.timeline_events.map(t => ({ id: t.id, type: 'timeline' as ItemType, title: t.date, description: t.description, status: t.canonStatus || 'draft' })),
    ...state.active_conflicts.map(c => ({ id: c.id, type: 'conflict' as ItemType, title: c.title, description: c.description, status: c.canonStatus || 'draft' })),
    ...state.chapters.map(c => ({ id: c.id, type: 'chapter' as ItemType, title: c.title, description: c.summary, status: c.canonStatus || 'draft' })),
    ...state.scenes.map(s => ({ id: s.id, type: 'scene' as ItemType, title: s.title, description: s.summary, status: s.canonStatus || 'draft' })),
    ...state.world_rules.map(w => ({ id: w.id, type: 'world_rule' as ItemType, title: w.rule, description: w.category, status: w.canonStatus || 'draft' })),
    ...state.locations.map(l => ({ id: l.id, type: 'location' as ItemType, title: l.name, description: l.description, status: l.canonStatus || 'draft' })),
    ...state.themes.map(t => ({ id: t.id, type: 'theme' as ItemType, title: t.theme, description: t.evidence.join(', '), status: t.canonStatus || 'draft' })),
    ...state.open_loops.map(o => ({ id: o.id, type: 'open_loop' as ItemType, title: o.description, description: o.status, status: o.canonStatus || 'draft' })),
    ...state.foreshadowing_elements.map(f => ({ id: f.id, type: 'foreshadowing' as ItemType, title: f.clue, description: f.payoff, status: f.canonStatus || 'draft' })),
  ], [state.characters, state.timeline_events, state.active_conflicts, state.chapters, state.scenes, state.world_rules, state.locations, state.themes, state.open_loops, state.foreshadowing_elements]);

  const filteredItems = useMemo(() => allItems.filter(item => {
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;
    if (filterType !== 'all' && item.type !== filterType) return false;
    return true;
  }), [allItems, filterStatus, filterType]);

  const updateItemStatus = useCallback((id: string, type: ItemType, newStatus: CanonStatus) => {
    const typeToField: Record<ItemType, keyof typeof state> = {
      character: 'characters',
      timeline: 'timeline_events',
      conflict: 'active_conflicts',
      chapter: 'chapters',
      scene: 'scenes',
      world_rule: 'world_rules',
      location: 'locations',
      theme: 'themes',
      open_loop: 'open_loops',
      foreshadowing: 'foreshadowing_elements',
    };
    const field = typeToField[type];
    const items = state[field] as { id: string; canonStatus?: CanonStatus }[];
    updateField(field, items.map(item => item.id === id ? { ...item, canonStatus: newStatus } : item) as StoryState[typeof field]);
  }, [state, updateField]);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <motion.div {...fadeUp}>
        <CarvedHeader
          title={t('title')}
          subtitle={t('subtitle')}
          icon={<Lock size={24} />}
          actions={
            <div className="flex flex-wrap gap-2">
              <ParchmentSelect
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as ItemType | 'all')}
              >
                <option value="all">{t('allTypes')}</option>
                <option value="character">{t('filterType.character')}</option>
                <option value="chapter">{t('filterType.chapter')}</option>
                <option value="scene">{t('filterType.scene')}</option>
                <option value="timeline">{t('filterType.timeline')}</option>
                <option value="conflict">{t('filterType.conflict')}</option>
                <option value="world_rule">{t('filterType.world_rule')}</option>
                <option value="location">{t('filterType.location')}</option>
                <option value="theme">{t('filterType.theme')}</option>
                <option value="open_loop">{t('filterType.open_loop')}</option>
                <option value="foreshadowing">{t('filterType.foreshadowing')}</option>
              </ParchmentSelect>

              <ParchmentSelect
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as CanonStatus | 'all')}
              >
                <option value="all">{t('allStatuses')}</option>
                <option value="confirmed">{tStatus('confirmed')}</option>
                <option value="flexible">{tStatus('flexible')}</option>
                <option value="draft">{tStatus('draft')}</option>
                <option value="discarded">{tStatus('discarded')}</option>
              </ParchmentSelect>
            </div>
          }
        />
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence>
          {filteredItems.map((item, index) => {
            const config = statusConfig[item.status];

            return (
              // Stamp-grid entrance: each item presses down like a rubber
              // stamp (scale 1.3→1 with a slight rotate), staggered.
              <motion.div
                key={`${item.type}-${item.id}`}
                initial={stagger.stampGrid(0).initial}
                animate={stagger.stampGrid(0).animate}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ ...springs.stamp, delay: Math.min(index, 8) * 0.05 }}
                layout
              >
              <ParchmentCard padding="none" className={`p-5 flex flex-col ${config.border}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-sepia-600 uppercase tracking-wider bg-parchment-200 px-2 py-0.5 rounded">
                        {t(`itemType.${item.type}`)}
                      </span>
                      <WaxSealBadge status={item.status} />
                    </div>
                    <h3 className="text-lg font-serif font-semibold text-sepia-900">{item.title}</h3>
                  </div>
                </div>

                <p className="text-sm text-sepia-600 line-clamp-3 mb-4 flex-1">
                  {item.description || <span className="italic opacity-50">{t('noDescription')}</span>}
                </p>

                <div className="flex items-center gap-2 pt-4 border-t border-sepia-300/30 mt-auto">
                  <span className="text-xs text-sepia-600 mr-auto">{t('changeStatus')}</span>
                  {(Object.keys(statusConfig) as CanonStatus[]).map((status) => {
                    const btnConfig = statusConfig[status];
                    const BtnIcon = btnConfig.icon;
                    const isActive = item.status === status;

                    return (
                      <motion.button
                        key={status}
                        onClick={() => updateItemStatus(item.id, item.type, status)}
                        title={tStatus(status)}
                        aria-pressed={isActive}
                        initial={false}
                        // Wax-seal press: the chosen seal slams down and settles
                        animate={isActive ? { scale: [1.35, 0.92, 1], rotate: [-8, 3, 0] } : { scale: 1, rotate: 0 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                        whileTap={{ scale: 0.85 }}
                        className={`p-1.5 rounded-md transition-colors ${
                          isActive
                            ? `${btnConfig.bg} ${btnConfig.color}`
                            : 'text-sepia-600 hover:bg-parchment-200 hover:text-sepia-700'
                        }`}
                      >
                        <BtnIcon size={16} />
                      </motion.button>
                    );
                  })}
                </div>
              </ParchmentCard>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <EmptyState variant="canon" title={t('emptyTitle')} subtitle={t('emptySubtitle')} />
        )}
      </div>
    </div>
  );
}
