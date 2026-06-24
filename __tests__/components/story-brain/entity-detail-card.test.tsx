import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import type { EntityCatalogEntry, RelationshipPair } from '@/lib/story-brain/types';

// Mock antiquarian
vi.mock('@/components/antiquarian', () => ({
  ParchmentCard: ({ children, onClick, ...props }: any) => (
    <div data-testid="parchment-card" onClick={onClick} {...props}>{children}</div>
  ),
  ProgressRing: ({ value, label, ...props }: any) => (
    <div data-testid={`progress-ring-${label?.toLowerCase()}`} {...props}>
      {label}: {value}
    </div>
  ),
}));

// Mock lucide-react with explicit named exports. Vitest 4 validates mock exports against
// ownKeys, so a Proxy-based catch-all mock ({} target) crashes the worker during module init.
vi.mock('lucide-react', () => ({
  X: (props: any) => <span data-testid="icon-x" {...props} />,
}));

import { EntityDetailCard } from '@/components/story-brain/entity-detail-card';

function makeEntity(overrides: Partial<EntityCatalogEntry> = {}): EntityCatalogEntry {
  return {
    id: 'e-1',
    name: 'Alice',
    type: 'character',
    mentionCount: 15,
    firstAppearanceChapter: 0,
    lastAppearanceChapter: 5,
    sceneIds: ['s-1', 's-2'],
    relationshipCount: 3,
    ...overrides,
  };
}

function makeRelationship(overrides: Partial<RelationshipPair> = {}): RelationshipPair {
  return {
    sourceId: 'e-1',
    sourceName: 'Alice',
    targetId: 'e-2',
    targetName: 'Bob',
    trustLevel: 75,
    tensionLevel: 30,
    dynamics: 'allies',
    ...overrides,
  };
}

describe('EntityDetailCard', () => {
  const defaultProps = {
    entity: makeEntity(),
    relationships: [] as RelationshipPair[],
    onClose: vi.fn(),
  };

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders entity name and type', () => {
    render(<EntityDetailCard {...defaultProps} />);
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText('Character')).toBeDefined();
  });

  it('shows mention count', () => {
    render(<EntityDetailCard {...defaultProps} />);
    expect(screen.getByText('15')).toBeDefined();
  });

  it('shows first and last chapter numbers', () => {
    render(<EntityDetailCard {...defaultProps} />);
    // firstAppearanceChapter = 0 => Ch.1, lastAppearanceChapter = 5 => Ch.6
    expect(screen.getByText('Ch.1')).toBeDefined();
    expect(screen.getByText('Ch.6')).toBeDefined();
  });

  it('renders relationships for this entity', () => {
    const relationships = [
      makeRelationship({ sourceId: 'e-1', targetId: 'e-2', targetName: 'Bob' }),
      makeRelationship({ sourceId: 'e-3', targetId: 'e-1', sourceName: 'Carol', targetName: 'Alice' }),
    ];
    render(<EntityDetailCard {...defaultProps} relationships={relationships} />);
    expect(screen.getByText('Relationships')).toBeDefined();
    expect(screen.getByText('Bob')).toBeDefined();
    expect(screen.getByText('Carol')).toBeDefined();
  });

  it('does not render relationships section when entity has none', () => {
    const relationships = [
      makeRelationship({ sourceId: 'e-3', targetId: 'e-4', sourceName: 'X', targetName: 'Y' }),
    ];
    render(<EntityDetailCard {...defaultProps} relationships={relationships} />);
    expect(screen.queryByText('Relationships')).toBeNull();
  });

  it('shows dash for negative appearance chapters', () => {
    const entity = makeEntity({ firstAppearanceChapter: -1, lastAppearanceChapter: -1 });
    render(<EntityDetailCard {...defaultProps} entity={entity} />);
    const dashes = screen.getAllByText('\u2014'); // em dash
    expect(dashes.length).toBe(2);
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<EntityDetailCard {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByLabelText('Close detail');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows trust and tension rings for relationships', () => {
    const relationships = [
      makeRelationship({ sourceId: 'e-1', trustLevel: 80, tensionLevel: 20 }),
    ];
    render(<EntityDetailCard {...defaultProps} relationships={relationships} />);
    expect(screen.getByTestId('progress-ring-trust')).toBeDefined();
    expect(screen.getByTestId('progress-ring-tension')).toBeDefined();
  });
});
