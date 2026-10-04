import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** A green runner exit is insufficient if required journeys were skipped. */
export function verifyReleaseResults(report) {
  const stats = report?.stats;
  if (!stats || !['expected','unexpected','flaky','skipped'].every(key => Number.isSafeInteger(stats[key]) && stats[key] >= 0)) {
    throw new Error('Invalid release test report');
  }
  if (stats.expected < 8 || stats.unexpected || stats.flaky || stats.skipped) {
    throw new Error('Release acceptance requires all eight journeys to pass with no skips or flaky retries');
  }
  return stats.expected;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const report = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')); console.log(`${verifyReleaseResults(report)} required release journeys passed without skips.`); }
  catch { console.error('Release acceptance failed: report missing, incomplete, skipped, failed or flaky.'); process.exitCode = 1; }
}
