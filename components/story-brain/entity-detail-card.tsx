'use client';

import { ParchmentCard, ProgressRing } from '@/components/antiquarian';
import { X } from 'lucide-react';
import type { EntityCatalogEntry, RelationshipPair } from '@/lib/story-brain/types';

interface EntityDetailCardProps {
  entity: EntityCatalogEntry;
  relationships: RelationshipPair[];
  onClose: () => void;
}

export function EntityDetailCard({ entity, relationships, onClose }: EntityDetailCardProps) {
  const entityRelationships = relationships.filter(
    r => r.sourceId === entity.id || r.targetId === entity.id
  );

  return (
    <ParchmentCard padding="lg" className="relative">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-1 text-sepia-600 hover:text-sepia-700 rounded"
        aria-label="Close detail"
      >
        <X size={16} />
      </button>

      <h3 className="text-lg font-serif font-semibold text-sepia-900 mb-1">{entity.name}</h3>
      <p className="text-xs text-sepia-600 uppercase tracking-wider mb-4">{entity.type}</p>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <span className="text-[10px] text-sepia-600 block">Mentions</span>
          <span className="text-lg font-mono text-sepia-800">{entity.mentionCount}</span>
        </div>
        <div>
          <span className="text-[10px] text-sepia-600 block">First</span>
          <span className="text-lg font-mono text-sepia-800">
            {entity.firstAppearanceChapter >= 0 ? `Ch.${entity.firstAppearanceChapter + 1}` : '—'}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-sepia-600 block">Last</span>
          <span className="text-lg font-mono text-sepia-800">
            {entity.lastAppearanceChapter >= 0 ? `Ch.${entity.lastAppearanceChapter + 1}` : '—'}
          </span>
        </div>
      </div>

      {entityRelationships.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-sepia-600 uppercase tracking-wider mb-2">Relationships</h4>
          <div className="space-y-2">
            {entityRelationships.map(rel => {
              const otherName = rel.sourceId === entity.id ? rel.targetName : rel.sourceName;
              return (
                <div key={`${rel.sourceId}-${rel.targetId}`} className="flex items-center gap-3 p-2 bg-parchment-200/50 rounded-lg">
                  <span className="text-sm text-sepia-800 flex-1">{otherName}</span>
                  <div className="flex items-center gap-2">
                    <ProgressRing value={rel.trustLevel} label="Trust" size="sm" />
                    <ProgressRing value={rel.tensionLevel} label="Tension" size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ParchmentCard>
  );
}
