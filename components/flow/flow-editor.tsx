'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useMicroPrompt } from '@/hooks/use-micro-prompt';
import { useFlowAutosave } from '@/hooks/use-flow-autosave';
import { useSession } from '@/lib/session';
import { useStory } from '@/lib/store';
import { useSceneChange } from '@/hooks/use-scene-change';
import { useToast } from '@/components/toast';
import { useConfirm } from '@/components/confirm-dialog';
import { MomentumGlow } from './momentum-glow';
import { MicroPromptDisplay } from './micro-prompt-display';
import { SceneChangeBanner } from './scene-change-banner';
import { SceneChangeOverlay } from './scene-change-overlay';
import { SceneChangeRecoveryModal } from './scene-change-recovery-modal';
import type { MicroPromptStoryContext } from '@/lib/prompts/micro-prompt';
import { HeteronymSelector } from '@/components/heteronyms/heteronym-selector';
import { VoiceSwitchModal } from '@/components/heteronyms/voice-switch-modal';
import { VoiceBanner } from '@/components/heteronyms/voice-banner';
import {
  readHeteronyms,
  getActiveHeteronymId,
  setActiveHeteronymId,
  getGuestHeteronymId,
  setGuestHeteronymId,
} from '@/lib/types/heteronym';
import {
  readSceneChangeReturn,
  clearSceneChangeReturn,
} from '@/lib/types/scene-change';
import { useBraindump } from '@/hooks/use-braindump';
import { BraindumpPanel } from './braindump-panel';
import { BraindumpHistoryDrawer } from './braindump-history-drawer';
import { BraindumpToolbarMessage } from './braindump-toolbar-message';
import { Theater, Shuffle, Mic, ClipboardList, BookCopy, Lightbulb, Shield } from 'lucide-react';
import { shouldBlockKey } from '@/lib/no-retreat-handler';
import { NoRetreatToggle } from './no-retreat-toggle';
import { NoRetreatEndModal } from './no-retreat-end-modal';
import { createMetricsCollector } from '@/lib/flow-metrics';
import type { MetricsCollector } from '@/lib/flow-metrics';
import { useChapterVersions } from '@/hooks/use-chapter-versions';
import { VersionSwitcher } from './version-switcher';
import { VersionCompare } from './version-compare';
import { useBlockDetector } from '@/hooks/use-block-detector';
import { useStoryCoach } from '@/hooks/use-story-coach';
import { SceneryChangePrompt } from './scenery-change-prompt';
import { DetourEditor } from './detour-editor';
import { CoachPanel } from '@/components/story-coach/coach-panel';
import { getAdaptiveConfig } from '@/lib/adaptive-experience';
import { ClosingRitual } from './closing-ritual';
import { getPlainText } from '@/lib/editor/serialization';
import { useTranslations } from 'next-intl';

const PAUSE_TIMEOUT = 30000; // 30 seconds
const MOMENTUM_DECAY_INTERVAL = 100; // ms
const MOMENTUM_INCREMENT = 0.02;
const MOMENTUM_DECAY = 0.01;

interface FlowEditorProps {
  chapterId: string;
  onExit: () => void;
}

export function FlowEditor({ chapterId, onExit }: FlowEditorProps) {
  const t = useTranslations('flow.editor');
  const { session, setFlowChapterId } = useSession();
  const { state } = useStory();
  const { scheduleAutosave, saveNow, initialContent } = useFlowAutosave(chapterId);
  const { prompt, isLoading, fetchPrompt, clearPrompt } = useMicroPrompt();
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [content, setContent] = useState(initialContent);
  const [momentum, setMomentum] = useState(0);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentumTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const metricsCollectorRef = useRef<MetricsCollector>(createMetricsCollector());
  const lastKeystrokeTimeRef = useRef<number>(Date.now());
  const sessionStartTimeRef = useRef<number>(Date.now());

  // L3: Reset keystroke timing when switching chapters so block detector starts fresh
  useEffect(() => {
    lastKeystrokeTimeRef.current = Date.now();
    sessionStartTimeRef.current = Date.now();
  }, [chapterId]);

  // Heteronym state
  const [heteronyms] = useState(() => readHeteronyms());
  const [activeHeteronymId, setActiveHId] = useState(() => getActiveHeteronymId());
  const [guestHeteronymId, setGuestHId] = useState(() => getGuestHeteronymId());
  const [voiceSwitchOpen, setVoiceSwitchOpen] = useState(false);

  const currentVoiceId = guestHeteronymId || activeHeteronymId;
  const guestHeteronym = guestHeteronymId ? heteronyms.find(h => h.id === guestHeteronymId) : null;
  const activeHeteronym = currentVoiceId ? heteronyms.find(h => h.id === currentVoiceId) ?? null : null;

  const chapter = state.chapters.find(ch => ch.id === chapterId);

  // Derive word count from content
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  // Scene Change state
  const nonDiscardedChapters = state.chapters.filter(ch => ch.canonStatus !== 'discarded');
  const sceneChange = useSceneChange(nonDiscardedChapters.length);
  const [overlayConfig, setOverlayConfig] = useState<{
    message: string;
    subtitle?: string;
    onComplete: () => void;
  } | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Braindump state
  const braindump = useBraindump({
    textareaRef,
    content,
    setContent,
    scheduleAutosave,
    projectName: state.title || 'Untitled Project',
  });
  const [toolbarMessage, setToolbarMessage] = useState<'unsupported' | 'denied' | null>(null);

  // Version history state
  const chapterVersions = useChapterVersions(chapterId, initialContent);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  // No-Retreat Mode state
  const [noRetreatMode, setNoRetreatMode] = useState(false);
  const [noRetreatEndOpen, setNoRetreatEndOpen] = useState(false);
  const sessionStartOffsetRef = useRef<number>(initialContent.length);
  const noRetreatStartTimeRef = useRef<number>(0);
  const noRetreatStartWordCountRef = useRef<number>(0);

  // Block detector
  const blockDetectorContext = useMemo(() => ({
    characterNames: state.characters.filter(c => c.canonStatus !== 'discarded').map(c => c.name),
    currentChapterTitle: chapter?.title,
    genre: state.genre.join(', ') || undefined,
  }), [state.characters, chapter, state.genre]);

  const blockDetector = useBlockDetector(
    metricsCollectorRef,
    sessionStartTimeRef.current,
    lastKeystrokeTimeRef,
    blockDetectorContext
  );

  // Story coach
  const storyCoach = useStoryCoach();
  const [coachPanelOpen, setCoachPanelOpen] = useState(false);

  // Closing ritual state
  const [closingRitualOpen, setClosingRitualOpen] = useState(false);

  // Adaptive config: auto-enable noRetreat for perfectionism block
  useEffect(() => {
    const config = getAdaptiveConfig(session.blockType);
    if (config.noRetreat && !noRetreatMode) {
      sessionStartOffsetRef.current = content.length;
      noRetreatStartTimeRef.current = Date.now();
      noRetreatStartWordCountRef.current = wordCount;
      setNoRetreatMode(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: check for pending return data (cursor restore + toast)
  useEffect(() => {
    const pendingReturn = readSceneChangeReturn();
    if (pendingReturn) {
      clearSceneChangeReturn();
      // Restore cursor position
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = pendingReturn.cursorPosition;
          textareaRef.current.selectionEnd = pendingReturn.cursorPosition;
          textareaRef.current.focus();
        }
      });
      toast(
        t('sceneChangeCompleteToast', { count: pendingReturn.wordsWritten }),
        'success'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: check for expired scene change (recovery modal)
  useEffect(() => {
    if (sceneChange.isActive && sceneChange.isExpired) {
      setShowRecoveryModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSceneChangeDepart = useCallback(() => {
    const cursorPos = textareaRef.current?.selectionStart ?? 0;
    saveNow(content);

    const alternateId = sceneChange.depart(
      chapterId,
      chapter?.title || t('untitled'),
      cursorPos,
      wordCount,
      nonDiscardedChapters
    );

    if (!alternateId) return;

    setOverlayConfig({
      message: t('switchingScenes'),
      subtitle: t('switchingScenesSub'),
      onComplete: () => {
        setOverlayConfig(null);
        setFlowChapterId(alternateId);
      },
    });
  }, [content, saveNow, sceneChange, chapterId, chapter?.title, wordCount, nonDiscardedChapters, setFlowChapterId, t]);

  const handleSceneChangeReturn = useCallback(() => {
    const originalId = sceneChange.sceneState?.originalChapterId;
    if (!originalId) return;

    // Check if original chapter still exists
    const originalExists = state.chapters.some(ch => ch.id === originalId);
    if (!originalExists) {
      toast(t('originalDeletedToast'), 'error');
      sceneChange.cancelSceneChange();
      return;
    }

    const ret = sceneChange.returnToOriginal(wordCount, content);

    setOverlayConfig({
      message: t('returningToChapter'),
      subtitle: t('returningToChapterSub', { count: ret.wordsWritten }),
      onComplete: () => {
        setOverlayConfig(null);
        setFlowChapterId(originalId);
      },
    });
  }, [sceneChange, wordCount, content, state.chapters, setFlowChapterId, toast, t]);

  const handleRecoveryReturn = useCallback(() => {
    setShowRecoveryModal(false);
    handleSceneChangeReturn();
  }, [handleSceneChangeReturn]);

  const handleRecoveryStay = useCallback(() => {
    setShowRecoveryModal(false);
    sceneChange.cancelSceneChange();
  }, [sceneChange]);

  const handleExitWithGuard = useCallback(async () => {
    if (braindump.panelOpen) {
      await braindump.closePanel();
    }
    if (sceneChange.isActive) {
      const confirmed = await confirm({
        title: t('activeSceneChangeTitle'),
        message: t('activeSceneChangeMessage'),
        confirmLabel: t('activeSceneChangeConfirm'),
        variant: 'danger',
      });
      if (!confirmed) return;
      sceneChange.cancelSceneChange();
    }
    if (wordCount > 0) {
      setClosingRitualOpen(true);
      return;
    }
    onExit();
  }, [braindump, sceneChange, confirm, onExit, wordCount, t]);

  const handleSelectActive = useCallback((id: string) => {
    setActiveHeteronymId(id);
    setActiveHId(id);
  }, []);

  const handleSelectGuest = useCallback((id: string) => {
    setGuestHeteronymId(id);
    setGuestHId(id);
  }, []);

  const handleClearGuest = useCallback(() => {
    setGuestHeteronymId(null);
    setGuestHId(null);
  }, []);

  const handleNoRetreatToggle = useCallback(() => {
    if (noRetreatMode) {
      // Turning off — show end modal with stats
      setNoRetreatEndOpen(true);
    } else {
      // Turning on — capture session start
      sessionStartOffsetRef.current = content.length;
      noRetreatStartTimeRef.current = Date.now();
      noRetreatStartWordCountRef.current = wordCount;
      setNoRetreatMode(true);
    }
  }, [noRetreatMode, content.length, wordCount]);

  const handleNoRetreatSave = useCallback(() => {
    setNoRetreatMode(false);
    setNoRetreatEndOpen(false);
  }, []);

  const handleNoRetreatBurn = useCallback(() => {
    // Revert to content at session start
    const originalContent = content.slice(0, sessionStartOffsetRef.current);
    setContent(originalContent);
    scheduleAutosave(originalContent);
    setNoRetreatMode(false);
    setNoRetreatEndOpen(false);
  }, [content, scheduleAutosave]);

  const genre = state.genre.join(', ');
  const protagonist = state.characters.find(c => c.role === 'protagonist' || c.role === 'Protagonist');

  // Build story context for micro-prompts (memoized — only changes when story state changes)
  const storyContext = useMemo((): MicroPromptStoryContext => {
    const ctx: MicroPromptStoryContext = {};

    if (state.title && state.title !== 'Untitled Project') {
      ctx.title = state.title;
    }
    if (state.synopsis) {
      ctx.synopsis = state.synopsis.slice(0, 500);
    }
    if (chapter?.title) {
      ctx.currentChapterTitle = chapter.title;
    }

    // Characters — name, role, key details
    const validChars = state.characters.filter(c => c.canonStatus !== 'discarded').slice(0, 10);
    if (validChars.length > 0) {
      // Explicit name list for grounding — prevents AI from inventing names
      ctx.characterNames = validChars.map(c => c.name);
      ctx.characters = validChars
        .map(c => {
          const parts = [`- ${c.name} (${c.role}): ${c.description?.slice(0, 120) || 'No description'}`];
          if (c.currentState?.emotionalState) {
            parts.push(`  Current state: ${c.currentState.emotionalState}`);
          }
          if (c.currentState?.visibleGoal) {
            parts.push(`  Goal: ${c.currentState.visibleGoal}`);
          }
          if (c.currentState?.currentFear) {
            parts.push(`  Fear: ${c.currentState.currentFear}`);
          }
          return parts.join('\n');
        })
        .join('\n');
    }

    // Chapter summaries — what happened before
    if (state.chapters.length > 0) {
      const currentIdx = state.chapters.findIndex(ch => ch.id === chapterId);
      ctx.chapterSummaries = state.chapters
        .filter(ch => ch.canonStatus !== 'discarded')
        .map((ch, i) => {
          const marker = i === currentIdx ? ' [CURRENT]' : '';
          const summary = ch.summary?.slice(0, 200) || 'No summary';
          return `- Ch${i + 1}: "${ch.title}"${marker}: ${summary}`;
        })
        .join('\n');
    }

    // Active conflicts
    const conflicts = state.active_conflicts?.filter(c => c.status === 'active' && c.canonStatus !== 'discarded');
    if (conflicts?.length) {
      ctx.activeConflicts = conflicts
        .slice(0, 5)
        .map(c => `- ${c.title}: ${c.description?.slice(0, 120) || ''}`)
        .join('\n');
    }

    // Open loops / unresolved threads
    const loops = state.open_loops?.filter(l => l.status === 'open' && l.canonStatus !== 'discarded');
    if (loops?.length) {
      ctx.openLoops = loops
        .slice(0, 5)
        .map(l => `- ${l.description?.slice(0, 120) || ''}`)
        .join('\n');
    }

    return ctx;
  }, [state.title, state.synopsis, state.characters, state.chapters, state.active_conflicts, state.open_loops, chapter?.title, chapterId]);

  // Momentum decay
  useEffect(() => {
    momentumTimerRef.current = setInterval(() => {
      setMomentum(prev => Math.max(0, prev - MOMENTUM_DECAY));
    }, MOMENTUM_DECAY_INTERVAL);
    return () => {
      if (momentumTimerRef.current) clearInterval(momentumTimerRef.current);
    };
  }, []);

  const triggerMicroPrompt = useCallback(() => {
    if (content.trim().length < 20) return;

    // Get last ~600 words for richer scene context
    const words = content.trim().split(/\s+/);
    const recentText = words.slice(-600).join(' ');

    fetchPrompt({
      recentText,
      storyContext,
      genre: genre || undefined,
      protagonistName: protagonist?.name,
      blockType: session.blockType,
      heteronym: activeHeteronym,
    });
  }, [content, storyContext, genre, protagonist?.name, session.blockType, fetchPrompt, activeHeteronym]);

  const resetPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(triggerMicroPrompt, PAUSE_TIMEOUT);
  }, [triggerMicroPrompt]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Block destructive keys — default always-block OR smart no-retreat
    const isDestructive =
      e.key === 'Backspace' ||
      e.key === 'Delete' ||
      ((e.ctrlKey || e.metaKey) && e.key === 'z') ||
      ((e.ctrlKey || e.metaKey) && e.key === 'x') ||
      (e.ctrlKey && e.key === 'Backspace') ||
      (e.ctrlKey && e.key === 'Delete');

    if (isDestructive) {
      if (noRetreatMode) {
        // Smart blocking — use shouldBlockKey
        const blocked = shouldBlockKey({
          key: e.key,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          cursorPos: e.currentTarget.selectionStart,
          selectionStart: e.currentTarget.selectionStart,
          selectionEnd: e.currentTarget.selectionEnd,
          sessionStartOffset: sessionStartOffsetRef.current,
        });
        if (blocked) {
          e.preventDefault();
          metricsCollectorRef.current.recordDeletionAttempt();
          return;
        }
      } else {
        // Default: always block all destructive keys
        e.preventDefault();
        metricsCollectorRef.current.recordDeletionAttempt();
        return;
      }
    }

    // Resume writing - clear prompt
    if (prompt && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      clearPrompt();
    }

    // Increase momentum on typing + record keystroke
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      setMomentum(prev => Math.min(1, prev + MOMENTUM_INCREMENT));
      const now = Date.now();
      metricsCollectorRef.current.recordKeystroke(now);
      lastKeystrokeTimeRef.current = now;
    }

    // Reset pause timer
    resetPauseTimer();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    scheduleAutosave(newContent);
  };

  return (
    <div className="fixed inset-0 z-[150] bg-parchment-200 flex flex-col">
      <MomentumGlow momentum={momentum} />

      {/* Voice banner */}
      {guestHeteronym && (
        <div className="relative z-10">
          <VoiceBanner guestHeteronym={guestHeteronym} onClear={handleClearGuest} />
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-sepia-300/30">
        <div className="flex items-center gap-4">
          {heteronyms.length > 0 && (
            <HeteronymSelector
              heteronyms={heteronyms}
              activeId={currentVoiceId}
              onSelect={handleSelectActive}
            />
          )}
          <h2 className="text-sm font-medium text-sepia-600 truncate max-w-xs">
            {chapter?.title || t('fallbackTitle')}
          </h2>
          <span className="text-xs text-sepia-600">{t('words', { count: wordCount })}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setVersionPanelOpen(!versionPanelOpen)}
              className="text-sm text-sepia-600 hover:text-sepia-700 transition-colors p-1.5 rounded-lg hover:bg-parchment-200"
              aria-label={t('versionHistory')}
            >
              <BookCopy size={16} />
              {chapterVersions.versionCount > 1 && (
                <span className="absolute -top-1 -right-1 bg-brass-500 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {chapterVersions.versionCount}
                </span>
              )}
            </button>
            {versionPanelOpen && (
              <VersionSwitcher
                versions={chapterVersions.versions}
                activeVersionId={chapterVersions.activeVersion?.id ?? null}
                onSwitch={(id) => {
                  // Save current content to current version before switching
                  if (chapterVersions.activeVersion) {
                    chapterVersions.createVersion(content, chapterVersions.activeVersion.label + t('autoSuffix'), 'auto-snapshot');
                  }
                  const target = chapterVersions.switchVersion(id);
                  if (target) {
                    // Versions may be Lexical JSON (manuscript/pre-flow snapshots);
                    // the flow textarea works in plain text.
                    const plain = getPlainText(target.content);
                    setContent(plain);
                    scheduleAutosave(plain);
                  }
                  setVersionPanelOpen(false);
                }}
                onRename={chapterVersions.rename}
                onMarkCanonical={chapterVersions.markCanonical}
                onDelete={chapterVersions.remove}
                onCreate={() => {
                  chapterVersions.createVersion(content, t('versionLabel', { letter: String.fromCharCode(65 + chapterVersions.versionCount) }), 'manual');
                  setVersionPanelOpen(false);
                }}
                onCompare={() => {
                  setVersionPanelOpen(false);
                  setCompareOpen(true);
                }}
                onClose={() => setVersionPanelOpen(false)}
              />
            )}
          </div>
          <button
            onClick={() => {
              setCoachPanelOpen(prev => !prev);
              if (!coachPanelOpen) {
                storyCoach.refresh(chapterId, {
                  chapterContent: content,
                  chapterTitle: chapter?.title,
                  storyContext: storyContext.synopsis ?? '',
                  heteronymVoice: activeHeteronym ? { name: activeHeteronym.name, voice: activeHeteronym.voice, styleNote: activeHeteronym.styleNote } : undefined,
                  language: state.language,
                });
              }
            }}
            className={`text-sm transition-colors p-1.5 rounded-lg hover:bg-parchment-200 ${
              coachPanelOpen ? 'text-brass-500' : 'text-sepia-600 hover:text-sepia-700'
            }`}
            aria-label={t('storyCoach')}
            aria-pressed={coachPanelOpen}
          >
            <Lightbulb size={16} />
          </button>
          <NoRetreatToggle active={noRetreatMode} onToggle={handleNoRetreatToggle} />
          {heteronyms.length > 1 && (
            <button
              onClick={() => setVoiceSwitchOpen(true)}
              className="text-sm text-sepia-600 hover:text-sepia-700 transition-colors p-1.5 rounded-lg hover:bg-parchment-200"
              aria-label={t('switchVoice')}
            >
              <Theater size={16} />
            </button>
          )}
          {sceneChange.canActivate && (
            <button
              onClick={handleSceneChangeDepart}
              className="text-sm text-sepia-600 hover:text-sepia-700 transition-colors p-1.5 rounded-lg hover:bg-parchment-200"
              aria-label={t('sceneChange')}
            >
              <Shuffle size={16} />
            </button>
          )}
          <button
            onClick={() => {
              if (!braindump.speech.isSupported) {
                setToolbarMessage('unsupported');
                return;
              }
              if (braindump.speech.permissionState === 'denied') {
                setToolbarMessage('denied');
                return;
              }
              setToolbarMessage(null);
              braindump.openPanel();
            }}
            className={`text-sm transition-colors p-1.5 rounded-lg hover:bg-parchment-200 ${
              braindump.panelOpen ? 'text-red-400' : 'text-sepia-600 hover:text-sepia-700'
            }`}
            aria-label={t('voiceBraindump')}
          >
            <Mic size={16} />
          </button>
          <button
            onClick={braindump.openHistory}
            className="text-sm text-sepia-600 hover:text-sepia-700 transition-colors p-1.5 rounded-lg hover:bg-parchment-200"
            aria-label={t('braindumpHistory')}
          >
            <ClipboardList size={16} />
          </button>
          <button
            onClick={handleExitWithGuard}
            className="text-sm text-sepia-600 hover:text-sepia-700 transition-colors px-3 py-1 rounded-lg hover:bg-parchment-200"
          >
            {t('exit')}
          </button>
        </div>
      </div>

      {/* Scene change banner */}
      {sceneChange.isActive && sceneChange.sceneState && (
        <div className="relative z-10">
          <SceneChangeBanner
            originalChapterTitle={sceneChange.sceneState.originalChapterTitle}
            remainingSeconds={sceneChange.remainingSeconds}
            isExpired={sceneChange.isExpired}
            extensionsLeft={sceneChange.extensionsLeft}
            onReturn={handleSceneChangeReturn}
            onExtend={sceneChange.grantExtension}
          />
        </div>
      )}

      {/* Braindump toolbar message */}
      {toolbarMessage && (
        <div className="relative z-10 px-6 py-1.5">
          <BraindumpToolbarMessage type={toolbarMessage} onDismiss={() => setToolbarMessage(null)} />
        </div>
      )}

      {/* Editor */}
      <div className="relative z-10 flex-1 flex flex-col items-center px-4 py-8">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder={t('placeholder')}
          className="w-full max-w-3xl flex-1 bg-transparent text-sepia-900 text-lg leading-relaxed font-serif placeholder-sepia-400 focus:outline-none resize-none"
          spellCheck={false}
        />

        {/* Block detector prompt */}
        {blockDetector.blockSignal && !blockDetector.activeDetour && (
          <SceneryChangePrompt
            signal={blockDetector.blockSignal}
            suggestions={blockDetector.suggestions}
            onSelect={blockDetector.startDetour}
            onDismiss={blockDetector.dismiss}
          />
        )}

        {/* Micro-prompt display */}
        {!blockDetector.blockSignal && (
          <div className="w-full max-w-3xl mt-4">
            <MicroPromptDisplay prompt={prompt} isLoading={isLoading} />
          </div>
        )}
      </div>

      {/* Version compare overlay */}
      {compareOpen && chapterVersions.versions.length >= 2 && (
        <VersionCompare
          versions={chapterVersions.versions}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {/* Voice switch modal */}
      {voiceSwitchOpen && (
        <VoiceSwitchModal
          heteronyms={heteronyms}
          activeId={activeHeteronymId}
          guestId={guestHeteronymId}
          onSelect={handleSelectGuest}
          onClearGuest={handleClearGuest}
          onClose={() => setVoiceSwitchOpen(false)}
        />
      )}

      {/* Scene change overlay */}
      {overlayConfig && (
        <SceneChangeOverlay
          message={overlayConfig.message}
          subtitle={overlayConfig.subtitle}
          onComplete={overlayConfig.onComplete}
        />
      )}

      {/* Scene change recovery modal */}
      {showRecoveryModal && sceneChange.sceneState && (
        <SceneChangeRecoveryModal
          originalChapterTitle={sceneChange.sceneState.originalChapterTitle}
          onReturn={handleRecoveryReturn}
          onStayHere={handleRecoveryStay}
        />
      )}

      {/* Braindump panel */}
      {braindump.panelOpen && <BraindumpPanel braindump={braindump} />}

      {/* Braindump history drawer */}
      {braindump.historyOpen && <BraindumpHistoryDrawer braindump={braindump} />}

      {/* Detour editor (full-screen overlay) */}
      {blockDetector.activeDetour && (
        <DetourEditor
          detour={blockDetector.activeDetour}
          onEnd={blockDetector.endDetour}
        />
      )}

      {/* No-Retreat end modal */}
      <NoRetreatEndModal
        open={noRetreatEndOpen}
        stats={{
          wordsWritten: Math.max(0, wordCount - noRetreatStartWordCountRef.current),
          sessionDurationMs: noRetreatStartTimeRef.current > 0 ? Date.now() - noRetreatStartTimeRef.current : 0,
        }}
        onSave={handleNoRetreatSave}
        onBurn={handleNoRetreatBurn}
      />

      {/* Story coach panel */}
      {coachPanelOpen && (
        <CoachPanel
          insights={storyCoach.insights}
          isLoading={storyCoach.isLoading}
          error={storyCoach.error}
          onRefresh={() => storyCoach.refresh(chapterId, {
            chapterContent: content,
            chapterTitle: chapter?.title,
            storyContext: storyContext.synopsis ?? '',
            heteronymVoice: activeHeteronym?.voice,
            language: state.language,
          })}
          onDismiss={storyCoach.dismissInsight}
          onClose={() => setCoachPanelOpen(false)}
        />
      )}

      {/* Closing ritual */}
      <ClosingRitual
        open={closingRitualOpen}
        stats={{
          wordsWritten: wordCount,
          sessionDurationMs: Date.now() - sessionStartTimeRef.current,
          content,
        }}
        onClose={() => {
          setClosingRitualOpen(false);
          onExit();
        }}
      />
    </div>
  );
}
