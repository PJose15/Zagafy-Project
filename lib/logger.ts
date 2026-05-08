/**
 * Phase 3.5 — structured logging foundation.
 *
 * Production: emits one JSON object per call to console.log/warn/error so
 * Vercel log capture (and, in Phase 5, Sentry breadcrumbs) can index each
 * field. Development: pretty-prints level + message + a context object.
 *
 * Use the call-site helper at the top of each API route:
 *
 *   const log = createRouteLogger({ endpoint: '/api/foo', requestId });
 *   log.info('processing', { chunkCount });
 *   log.warn('upstream slow', { latencyMs });
 *   log.error('failed', err, { hint: 'check the API key' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  endpoint?: string;
  /** Populated post-auth in Phase 5; leave undefined for now. */
  userId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: unknown, ctx?: LogContext): void;
  /** Returns a new logger that merges these defaults into every entry. */
  child(defaults: LogContext): Logger;
}

interface LogEntry extends LogContext {
  level: LogLevel;
  msg: string;
  timestamp: string;
  error?: SerializedError;
}

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  /** Extra fields commonly present on upstream errors (status, code). */
  status?: number;
  code?: string;
}

function serializeError(err: unknown): SerializedError | undefined {
  if (err === undefined || err === null) return undefined;
  if (err instanceof Error) {
    const out: SerializedError = { name: err.name, message: err.message };
    if (err.stack) out.stack = err.stack;
    const e = err as Error & { status?: number; statusCode?: number; code?: string };
    if (typeof e.status === 'number') out.status = e.status;
    if (typeof e.statusCode === 'number' && out.status === undefined) out.status = e.statusCode;
    if (typeof e.code === 'string') out.code = e.code;
    return out;
  }
  return { name: 'NonError', message: String(err) };
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function emit(level: LogLevel, msg: string, ctx?: LogContext, err?: unknown): void {
  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...ctx,
  };
  const serialized = serializeError(err);
  if (serialized) entry.error = serialized;

  // In production we want one JSON line per entry so log capture indexes it.
  // In development we want a readable line plus the context object.
  if (isProduction()) {
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }

  const tag = `[${level.toUpperCase()}]`;
  const rest = { ...ctx, ...(serialized ? { error: serialized } : {}) };
  const hasContext = Object.keys(rest).length > 0;
  if (level === 'error') {
    if (hasContext) console.error(tag, msg, rest);
    else console.error(tag, msg);
  } else if (level === 'warn') {
    if (hasContext) console.warn(tag, msg, rest);
    else console.warn(tag, msg);
  } else {
    if (hasContext) console.log(tag, msg, rest);
    else console.log(tag, msg);
  }
}

function makeLogger(defaults: LogContext = {}): Logger {
  const merge = (ctx?: LogContext): LogContext =>
    ctx ? { ...defaults, ...ctx } : { ...defaults };

  return {
    debug: (msg, ctx) => emit('debug', msg, merge(ctx)),
    info: (msg, ctx) => emit('info', msg, merge(ctx)),
    warn: (msg, ctx) => emit('warn', msg, merge(ctx)),
    error: (msg, err, ctx) => emit('error', msg, merge(ctx), err),
    child: (extra) => makeLogger({ ...defaults, ...extra }),
  };
}

/** Module-level logger; useful for non-request contexts (instrumentation, scripts). */
export const log: Logger = makeLogger();

/** Per-request logger pinned to an endpoint and requestId. */
export function createRouteLogger(defaults: LogContext): Logger {
  return makeLogger(defaults);
}
