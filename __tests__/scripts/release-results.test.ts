import { it, expect } from 'vitest';
import { verifyReleaseResults } from '../../scripts/check-release-results.mjs';
it('accepts eight clean required journeys',()=>{expect(verifyReleaseResults({stats:{expected:8,unexpected:0,flaky:0,skipped:0}})).toBe(8);});
it.each([{}, {stats:{expected:7,unexpected:0,flaky:0,skipped:0}}, {stats:{expected:8,unexpected:0,flaky:0,skipped:1}},
 {stats:{expected:8,unexpected:1,flaky:0,skipped:0}}, {stats:{expected:8,unexpected:0,flaky:1,skipped:0}},
 {stats:{expected:8,unexpected:0,flaky:0,skipped:-1}}, {stats:{expected:'8',unexpected:0,flaky:0,skipped:0}}])('rejects false-green/malformed reports: %j',report=>{expect(()=>verifyReleaseResults(report)).toThrow();});
