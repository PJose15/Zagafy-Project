import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_MODEL = process.env.ANTHROPIC_MODEL;

async function loadConfig() {
  // Reset module cache so the env var is re-evaluated on import.
  vi.resetModules();
  return await import('@/lib/ai-config');
}

describe('anthropicConfig', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    if (ORIGINAL_MODEL === undefined) {
      delete process.env.ANTHROPIC_MODEL;
    } else {
      process.env.ANTHROPIC_MODEL = ORIGINAL_MODEL;
    }
  });

  it('falls back to the default Sonnet model when ANTHROPIC_MODEL is unset', async () => {
    const { anthropicConfig } = await loadConfig();
    expect(anthropicConfig.model).toBe('claude-sonnet-4-5-20250929');
  });

  it('honors ANTHROPIC_MODEL env override', async () => {
    process.env.ANTHROPIC_MODEL = 'claude-opus-4-7';
    const { anthropicConfig } = await loadConfig();
    expect(anthropicConfig.model).toBe('claude-opus-4-7');
  });

  it('exposes positive timeouts for character chat, polish, and insight', async () => {
    const { anthropicConfig } = await loadConfig();
    expect(anthropicConfig.timeouts.characterChat).toBeGreaterThan(0);
    expect(anthropicConfig.timeouts.polish).toBeGreaterThan(0);
    expect(anthropicConfig.timeouts.insight).toBeGreaterThan(0);
    // Insight is the optional secondary call — must be shorter than the main call.
    expect(anthropicConfig.timeouts.insight).toBeLessThan(anthropicConfig.timeouts.characterChat);
  });

  it('exposes temperatures within the valid Anthropic range', async () => {
    const { anthropicConfig } = await loadConfig();
    for (const t of Object.values(anthropicConfig.temperatures)) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
});
