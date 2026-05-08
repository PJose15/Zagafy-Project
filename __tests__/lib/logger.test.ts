import { describe, it, expect, vi, afterEach } from 'vitest';
import { log, createRouteLogger } from '@/lib/logger';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('logger — production JSON mode', () => {
  it('emits a single JSON line per info entry with timestamp + context', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('processing', { requestId: 'r-1', endpoint: '/api/foo', chunkCount: 3 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('processing');
    expect(parsed.requestId).toBe('r-1');
    expect(parsed.endpoint).toBe('/api/foo');
    expect(parsed.chunkCount).toBe(3);
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('routes warn entries through console.warn with JSON shape', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn('slow upstream', { latencyMs: 1234 });
    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('warn');
    expect(parsed.latencyMs).toBe(1234);
  });

  it('routes error entries through console.error and serializes the error object', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err: Error & { status?: number; code?: string } = new Error('boom');
    err.status = 503;
    err.code = 'UNAVAILABLE';
    log.error('upstream failed', err, { endpoint: '/api/x' });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe('error');
    expect(parsed.endpoint).toBe('/api/x');
    expect(parsed.error.name).toBe('Error');
    expect(parsed.error.message).toBe('boom');
    expect(parsed.error.status).toBe(503);
    expect(parsed.error.code).toBe('UNAVAILABLE');
    expect(typeof parsed.error.stack).toBe('string');
  });

  it('serializes non-Error throws as NonError', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('odd throw', 'just a string');
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.error.name).toBe('NonError');
    expect(parsed.error.message).toBe('just a string');
  });
});

describe('logger — development pretty mode', () => {
  it('formats info as [INFO] msg with context object', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('hello', { requestId: 'r-2' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('[INFO]');
    expect(spy.mock.calls[0][1]).toBe('hello');
    expect(spy.mock.calls[0][2]).toMatchObject({ requestId: 'r-2' });
  });

  it('omits context arg when there is no context', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn('no ctx');
    expect(spy.mock.calls[0]).toEqual(['[WARN]', 'no ctx']);
  });
});

describe('createRouteLogger + child', () => {
  it('merges per-request defaults into every entry', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createRouteLogger({ endpoint: '/api/chat', requestId: 'r-3' });
    logger.info('start', { phase: 'validate' });
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.endpoint).toBe('/api/chat');
    expect(parsed.requestId).toBe('r-3');
    expect(parsed.phase).toBe('validate');
  });

  it('child loggers add to (and can override) parent defaults', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const parent = createRouteLogger({ endpoint: '/api/chat' });
    const child = parent.child({ requestId: 'r-4', endpoint: '/api/chat/sub' });
    child.info('hi');
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.endpoint).toBe('/api/chat/sub');
    expect(parsed.requestId).toBe('r-4');
  });
});
