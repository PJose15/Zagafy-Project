'use client';

import { useState, useMemo } from 'react';
import { ParchmentCard } from '@/components/antiquarian';
import { Search, Users, MapPin, CalendarDays, Swords } from 'lucide-react';
import { motion } from 'motion/react';
import { stagger } from '@/lib/animations';
import type { EntityCatalogEntry, EntityType } from '@/lib/story-brain/types';

const TYPE_ICONS: Record<EntityType, React.FC<{ size?: number; className?: string }>> = {
  character: Users,
  location: MapPin,
  event: CalendarDays,
  conflict: Swords,
};

const TYPE_LABELS: Record<EntityType, string> = {
  character: 'Characters',
  location: 'Locations',
  event: 'Events',
  conflict: 'Conflicts',
};

interface EntityCatalogProps {
  entities: EntityCatalogEntry[];
  onSelect?: (entity: EntityCatalogEntry) => void;
}

export function EntityCatalog({ entities, onSelect }: EntityCatalogProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<EntityType | 'all'>('all');

  const filtered = useMemo(() => {
    let result = entities;
    if (filterType !== 'all') {
      result = result.filter(e => e.type === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => e.name.toLowerCase().includes(q));
    }
    return result.sort((a, b) => b.mentionCount - a.mentionCount);
  }, [entities, search, filterType]);

  const grouped = useMemo(() => {
    const groups: Record<EntityType, EntityCatalogEntry[]> = {
      character: [], location: [], event: [], conflict: [],
    };
    for (const e of filtered) {
      groups[e.type].push(e);
    }
    return groups;
  }, [filtered]);

  const types: EntityType[] = ['character', 'location', 'event', 'conflict'];

  return (
    <div className="space-y-4">
      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sepia-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entities..."
            aria-label="Search entities"
            className="w-full pl-9 pr-3 py-2 bg-parchment-200 border border-sepia-300/40 rounded-lg text-sm text-sepia-900 focus:outline-none focus:border-brass-500/60"
          />
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setFilterType('all')}
            aria-pressed={filterType === 'all'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterType === 'all' ? 'bg-brass-500 text-cream-50' : 'text-sepia-600 hover:bg-parchment-200'
            }`}
          >
            All
          </button>
          {types.map(type => {
            const Icon = TYPE_ICONS[type];
            return (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                aria-pressed={filterType === type}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                  filterType === type ? 'bg-brass-500 text-cream-50' : 'text-sepia-600 hover:bg-parchment-200'
                }`}
              >
                <Icon size={12} />
                {TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Entity List */}
      {filtered.length === 0 ? (
        <p className="text-sm text-sepia-600 text-center py-8">No entities found.</p>
      ) : (
        filterType === 'all' ? (
          types.map(type => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const GroupIcon = TYPE_ICONS[type];
            return (
              <div key={type} className="space-y-2">
                <h3 className="text-xs font-medium text-sepia-600 uppercase tracking-wider flex items-center gap-2">
                  <GroupIcon size={14} />
                  {TYPE_LABELS[type]} ({items.length})
                </h3>
                <div className="space-y-1.5">
                  {items.map((entity, i) => (
                    <EntityRow key={entity.id} entity={entity} index={i} onClick={() => onSelect?.(entity)} />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="space-y-1.5">
            {filtered.map((entity, i) => (
              <EntityRow key={entity.id} entity={entity} index={i} onClick={() => onSelect?.(entity)} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function EntityRow({ entity, index, onClick }: { entity: EntityCatalogEntry; index: number; onClick?: () => void }) {
  return (
    <motion.div {...stagger.cards(index)}>
      <ParchmentCard
        padding="sm"
        hover
        className="cursor-pointer"
        onClick={onClick}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-sepia-800 truncate">{entity.name}</span>
            {entity.canonStatus && entity.canonStatus !== 'draft' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                entity.canonStatus === 'confirmed' ? 'bg-forest-700/10 text-forest-700' :
                entity.canonStatus === 'flexible' ? 'bg-brass-500/10 text-brass-600' :
                'bg-wax-500/10 text-wax-600'
              }`}>
                {entity.canonStatus}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[10px] font-mono text-sepia-600">{entity.mentionCount} mentions</span>
            {entity.firstAppearanceChapter >= 0 && (
              <span className="text-[10px] font-mono text-sepia-600">Ch.{entity.firstAppearanceChapter + 1}</span>
            )}
          </div>
        </div>
      </ParchmentCard>
    </motion.div>
  );
}
