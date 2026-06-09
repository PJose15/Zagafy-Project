import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createRouteLogger } from '@/lib/logger';
import { makeRequestId } from '@/lib/api-response';

/**
 * Phase 5.11 -- production observability: metrics collection.
 *
 * Three data sinks receive every metric:
 *
 * 1. **Structured log** -- JSON-formatted for Vercel log drain indexing.
 *    Filter by `_metric` field to find specific metric types.
 * 2. **Sentry** -- custom spans + measurements for p50/p95/p99 latency
 *    dashboards and alert rules (error rate, latency thresholds).
 * 3. **PostHog** -- event properties for product dashboards (AI spend,
 *    DAU, activation funnels).
 *
 * Usage in API routes:
 *
 *   // Automatic instrumentation (wrap the handler):
 *   export const POST = withMetrics('/api/chat', async (req) => { ... });
 *
 *   // Manual AI cost tracking (inside the handler, after AI response):
 *   recordAICost({
 *     userId, model: 'gemini-2.5-flash',
 *     inputTokens: 500, outputTokens: 1200,
 *     endpoint: '/api/chat',
 *   });
 */

// -- Types ----------------------------------------------------------------

export interface EndpointMetric {
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
  userId?: string;
  error?: boolean;
}

export interface AICostEntry {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  endpoint: string;
  requestId?: string;
}

// -- Model cost table (USD per 1K tokens, approximate) --------------------

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash':             { input: 0.00015,  output: 0.0006  },
  'gemini-2.0-flash':             { input: 0.00015,  output: 0.0006  },
  'gemini-1.5-flash':             { input: 0.000075, output: 0.0003  },
  'gemini-1.5-pro':               { input: 0.00125,  output: 0.005   },
  'claude-sonnet-4-5-20250929':   { input: 0.003,    output: 0.015   },
  'claude-3-5-sonnet-20241022':   { input: 0.003,    output: 0.015   },
};

/** Conservative fallback for unrecognized models. */
const DEFAULT_COST = { input: 0.003, output: 0.015 };

/**
 * Estimate cost in USD cents for an AI API call.
 * Returns a number with up to 3 decimal places.
 */
export function estimateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = MODEL_COSTS[model] ?? DEFAULT_COST;
  const usd =
    (inputTokens / 1000) * rates.input +
    (outputTokens / 1000) * rates.output;
  // Convert to cents, round to 3 decimal places
  return Math.round(usd * 100 * 1000) / 1000;
}

// -- Sentry integration ---------------------------------------------------

function forwardToSentry(metric: EndpointMetric): void {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  void import('@sentry/nextjs')
    .then((Sentry) => {
      // Attach measurements to the active span if one exists
      // (Sentry's Next.js integration auto-creates spans for API routes).
      const span = Sentry.getActiveSpan();
      if (span) {
        span.setAttribute('http.route', metric.endpoint);
        span.setAttribute('zagafy.duration_ms', metric.durationMs);
        span.setAttribute('zagafy.status_code', metric.statusCode);
        if (metric.userId) span.setAttribute('zagafy.user_id', metric.userId);
      }
    })
    .catch(() => {
      /* Sentry unavailable; structured log already emitted. */
    });
}

function forwardCostToSentry(
  costCents: number,
  model: string,
  endpoint: string,
): void {
  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  void import('@sentry/nextjs')
    .then((Sentry) => {
      const span = Sentry.getActiveSpan();
      if (span) {
        span.setAttribute('zagafy.ai_cost_cents', costCents);
        span.setAttribute('zagafy.ai_model', model);
        span.setAttribute('http.route', endpoint);
      }
    })
    .catch(() => {});
}

// -- PostHog integration --------------------------------------------------

async function trackMetricInPostHog(
  event: string,
  distinctId: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  try {
    const { PostHog } = await import('posthog-node');
    const host =
      process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
    const client = new PostHog(apiKey, { host });
    client.capture({ distinctId, event, properties });
    await client.shutdown();
  } catch {
    // Analytics should never break application flow
  }
}

// -- Public API -----------------------------------------------------------

const metricLog = createRouteLogger({ endpoint: 'metrics' });

/**
 * Record an API endpoint metric (latency + success/error).
 * Called automatically by `withMetrics()`, or manually from routes that
 * need to attach a userId.
 */
export function recordEndpointMetric(metric: EndpointMetric): void {
  const isError = metric.error ?? metric.statusCode >= 500;

  // 1. Structured log for Vercel
  metricLog.info('metric:endpoint', {
    _metric: 'endpoint',
    endpoint: metric.endpoint,
    method: metric.method,
    statusCode: metric.statusCode,
    durationMs: metric.durationMs,
    error: isError,
    requestId: metric.requestId,
    userId: metric.userId,
  });

  // 2. Sentry span attributes (fire-and-forget)
  forwardToSentry(metric);

  // 3. PostHog (fire-and-forget, only for authenticated requests)
  if (metric.userId) {
    void trackMetricInPostHog('$api_request', metric.userId, {
      endpoint: metric.endpoint,
      method: metric.method,
      status_code: metric.statusCode,
      duration_ms: metric.durationMs,
      is_error: isError,
    });
  }
}

/**
 * Record an AI API call cost. Call this after receiving the AI response,
 * passing the token counts from the response metadata.
 *
 * Costs are estimated from the model cost table and logged as cents.
 */
export function recordAICost(entry: AICostEntry): void {
  const costCents = estimateTokenCost(
    entry.model,
    entry.inputTokens,
    entry.outputTokens,
  );

  // 1. Structured log
  metricLog.info('metric:ai_cost', {
    _metric: 'ai_cost',
    userId: entry.userId,
    model: entry.model,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    costCents,
    endpoint: entry.endpoint,
    requestId: entry.requestId,
  });

  // 2. Sentry span attributes
  forwardCostToSentry(costCents, entry.model, entry.endpoint);

  // 3. PostHog
  void trackMetricInPostHog('ai_cost_recorded', entry.userId, {
    model: entry.model,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    cost_cents: costCents,
    endpoint: entry.endpoint,
  });

  // 4. Alert: per-call spend threshold
  const thresholdCents = Number(process.env.DAILY_AI_SPEND_ALERT_CENTS);
  if (thresholdCents > 0 && costCents >= thresholdCents) {
    metricLog.warn('ai_cost:call_exceeds_threshold', {
      costCents,
      thresholdCents,
      model: entry.model,
      userId: entry.userId,
      endpoint: entry.endpoint,
    });
  }
}

/**
 * Record sync engine queue depth. Call from the sync push/pull endpoints
 * with the number of pending deltas.
 */
export function recordSyncQueueDepth(
  depth: number,
  userId?: string,
): void {
  metricLog.info('metric:sync_queue', {
    _metric: 'sync_queue_depth',
    depth,
    userId,
  });

  const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    void import('@sentry/nextjs')
      .then((Sentry) => {
        const span = Sentry.getActiveSpan();
        if (span) {
          span.setAttribute('zagafy.sync_queue_depth', depth);
        }
      })
      .catch(() => {});
  }
}

// -- Route handler wrapper ------------------------------------------------

type RouteHandler = (
  req: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<NextResponse | Response>;

/**
 * Wrap an API route handler with automatic metrics collection.
 *
 * Records per-request:
 * - Latency (start to response)
 * - HTTP status code
 * - Error flag (5xx responses)
 *
 * Also wraps the handler in a Sentry span for performance tracing
 * (p50/p95/p99 latency in Sentry dashboards).
 *
 * Usage:
 *   export const POST = withMetrics('/api/chat', async (req) => {
 *     // existing handler body -- no changes needed
 *   });
 */
export function withMetrics(
  endpoint: string,
  handler: RouteHandler,
): RouteHandler {
  return async (req, context) => {
    const requestId = makeRequestId();
    const start = performance.now();
    let statusCode = 500;

    try {
      const dsn =
        process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

      let response: NextResponse | Response;

      if (dsn) {
        // Wrap in a Sentry span for performance tracing
        const Sentry = await import('@sentry/nextjs').catch(() => null);
        if (Sentry) {
          response = await Sentry.startSpan(
            {
              name: `${req.method} ${endpoint}`,
              op: 'http.server',
              attributes: {
                'http.method': req.method,
                'http.route': endpoint,
              },
            },
            async () => handler(req, context),
          );
        } else {
          response = await handler(req, context);
        }
      } else {
        response = await handler(req, context);
      }

      statusCode = response.status;
      return response;
    } catch (error) {
      // Re-throw so Next.js handles the error. The metric records in finally.
      throw error;
    } finally {
      const durationMs = Math.round(performance.now() - start);
      recordEndpointMetric({
        endpoint,
        method: req.method,
        statusCode,
        durationMs,
        requestId,
      });
    }
  };
}
