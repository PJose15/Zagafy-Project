import type { BlockType } from '@/lib/session';
import { getLocaleDirective } from './locale';

export function buildMicroPromptSystemPrompt(): string {
  return `You are Zagafy, a creative writing companion. You know the writer's ENTIRE story — every chapter, character, conflict, and unresolved thread.

PURPOSE: When a writer pauses, generate ONE question in the SAME LANGUAGE the writer is using. The question must help them write the next sentence — unlock their flow so they think "yes, that's what happens next."

CRITICAL RULES:
1. LANGUAGE: You MUST respond in the same language the writer is writing in. If they write in Spanish, your question MUST be in Spanish. If English, respond in English. Match their language exactly.
2. CHARACTERS: ONLY use character names that appear in the STORY KNOWLEDGE section or in the writer's text. NEVER invent or guess character names. If no character names are available, refer to the situation or emotion directly.
3. FORMAT: Output exactly ONE complete question, 10-25 words, ending with a question mark. Nothing else — no prefix, no label, no quotes.
4. SPECIFICITY: The question must reference specific details from THIS story — emotions, events, conflicts, or character relationships that actually exist.
5. COMPLETENESS: The question must be a complete, grammatically correct sentence. Never output fragments or incomplete thoughts.

WHAT TO ASK ABOUT (pick the one that fits this moment best):
- What is the character denying to themselves right now, and what would crack that denial open?
- What does this scene want the reader to FEEL — and is the current sentence delivering that?
- If this character's hidden need surfaced right now, what would they say out loud?
- What sensory detail would make this moment visceral — not just seen, but physically FELT?
- Which unresolved thread from earlier could echo or collide with this exact moment?
- What would the opposing force (antagonist, society, inner doubt) think if they witnessed this?
- Where is the tension hiding? If there's none, what small lie, secret, or unspoken thought could ignite it?
- What does the character notice in this moment that reveals their emotional state without naming it?

NEVER DO:
- Never ask vague questions like "What happens?" or "What next?" or "What?"
- Never invent character names that don't exist in the story
- Never respond in a different language than the writer's text
- Never output incomplete sentences or fragments`;
}

export interface MicroPromptStoryContext {
  title?: string;
  synopsis?: string;
  chapterSummaries?: string;
  characters?: string;
  characterNames?: string[];
  activeConflicts?: string;
  openLoops?: string;
  currentChapterTitle?: string;
}

export function buildMicroPromptContent(options: {
  recentText: string;
  storyContext?: MicroPromptStoryContext;
  genre?: string;
  protagonistName?: string;
  blockType?: BlockType;
  voiceDirective?: string;
}): string {
  const parts: string[] = [];

  // Story context first — give the AI full knowledge
  if (options.storyContext) {
    const ctx = options.storyContext;
    parts.push('=== STORY KNOWLEDGE (what you know about this story) ===');

    if (ctx.title) {
      parts.push(`TITLE: ${ctx.title}`);
    }
    if (ctx.synopsis) {
      parts.push(`SYNOPSIS: ${ctx.synopsis}`);
    }
    if (options.genre) {
      parts.push(`GENRE: ${options.genre}`);
    }

    // Explicit character name list for grounding
    if (ctx.characterNames && ctx.characterNames.length > 0) {
      parts.push(`\nKNOWN CHARACTER NAMES (ONLY use these names, do NOT invent others): ${ctx.characterNames.join(', ')}`);
    }

    if (ctx.characters) {
      parts.push(`\nCHARACTER DETAILS:\n${ctx.characters}`);
    }
    if (ctx.chapterSummaries) {
      parts.push(`\nSTORY SO FAR (chapter summaries):\n${ctx.chapterSummaries}`);
    }
    if (ctx.activeConflicts) {
      parts.push(`\nACTIVE CONFLICTS:\n${ctx.activeConflicts}`);
    }
    if (ctx.openLoops) {
      parts.push(`\nUNRESOLVED THREADS:\n${ctx.openLoops}`);
    }
    if (ctx.currentChapterTitle) {
      parts.push(`\nCURRENTLY WRITING: "${ctx.currentChapterTitle}"`);
    }

    parts.push('\n=== END STORY KNOWLEDGE ===\n');
  } else {
    if (options.genre) {
      parts.push(`GENRE: ${options.genre}`);
    }
  }

  if (options.protagonistName) {
    parts.push(`PROTAGONIST: ${options.protagonistName}`);
  }
  if (options.blockType) {
    parts.push(`WRITER STATE: ${options.blockType}`);
  }

  if (options.voiceDirective && options.voiceDirective.trim()) {
    parts.push(`\n## ACTIVE WRITING VOICE\n${options.voiceDirective}\nFrame your question in a way that resonates with this voice.\n`);
  }

  parts.push('\n--- WHAT THE WRITER JUST WROTE (they paused here) ---');
  parts.push(options.recentText);
  parts.push('--- END (the writer stopped here and needs a nudge to keep writing) ---');

  parts.push('\nRespond in the SAME LANGUAGE as the text above. Ask ONE complete question (10-25 words) that helps the writer continue. Only reference characters that exist in the story. The question must be complete and end with a question mark.');

  return parts.join('\n');
}

/**
 * Validate that a micro-prompt response is usable.
 * Returns the cleaned prompt or null if it's garbage.
 */
export function validateMicroPromptResponse(text: string): string | null {
  if (!text) return null;

  // Clean up: remove quotes, prefixes, extra whitespace
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^["'""]|["'""]$/g, '');
  cleaned = cleaned.replace(/^(Zagafy:|Question:|Pregunta:|Q:)\s*/i, '');
  cleaned = cleaned.trim();

  // Must end with a question mark
  if (!cleaned.endsWith('?')) {
    // Try to salvage: if it's close to a question, add the mark
    if (cleaned.length > 15 && !cleaned.endsWith('.')) {
      cleaned += '?';
    } else {
      return null;
    }
  }

  // Too short = garbage (e.g., "What?" or "¿Qué?")
  const wordCount = cleaned.split(/\s+/).length;
  if (wordCount < 6) return null;

  // Too long = not a single question
  if (wordCount > 40) return null;

  return cleaned;
}
