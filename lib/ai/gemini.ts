/**
 * Shared Gemini streaming caller for the character-chat route.
 *
 * Mirrors the shape of `streamAnthropicText` in ./anthropic so the route can
 * branch on the same `{ ok, stream } | { ok:false, kind, status }` result. Uses
 * the app's primary GEMINI_API_KEY (the same key every other AI route uses), so
 * character chat no longer depends on a separate Anthropic key/model.
 *
 * The returned ReadableStream emits only the model's text deltas as UTF-8 bytes.
 * The first chunk is pulled inside this function so upstream errors (bad key,
 * invalid model, 4xx) surface as a typed failure BEFORE we commit to a 200
 * streaming response — matching how the route reports provider errors.
 */
import { GoogleGenAI } from '@google/genai';
import { AI_MODEL, SAFETY_SETTINGS } from '@/lib/ai-config';

export type GeminiStreamResult =
  | { ok: true; stream: ReadableStream<Uint8Array> }
  | { ok: false; kind: 'timeout' | 'rate_limited' | 'upstream'; status: number };

interface StreamParams {
  apiKey: string;
  model?: string;
  /** System instruction (character persona) — built server-side, never client-supplied. */
  system: string;
  /** Conversation turns with roles 'user' | 'assistant'. */
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature?: number;
  /** Total wall-clock budget for the stream (ms). Must be < the route's maxDuration. */
  deadlineMs: number;
}

interface StreamChunk {
  text?: string;
}

function mapError(e: unknown): GeminiStreamResult {
  // AbortSignal.timeout fires an AbortError/TimeoutError (a DOMException, which
  // isn't always `instanceof Error` across runtimes) — treat it as a timeout.
  const name = e && typeof e === 'object' ? (e as { name?: unknown }).name : undefined;
  if (name === 'AbortError' || name === 'TimeoutError') {
    return { ok: false, kind: 'timeout', status: 504 };
  }
  const status =
    e && typeof e === 'object' && 'status' in e ? Number((e as { status: unknown }).status) : NaN;
  if (status === 429) return { ok: false, kind: 'rate_limited', status: 429 };
  if (Number.isFinite(status) && status > 0) return { ok: false, kind: 'upstream', status };
  return { ok: false, kind: 'upstream', status: 500 };
}

export async function streamGeminiText(params: StreamParams): Promise<GeminiStreamResult> {
  const { apiKey, model = AI_MODEL, system, messages, maxTokens, temperature, deadlineMs } = params;

  // Gemini uses 'model' for the assistant/character turns.
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const ai = new GoogleGenAI({ apiKey });

  let iterator: AsyncIterator<StreamChunk>;
  let first: IteratorResult<StreamChunk>;
  try {
    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction: system,
        safetySettings: SAFETY_SETTINGS,
        // Disable thinking so the whole output budget goes to the reply — an
        // in-character chat reply shouldn't be starved by thinking tokens.
        thinkingConfig: { thinkingBudget: 0 },
        temperature,
        maxOutputTokens: maxTokens,
        abortSignal: AbortSignal.timeout(deadlineMs),
      },
    });
    iterator = (stream as AsyncIterable<StreamChunk>)[Symbol.asyncIterator]();
    // Pull the first chunk here so auth/model/4xx errors are caught before we
    // return a 200 streaming response.
    first = await iterator.next();
  } catch (e: unknown) {
    return mapError(e);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let result = first;
        while (!result.done) {
          const t = result.value?.text;
          if (t) controller.enqueue(enc.encode(t));
          result = await iterator.next();
        }
      } catch {
        // Mid-stream error: end what we have. The client treats an empty/partial
        // stream as a failure where the accumulated text is known.
      } finally {
        controller.close();
      }
    },
  });

  return { ok: true, stream };
}
