export type BlockSeverity = 'mild' | 'moderate' | 'severe';

export type BlockIndicator =
  | 'low_wpm'
  | 'high_deletion'
  | 'frequent_pauses'
  | 'idle';

export interface BlockSignal {
  severity: BlockSeverity;
  indicators: BlockIndicator[];
  metrics: {
    wpm: number;
    deletionRatio: number;
    pauseCount: number;
    idleSeconds: number;
  };
  detectedAt: number; // epoch ms
}

export type DetourType =
  | 'dialogue_sprint'
  | 'alternate_pov'
  | 'sensory_snapshot'
  | 'villains_diary'
  | 'flash_forward'
  | 'character_interview';

export interface DetourSuggestion {
  type: DetourType;
  /** Legacy English title — i18n renders `flow.detourCatalog.{type}.title`. */
  title: string;
  /** Legacy English prompt — i18n renders `flow.detourCatalog.{type}.prompt`. */
  prompt: string;
  /**
   * The single dynamic value the prompt template personalizes with (character
   * name, chapter title or genre). `null` = the story had no matching data —
   * the renderer substitutes a translated default. `undefined` = legacy
   * record from before i18n — the renderer falls back to the stored `prompt`.
   */
  promptParam?: string | null;
  durationMinutes: number;
}

export interface DetourSession {
  id: string;
  type: DetourType;
  startedAt: string;    // ISO timestamp
  endedAt: string | null;
  prompt: string;
  /** See DetourSuggestion.promptParam. */
  promptParam?: string | null;
  content: string;
  wordCount: number;
}
