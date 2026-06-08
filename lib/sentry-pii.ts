import type { ErrorEvent, EventHint, Breadcrumb } from '@sentry/nextjs';

const SENSITIVE_KEY_PATTERN = /^(text|chapter|manuscript|bible|prompt|content|body|message|messages|story|scene|outline|note|notes|draft|polish|braindump|reply|completion|generated|response|character|persona|heteronym|excerpt|paragraph|paragraphs|email|password|token|secret|api[_-]?key|authorization|cookie)$/i;

const MAX_STRING_LEN = 256;

export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated: depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING_LEN
      ? `[Redacted: string len=${value.length}]`
      : value;
  }
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 32).map((item) => scrubValue(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = '[Redacted]';
      continue;
    }
    out[k] = scrubValue(v, depth + 1);
  }
  return out;
}

export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (event.request) {
    if (event.request.cookies) delete event.request.cookies;
    if (event.request.headers) {
      const headers = event.request.headers as Record<string, string>;
      for (const k of Object.keys(headers)) {
        if (/^(authorization|cookie|x-api-key|x-health-token)$/i.test(k)) {
          headers[k] = '[Redacted]';
        }
      }
    }
    if (event.request.data !== undefined) {
      event.request.data = scrubValue(event.request.data) as typeof event.request.data;
    }
    if (event.request.query_string) {
      event.request.query_string = '[Redacted]';
    }
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  }

  if (event.extra) {
    event.extra = scrubValue(event.extra) as Record<string, unknown>;
  }
  if (event.contexts) {
    event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  }

  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data) {
    breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
  }
  if (breadcrumb.message && breadcrumb.message.length > MAX_STRING_LEN) {
    breadcrumb.message = `[Redacted: msg len=${breadcrumb.message.length}]`;
  }
  return breadcrumb;
}
