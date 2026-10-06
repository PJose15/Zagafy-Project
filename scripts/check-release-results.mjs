import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const REQUIRED_JOURNEYS = [
  ['release-core.spec.ts', 'a chapter survives save, navigation and reload'],
  ['release-export.spec.ts', 'saved chapter exports as readable DOCX'],
  ['release-export.spec.ts', 'saved chapter exports as readable PDF'],
  ['release-backup.spec.ts', 'JSON backup restores a changed chapter and survives reload'],
  ['release-chat-local.spec.ts', 'a single saved chat message can be cleared and restored without a model replay'],
  ['release-cloud.spec.ts', 'concurrent turns survive fresh-device import and reload'],
  ['release-cloud.spec.ts', 'offline clear reaches the other device and explicit restore uses new IDs'],
  ['release-cloud.spec.ts', 'a second account cannot read the fixture or sync the first account’s workspace'],
];

/** Match actual test identities and first-attempt outcomes, not aggregate counts. */
export function verifyReleaseResults(report) {
  const stats = report?.stats;
  if (!stats || !['expected','unexpected','flaky','skipped'].every(key => Number.isSafeInteger(stats[key]) && stats[key] >= 0)) {
    throw new Error('Invalid release test report');
  }
  if (stats.expected !== REQUIRED_JOURNEYS.length || stats.unexpected || stats.flaky || stats.skipped ||
      !Array.isArray(report.suites) || !Array.isArray(report.errors) || report.errors.length) {
    throw new Error('Release acceptance requires all eight journeys to pass with no skips or flaky retries');
  }
  const specs = [];
  const visit = (suites) => {
    for (const suite of suites) {
      if (!suite || !Array.isArray(suite.specs) || (suite.suites !== undefined && !Array.isArray(suite.suites))) throw new Error('Invalid release suites');
      specs.push(...suite.specs);
      visit(suite.suites ?? []);
    }
  };
  visit(report.suites);
  const required = new Set(REQUIRED_JOURNEYS.map(([file, title]) => `${file}:${title}`));
  for (const spec of specs) {
    const file = typeof spec?.file === 'string' ? spec.file.replaceAll('\\', '/').split('/').at(-1) : '';
    const key = `${file}:${spec?.title}`;
    if (!required.delete(key) || spec.ok !== true || !Array.isArray(spec.tests) || spec.tests.length !== 1) {
      throw new Error('Missing, duplicate or unexpected required journey');
    }
    const test = spec.tests[0];
    if (test.projectName !== 'chromium' || test.expectedStatus !== 'passed' || test.status !== 'expected' ||
        !Array.isArray(test.results) || test.results.length !== 1 ||
        test.results[0].status !== 'passed' || test.results[0].retry !== 0 || test.results[0].error ||
        !Array.isArray(test.results[0].errors) || test.results[0].errors.length) {
      throw new Error('Required journey did not pass cleanly on its first attempt');
    }
  }
  if (required.size) throw new Error('Required release journeys are missing');
  return stats.expected;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const report = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')); console.log(`${verifyReleaseResults(report)} required release journeys passed without skips.`); }
  catch { console.error('Release acceptance failed: report missing, incomplete, skipped, failed or flaky.'); process.exitCode = 1; }
}
