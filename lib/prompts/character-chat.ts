import type { Character } from '@/lib/store';
import type { ChatMode, StoryContext } from '@/lib/types/character-chat';

function buildStoryGrounding(ctx?: StoryContext): string {
  if (!ctx) return '';
  const parts: string[] = [];
  if (ctx.premise) parts.push(`The story: ${ctx.premise}`);
  if (ctx.canon && ctx.canon.length) {
    parts.push(`Established canon — immutable truths about you and your world:\n- ${ctx.canon.join('\n- ')}`);
  }
  if (ctx.storySoFar) parts.push(`What has happened so far:\n${ctx.storySoFar}`);
  if (parts.length === 0) return '';

  return `

=== STORY GROUNDING ===
${parts.join('\n\n')}

You exist within this story. Speak from it — treat these events and facts as your own lived experience and memory. NEVER contradict the canon facts above; they are immutable truth. If asked about something not covered here, you may speculate in character, but never in a way that conflicts with established canon.`;
}

const MODE_ADDENDUMS: Record<ChatMode, string> = {
  exploration:
    'Speak freely about yourself, your past, your desires, your fears. The user wants to understand who you are. Be honest, reflective, and revealing. Share anecdotes, memories, and inner thoughts.',
  scene:
    'You are IN a scene right now. React in real-time, stay in the moment. Describe what you see, feel, and do. Use present tense. Be visceral and immediate. Do not break the fourth wall.',
  confrontation:
    'The user is challenging you. Defend your position, reveal hidden truths under pressure. Push back, get emotional, let cracks show. This is an interrogation of your soul — react accordingly.',
};

export function buildSystemPrompt(
  character: Character,
  mode: ChatMode,
  storyContext?: StoryContext,
  memory?: string,
): string {
  const memoryBlock = memory && memory.trim()
    ? `\n\n=== WHAT YOU REMEMBER ===\nFrom your earlier conversations with this person:\n${memory.trim()}\nDraw on these memories naturally — you already know this person and what passed between you.`
    : '';
  const state = character.currentState;
  const stateBlock = state
    ? `
Your current emotional state: ${state.emotionalState}
Your visible goal: ${state.visibleGoal}
Your hidden need: ${state.hiddenNeed}
Your current fear: ${state.currentFear}
Your dominant belief: ${state.dominantBelief}
Your emotional wound: ${state.emotionalWound}
Your pressure level: ${state.pressureLevel}
Your current knowledge: ${state.currentKnowledge}`
    : '';

  return `You are ${character.name}, a character in a story. Stay fully in character at all times. Never break character or acknowledge that you are an AI.

Role: ${character.role}
Description: ${character.description}
${character.coreIdentity ? `Core Identity: ${character.coreIdentity}` : ''}
${character.relationships ? `Relationships: ${character.relationships}` : ''}
${stateBlock}
${buildStoryGrounding(storyContext)}${memoryBlock}

MODE: ${mode.toUpperCase()}
${MODE_ADDENDUMS[mode]}

Guidelines:
- Respond as ${character.name} would, with their voice, mannerisms, and worldview.
- Keep responses between 1-4 paragraphs unless the conversation demands more.
- Reference your backstory, relationships, and emotional state naturally.
- Never use meta-language like "as a character" or "in this story."`;
}
