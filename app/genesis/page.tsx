'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { useStory } from '@/lib/store';
import { convertGenesisToStory } from '@/lib/genesis-converter';
import {
  GENESIS_STEPS,
  GENRE_OPTIONS,
  TONE_OPTIONS,
  isGenesisComplete,
  createEmptyGenesis,
} from '@/lib/types/genesis';
import type { GenesisStep, GenesisData, AntagonistType } from '@/lib/types/genesis';
import { GenesisSummary } from '@/components/genesis/genesis-summary';
import { ParchmentCard, BrassButton, ParchmentInput, ParchmentTextarea } from '@/components/antiquarian';
import { fadeUp, springs } from '@/lib/animations';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

const stepLabels: Record<GenesisStep, string> = {
  'name': 'Project Name',
  'logline': 'Logline',
  'genre-tone': 'Genre & Tone',
  'protagonist': 'Protagonist',
  'antagonist': 'Antagonist',
  'world': 'World',
};

const stepDescriptions: Record<GenesisStep, string> = {
  'name': 'What will you call this story?',
  'logline': 'Describe your story in one or two sentences.',
  'genre-tone': 'Pick the genres and tones that define your narrative.',
  'protagonist': 'Who drives this story forward?',
  'antagonist': 'What force stands in opposition?',
  'world': 'Where and when does this story take place?',
};

export default function GenesisPage() {
  const router = useRouter();
  const { setState } = useStory();
  const [stepIndex, setStepIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [data, setData] = useState(() => createEmptyGenesis());

  const currentStep = GENESIS_STEPS[stepIndex];

  const updateField = useCallback(<K extends keyof GenesisData>(field: K, value: GenesisData[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const canAdvance = useCallback((): boolean => {
    switch (currentStep) {
      case 'name':
        return (data.projectName?.trim().length ?? 0) > 0;
      case 'logline':
        return (data.logline?.trim().length ?? 0) > 0;
      case 'genre-tone':
        return (data.genres?.length ?? 0) > 0 && (data.tones?.length ?? 0) > 0;
      case 'protagonist':
        return (data.protagonist?.name?.trim().length ?? 0) > 0;
      case 'antagonist':
        return (data.antagonist?.name?.trim().length ?? 0) > 0;
      case 'world':
        return (data.world?.setting?.trim().length ?? 0) > 0;
      default:
        return false;
    }
  }, [currentStep, data]);

  const handleNext = useCallback(() => {
    if (stepIndex < GENESIS_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      setShowSummary(true);
    }
  }, [stepIndex]);

  const handleBack = useCallback(() => {
    if (showSummary) {
      setShowSummary(false);
    } else if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  }, [stepIndex, showSummary]);

  const handleEditFromSummary = useCallback((step: GenesisStep) => {
    setShowSummary(false);
    setStepIndex(GENESIS_STEPS.indexOf(step));
  }, []);

  const handleCreate = useCallback(() => {
    if (!isGenesisComplete(data)) return;
    setIsCreating(true);
    const storyData = convertGenesisToStory(data);
    setState(prev => ({ ...prev, ...storyData }));
    localStorage.removeItem('zagafy_tour_completed');
    router.replace('/');
  }, [data, setState, router]);

  const toggleGenre = useCallback((genre: string) => {
    setData(prev => {
      const genres = prev.genres ?? [];
      return {
        ...prev,
        genres: genres.includes(genre) ? genres.filter(g => g !== genre) : [...genres, genre],
      };
    });
  }, []);

  const toggleTone = useCallback((tone: string) => {
    setData(prev => {
      const tones = prev.tones ?? [];
      return {
        ...prev,
        tones: tones.includes(tone) ? tones.filter(t => t !== tone) : [...tones, tone],
      };
    });
  }, []);

  const handleSkip = useCallback(() => {
    router.replace('/');
  }, [router]);

  // World rules management
  const addWorldRule = useCallback(() => {
    setData(prev => ({
      ...prev,
      world: { ...prev.world!, rules: [...(prev.world?.rules ?? []), ''] },
    }));
  }, []);

  const updateWorldRule = useCallback((index: number, value: string) => {
    setData(prev => {
      const rules = [...(prev.world?.rules ?? [])];
      rules[index] = value;
      return { ...prev, world: { ...prev.world!, rules } };
    });
  }, []);

  const removeWorldRule = useCallback((index: number) => {
    setData(prev => {
      const rules = (prev.world?.rules ?? []).filter((_, i) => i !== index);
      return { ...prev, world: { ...prev.world!, rules } };
    });
  }, []);

  if (showSummary && isGenesisComplete(data)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="w-full max-w-3xl">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-sepia-600 hover:text-sepia-700 transition-colors mb-6"
          >
            <ChevronLeft size={16} /> Back to editing
          </button>
          <GenesisSummary
            data={data}
            onEdit={handleEditFromSummary}
            onCreate={handleCreate}
            isCreating={isCreating}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-xl space-y-8">
        {/* Header */}
        <motion.div {...fadeUp} className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles size={24} className="text-brass-500" />
            <h1 className="text-2xl font-serif font-bold text-sepia-900">Genesis Mode</h1>
          </div>
          <p className="text-sm text-sepia-600">Build your story from the ground up.</p>
        </motion.div>

        {/* Step Dots — 24px hit targets (WCAG 2.2 target-size) wrap a small dot */}
        <div className="flex items-center justify-center gap-1">
          {GENESIS_STEPS.map((step, i) => (
            <button
              key={step}
              onClick={() => { if (i < stepIndex) setStepIndex(i); }}
              className={[
                'flex items-center justify-center w-6 h-6 rounded-full transition-colors',
                i < stepIndex ? 'cursor-pointer' : 'cursor-default',
              ].join(' ')}
              aria-label={`Step ${i + 1}: ${stepLabels[step]}`}
              aria-current={i === stepIndex ? 'step' : undefined}
            >
              <span
                className={[
                  'w-2.5 h-2.5 rounded-full transition-all duration-300',
                  i === stepIndex ? 'bg-brass-500 scale-125' : i < stepIndex ? 'bg-forest-600' : 'bg-sepia-300/50',
                  i < stepIndex ? 'group-hover:bg-forest-500' : '',
                ].join(' ')}
              />
            </button>
          ))}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={springs.gentle}
          >
            <ParchmentCard padding="lg">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-serif font-semibold text-sepia-900">
                    {stepLabels[currentStep]}
                  </h2>
                  <p className="text-sm text-sepia-600 mt-1">{stepDescriptions[currentStep]}</p>
                </div>

                {/* Step-specific form fields */}
                {currentStep === 'name' && (
                  <ParchmentInput
                    value={data.projectName ?? ''}
                    onChange={(e) => updateField('projectName', e.target.value)}
                    placeholder="e.g., The Obsidian Crown"
                    autoFocus
                    data-testid="genesis-name-input"
                  />
                )}

                {currentStep === 'logline' && (
                  <ParchmentTextarea
                    value={data.logline ?? ''}
                    onChange={(e) => updateField('logline', e.target.value)}
                    placeholder="e.g., A disgraced knight must reclaim a cursed artifact before it destroys the realm."
                    rows={3}
                    autoFocus
                    data-testid="genesis-logline-input"
                  />
                )}

                {currentStep === 'genre-tone' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-sepia-700 uppercase tracking-wider">Genre</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {GENRE_OPTIONS.map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => toggleGenre(g)}
                            className={[
                              'text-xs px-3 py-1.5 rounded-full border transition-all',
                              data.genres?.includes(g)
                                ? 'bg-forest-700 text-cream-50 border-forest-600'
                                : 'bg-parchment-200 text-sepia-700 border-sepia-300/50 hover:border-sepia-400',
                            ].join(' ')}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-sepia-700 uppercase tracking-wider">Tone</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {TONE_OPTIONS.map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleTone(t)}
                            className={[
                              'text-xs px-3 py-1.5 rounded-full border transition-all',
                              data.tones?.includes(t)
                                ? 'bg-brass-600 text-cream-50 border-brass-500'
                                : 'bg-parchment-200 text-sepia-700 border-sepia-300/50 hover:border-sepia-400',
                            ].join(' ')}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 'protagonist' && (
                  <div className="space-y-3">
                    <ParchmentInput
                      value={data.protagonist?.name ?? ''}
                      onChange={(e) => updateField('protagonist', { ...data.protagonist!, name: e.target.value })}
                      placeholder="Character name"
                      autoFocus
                      data-testid="genesis-protag-name"
                    />
                    <ParchmentTextarea
                      value={data.protagonist?.description ?? ''}
                      onChange={(e) => updateField('protagonist', { ...data.protagonist!, description: e.target.value })}
                      placeholder="Brief description"
                      rows={2}
                    />
                    <ParchmentInput
                      value={data.protagonist?.goal ?? ''}
                      onChange={(e) => updateField('protagonist', { ...data.protagonist!, goal: e.target.value })}
                      placeholder="What do they want?"
                    />
                    <ParchmentInput
                      value={data.protagonist?.fear ?? ''}
                      onChange={(e) => updateField('protagonist', { ...data.protagonist!, fear: e.target.value })}
                      placeholder="What do they fear?"
                    />
                  </div>
                )}

                {currentStep === 'antagonist' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-sepia-700 uppercase tracking-wider">Type</label>
                      <div className="flex gap-2 mt-2">
                        {(['character', 'force', 'internal'] as AntagonistType[]).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateField('antagonist', { ...data.antagonist!, type: t })}
                            className={[
                              'text-xs px-3 py-1.5 rounded-full border transition-all capitalize',
                              data.antagonist?.type === t
                                ? 'bg-wax-600 text-cream-50 border-wax-500'
                                : 'bg-parchment-200 text-sepia-700 border-sepia-300/50 hover:border-sepia-400',
                            ].join(' ')}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ParchmentInput
                      value={data.antagonist?.name ?? ''}
                      onChange={(e) => updateField('antagonist', { ...data.antagonist!, name: e.target.value })}
                      placeholder={data.antagonist?.type === 'internal' ? 'e.g., Self-doubt' : data.antagonist?.type === 'force' ? 'e.g., The Plague' : 'Character name'}
                      autoFocus
                      data-testid="genesis-antag-name"
                    />
                    <ParchmentTextarea
                      value={data.antagonist?.description ?? ''}
                      onChange={(e) => updateField('antagonist', { ...data.antagonist!, description: e.target.value })}
                      placeholder="Description"
                      rows={2}
                    />
                    <ParchmentInput
                      value={data.antagonist?.motivation ?? ''}
                      onChange={(e) => updateField('antagonist', { ...data.antagonist!, motivation: e.target.value })}
                      placeholder="Motivation or driving force"
                    />
                  </div>
                )}

                {currentStep === 'world' && (
                  <div className="space-y-3">
                    <ParchmentTextarea
                      value={data.world?.setting ?? ''}
                      onChange={(e) => updateField('world', { ...data.world!, setting: e.target.value })}
                      placeholder="Describe the world or setting"
                      rows={2}
                      autoFocus
                      data-testid="genesis-world-setting"
                    />
                    <ParchmentInput
                      value={data.world?.timePeriod ?? ''}
                      onChange={(e) => updateField('world', { ...data.world!, timePeriod: e.target.value })}
                      placeholder="Time period (e.g., Medieval, 2150 AD, Victorian era)"
                    />
                    <div>
                      <label className="text-xs font-medium text-sepia-700 uppercase tracking-wider">
                        World Rules (optional)
                      </label>
                      <div className="space-y-2 mt-2">
                        {(data.world?.rules ?? []).map((rule, i) => (
                          <div key={i} className="flex gap-2">
                            <ParchmentInput
                              value={rule}
                              onChange={(e) => updateWorldRule(i, e.target.value)}
                              placeholder="e.g., Magic requires sacrifice"
                              className="flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => removeWorldRule(i)}
                              className="text-sepia-600 hover:text-wax-500 transition-colors text-sm px-2"
                              aria-label="Remove rule"
                            >
                              x
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addWorldRule}
                          className="text-xs text-brass-600 hover:text-brass-500 transition-colors"
                        >
                          + Add rule
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ParchmentCard>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={stepIndex === 0 ? handleSkip : handleBack}
            className="flex items-center gap-1 text-sm text-sepia-600 hover:text-sepia-700 transition-colors"
          >
            <ChevronLeft size={16} />
            {stepIndex === 0 ? 'Skip' : 'Back'}
          </button>

          <BrassButton
            onClick={handleNext}
            disabled={!canAdvance()}
            icon={stepIndex === GENESIS_STEPS.length - 1 ? undefined : <ChevronRight size={16} />}
          >
            {stepIndex === GENESIS_STEPS.length - 1 ? 'Review' : 'Next'}
          </BrassButton>
        </div>
      </div>
    </div>
  );
}
