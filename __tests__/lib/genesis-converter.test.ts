import { describe, it, expect, vi, beforeEach } from 'vitest';
import { convertGenesisToStory } from '@/lib/genesis-converter';
import type { GenesisData } from '@/lib/types/genesis';

function makeGenesisData(overrides: Partial<GenesisData> = {}): GenesisData {
  return {
    projectName: 'The Obsidian Crown',
    logline: 'A disgraced knight seeks redemption.',
    genres: ['Fantasy', 'Adventure'],
    tones: ['Dark', 'Epic'],
    protagonist: {
      name: 'Alaric',
      role: 'Protagonist',
      description: 'A fallen knight',
      goal: 'Reclaim his honor',
      fear: 'Being forgotten',
    },
    antagonist: {
      type: 'character',
      name: 'Morvaine',
      description: 'A shadow sorcerer',
      motivation: 'Absolute power',
    },
    world: {
      setting: 'A crumbling medieval kingdom',
      timePeriod: 'Dark Ages',
      rules: ['Magic corrupts the user', 'Dragons are extinct'],
    },
    ...overrides,
  };
}

describe('convertGenesisToStory', () => {
  beforeEach(() => {
    let counter = 0;
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => `uuid-${++counter}`),
    });
  });

  it('sets title from projectName', () => {
    const result = convertGenesisToStory(makeGenesisData());
    expect(result.title).toBe('The Obsidian Crown');
  });

  it('trims title whitespace', () => {
    const result = convertGenesisToStory(makeGenesisData({ projectName: '  Spaced Out  ' }));
    expect(result.title).toBe('Spaced Out');
  });

  it('sets genre array', () => {
    const result = convertGenesisToStory(makeGenesisData());
    expect(result.genre).toEqual(['Fantasy', 'Adventure']);
  });

  it('sets synopsis from logline', () => {
    const result = convertGenesisToStory(makeGenesisData());
    expect(result.synopsis).toBe('A disgraced knight seeks redemption.');
  });

  it('maps tones into the style profile (previously discarded)', () => {
    const result = convertGenesisToStory(makeGenesisData());
    expect(result.style_profile).toBe('Dark, Epic');
  });

  it('omits style_profile when no tones are provided', () => {
    const result = convertGenesisToStory(makeGenesisData({ tones: [] }));
    expect(result.style_profile).toBeUndefined();
  });

  it('creates protagonist character', () => {
    const result = convertGenesisToStory(makeGenesisData());
    expect(result.characters).toBeDefined();
    const protag = result.characters!.find(c => c.role === 'Protagonist');
    expect(protag).toBeDefined();
    expect(protag!.name).toBe('Alaric');
    expect(protag!.currentState?.visibleGoal).toBe('Reclaim his honor');
    expect(protag!.currentState?.currentFear).toBe('Being forgotten');
    expect(protag!.canonStatus).toBe('draft');
    expect(protag!.source).toBe('user-entered');
  });

  it('creates antagonist character when type is character', () => {
    const result = convertGenesisToStory(makeGenesisData());
    const antag = result.characters!.find(c => c.role === 'Antagonist');
    expect(antag).toBeDefined();
    expect(antag!.name).toBe('Morvaine');
    expect(antag!.currentState?.visibleGoal).toBe('Absolute power');
  });

  it('does NOT create antagonist character when type is force', () => {
    const result = convertGenesisToStory(makeGenesisData({
      antagonist: { type: 'force', name: 'The Plague', description: 'A spreading disease', motivation: 'Nature' },
    }));
    const antag = result.characters!.find(c => c.role === 'Antagonist');
    expect(antag).toBeUndefined();
    expect(result.characters).toHaveLength(1); // Only protagonist
  });

  it('does NOT create antagonist character when type is internal', () => {
    const result = convertGenesisToStory(makeGenesisData({
      antagonist: { type: 'internal', name: 'Self-doubt', description: 'Inner demon', motivation: 'Fear' },
    }));
    expect(result.characters!.find(c => c.role === 'Antagonist')).toBeUndefined();
  });

  it('creates conflict for character antagonist', () => {
    const result = convertGenesisToStory(makeGenesisData());
    expect(result.active_conflicts).toHaveLength(1);
    expect(result.active_conflicts![0].title).toBe('Alaric vs Morvaine');
    expect(result.active_conflicts![0].status).toBe('active');
  });

  it('creates conflict for force antagonist', () => {
    const result = convertGenesisToStory(makeGenesisData({
      antagonist: { type: 'force', name: 'The Plague', description: 'A disease', motivation: '' },
    }));
    expect(result.active_conflicts![0].title).toBe('Alaric vs The Plague');
  });

  it('creates conflict for internal antagonist', () => {
    const result = convertGenesisToStory(makeGenesisData({
      antagonist: { type: 'internal', name: 'Self-doubt', description: '', motivation: 'Fear' },
    }));
    expect(result.active_conflicts![0].title).toContain("inner conflict");
    expect(result.active_conflicts![0].title).toContain('Self-doubt');
  });

  it('creates world rules from rules array', () => {
    const result = convertGenesisToStory(makeGenesisData());
    const worldRules = result.world_rules!.filter(r => r.category === 'World');
    expect(worldRules).toHaveLength(2);
    expect(worldRules[0].rule).toBe('Magic corrupts the user');
    expect(worldRules[1].rule).toBe('Dragons are extinct');
  });

  it('skips empty rules', () => {
    const result = convertGenesisToStory(makeGenesisData({
      world: { setting: 'A world', timePeriod: '', rules: ['Valid', '', '  '] },
    }));
    const worldRules = result.world_rules!.filter(r => r.category === 'World');
    expect(worldRules).toHaveLength(1);
  });

  it('creates setting world rule', () => {
    const result = convertGenesisToStory(makeGenesisData());
    const setting = result.world_rules!.find(r => r.category === 'Setting');
    expect(setting).toBeDefined();
    expect(setting!.rule).toBe('A crumbling medieval kingdom');
  });

  it('creates time period world rule', () => {
    const result = convertGenesisToStory(makeGenesisData());
    const time = result.world_rules!.find(r => r.category === 'Time Period');
    expect(time).toBeDefined();
    expect(time!.rule).toBe('Dark Ages');
  });

  it('skips empty time period', () => {
    const result = convertGenesisToStory(makeGenesisData({
      world: { setting: 'A world', timePeriod: '', rules: [] },
    }));
    const time = result.world_rules!.find(r => r.category === 'Time Period');
    expect(time).toBeUndefined();
  });

  it('assigns unique UUIDs to all entities', () => {
    const result = convertGenesisToStory(makeGenesisData());
    const ids = [
      ...result.characters!.map(c => c.id),
      ...result.active_conflicts!.map(c => c.id),
      ...result.world_rules!.map(r => r.id),
    ];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
