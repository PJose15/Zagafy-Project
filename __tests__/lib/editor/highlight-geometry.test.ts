import { describe, it, expect } from 'vitest';
import {
  sliceRangesAcrossNodes,
  type HighlightNode,
} from '@/lib/editor/highlight-geometry';

// Plain text model: "Hello world" + '\n' + "Second block"
// Node A: offsets [0, 11), join gap at 11, Node B: offsets [12, 24).
const twoBlocks: HighlightNode[] = [
  { key: 'A', length: 11, joinAfter: 1 },
  { key: 'B', length: 12, joinAfter: 0 },
];

describe('sliceRangesAcrossNodes', () => {
  it('slices a range contained within a single node', () => {
    expect(sliceRangesAcrossNodes(twoBlocks, [{ start: 0, end: 5 }])).toEqual([
      { key: 'A', start: 0, end: 5 },
    ]);
  });

  it('slices a range starting mid-node', () => {
    expect(sliceRangesAcrossNodes(twoBlocks, [{ start: 6, end: 11 }])).toEqual([
      { key: 'A', start: 6, end: 11 },
    ]);
  });

  it('splits a range spanning two nodes across the \\n join gap', () => {
    // "world\nSecond" — the '\n' at absolute offset 11 belongs to no node.
    expect(sliceRangesAcrossNodes(twoBlocks, [{ start: 6, end: 18 }])).toEqual([
      { key: 'A', start: 6, end: 11 },
      { key: 'B', start: 0, end: 6 },
    ]);
  });

  it('ignores zero-length and inverted ranges', () => {
    expect(
      sliceRangesAcrossNodes(twoBlocks, [
        { start: 4, end: 4 },
        { start: 9, end: 3 },
      ]),
    ).toEqual([]);
  });

  it('clamps out-of-bounds offsets to the document length', () => {
    expect(sliceRangesAcrossNodes(twoBlocks, [{ start: -5, end: 999 }])).toEqual([
      { key: 'A', start: 0, end: 11 },
      { key: 'B', start: 0, end: 12 },
    ]);
  });

  it('yields nothing for a range entirely inside a join gap', () => {
    // Absolute offset 11 is the '\n' between blocks.
    expect(sliceRangesAcrossNodes(twoBlocks, [{ start: 11, end: 12 }])).toEqual([]);
  });

  it('skips zero-length sentinel nodes and multi-join gaps (empty blocks)', () => {
    // "\nA\n\nB": leading empty block sentinel, then A, an empty block (2 joins), then B.
    const nodes: HighlightNode[] = [
      { key: '', length: 0, joinAfter: 1 },
      { key: 'A', length: 1, joinAfter: 2 },
      { key: 'B', length: 1, joinAfter: 0 },
    ];
    // Whole document: sentinel emits nothing; A and B fully covered.
    expect(sliceRangesAcrossNodes(nodes, [{ start: 0, end: 5 }])).toEqual([
      { key: 'A', start: 0, end: 1 },
      { key: 'B', start: 0, end: 1 },
    ]);
  });

  it('handles multiple ranges independently', () => {
    expect(
      sliceRangesAcrossNodes(twoBlocks, [
        { start: 0, end: 3 },
        { start: 13, end: 16 },
      ]),
    ).toEqual([
      { key: 'A', start: 0, end: 3 },
      { key: 'B', start: 1, end: 4 },
    ]);
  });
});
