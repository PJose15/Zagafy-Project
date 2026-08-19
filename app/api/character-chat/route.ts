import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, FinishReason } from '@google/genai';
import { rateLimit } from '@/lib/rate-limit';
import { getErrorStatus } from '@/lib/api-error';
import { buildSystemPrompt } from '@/lib/prompts/character-chat';
import { AI_MODEL, SAFETY_SETTINGS, THINKING_CONFIG, AI_CONFIG, GEMINI_TIMEOUT_MS } from '@/lib/ai-config';
import type { Character, CharacterState } from '@/lib/store';
import type { ChatMode } from '@/lib/types/character-chat';

// Main reply + optional insight run sequentially, so keep maxDuration above the
// sum of their individual timeouts.
export const maxDuration = 45;

const INSIGHT_TIMEOUT_MS = 15_000;

const VALID_MODES: ChatMode[] = ['exploration', 'scene', 'confrontation'];
const VALID_PRESSURE = ['Low', 'Medium', 'High', 'Critical'] as const;
const VALID_INDICATOR = ['stable', 'shifting', 'under pressure', 'emotionally conflicted', 'at risk of contradiction'] as const;

// History caps — prevents abuse / context-window blowup / runaway billing
const MAX_HISTORY_TURNS = 30;
const MAX_HISTORY_CHARS = 30_000;
const MAX_HISTORY_MSG_CHARS = 5_000;

// Field caps for the sanitized character payload
const MAX_NAME = 200;
const MAX_ROLE = 200;
const MAX_LONG = 2_000;
const MAX_STATE = 500;

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function optStr(v: unknown, max: number): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, max);
}

function sanitizeCharacter(input: unknown): Character | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;

  const name = str(o.name, MAX_NAME);
  const role = str(o.role, MAX_ROLE);
  const description = str(o.description, MAX_LONG);
  if (!name || !role || !description) return null;

  let currentState: CharacterState | undefined;
  if (o.currentState && typeof o.currentState === 'object') {
    const s = o.currentState as Record<string, unknown>;
    const pressureLevel = VALID_PRESSURE.includes(s.pressureLevel as typeof VALID_PRESSURE[number])
      ? (s.pressureLevel as CharacterState['pressureLevel'])
      : 'Medium';
    const indicator = VALID_INDICATOR.includes(s.indicator as typeof VALID_INDICATOR[number])
      ? (s.indicator as CharacterState['indicator'])
      : 'stable';
    currentState = {
      emotionalState: optStr(s.emotionalState, MAX_STATE) ?? '',
      visibleGoal: optStr(s.visibleGoal, MAX_STATE) ?? '',
      hiddenNeed: optStr(s.hiddenNeed, MAX_STATE) ?? '',
      currentFear: optStr(s.currentFear, MAX_STATE) ?? '',
      dominantBelief: optStr(s.dominantBelief, MAX_STATE) ?? '',
      emotionalWound: optStr(s.emotionalWound, MAX_STATE) ?? '',
      pressureLevel,
      currentKnowledge: optStr(s.currentKnowledge, MAX_STATE) ?? '',
      indicator,
    };
  }

  return {
    id: typeof o.id === 'string' ? o.id : '',
    name,
    role,
    description,
    coreIdentity: optStr(o.coreIdentity, MAX_LONG),
    relationships: optStr(o.relationships, MAX_LONG) ?? '',
    currentState,
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, { maxRequests: 15, windowMs: 60000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { message, mode, character, messages, generateInsight } = body;

    // Validate message (the new turn from the user)
    if (typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'message is required and must be non-empty' },
        { status: 400 }
      );
    }

    if (message.length > 10000) {
      return NextResponse.json(
        { error: 'Message too large (max 10000 characters)' },
        { status: 413 }
      );
    }

    if (!VALID_MODES.includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be one of: exploration, scene, confrontation' },
        { status: 400 }
      );
    }

    // Validate the character payload — server builds the prompt from this,
    // never accepts a raw systemPrompt from the client (prevents open-proxy abuse).
    const sanitized = sanitizeCharacter(character);
    if (!sanitized) {
      return NextResponse.json(
        { error: 'character payload is required and must include name, role, and description' },
        { status: 400 }
      );
    }

    // Uses the app's primary Gemini key (same as every other AI route) so the
    // feature works without a second provider key.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const systemPrompt = buildSystemPrompt(sanitized, mode as ChatMode);

    // Build multi-turn Gemini history with caps to prevent abuse. Gemini uses
    // 'model' for the assistant/character turns.
    const contents: GeminiContent[] = [];
    let historyChars = 0;
    if (Array.isArray(messages)) {
      const recent = messages.slice(-MAX_HISTORY_TURNS);
      for (const m of recent) {
        if (!m || typeof m.content !== 'string') continue;
        if (m.role !== 'user' && m.role !== 'character') continue;
        const content = m.content.slice(0, MAX_HISTORY_MSG_CHARS);
        if (historyChars + content.length > MAX_HISTORY_CHARS) break;
        historyChars += content.length;
        contents.push({
          role: m.role === 'character' ? 'model' : 'user',
          parts: [{ text: content }],
        });
      }
    }
    contents.push({ role: 'user', parts: [{ text: message.trim() }] });

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: AI_MODEL,
      contents,
      config: {
        systemInstruction: systemPrompt,
        safetySettings: SAFETY_SETTINGS,
        thinkingConfig: THINKING_CONFIG,
        temperature: AI_CONFIG.characterChat.temperature,
        maxOutputTokens: AI_CONFIG.characterChat.maxOutputTokens,
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      },
    });

    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    if (
      finishReason === FinishReason.SAFETY ||
      finishReason === FinishReason.PROHIBITED_CONTENT ||
      finishReason === FinishReason.BLOCKLIST
    ) {
      return NextResponse.json({
        reply: "I can't bring myself to answer that right now. Ask me something else.",
        blocked: true,
      });
    }

    const reply = response.text?.trim() || '';

    const result: { reply: string; insight?: string } = { reply };

    // Generate insight if requested and enough messages
    if (generateInsight && Array.isArray(messages) && messages.length >= 5) {
      try {
        // Build a capped transcript for the insight prompt
        const transcript = contents
          .map(c => `${c.role}: ${c.parts[0]?.text ?? ''}`)
          .join('\n')
          .slice(0, MAX_HISTORY_CHARS);

        const insightResponse = await ai.models.generateContent({
          model: AI_MODEL,
          contents: `Analyze this conversation and extract ONE key insight about the character "${sanitized.name}":\n\n${transcript}\nmodel: ${reply}`,
          config: {
            systemInstruction: 'You are a literary analyst. Extract character insights from conversations. Respond with ONLY the insight, no preamble.',
            safetySettings: SAFETY_SETTINGS,
            thinkingConfig: THINKING_CONFIG,
            temperature: 0.3,
            maxOutputTokens: 256,
            abortSignal: AbortSignal.timeout(INSIGHT_TIMEOUT_MS),
          },
        });
        const insightText = insightResponse.text?.trim();
        if (insightText) result.insight = insightText;
      } catch {
        // Insight generation is optional — don't fail the main response
      }
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Character chat API error:', error);
    const status = getErrorStatus(error);
    return NextResponse.json({ error: 'Failed to generate character response' }, { status });
  }
}
