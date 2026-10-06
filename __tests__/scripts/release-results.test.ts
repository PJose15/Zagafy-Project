import { it, expect } from 'vitest';
import { REQUIRED_JOURNEYS, verifyReleaseResults } from '../../scripts/check-release-results.mjs';
function report() {
  return { stats: { expected: 8, unexpected: 0, flaky: 0, skipped: 0 }, errors: [], suites: [{
    specs: [], suites: [{ specs: REQUIRED_JOURNEYS.map(([file, title]) => ({
      file: `e2e/${file}`, title, ok: true, tests: [{ projectName: 'chromium', expectedStatus: 'passed', status: 'expected',
        results: [{ status: 'passed', retry: 0, errors: [] }] }],
    })) }],
  }] };
}
it('accepts exactly the required eight clean Chromium journeys in nested suites', () => {
  expect(verifyReleaseResults(report())).toBe(8);
});
it('rejects eight unrelated passing tests even when summary counts are green', () => {
  const data = report(); data.suites[0].suites[0].specs.forEach(spec => { spec.title = 'unrelated'; });
  expect(() => verifyReleaseResults(data)).toThrow();
});
it('rejects a duplicate substituted for a missing required journey', () => {
  const data = report(); const specs = data.suites[0].suites[0].specs; specs[7] = specs[0];
  expect(() => verifyReleaseResults(data)).toThrow();
});
it.each(['failed', 'skipped', 'timedOut', 'interrupted'])('rejects a hidden %s result despite green stats', status => {
  const data = report(); data.suites[0].suites[0].specs[0].tests[0].results[0].status = status;
  expect(() => verifyReleaseResults(data)).toThrow();
});
it('rejects a retry concealed by summary stats', () => {
  const data = report(); data.suites[0].suites[0].specs[0].tests[0].results[0].retry = 1;
  expect(() => verifyReleaseResults(data)).toThrow();
});
it('rejects a runner error after all tests pass', () => {
  expect(() => verifyReleaseResults({ ...report(), errors: [{ message: 'teardown failed' }] })).toThrow();
});
it.each([{}, { stats: { expected: 8, unexpected: 0, flaky: 0, skipped: 0 } },
  { ...report(), stats: { expected: 7, unexpected: 0, flaky: 0, skipped: 0 } },
  { ...report(), stats: { expected: 8, unexpected: 0, flaky: 0, skipped: 1 } },
  { ...report(), stats: { expected: 8, unexpected: 1, flaky: 0, skipped: 0 } },
  { ...report(), stats: { expected: 8, unexpected: 0, flaky: 1, skipped: 0 } },
  { ...report(), stats: { expected: 8, unexpected: 0, flaky: 0, skipped: -1 } },
  { ...report(), stats: { expected: '8', unexpected: 0, flaky: 0, skipped: 0 } },
])('rejects false-green/malformed reports', data => { expect(() => verifyReleaseResults(data)).toThrow(); });
