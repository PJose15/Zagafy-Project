import { NextRequest } from 'next/server';
import { GoogleGenAI, FinishReason, Content } from '@google/genai';
import { buildWritingAssistantPrompt } from '@/lib/prompts/writing-assistant';
import { rateLimit } from '@/lib/rate-limit';
import { requireUser, isAuthError } from '@/lib/auth';
import { AI_MODEL, SAFETY_SETTINGS, AI_CONFIG } from '@/lib/ai-config';
import { getErrorStatus } from '@/lib/api-error';
import { ok, err, statusToCode, makeRequestId } from '@/lib/api-response';
import { withRetry } from '@/lib/ai/retry';
import { createRouteLogger } from '@/lib/logger';
import { safeParseGeminiResponse } from '@/lib/ai/safe-json-parse';
import {
  NORMAL_RESPONSE_SCHEMA,
  BLOCKED_RESPONSE_SCHEMA,
  type ChatResponseNormal,
  type ChatResponseBlocked,
} from '@/lib/types/chat-response';
import { validateNormalResponse, validateBlockedResponse, type KnownEntities } from '@/lib/ai/chat-validation';

export const maxDuration = 60;

const MAX_HISTORY_TURNS = 10;
const MAX_TURN_CHARS = 2000;

export async function POST(req: NextRequest) {
  const requestId = makeRequestId();
  const log = createRouteLogger({ endpoint: '/api/chat', requestId });
  const limited = await rateLimit(req, { maxRequests: 10, windowMs: 60000 });
  if (limited) return limited;

  const authResult = await requireUser();
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const { userInput, isBlockedRequest, language, chatHistory, knownEntities, blockType } = body;
    const heteronym = body.heteronym && typeof body.heteronym === 'object' && typeof body.heteronym.name === 'string'
      ? body.heteronym : null;
    const storyContext = typeof body.storyContext === 'string' ? body.storyContext : '';

    if (typeof userInput !== 'string' || !userInput.trim()) {
      return err('validation_failed', 'Missing required field: userInput', 400);
    }
    if (typeof language !== 'string' || !language.trim()) {
      return err('validation_failed', 'Missing required field: language', 400);
    }

    // Validate and build multi-turn history
    const history = buildMultiTurnHistory(chatHistory);
    const historyTextLength = history.reduce((sum, c) =>
      sum + (c.parts?.reduce((s, p) => s + ((p as { text?: string }).text?.length || 0), 0) || 0), 0);

    const totalLength = storyContext.length + userInput.length + historyTextLength;
    if (totalLength > 500000) {
      return err('validation_failed', 'Request payload too large (max 500KB of text)', 413);
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return err('internal_error', 'API key not configured', 500);
    }

    const ai = new GoogleGenAI({ apiKey });
    const isBlocked = !!isBlockedRequest;
    const systemPrompt = buildWritingAssistantPrompt(language, blockType, heteronym ?? null);
    const config = isBlocked ? AI_CONFIG.chatBlocked : AI_CONFIG.chat;
    const responseSchema = isBlocked ? BLOCKED_RESPONSE_SCHEMA : NORMAL_RESPONSE_SCHEMA;

    const totalHistoryItems = Array.isArray(chatHistory) ? chatHistory.length : 0;
    const truncated = totalHistoryItems > MAX_HISTORY_TURNS * 2;
    const truncationNotice = truncated
      ? `[Note: This conversation has ${totalHistoryItems} messages but only the most recent ${MAX_HISTORY_TURNS} exchanges are included. Earlier discussion may be missing. If the user references something you don't recall, explain that older messages were trimmed.]\n\n`
      : '';

    const contextMessage = `${truncationNotice}<story_context>\n${storyContext}\n</story_context>\n\n<user_request>\n${userInput}\n</user_request>`;

    // Use multi-turn chat with history
    const chat = ai.chats.create({
      model: AI_MODEL,
      history,
      config: {
        systemInstruction: systemPrompt,
        safetySettings: SAFETY_SETTINGS,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        responseMimeType: 'application/json',
        responseSchema,
      },
    });

    const response = await withRetry(() => chat.sendMessage({ message: contextMessage }));

    // Check if the response was blocked or truncated
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.PROHIBITED_CONTENT || finishReason === FinishReason.BLOCKLIST) {
      return ok({
        text: 'The AI could not generate a response for this request. Try rephrasing your input or adjusting the scene context.',
        isBlockedMode: isBlocked,
        blocked: true,
      });
    }

    const rawText = response.text || '';

    // Parse structured JSON response
    const fallbackShape = isBlocked
      ? { currentState: '', diagnosis: '', nextPaths: [], bestRecommendation: '', sceneStarter: '' }
      : { contextUsed: [], informationGaps: [], conflictsDetected: [], recommendation: '', alternatives: [], generatedText: rawText, confidenceNotes: [] };

    const parsed = safeParseGeminiResponse<ChatResponseNormal | ChatResponseBlocked>(
      rawText,
      fallbackShape as ChatResponseNormal | ChatResponseBlocked
    );

    // If parsing fell back to fallback and there's raw text, use legacy format
    if (parsed === fallbackShape && rawText) {
      let text = rawText;
      if (finishReason === FinishReason.MAX_TOKENS && text) {
        text += '\n\n---\n*Response was truncated due to length. Ask me to continue if needed.*';
      }
      return ok({
        text: text || 'I could not generate a response.',
        isBlockedMode: isBlocked,
      });
    }

    // Validate against known entities if provided
    const entities: KnownEntities = knownEntities && typeof knownEntities === 'object'
      ? {
          characters: Array.isArray(knownEntities.characters) ? knownEntities.characters : [],
          chapters: Array.isArray(knownEntities.chapters) ? knownEntities.chapters : [],
          locations: Array.isArray(knownEntities.locations) ? knownEntities.locations : [],
        }
      : { characters: [], chapters: [], locations: [] };

    let validated;
    if (isBlocked) {
      const blockedResponse = ensureBlockedShape(parsed as ChatResponseBlocked);
      validated = entities.characters.length > 0
        ? validateBlockedResponse(blockedResponse, entities)
        : { ...blockedResponse, validationWarnings: [] };
    } else {
      const normalResponse = ensureNormalShape(parsed as ChatResponseNormal);
      validated = entities.characters.length > 0
        ? validateNormalResponse(normalResponse, entities)
        : normalResponse;
    }

    // Build legacy text from structured response for backward compatibility
    const text = isBlocked
      ? buildBlockedText(validated as ChatResponseBlocked & { validationWarnings?: string[] })
      : buildNormalText(validated as ChatResponseNormal);

    let finalText = text;
    if (finishReason === FinishReason.MAX_TOKENS && finalText) {
      finalText += '\n\n---\n*Response was truncated due to length. Ask me to continue if needed.*';
    }

    return ok({
      text: finalText || 'I could not generate a response.',
      isBlockedMode: isBlocked,
      structured: validated,
    });

  } catch (error: unknown) {
    log.error('Chat API error', error);
    const status = getErrorStatus(error);
    const message = status === 429
      ? 'AI quota exceeded. Please wait a few minutes and try again, or upgrade your API key.'
      : 'Failed to generate response';
    return err(statusToCode(status), message, status);
  }
}

/**
 * Convert client chat history to Gemini multi-turn Content[] format.
 */
function buildMultiTurnHistory(
  chatHistory: unknown
): Content[] {
  if (!Array.isArray(chatHistory)) return [];

  const contents: Content[] = [];
  const items = chatHistory.slice(-MAX_HISTORY_TURNS * 2); // Keep last N turns (user+model pairs)

  for (const item of items) {
    if (typeof item === 'object' && item !== null && 'role' in item && 'content' in item) {
      const role = (item as { role: string }).role;
      const content = String((item as { content: string }).content).slice(0, MAX_TURN_CHARS);
      const geminiRole = role === 'assistant' || role === 'model' ? 'model' : 'user';
      contents.push({ role: geminiRole, parts: [{ text: content }] });
    } else if (typeof item === 'string') {
      // Legacy format: "User: msg" or "Assistant: msg"
      const text = item.slice(0, MAX_TURN_CHARS);
      if (item.startsWith('Assistant:') || item.startsWith('Model:')) {
        contents.push({ role: 'model', parts: [{ text: text.replace(/^(Assistant|Model):\s*/, '') }] });
      } else {
        contents.push({ role: 'user', parts: [{ text: text.replace(/^User:\s*/, '') }] });
      }
    }
  }

  // Gemini requires alternating user/model turns — deduplicate consecutive same-role
  const deduped: Content[] = [];
  for (const c of contents) {
    if (deduped.length > 0 && deduped[deduped.length - 1].role === c.role) {
      // Merge into previous
      const prev = deduped[deduped.length - 1];
      const prevText = (prev.parts?.[0] as { text?: string })?.text || '';
      const curText = (c.parts?.[0] as { text?: string })?.text || '';
      prev.parts = [{ text: prevText + '\n' + curText }];
    } else {
      deduped.push(c);
    }
  }

  return deduped;
}

/** Ensure normal response has all expected fields */
function ensureNormalShape(r: Partial<ChatResponseNormal>): ChatResponseNormal {
  return {
    contextUsed: Array.isArray(r.contextUsed) ? r.contextUsed : [],
    informationGaps: Array.isArray(r.informationGaps) ? r.informationGaps : [],
    conflictsDetected: Array.isArray(r.conflictsDetected) ? r.conflictsDetected : [],
    recommendation: typeof r.recommendation === 'string' ? r.recommendation : '',
    alternatives: Array.isArray(r.alternatives) ? r.alternatives : [],
    generatedText: typeof r.generatedText === 'string' ? r.generatedText : '',
    confidenceNotes: Array.isArray(r.confidenceNotes) ? r.confidenceNotes : [],
  };
}

/** Ensure blocked response has all expected fields */
function ensureBlockedShape(r: Partial<ChatResponseBlocked>): ChatResponseBlocked {
  return {
    currentState: typeof r.currentState === 'string' ? r.currentState : '',
    diagnosis: typeof r.diagnosis === 'string' ? r.diagnosis : '',
    nextPaths: Array.isArray(r.nextPaths) ? r.nextPaths : [],
    bestRecommendation: typeof r.bestRecommendation === 'string' ? r.bestRecommendation : '',
    sceneStarter: typeof r.sceneStarter === 'string' ? r.sceneStarter : '',
  };
}

/** Build markdown text from normal structured response (backward compat) */
function buildNormalText(r: ChatResponseNormal): string {
  const parts: string[] = [];

  if (r.contextUsed.length > 0 && r.contextUsed[0] !== 'None') {
    parts.push(`### Context Used\n${r.contextUsed.map(c => `- ${c}`).join('\n')}`);
  }

  if (r.informationGaps.length > 0 && r.informationGaps[0] !== 'None') {
    parts.push(`### Information Gaps\n${r.informationGaps.map(g => `- ${g}`).join('\n')}`);
  }

  if (r.conflictsDetected.length > 0 && r.conflictsDetected[0] !== 'None') {
    parts.push(`### Conflicts Detected\n${r.conflictsDetected.map(c => `- ${c}`).join('\n')}`);
  }

  if (r.recommendation) {
    parts.push(`### Recommendation\n${r.recommendation}`);
  }

  if (r.alternatives.length > 0) {
    parts.push(`### Alternatives\n${r.alternatives.map(a => `- ${a}`).join('\n')}`);
  }

  if (r.generatedText) {
    parts.push(`### Generated Text\n${r.generatedText}`);
  }

  if (r.confidenceNotes.length > 0) {
    parts.push(`### Confidence Notes\n${r.confidenceNotes.map(n => `- ${n}`).join('\n')}`);
  }

  return parts.join('\n\n');
}

/** Build markdown text from blocked structured response (backward compat) */
function buildBlockedText(r: ChatResponseBlocked & { validationWarnings?: string[] }): string {
  const parts: string[] = [];

  if (r.currentState) {
    parts.push(`### Current Narrative State\n${r.currentState}`);
  }

  if (r.diagnosis) {
    parts.push(`### Diagnosis: Why You Might Be Blocked\n${r.diagnosis}`);
  }

  if (r.nextPaths.length > 0) {
    const pathLines = r.nextPaths.map(p => `- **${p.label}**: ${p.description}`).join('\n');
    parts.push(`### Next Paths\n${pathLines}`);
  }

  if (r.bestRecommendation) {
    parts.push(`### Best Recommended Next Move\n${r.bestRecommendation}`);
  }

  if (r.sceneStarter) {
    parts.push(`### Scene Starter\n${r.sceneStarter}`);
  }

  if (r.validationWarnings && r.validationWarnings.length > 0) {
    parts.push(`### Validation Notes\n${r.validationWarnings.map(w => `- ${w}`).join('\n')}`);
  }

  return parts.join('\n\n');
}
