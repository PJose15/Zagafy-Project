'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useStory, type CharacterState } from '@/lib/store';
import type {
  ExtractedData,
  ExtractedChapter,
  ExtractedCharacter,
  ExtractedCharacterState,
  ExtractedRelationship,
  ExtractedConflict,
  ExtractedTimelineEvent,
  ExtractedWorldRule,
  ExtractedLocation,
  ExtractedTheme,
  ExtractedCanonItem,
  ExtractedAmbiguity,
  ExtractedOpenLoop,
  ExtractedForeshadowing,
  ExtractedScene,
} from '@/lib/types/extracted-data';
import { UploadCloud, FileText, CheckCircle2, Loader2, ArrowRight, X, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@/components/toast';
import { CarvedHeader, ParchmentCard, BrassButton, InkStampButton } from '@/components/antiquarian';
import { ImportReviewQueue, type ReviewItem } from '@/components/import/ImportReviewQueue';
import { mergeFill, normalizeForMatch } from '@/lib/import/mergeEntities';

export default function ImportPage() {
  const t = useTranslations('importPage');
  const { state, updateField } = useStory();
  const { toast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'analyzing' | 'review' | 'success'>('idle');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Existing entity names for duplicate detection
  const existingNames = useMemo(() => ({
    characters: state.characters.map(c => c.name),
    conflicts: state.active_conflicts.map(c => c.title),
    locations: (state.locations || []).map(l => l.name),
    chapters: state.chapters.map(c => c.title),
    worldRules: state.world_rules.map(r => r.rule),
    themes: (state.themes || []).map(t => t.theme),
  }), [state.characters, state.active_conflicts, state.locations, state.chapters, state.world_rules, state.themes]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...files];
    if (direction === 'up' && index > 0) {
      [newFiles[index - 1], newFiles[index]] = [newFiles[index], newFiles[index - 1]];
    } else if (direction === 'down' && index < newFiles.length - 1) {
      [newFiles[index + 1], newFiles[index]] = [newFiles[index], newFiles[index + 1]];
    }
    setFiles(newFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadStatus('uploading');

    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    formData.append('language', state.language || 'English');

    try {
      setUploadStatus('analyzing');
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const res = await fetch('/api/ingest', {
        method: 'POST',
        body: formData,
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t('parseError'));
      }

      const data = await res.json();
      setExtractedData(data.extractedData || {});
      setUploadStatus('review');
    } catch (error: unknown) {
      toast(error instanceof Error ? error.message : t('ingestError'), 'error');
      setUploadStatus('idle');
    } finally {
      setIsUploading(false);
    }
  };

  // CB-11: Handle confirmed import from the review queue. Accepted items are
  // added as new entities; merged items (duplicates of existing entities) fold
  // their details into the existing entity non-destructively.
  const handleReviewConfirm = useCallback((resolvedItems: ReviewItem[]) => {
    // Deduplicates incoming against existing AND against itself. O(n+m).
    const dedup = <T,>(existing: T[], incoming: T[], key: keyof T): T[] => {
      const normalize = (item: T) => String(item[key] ?? '').toLowerCase().trim();
      const seen = new Set<string>(existing.map(normalize));
      const out: T[] = [];
      for (const item of incoming) {
        const k = normalize(item);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(item);
      }
      return out;
    };
    if (!extractedData) return;

    // Group accepted items by category, extracting entity data
    const accepted = {
      chapters: [] as ExtractedChapter[],
      characters: [] as ExtractedCharacter[],
      active_conflicts: [] as ExtractedConflict[],
      timeline_events: [] as ExtractedTimelineEvent[],
      world_rules: [] as ExtractedWorldRule[],
      locations: [] as ExtractedLocation[],
      themes: [] as ExtractedTheme[],
      canon_items: [] as ExtractedCanonItem[],
      open_loops: [] as ExtractedOpenLoop[],
      foreshadowing_elements: [] as ExtractedForeshadowing[],
    };

    // CB-11 merge: build non-destructive field patches for merged duplicates,
    // keyed by the normalized name/title of the existing entity they matched.
    // Only the six categories with duplicate detection can be merged.
    type Patch = Record<string, unknown>;
    const mergePatches = {
      characters: new Map<string, Patch>(),
      chapters: new Map<string, Patch>(),
      active_conflicts: new Map<string, Patch>(),
      world_rules: new Map<string, Patch>(),
      locations: new Map<string, Patch>(),
      themes: new Map<string, Patch>(),
    };
    const addMergePatch = (item: ReviewItem) => {
      if (!item.duplicateOf) return;
      const key = normalizeForMatch(item.duplicateOf);
      switch (item.category) {
        case 'characters': { const c = item.entity as ExtractedCharacter; mergePatches.characters.set(key, { role: c.role, description: c.description, coreIdentity: c.core_traits?.join(', ') }); break; }
        case 'chapters': { const c = item.entity as ExtractedChapter; mergePatches.chapters.set(key, { summary: c.summary, content: c.raw_text_reference }); break; }
        case 'active_conflicts': { const c = item.entity as ExtractedConflict; mergePatches.active_conflicts.set(key, { description: c.description }); break; }
        case 'world_rules': { const w = item.entity as ExtractedWorldRule; mergePatches.world_rules.set(key, { category: w.scope, rule: w.rule }); break; }
        case 'locations': { const l = item.entity as ExtractedLocation; mergePatches.locations.set(key, { description: l.description, importance: l.importance, associatedRules: l.associated_rules }); break; }
        case 'themes': { const th = item.entity as ExtractedTheme; mergePatches.themes.set(key, { evidence: th.evidence }); break; }
      }
    };

    for (const item of resolvedItems) {
      if (item.status === 'merged') { addMergePatch(item); continue; }
      switch (item.category) {
        case 'chapters': accepted.chapters.push(item.entity as ExtractedChapter); break;
        case 'characters': accepted.characters.push(item.entity as ExtractedCharacter); break;
        case 'active_conflicts': accepted.active_conflicts.push(item.entity as ExtractedConflict); break;
        case 'timeline_events': accepted.timeline_events.push(item.entity as ExtractedTimelineEvent); break;
        case 'world_rules': accepted.world_rules.push(item.entity as ExtractedWorldRule); break;
        case 'locations': accepted.locations.push(item.entity as ExtractedLocation); break;
        case 'themes': accepted.themes.push(item.entity as ExtractedTheme); break;
        case 'canon_items': accepted.canon_items.push(item.entity as ExtractedCanonItem); break;
        case 'open_loops': accepted.open_loops.push(item.entity as ExtractedOpenLoop); break;
        case 'foreshadowing_elements': accepted.foreshadowing_elements.push(item.entity as ExtractedForeshadowing); break;
      }
    }

    // Apply merge patches to the existing entities (fill empties, union arrays).
    const applyMerges = <T extends object>(
      existing: T[], matchField: keyof T, patches: Map<string, Patch>,
    ): T[] => {
      if (patches.size === 0) return existing;
      return existing.map(e => {
        const patch = patches.get(normalizeForMatch(String(e[matchField] ?? '')));
        return patch ? mergeFill(e, patch as Partial<T>) : e;
      });
    };
    const baseCharacters = applyMerges(state.characters, 'name', mergePatches.characters);
    const baseChapters = applyMerges(state.chapters, 'title', mergePatches.chapters);
    const baseConflicts = applyMerges(state.active_conflicts, 'title', mergePatches.active_conflicts);
    const baseWorldRules = applyMerges(state.world_rules, 'rule', mergePatches.world_rules);
    const baseLocations = applyMerges(state.locations || [], 'name', mergePatches.locations);
    const baseThemes = applyMerges(state.themes || [], 'theme', mergePatches.themes);

    // Use full extracted data for relationships and character states (linked data)
    const rawRelationships = extractedData.relationships || [];
    const rawCharacterStates = extractedData.character_states || [];

    // Pre-index: character name/id → stable UUID (O(C))
    const charIdMap = new Map<string, string>();
    for (const c of accepted.characters) {
      if (!c.name) continue;
      const id = c.character_id || crypto.randomUUID();
      charIdMap.set(c.name, id);
      charIdMap.set(c.name.toLowerCase(), id);
      if (c.character_id) charIdMap.set(c.character_id, id);
    }
    const resolveCharId = (ref: string): string | undefined =>
      charIdMap.get(ref) || charIdMap.get(ref.toLowerCase());

    const charByRef = new Map<string, ExtractedCharacter>();
    for (const c of accepted.characters) {
      if (c.name) charByRef.set(c.name, c);
      if (c.character_id) charByRef.set(c.character_id, c);
    }

    const stateByRef = new Map<string, ExtractedCharacterState>();
    for (const s of rawCharacterStates) {
      if (s.character_id) stateByRef.set(s.character_id, s);
      if (s.name) stateByRef.set(s.name, s);
    }

    const relsBySource = new Map<string, ExtractedRelationship[]>();
    const relsByTarget = new Map<string, ExtractedRelationship[]>();
    const pushRel = (map: Map<string, ExtractedRelationship[]>, key: string | undefined, rel: ExtractedRelationship) => {
      if (!key) return;
      const arr = map.get(key);
      if (arr) arr.push(rel);
      else map.set(key, [rel]);
    };
    for (const r of rawRelationships) {
      pushRel(relsBySource, r.character_1, r);
      pushRel(relsByTarget, r.character_2, r);
    }
    const getRelsFor = (map: Map<string, ExtractedRelationship[]>, name?: string, id?: string): ExtractedRelationship[] => {
      const a = name ? map.get(name) : undefined;
      const b = id && id !== name ? map.get(id) : undefined;
      if (a && b) return [...a, ...b];
      return a || b || [];
    };

    // Merge Characters
    const newCharacters = accepted.characters.map((c: ExtractedCharacter) => {
      const charState = (c.character_id && stateByRef.get(c.character_id)) || (c.name ? stateByRef.get(c.name) : undefined);
      const charId = charIdMap.get(c.name!) || crypto.randomUUID();

      const relsAsSource = getRelsFor(relsBySource, c.name, c.character_id)
        .map((r: ExtractedRelationship) => {
          const resolvedId = resolveCharId(r.character_2!);
          if (!resolvedId) return null;
          const targetChar = charByRef.get(r.character_2!);
          return {
            targetId: resolvedId,
            targetName: targetChar?.name || r.character_2,
            trustLevel: r.trust_level || 50,
            tensionLevel: r.tension_level || 50,
            dynamics: r.current_dynamic || r.relationship_type || ''
          };
        }).filter(Boolean);

      const relsAsTarget = getRelsFor(relsByTarget, c.name, c.character_id)
        .map((r: ExtractedRelationship) => {
          const resolvedId = resolveCharId(r.character_1!);
          if (!resolvedId) return null;
          const sourceChar = charByRef.get(r.character_1!);
          return {
            targetId: resolvedId,
            targetName: sourceChar?.name || r.character_1,
            trustLevel: r.trust_level || 50,
            tensionLevel: r.tension_level || 50,
            dynamics: r.current_dynamic || r.relationship_type || ''
          };
        }).filter(Boolean);

      const seenTargets = new Set<string>();
      const allRels = [...relsAsSource, ...relsAsTarget].filter((r): r is NonNullable<typeof r> => r !== null);
      const rels = allRels.filter(r => {
        if (seenTargets.has(r.targetId)) return false;
        seenTargets.add(r.targetId);
        return true;
      });

      return {
        id: charId,
        name: c.name!,
        role: c.role || '',
        description: c.description || '',
        coreIdentity: c.core_traits ? c.core_traits.join(', ') : '',
        relationships: '',
        canonStatus: 'draft' as const,
        source: 'ai-inferred' as const,
        currentState: {
          indicator: 'stable' as const,
          pressureLevel: (charState?.current_pressure_level || 'Low') as CharacterState['pressureLevel'],
          emotionalState: charState?.current_emotional_state || '',
          visibleGoal: charState?.visible_goal || '',
          hiddenNeed: charState?.hidden_need || '',
          currentFear: charState?.current_fear || '',
          dominantBelief: charState?.dominant_belief || '',
          emotionalWound: charState?.emotional_wound || '',
          currentKnowledge: charState?.current_knowledge || ''
        },
        dynamicRelationships: rels,
        stateHistory: []
      };
    });

    const newChapters = accepted.chapters.map((c: ExtractedChapter, idx: number) => ({
      id: c.chapter_id || crypto.randomUUID(),
      title: c.title || t('chapterFallback', { n: idx + 1 }),
      summary: c.summary || '',
      content: c.raw_text_reference || '',
      canonStatus: 'draft' as const,
      source: 'ai-inferred' as const,
    }));

    // Scenes are linked to chapters — import all scenes for accepted chapters
    const acceptedChapterIds = new Set(accepted.chapters.map(c => c.chapter_id).filter(Boolean));
    const newScenes = (extractedData.scenes || [])
      .filter((s: ExtractedScene) => !s.chapter_id || acceptedChapterIds.has(s.chapter_id))
      .map((s: ExtractedScene) => ({
        id: s.scene_id || crypto.randomUUID(),
        chapterId: s.chapter_id || '',
        title: t('sceneTitle', { n: s.order_index || '' }),
        summary: s.summary || '',
        content: '',
        canonStatus: 'draft' as const,
        source: 'ai-inferred' as const,
      }));

    const newConflicts = accepted.active_conflicts.map((c: ExtractedConflict) => ({
      id: c.conflict_id || crypto.randomUUID(),
      title: c.title || c.conflict_type || t('conflictFallback'),
      description: c.description || '',
      status: c.status === 'resolved' ? 'resolved' as const : 'active' as const,
      canonStatus: 'draft' as const,
      source: 'ai-inferred' as const,
    }));

    const newTimelineEvents = accepted.timeline_events.map((t: ExtractedTimelineEvent) => ({
      id: t.timeline_event_id || crypto.randomUUID(),
      date: t.event || '',
      description: t.immediate_effect || '',
      impact: t.latent_effect || '',
      canonStatus: 'draft' as const,
      source: 'ai-inferred' as const,
    }));

    const newWorldRules = accepted.world_rules.map((w: ExtractedWorldRule) => ({
      id: w.world_rule_id || crypto.randomUUID(),
      category: w.scope || 'Lore',
      rule: w.rule || '',
      canonStatus: 'draft' as const,
      source: 'ai-inferred' as const,
    }));

    const newLocations = accepted.locations.map((l: ExtractedLocation) => ({
      id: l.location_id || crypto.randomUUID(),
      name: l.name || '',
      description: l.description || '',
      importance: l.importance || 'medium',
      associatedRules: l.associated_rules || [],
      canonStatus: 'draft' as const,
      source: 'ai-inferred' as const,
    }));

    const newThemes = accepted.themes.map((t: ExtractedTheme) => ({
      id: t.theme_id || crypto.randomUUID(),
      theme: t.theme || '',
      evidence: t.evidence || [],
      canonStatus: 'draft' as const,
      source: 'ai-inferred' as const,
    }));

    const newCanonItems = accepted.canon_items.map((c: ExtractedCanonItem) => ({
      id: c.canon_item_id || crypto.randomUUID(),
      category: c.category || 'other',
      description: c.description || '',
      status: c.status || 'draft_idea',
      sourceReference: c.source_reference || ''
    }));

    // Ambiguities are always imported (informational, not entity data)
    const newAmbiguities = (extractedData.ambiguities || []).map((a: ExtractedAmbiguity) => ({
      id: a.ambiguity_id || crypto.randomUUID(),
      issue: a.issue || '',
      affectedSection: a.affected_section || '',
      confidence: a.confidence || 'medium',
      recommendedReview: a.recommended_review || ''
    }));

    const newOpenLoops = accepted.open_loops.map((l: ExtractedOpenLoop) => ({
      id: l.loop_id || crypto.randomUUID(),
      description: l.description || '',
      status: l.status === 'resolved' ? 'closed' as const : 'open' as const,
      canonStatus: 'draft' as const,
      source: 'ai-inferred' as const,
    }));

    const newForeshadowing = accepted.foreshadowing_elements.map((f: ExtractedForeshadowing) => ({
      id: f.foreshadowing_id || crypto.randomUUID(),
      clue: f.clue || '',
      payoff: f.payoff_status || '',
      canonStatus: 'draft' as const,
      source: 'ai-inferred' as const,
    }));

    // Apply merges (updated existing entities) + deduped new accepted entities.
    updateField('characters', [...baseCharacters, ...dedup(baseCharacters, newCharacters, 'name')]);
    updateField('chapters', [...baseChapters, ...dedup(baseChapters, newChapters, 'title')]);
    updateField('scenes', [...state.scenes, ...dedup(state.scenes, newScenes, 'title')]);
    updateField('active_conflicts', [...baseConflicts, ...dedup(baseConflicts, newConflicts, 'title')]);
    updateField('timeline_events', [...state.timeline_events, ...dedup(state.timeline_events, newTimelineEvents, 'description')]);
    updateField('world_rules', [...baseWorldRules, ...dedup(baseWorldRules, newWorldRules, 'rule')]);
    updateField('locations', [...baseLocations, ...dedup(baseLocations, newLocations, 'name')]);
    updateField('themes', [...baseThemes, ...dedup(baseThemes, newThemes, 'theme')]);
    updateField('canon_items', [...(state.canon_items || []), ...dedup(state.canon_items || [], newCanonItems, 'description')]);
    updateField('ambiguities', [...(state.ambiguities || []), ...dedup(state.ambiguities || [], newAmbiguities, 'issue')]);
    updateField('open_loops', [...state.open_loops, ...dedup(state.open_loops, newOpenLoops, 'description')]);
    updateField('foreshadowing_elements', [...state.foreshadowing_elements, ...dedup(state.foreshadowing_elements, newForeshadowing, 'clue')]);

    // Project metadata
    if (extractedData.project?.title && state.title === 'Untitled Project') {
      updateField('title', extractedData.project.title);
    }
    if (extractedData.project?.summary_global && !state.synopsis) {
      updateField('synopsis', extractedData.project.summary_global);
    }
    if (extractedData.project?.genre?.length && state.genre.length === 0) {
      updateField('genre', extractedData.project.genre);
    }
    if (!state.style_profile) {
      const parts = [
        extractedData.project?.tone_profile && t('tonePrefix', { value: extractedData.project.tone_profile }),
        extractedData.project?.narrative_pov && t('povPrefix', { value: extractedData.project.narrative_pov }),
      ].filter(Boolean);
      if (parts.length) updateField('style_profile', parts.join('. '));
    }

    setImportedCount(resolvedItems.length);
    setUploadStatus('success');
    toast(t('toastImported', { count: resolvedItems.length }), 'success');
  }, [extractedData, state, updateField, toast, t]);

  const reset = () => {
    setFiles([]);
    setUploadStatus('idle');
    setExtractedData(null);
    setImportedCount(0);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <CarvedHeader
        title={t('title')}
        subtitle={t('subtitle')}
        icon={<UploadCloud size={24} />}
      />

      {uploadStatus === 'idle' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-sepia-300/60 hover:border-brass-500 bg-parchment-100/50 rounded-xl p-12 text-center transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <div className="flex justify-center mb-4">
              <div className="bg-parchment-200 p-4 rounded-full text-sepia-600">
                <UploadCloud size={32} />
              </div>
            </div>
            <h3 className="text-lg font-medium text-sepia-800 mb-2">{t('dragDrop')}</h3>
            <p className="text-sm text-sepia-600 mb-6">{t('supports')}</p>
            <BrassButton>
              {t('browseFiles')}
            </BrassButton>
          </div>

          {files.length > 0 && (
            <ParchmentCard>
              <h4 className="text-sm font-medium text-sepia-600 uppercase tracking-wider mb-4">{t('selectedFiles')}</h4>
              <ul className="space-y-3 mb-6">
                {files.map((file, idx) => (
                  <li key={idx} className="flex items-center justify-between bg-parchment-200 p-3 rounded-lg border border-sepia-300/30">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-brass-500" />
                      <span className="text-sm text-sepia-800 font-medium">{file.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-sepia-600">{t('fileSize', { size: (file.size / 1024 / 1024).toFixed(2) })}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => moveFile(idx, 'up')} disabled={idx === 0} className="p-1 text-sepia-600 hover:text-sepia-700 disabled:opacity-30" aria-label={t('moveUpAria', { name: file.name })}><ChevronUp size={16} /></button>
                        <button onClick={() => moveFile(idx, 'down')} disabled={idx === files.length - 1} className="p-1 text-sepia-600 hover:text-sepia-700 disabled:opacity-30" aria-label={t('moveDownAria', { name: file.name })}><ChevronDown size={16} /></button>
                        <button onClick={() => setFiles(files.filter((_, i) => i !== idx))} className="p-1 text-wax-600 hover:text-wax-500 ml-2" aria-label={t('removeAria', { name: file.name })}><X size={16} /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end">
                <InkStampButton variant="primary" onClick={handleUpload} icon={<ArrowRight size={18} />}>
                  {t('startIngestion')}
                </InkStampButton>
              </div>
            </ParchmentCard>
          )}
        </div>
      )}

      {(uploadStatus === 'uploading' || uploadStatus === 'analyzing') && (
        <div className="flex flex-col items-center justify-center py-24 space-y-6 animate-in fade-in">
          <Loader2 size={48} className="text-brass-500 animate-spin" />
          <div className="text-center">
            <h3 className="text-xl font-medium text-sepia-800 mb-2">
              {uploadStatus === 'uploading' ? t('uploading') : t('analyzing')}
            </h3>
            <p className="text-sepia-600 text-sm max-w-md mx-auto">
              {uploadStatus === 'uploading' ? t('uploadingDesc') : t('analyzingDesc')}
            </p>
          </div>
        </div>
      )}

      {uploadStatus === 'review' && extractedData && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-forest-700/10 border border-forest-700/20 rounded-xl p-6 flex items-start gap-4">
            <CheckCircle2 className="text-forest-600 shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-medium text-sepia-900 mb-1">{t('analysisComplete')}</h3>
              <p className="text-sm text-sepia-600">
                {t('reviewDesc')}
              </p>
            </div>
          </div>

          {/* Project Metadata — always editable, separate from per-entity review */}
          {extractedData.project && (
            <ParchmentCard>
              <h4 className="text-sm font-medium text-sepia-600 uppercase tracking-wider mb-4">
                {t('projectMetadata')}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-sepia-600 block mb-1">{t('metaTitle')}</label>
                  <input
                    type="text"
                    value={extractedData.project?.title || ''}
                    onChange={(e) => setExtractedData({ ...extractedData, project: { ...extractedData.project, title: e.target.value } })}
                    className="w-full bg-parchment-200 border border-sepia-300/50 focus:border-brass-500/60 rounded-lg text-sm text-sepia-800 font-medium outline-none px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs text-sepia-600 block mb-1">{t('metaGenre')}</label>
                  <input
                    type="text"
                    value={(extractedData.project?.genre || []).join(', ')}
                    onChange={(e) => setExtractedData({ ...extractedData, project: { ...extractedData.project, genre: e.target.value.split(',').map(s => s.trim()) } })}
                    className="w-full bg-parchment-200 border border-sepia-300/50 focus:border-brass-500/60 rounded-lg text-sm text-sepia-800 font-medium outline-none px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-sepia-600 block mb-1">{t('metaSummary')}</label>
                  <textarea
                    value={extractedData.project?.summary_global || ''}
                    onChange={(e) => setExtractedData({ ...extractedData, project: { ...extractedData.project, summary_global: e.target.value } })}
                    className="w-full bg-parchment-200 border border-sepia-300/50 focus:border-brass-500/60 rounded-lg text-sm text-sepia-800 outline-none px-3 py-2 h-20 resize-none"
                  />
                </div>
              </div>
            </ParchmentCard>
          )}

          {/* Per-entity review queue (CB-11) */}
          <ImportReviewQueue
            extractedData={extractedData}
            existingNames={existingNames}
            onConfirm={handleReviewConfirm}
            onCancel={reset}
          />
        </div>
      )}

      {uploadStatus === 'success' && (
        <div className="flex flex-col items-center justify-center py-24 space-y-6 animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 bg-forest-600/10 rounded-full flex items-center justify-center">
            <CheckCircle2 size={40} className="text-forest-600" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-serif font-bold text-sepia-900 mb-2">{t('ingestionComplete')}</h3>
            <p className="text-sepia-600 text-sm max-w-md mx-auto mb-8">
              {importedCount > 0
                ? t('successWithCount', { count: importedCount })
                : t('successNoCount')}
            </p>
            <BrassButton onClick={reset}>
              {t('importMore')}
            </BrassButton>
          </div>
        </div>
      )}
    </div>
  );
}
