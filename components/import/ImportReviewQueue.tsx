'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  X,
  Edit3,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Filter,
  AlertTriangle,
  Sparkles,
  Users,
  Swords,
  MapPin,
  Clock,
  Globe,
  Palette,
  BookOpen,
  CircleDot,
  Eye,
  Shield,
  GitMerge,
} from 'lucide-react';
import { ParchmentCard, InkStampButton } from '@/components/antiquarian';
import type {
  ExtractedData,
  ExtractedCharacter,
  ExtractedConflict,
  ExtractedTimelineEvent,
  ExtractedWorldRule,
  ExtractedLocation,
  ExtractedTheme,
  ExtractedCanonItem,
  ExtractedOpenLoop,
  ExtractedForeshadowing,
  ExtractedChapter,
} from '@/lib/types/extracted-data';

// ─── Types ───

export type ReviewStatus = 'pending' | 'accepted' | 'rejected' | 'merged';

export type EntityCategory =
  | 'chapters'
  | 'characters'
  | 'active_conflicts'
  | 'timeline_events'
  | 'world_rules'
  | 'locations'
  | 'themes'
  | 'canon_items'
  | 'open_loops'
  | 'foreshadowing_elements';

type AnyEntity =
  | ExtractedCharacter
  | ExtractedConflict
  | ExtractedTimelineEvent
  | ExtractedWorldRule
  | ExtractedLocation
  | ExtractedTheme
  | ExtractedCanonItem
  | ExtractedOpenLoop
  | ExtractedForeshadowing
  | ExtractedChapter;

export interface ReviewItem {
  id: string;
  category: EntityCategory;
  label: string;
  subtitle: string;
  confidence: number;
  status: ReviewStatus;
  entity: AnyEntity;
  duplicateOf?: string; // name/title of existing entity if match found
}

interface ImportReviewQueueProps {
  extractedData: ExtractedData;
  existingNames: {
    characters: string[];
    conflicts: string[];
    locations: string[];
    chapters: string[];
    worldRules: string[];
    themes: string[];
  };
  onConfirm: (accepted: ReviewItem[]) => void;
  onCancel: () => void;
}

// ─── Category metadata ───

// Category labels live in the `importPage.category` i18n namespace, keyed by the
// same EntityCategory keys. Icons + colors stay here.
const CATEGORY_META: Record<EntityCategory, { icon: React.ReactNode; color: string }> = {
  chapters: { icon: <BookOpen size={14} />, color: 'text-sepia-700' },
  characters: { icon: <Users size={14} />, color: 'text-forest-700' },
  active_conflicts: { icon: <Swords size={14} />, color: 'text-wax-600' },
  timeline_events: { icon: <Clock size={14} />, color: 'text-brass-700' },
  world_rules: { icon: <Globe size={14} />, color: 'text-sepia-600' },
  locations: { icon: <MapPin size={14} />, color: 'text-forest-600' },
  themes: { icon: <Palette size={14} />, color: 'text-brass-600' },
  canon_items: { icon: <Shield size={14} />, color: 'text-sepia-700' },
  open_loops: { icon: <CircleDot size={14} />, color: 'text-brass-700' },
  foreshadowing_elements: { icon: <Eye size={14} />, color: 'text-forest-700' },
};

type Translator = (key: string, values?: Record<string, string | number>) => string;

// ─── Helpers ───

function normalizeForMatch(s: string): string {
  return s.toLowerCase().trim();
}

function findDuplicate(name: string, existingList: string[]): string | undefined {
  const norm = normalizeForMatch(name);
  return existingList.find(e => normalizeForMatch(e) === norm);
}

function confidenceColor(c: number): string {
  if (c >= 0.9) return 'text-forest-700 bg-forest-600/10';
  if (c >= 0.7) return 'text-brass-700 bg-brass-400/10';
  if (c >= 0.5) return 'text-sepia-600 bg-sepia-300/20';
  return 'text-wax-600 bg-wax-500/10';
}

function confidenceLevelKey(c: number): 'high' | 'good' | 'medium' | 'low' {
  if (c >= 0.9) return 'high';
  if (c >= 0.7) return 'good';
  if (c >= 0.5) return 'medium';
  return 'low';
}

function getEntityLabel(cat: EntityCategory, entity: AnyEntity, t: Translator): string {
  switch (cat) {
    case 'chapters': return (entity as ExtractedChapter).title || t('entityFallback.chapter');
    case 'characters': return (entity as ExtractedCharacter).name || t('entityFallback.character');
    case 'active_conflicts': return (entity as ExtractedConflict).title || (entity as ExtractedConflict).conflict_type || t('entityFallback.conflict');
    case 'timeline_events': return (entity as ExtractedTimelineEvent).event || t('entityFallback.event');
    case 'world_rules': return (entity as ExtractedWorldRule).scope || (entity as ExtractedWorldRule).title || t('entityFallback.rule');
    case 'locations': return (entity as ExtractedLocation).name || t('entityFallback.location');
    case 'themes': return (entity as ExtractedTheme).theme || t('entityFallback.theme');
    case 'canon_items': return (entity as ExtractedCanonItem).description?.slice(0, 60) || t('entityFallback.canonItem');
    case 'open_loops': return (entity as ExtractedOpenLoop).description?.slice(0, 60) || t('entityFallback.openLoop');
    case 'foreshadowing_elements': return (entity as ExtractedForeshadowing).clue || (entity as ExtractedForeshadowing).description?.slice(0, 60) || t('entityFallback.foreshadowing');
  }
}

function getEntitySubtitle(cat: EntityCategory, entity: AnyEntity): string {
  switch (cat) {
    case 'chapters': return (entity as ExtractedChapter).summary?.slice(0, 100) || '';
    case 'characters': {
      const c = entity as ExtractedCharacter;
      return [c.role, c.description?.slice(0, 80)].filter(Boolean).join(' — ');
    }
    case 'active_conflicts': return (entity as ExtractedConflict).description?.slice(0, 100) || '';
    case 'timeline_events': {
      const t = entity as ExtractedTimelineEvent;
      return t.immediate_effect || t.description || '';
    }
    case 'world_rules': return (entity as ExtractedWorldRule).rule || (entity as ExtractedWorldRule).description || '';
    case 'locations': return (entity as ExtractedLocation).description?.slice(0, 100) || '';
    case 'themes': return (entity as ExtractedTheme).evidence?.join(', ')?.slice(0, 100) || '';
    case 'canon_items': return (entity as ExtractedCanonItem).category || '';
    case 'open_loops': return (entity as ExtractedOpenLoop).status || '';
    case 'foreshadowing_elements': return (entity as ExtractedForeshadowing).payoff_status || '';
  }
}

// ─── Build review items from extracted data ───

function buildReviewItems(
  data: ExtractedData,
  existingNames: ImportReviewQueueProps['existingNames'],
  t: Translator,
): ReviewItem[] {
  const items: ReviewItem[] = [];
  let idx = 0;

  const addItems = <T extends AnyEntity>(
    category: EntityCategory,
    entities: T[] | undefined,
    matchList: string[],
    matchKey: (e: T) => string,
  ) => {
    for (const entity of entities || []) {
      const label = getEntityLabel(category, entity, t);
      const dup = findDuplicate(matchKey(entity), matchList);
      items.push({
        id: `${category}-${idx++}`,
        category,
        label,
        subtitle: getEntitySubtitle(category, entity),
        confidence: (entity as { confidence?: number }).confidence ?? 0.7,
        status: 'pending',
        entity,
        duplicateOf: dup,
      });
    }
  };

  addItems('chapters', data.chapters, existingNames.chapters, (e) => (e as ExtractedChapter).title || '');
  addItems('characters', data.characters, existingNames.characters, (e) => (e as ExtractedCharacter).name || '');
  addItems('active_conflicts', data.active_conflicts, existingNames.conflicts, (e) => (e as ExtractedConflict).title || '');
  addItems('timeline_events', data.timeline_events, [], () => '');
  addItems('world_rules', data.world_rules, existingNames.worldRules, (e) => (e as ExtractedWorldRule).rule || '');
  addItems('locations', data.locations, existingNames.locations, (e) => (e as ExtractedLocation).name || '');
  addItems('themes', data.themes, existingNames.themes, (e) => (e as ExtractedTheme).theme || '');
  addItems('canon_items', data.canon_items, [], () => '');
  addItems('open_loops', data.open_loops, [], () => '');
  addItems('foreshadowing_elements', data.foreshadowing_elements, [], () => '');

  return items;
}

// ─── Component ───

export function ImportReviewQueue({
  extractedData,
  existingNames,
  onConfirm,
  onCancel,
}: ImportReviewQueueProps) {
  const t = useTranslations('importPage');
  const tCommon = useTranslations('common');
  const initialItems = useMemo(
    () => buildReviewItems(extractedData, existingNames, t),
    [extractedData, existingNames, t],
  );

  const [items, setItems] = useState<ReviewItem[]>(initialItems);
  const [autoAcceptThreshold, setAutoAcceptThreshold] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<EntityCategory>>(
    () => new Set(Object.keys(CATEGORY_META) as EntityCategory[]),
  );
  const [filterStatus, setFilterStatus] = useState<'all' | ReviewStatus>('all');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Group items by category
  const groupedItems = useMemo(() => {
    const groups = new Map<EntityCategory, ReviewItem[]>();
    for (const item of items) {
      if (filterStatus !== 'all' && item.status !== filterStatus) continue;
      const arr = groups.get(item.category);
      if (arr) arr.push(item);
      else groups.set(item.category, [item]);
    }
    return groups;
  }, [items, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    let accepted = 0, rejected = 0, pending = 0, merged = 0, duplicates = 0;
    for (const item of items) {
      if (item.status === 'accepted') accepted++;
      else if (item.status === 'rejected') rejected++;
      else if (item.status === 'merged') merged++;
      else pending++;
      if (item.duplicateOf) duplicates++;
    }
    return { accepted, rejected, pending, merged, duplicates, total: items.length };
  }, [items]);

  const updateItem = (id: string, status: ReviewStatus) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, status } : item));
  };

  const updateItemEntity = (id: string, entity: AnyEntity) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, entity, label: getEntityLabel(item.category, entity, t) } : item,
    ));
    setEditingId(null);
  };

  const bulkAction = (category: EntityCategory | 'all', status: ReviewStatus) => {
    setItems(prev => prev.map(item => {
      if (category !== 'all' && item.category !== category) return item;
      return { ...item, status };
    }));
  };

  const applyAutoAccept = (threshold: number) => {
    setAutoAcceptThreshold(threshold);
    setItems(prev => prev.map(item => {
      if (item.status !== 'pending') return item;
      if (item.confidence >= threshold && !item.duplicateOf) {
        return { ...item, status: 'accepted' };
      }
      return item;
    }));
  };

  const toggleCategory = (cat: EntityCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleConfirm = () => {
    // Accepted items are added as new; merged items fold into existing entities.
    // Both are "resolved for import"; the page branches on item.status.
    onConfirm(items.filter(i => i.status === 'accepted' || i.status === 'merged'));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      {/* Header Stats Bar */}
      <ParchmentCard className="!p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-sepia-600">
              {t.rich('entitiesExtracted', { count: stats.total, b: (c) => <strong className="text-sepia-800">{c}</strong> })}
            </span>
            <span className="text-forest-700">
              <Check size={14} className="inline -mt-0.5 mr-1" />
              {t('acceptedCount', { count: stats.accepted })}
            </span>
            <span className="text-wax-600">
              <X size={14} className="inline -mt-0.5 mr-1" />
              {t('rejectedCount', { count: stats.rejected })}
            </span>
            {stats.merged > 0 && (
              <span className="text-brass-700">
                <GitMerge size={14} className="inline -mt-0.5 mr-1" />
                {t('mergedCount', { count: stats.merged })}
              </span>
            )}
            <span className="text-sepia-600">
              {t('pendingCount', { count: stats.pending })}
            </span>
            {stats.duplicates > 0 && (
              <span className="text-brass-700">
                <AlertTriangle size={14} className="inline -mt-0.5 mr-1" />
                {t('duplicatesCount', { count: stats.duplicates })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="text-xs bg-parchment-200 border border-sepia-300/50 rounded-lg px-2 py-1.5 text-sepia-700 outline-none"
              aria-label={t('filterAria')}
            >
              <option value="all">{t('filterAll')}</option>
              <option value="pending">{t('filterPending')}</option>
              <option value="accepted">{t('filterAccepted')}</option>
              <option value="rejected">{t('filterRejected')}</option>
            </select>
            <Filter size={14} className="text-sepia-600" />
          </div>
        </div>
      </ParchmentCard>

      {/* Auto-accept threshold */}
      <ParchmentCard className="!p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-brass-600" />
            <span className="text-sm text-sepia-700">{t('autoAccept')}</span>
          </div>
          <div className="flex items-center gap-2">
            {[0.85, 0.9, 0.95].map(threshold => (
              <button
                key={threshold}
                onClick={() => applyAutoAccept(threshold)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  autoAcceptThreshold === threshold
                    ? 'bg-forest-600/10 border-forest-600/30 text-forest-700'
                    : 'bg-parchment-200 border-sepia-300/50 text-sepia-600 hover:border-brass-500/50'
                }`}
              >
                {t('threshold', { percent: Math.round(threshold * 100) })}
              </button>
            ))}
          </div>
        </div>
      </ParchmentCard>

      {/* Bulk actions */}
      <div className="flex items-center gap-2">
        <InkStampButton variant="ghost" size="sm" onClick={() => bulkAction('all', 'accepted')}>
          {t('acceptAll')}
        </InkStampButton>
        <InkStampButton variant="ghost" size="sm" onClick={() => bulkAction('all', 'rejected')}>
          {t('rejectAll')}
        </InkStampButton>
        <InkStampButton variant="ghost" size="sm" onClick={() => bulkAction('all', 'pending')}>
          {t('resetAll')}
        </InkStampButton>
      </div>

      {/* Category groups */}
      {(Object.keys(CATEGORY_META) as EntityCategory[]).map(category => {
        const catItems = groupedItems.get(category);
        if (!catItems || catItems.length === 0) return null;
        const meta = CATEGORY_META[category];
        const isExpanded = expandedCategories.has(category);
        const catAccepted = catItems.filter(i => i.status === 'accepted').length;
        const catRejected = catItems.filter(i => i.status === 'rejected').length;

        return (
          <ParchmentCard key={category}>
            {/* Category header */}
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between p-1 group"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronDown size={16} className="text-sepia-600" /> : <ChevronRight size={16} className="text-sepia-600" />}
                <span className={`${meta.color}`}>{meta.icon}</span>
                <h4 className="text-sm font-medium text-sepia-700 uppercase tracking-wider">{t(`category.${category}`)}</h4>
                <span className="bg-parchment-200 text-sepia-600 px-2 py-0.5 rounded text-xs">
                  {catItems.length}
                </span>
                {catAccepted > 0 && (
                  <span className="text-[10px] text-forest-700 bg-forest-600/10 px-1.5 py-0.5 rounded-full">
                    {t('acceptedCount', { count: catAccepted })}
                  </span>
                )}
                {catRejected > 0 && (
                  <span className="text-[10px] text-wax-600 bg-wax-500/10 px-1.5 py-0.5 rounded-full">
                    {t('rejectedCount', { count: catRejected })}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); bulkAction(category, 'accepted'); }}
                  className="text-[10px] text-forest-700 hover:bg-forest-600/10 px-2 py-1 rounded"
                >
                  {t('catAcceptAll')}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); bulkAction(category, 'rejected'); }}
                  className="text-[10px] text-wax-600 hover:bg-wax-500/10 px-2 py-1 rounded"
                >
                  {t('catRejectAll')}
                </button>
              </div>
            </button>

            {/* Items */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-2 mt-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                    {catItems.map(item => (
                      <ReviewItemRow
                        key={item.id}
                        item={item}
                        isEditing={editingId === item.id}
                        onAccept={() => updateItem(item.id, 'accepted')}
                        onReject={() => updateItem(item.id, 'rejected')}
                        onReset={() => updateItem(item.id, 'pending')}
                        onMerge={() => updateItem(item.id, 'merged')}
                        onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                        onSaveEdit={(entity) => updateItemEntity(item.id, entity)}
                        onCancelEdit={() => setEditingId(null)}
                        t={t}
                        tCommon={tCommon}
                      />
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </ParchmentCard>
        );
      })}

      {/* Footer actions */}
      <div className="flex items-center justify-between pt-6 border-t border-sepia-300/50">
        <div className="text-sm text-sepia-600">
          {t('willImport', { accepted: stats.accepted, total: stats.total })}
          {stats.merged > 0 && (
            <span className="text-brass-700 ml-2">
              {t('willMerge', { count: stats.merged })}
            </span>
          )}
          {stats.pending > 0 && (
            <span className="text-brass-700 ml-2">
              {t('stillPending', { count: stats.pending })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <InkStampButton variant="ghost" onClick={onCancel}>
            {tCommon('cancel')}
          </InkStampButton>
          <InkStampButton
            variant="primary"
            onClick={handleConfirm}
            disabled={stats.accepted === 0 && stats.merged === 0}
            icon={<Check size={18} />}
          >
            {stats.merged > 0
              ? t('importResolved', { count: stats.accepted + stats.merged })
              : t('importAccepted', { count: stats.accepted })}
          </InkStampButton>
        </div>
      </div>
    </div>
  );
}

// ─── Individual review item row ───

interface ReviewItemRowProps {
  item: ReviewItem;
  isEditing: boolean;
  onAccept: () => void;
  onReject: () => void;
  onReset: () => void;
  onMerge: () => void;
  onEdit: () => void;
  onSaveEdit: (entity: AnyEntity) => void;
  onCancelEdit: () => void;
  t: Translator;
  tCommon: Translator;
}

function ReviewItemRow({
  item,
  isEditing,
  onAccept,
  onReject,
  onReset,
  onMerge,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  t,
  tCommon,
}: ReviewItemRowProps) {
  const statusStyles = {
    pending: 'border-sepia-300/30 bg-parchment-200/50',
    accepted: 'border-forest-600/30 bg-forest-600/5',
    rejected: 'border-wax-500/30 bg-wax-500/5 opacity-60',
    merged: 'border-brass-500/40 bg-brass-400/10',
  };

  return (
    <li className={`p-3 rounded-lg border transition-colors ${statusStyles[item.status]}`}>
      <div className="flex items-start gap-3">
        {/* Status indicator */}
        <button
          type="button"
          onClick={item.status === 'accepted' ? onReset : onAccept}
          className="mt-0.5 shrink-0"
          aria-label={item.status === 'accepted' ? t('resetToPending') : t('accept')}
        >
          {item.status === 'accepted' ? (
            <CheckSquare size={18} className="text-forest-700" />
          ) : (
            <Square size={18} className="text-sepia-600 hover:text-forest-600" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-serif font-semibold text-sm ${item.status === 'rejected' ? 'text-sepia-600 line-through' : 'text-sepia-900'}`}>
              {item.label}
            </span>
            {/* Confidence badge */}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${confidenceColor(item.confidence)}`}>
              {t('confidenceBadge', { label: t(`confidence.${confidenceLevelKey(item.confidence)}`), percent: Math.round(item.confidence * 100) })}
            </span>
            {/* Duplicate warning */}
            {item.duplicateOf && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brass-400/15 text-brass-700 flex items-center gap-1">
                <AlertTriangle size={10} /> {t('exists', { name: item.duplicateOf })}
              </span>
            )}
            {/* Status badge */}
            {item.status === 'accepted' && (
              <span className="text-[10px] text-forest-700 bg-forest-600/10 px-1.5 py-0.5 rounded-full">{t('acceptedBadge')}</span>
            )}
            {item.status === 'rejected' && (
              <span className="text-[10px] text-wax-600 bg-wax-500/10 px-1.5 py-0.5 rounded-full">{t('rejectedBadge')}</span>
            )}
            {item.status === 'merged' && (
              <span className="text-[10px] text-brass-700 bg-brass-400/15 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <GitMerge size={10} /> {t('mergedBadge')}
              </span>
            )}
          </div>
          {item.subtitle && (
            <p className="text-xs text-sepia-600 mt-1 line-clamp-2">{item.subtitle}</p>
          )}

          {/* Inline edit form */}
          {isEditing && (
            <InlineEditForm
              item={item}
              onSave={onSaveEdit}
              onCancel={onCancelEdit}
              t={t}
              tCommon={tCommon}
            />
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="p-1.5 text-sepia-600 hover:text-brass-600 hover:bg-brass-400/10 rounded transition-colors"
            aria-label={t('edit')}
          >
            <Edit3 size={14} />
          </button>
          {/* Merge is only meaningful for items that duplicate an existing entity */}
          {item.duplicateOf && item.status !== 'merged' && (
            <button
              type="button"
              onClick={onMerge}
              className="p-1.5 text-sepia-600 hover:text-brass-700 hover:bg-brass-400/15 rounded transition-colors"
              aria-label={t('mergeAria', { name: item.duplicateOf })}
              title={t('mergeAria', { name: item.duplicateOf })}
            >
              <GitMerge size={14} />
            </button>
          )}
          {item.status !== 'accepted' && (
            <button
              type="button"
              onClick={onAccept}
              className="p-1.5 text-sepia-600 hover:text-forest-600 hover:bg-forest-600/10 rounded transition-colors"
              aria-label={t('accept')}
            >
              <Check size={14} />
            </button>
          )}
          {item.status !== 'rejected' && (
            <button
              type="button"
              onClick={onReject}
              className="p-1.5 text-sepia-600 hover:text-wax-600 hover:bg-wax-500/10 rounded transition-colors"
              aria-label={t('reject')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// ─── Inline edit form ───

interface InlineEditFormProps {
  item: ReviewItem;
  onSave: (entity: AnyEntity) => void;
  onCancel: () => void;
  t: Translator;
  tCommon: Translator;
}

function InlineEditForm({ item, onSave, onCancel, t, tCommon }: InlineEditFormProps) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    () => ({ ...item.entity }) as Record<string, unknown>,
  );

  const fields = getEditableFields(item.category);

  const handleSave = () => {
    onSave(draft as AnyEntity);
  };

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="mt-3 pt-3 border-t border-sepia-300/30 space-y-2"
    >
      {fields.map((key) => (
        <div key={key}>
          <label className="text-[10px] text-sepia-600 uppercase tracking-wider block mb-0.5">
            {t(`field.${key}`)}
          </label>
          {typeof draft[key] === 'string' && (draft[key] as string).length > 80 ? (
            <textarea
              value={(draft[key] as string) || ''}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              className="w-full bg-parchment-100 border border-sepia-300/50 focus:border-brass-500/60 rounded text-xs text-sepia-800 outline-none px-2 py-1.5 resize-none h-16"
            />
          ) : (
            <input
              type="text"
              value={String(draft[key] ?? '')}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              className="w-full bg-parchment-100 border border-sepia-300/50 focus:border-brass-500/60 rounded text-xs text-sepia-800 outline-none px-2 py-1.5"
            />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          className="text-xs text-forest-700 hover:bg-forest-600/10 px-3 py-1.5 rounded border border-forest-600/30"
        >
          {tCommon('save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-sepia-600 hover:bg-sepia-300/20 px-3 py-1.5 rounded"
        >
          {tCommon('cancel')}
        </button>
      </div>
    </motion.div>
  );
}

// ─── Editable fields per category ───

// Returns the editable field keys per category; labels are resolved via the
// `importPage.field.*` i18n namespace at render time.
function getEditableFields(category: EntityCategory): string[] {
  switch (category) {
    case 'chapters': return ['title', 'summary'];
    case 'characters': return ['name', 'role', 'description'];
    case 'active_conflicts': return ['title', 'description', 'status'];
    case 'timeline_events': return ['event', 'immediate_effect', 'latent_effect'];
    case 'world_rules': return ['scope', 'rule'];
    case 'locations': return ['name', 'description', 'importance'];
    case 'themes': return ['theme'];
    case 'canon_items': return ['category', 'description'];
    case 'open_loops': return ['description', 'status'];
    case 'foreshadowing_elements': return ['clue', 'description'];
  }
}
