'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { ChevronLeft, ChevronRight, Sparkles, X, UploadCloud } from 'lucide-react';

export default function GenesisPage() {
  const router = useRouter();
  const t = useTranslations('genesis');
  const stepLabel = (step: GenesisStep) => t(`steps.${step}.label`);
  const stepDescription = (step: GenesisStep) => t(`steps.${step}.description`);
  const { state, saveNow } = useStory();
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

  const handleCreate = useCallback(async () => {
    if (!isGenesisComplete(data)) return;
    setIsCreating(true);
    const storyData = convertGenesisToStory(data);
    const merged = { ...state, ...storyData } as typeof state;
    localStorage.removeItem('zagafy_tour_completed');
    // Persist BEFORE navigating so GenesisGuard sees the saved project and
    // doesn't bounce the dashboard straight back to Genesis (the old race).
    try {
      await saveNow(merged);
    } finally {
      router.replace('/');
    }
  }, [data, state, saveNow, router]);

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

  // Leave Genesis without completing it. Go to the dashboard if the active
  // project already has content; otherwise to the project library (avoids the
  // empty-project → GenesisGuard → /genesis redirect loop).
  const exitGenesis = useCallback(() => {
    const hasContent =
      state.chapters.length > 0 ||
      state.characters.length > 0 ||
      (state.synopsis?.trim().length ?? 0) > 0 ||
      (!!state.title && state.title !== 'Untitled Project');
    router.replace(hasContent ? '/' : '/projects');
  }, [state, router]);

  const handleSkip = exitGenesis;

  // Import an existing manuscript instead of building from scratch. The import
  // page merges into the active project; this is the escape for writers who
  // already have a novel and shouldn't be forced to start from zero.
  const goImport = useCallback(() => {
    router.push('/import');
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
      <div className="min-h-screen flex items-center justify-center p-8 relative">
        <button
          onClick={exitGenesis}
          className="absolute top-4 right-4 p-2 rounded-full text-sepia-600 hover:text-sepia-900 hover:bg-sepia-300/30 transition-colors"
          aria-label={t('exit')}
        >
          <X size={20} />
        </button>
        <div className="w-full max-w-3xl">
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-sm text-sepia-600 hover:text-sepia-700 transition-colors mb-6"
          >
            <ChevronLeft size={16} /> {t('backToEditing')}
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
    <div className="min-h-screen flex flex-col items-center justify-center p-8 relative">
      <button
        onClick={exitGenesis}
        className="absolute top-4 right-4 p-2 rounded-full text-sepia-600 hover:text-sepia-900 hover:bg-sepia-300/30 transition-colors"
        aria-label={t('exit')}
      >
        <X size={20} />
      </button>
      <div className="w-full max-w-xl space-y-8">
        {/* Header */}
        <motion.div {...fadeUp} className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles size={24} className="text-brass-500" />
            <h1 className="text-2xl font-serif font-bold text-sepia-900">{t('mode')}</h1>
          </div>
          <p className="text-sm text-sepia-600">{t('tagline')}</p>
          <button
            onClick={goImport}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brass-700 hover:text-brass-900 transition-colors mt-1"
          >
            <UploadCloud size={15} aria-hidden="true" /> {t('importInstead')}
          </button>
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
              aria-label={t('stepAria', { num: i + 1, label: stepLabel(step) })}
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
                    {stepLabel(currentStep)}
                  </h2>
                  <p className="text-sm text-sepia-600 mt-1">{stepDescription(currentStep)}</p>
                </div>

                {/* Step-specific form fields */}
                {currentStep === 'name' && (
                  <ParchmentInput
                    value={data.projectName ?? ''}
                    onChange={(e) => updateField('projectName', e.target.value)}
                    placeholder={t('placeholders.name')}
                    autoFocus
                    data-testid="genesis-name-input"
                  />
                )}

                {currentStep === 'logline' && (
                  <ParchmentTextarea
                    value={data.logline ?? ''}
                    onChange={(e) => updateField('logline', e.target.value)}
                    placeholder={t('placeholders.logline')}
                    rows={3}
                    autoFocus
                    data-testid="genesis-logline-input"
                  />
                )}

                {currentStep === 'genre-tone' && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-sepia-700 uppercase tracking-wider">{t('genreLabel')}</label>
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
                      <label className="text-xs font-medium text-sepia-700 uppercase tracking-wider">{t('toneLabel')}</label>
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
                      placeholder={t('placeholders.protagName')}
                      autoFocus
                      data-testid="genesis-protag-name"
                    />
                    <ParchmentTextarea
                      value={data.protagonist?.description ?? ''}
                      onChange={(e) => updateField('protagonist', { ...data.protagonist!, description: e.target.value })}
                      placeholder={t('placeholders.protagDesc')}
                      rows={2}
                    />
                    <ParchmentInput
                      value={data.protagonist?.goal ?? ''}
                      onChange={(e) => updateField('protagonist', { ...data.protagonist!, goal: e.target.value })}
                      placeholder={t('placeholders.protagGoal')}
                    />
                    <ParchmentInput
                      value={data.protagonist?.fear ?? ''}
                      onChange={(e) => updateField('protagonist', { ...data.protagonist!, fear: e.target.value })}
                      placeholder={t('placeholders.protagFear')}
                    />
                  </div>
                )}

                {currentStep === 'antagonist' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-sepia-700 uppercase tracking-wider">{t('typeLabel')}</label>
                      <div className="flex gap-2 mt-2">
                        {(['character', 'force', 'internal'] as AntagonistType[]).map(ty => (
                          <button
                            key={ty}
                            type="button"
                            onClick={() => updateField('antagonist', { ...data.antagonist!, type: ty })}
                            className={[
                              'text-xs px-3 py-1.5 rounded-full border transition-all capitalize',
                              data.antagonist?.type === ty
                                ? 'bg-wax-600 text-cream-50 border-wax-500'
                                : 'bg-parchment-200 text-sepia-700 border-sepia-300/50 hover:border-sepia-400',
                            ].join(' ')}
                          >
                            {t(`antagonistType.${ty}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <ParchmentInput
                      value={data.antagonist?.name ?? ''}
                      onChange={(e) => updateField('antagonist', { ...data.antagonist!, name: e.target.value })}
                      placeholder={data.antagonist?.type === 'internal' ? t('placeholders.antagNameInternal') : data.antagonist?.type === 'force' ? t('placeholders.antagNameForce') : t('placeholders.antagNameCharacter')}
                      autoFocus
                      data-testid="genesis-antag-name"
                    />
                    <ParchmentTextarea
                      value={data.antagonist?.description ?? ''}
                      onChange={(e) => updateField('antagonist', { ...data.antagonist!, description: e.target.value })}
                      placeholder={t('placeholders.antagDesc')}
                      rows={2}
                    />
                    <ParchmentInput
                      value={data.antagonist?.motivation ?? ''}
                      onChange={(e) => updateField('antagonist', { ...data.antagonist!, motivation: e.target.value })}
                      placeholder={t('placeholders.antagMotivation')}
                    />
                  </div>
                )}

                {currentStep === 'world' && (
                  <div className="space-y-3">
                    <ParchmentTextarea
                      value={data.world?.setting ?? ''}
                      onChange={(e) => updateField('world', { ...data.world!, setting: e.target.value })}
                      placeholder={t('placeholders.worldSetting')}
                      rows={2}
                      autoFocus
                      data-testid="genesis-world-setting"
                    />
                    <ParchmentInput
                      value={data.world?.timePeriod ?? ''}
                      onChange={(e) => updateField('world', { ...data.world!, timePeriod: e.target.value })}
                      placeholder={t('placeholders.worldTime')}
                    />
                    <div>
                      <label className="text-xs font-medium text-sepia-700 uppercase tracking-wider">
                        {t('worldRules')}
                      </label>
                      <div className="space-y-2 mt-2">
                        {(data.world?.rules ?? []).map((rule, i) => (
                          <div key={i} className="flex gap-2">
                            <ParchmentInput
                              value={rule}
                              onChange={(e) => updateWorldRule(i, e.target.value)}
                              placeholder={t('placeholders.worldRule')}
                              className="flex-1"
                            />
                            <button
                              type="button"
                              onClick={() => removeWorldRule(i)}
                              className="text-sepia-600 hover:text-wax-500 transition-colors text-sm px-2"
                              aria-label={t('removeRule')}
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
                          {t('addRule')}
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
            {stepIndex === 0 ? t('skip') : t('back')}
          </button>

          <BrassButton
            onClick={handleNext}
            disabled={!canAdvance()}
            icon={stepIndex === GENESIS_STEPS.length - 1 ? undefined : <ChevronRight size={16} />}
          >
            {stepIndex === GENESIS_STEPS.length - 1 ? t('review') : t('next')}
          </BrassButton>
        </div>

        {/* Why is Next disabled? Quiet guidance, not an error */}
        <AnimatePresence initial={false}>
          {!canAdvance() && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="text-right text-xs italic text-sepia-600 -mt-4"
              aria-live="polite"
            >
              {t(`requirement.${currentStep}`)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
