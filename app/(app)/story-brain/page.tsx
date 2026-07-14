'use client';

import { useState, useDeferredValue } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { CarvedHeader, ParchmentCard, FeatureErrorBoundary } from '@/components/antiquarian';
import { useStoryBrain } from '@/hooks/use-story-brain';
import { EntityCatalog } from '@/components/story-brain/entity-catalog';
import { EntityDetailCard } from '@/components/story-brain/entity-detail-card';
import { InconsistencyAlert } from '@/components/story-brain/inconsistency-alert';
import { RelationshipMatrix } from '@/components/story-brain/relationship-matrix';
import { PlotHolePanel } from '@/components/story-brain/plot-hole-panel';
import type { EntityCatalogEntry } from '@/lib/story-brain/types';

type Tab = 'entities' | 'relationships' | 'alerts' | 'plot-holes';

export default function StoryBrainPage() {
  const t = useTranslations('storyBrain');
  const {
    analysis,
    inconsistencies,
    plotHoles,
    resolutions,
    unresolvedCount,
    unresolvedPlotHoleCount,
    resolve,
    unresolve,
  } = useStoryBrain();

  // M2: Defer heavy analysis results so the shell renders immediately
  const deferredAnalysis = useDeferredValue(analysis);
  const isStale = deferredAnalysis !== analysis;

  const [activeTab, setActiveTab] = useState<Tab>('entities');
  const [selectedEntity, setSelectedEntity] = useState<EntityCatalogEntry | null>(null);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'entities', label: t('tabs.entities'), badge: deferredAnalysis.entities.length },
    { id: 'relationships', label: t('tabs.relationships'), badge: deferredAnalysis.relationships.length },
    { id: 'alerts', label: t('tabs.alerts'), badge: unresolvedCount },
    { id: 'plot-holes', label: t('tabs.plotHoles'), badge: unresolvedPlotHoleCount },
  ];

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <CarvedHeader
        title={t('title')}
        subtitle={t('subtitle', { entities: deferredAnalysis.entities.length, issues: unresolvedCount + unresolvedPlotHoleCount })}
      />

      {/* Summary Stats — M2: dim while deferred value is stale */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 transition-opacity ${isStale ? 'opacity-60' : ''}`}>
        <ParchmentCard padding="sm">
          <span className="text-[10px] text-sepia-600 block">{t('stats.characters')}</span>
          <span className="text-lg font-mono text-sepia-800">{deferredAnalysis.entityCountByType.character}</span>
        </ParchmentCard>
        <ParchmentCard padding="sm">
          <span className="text-[10px] text-sepia-600 block">{t('stats.locations')}</span>
          <span className="text-lg font-mono text-sepia-800">{deferredAnalysis.entityCountByType.location}</span>
        </ParchmentCard>
        <ParchmentCard padding="sm">
          <span className="text-[10px] text-sepia-600 block">{t('stats.relationships')}</span>
          <span className="text-lg font-mono text-sepia-800">{deferredAnalysis.relationships.length}</span>
        </ParchmentCard>
        <ParchmentCard padding="sm">
          <span className="text-[10px] text-sepia-600 block">{t('stats.totalMentions')}</span>
          <span className="text-lg font-mono text-sepia-800">{deferredAnalysis.totalMentions}</span>
        </ParchmentCard>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-sepia-300/30 pb-0" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative ${
              activeTab === tab.id
                ? 'bg-parchment-100 text-sepia-900 border border-sepia-300/30 border-b-transparent -mb-px'
                : 'text-sepia-600 hover:text-sepia-700 hover:bg-parchment-200/50'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={`ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                tab.id === 'alerts' || tab.id === 'plot-holes'
                  ? 'bg-wax-500/10 text-wax-600'
                  : 'bg-brass-500/10 text-brass-600'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content — M2: dim while deferred value is stale */}
      <div role="tabpanel" className={`transition-opacity ${isStale ? 'opacity-60' : ''}`}>
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
        {activeTab === 'entities' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={selectedEntity ? 'lg:col-span-2' : 'lg:col-span-3'}>
              <FeatureErrorBoundary title={t('entityCatalogTitle')}>
                <EntityCatalog
                  entities={deferredAnalysis.entities}
                  onSelect={setSelectedEntity}
                />
              </FeatureErrorBoundary>
            </div>
            {selectedEntity && (
              <div>
                <EntityDetailCard
                  entity={selectedEntity}
                  relationships={deferredAnalysis.relationships}
                  onClose={() => setSelectedEntity(null)}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'relationships' && (
          <ParchmentCard padding="lg">
            <RelationshipMatrix relationships={deferredAnalysis.relationships} />
          </ParchmentCard>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-2">
            {inconsistencies.length === 0 ? (
              <p className="text-sm text-sepia-600 text-center py-8">{t('noInconsistencies')}</p>
            ) : (
              inconsistencies.map(inc => (
                <InconsistencyAlert
                  key={inc.id}
                  inconsistency={inc}
                  resolution={resolutions.find(r => r.inconsistencyId === inc.id)}
                  onResolve={resolve}
                  onUnresolve={unresolve}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'plot-holes' && (
          <FeatureErrorBoundary title={t('plotHolesTitle')}>
          <PlotHolePanel
            plotHoles={plotHoles}
            resolutions={resolutions}
            onResolve={resolve}
            onUnresolve={unresolve}
          />
          </FeatureErrorBoundary>
        )}
        </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
