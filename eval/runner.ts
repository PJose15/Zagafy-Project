#!/usr/bin/env tsx
/**
 * AI Eval Pipeline Runner (Phase 7.5 -- MP-14)
 *
 * Runs test cases against AI endpoints and grades responses.
 * Usage: npx tsx eval/runner.ts --base-url http://localhost:3000
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Rubric {
  mustContain: string[];
  mustNotContain: string[];
  qualityCriteria: string[];
}

interface TestCase {
  id: string;
  endpoint: string;
  input: Record<string, unknown>;
  rubric: Rubric;
}

interface CaseResult {
  id: string;
  endpoint: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  durationMs: number;
  violations: string[];
  qualityCriteria: string[];
  responseSnippet: string;
}

interface RunSummary {
  timestamp: string;
  baseUrl: string;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  results: CaseResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(): { baseUrl: string } {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--base-url');
  const baseUrl = idx !== -1 && args[idx + 1] ? args[idx + 1] : 'http://localhost:3000';
  return { baseUrl: baseUrl.replace(/\/+$/, '') };
}

function loadCases(casesDir: string): TestCase[] {
  const cases: TestCase[] = [];
  const files = fs.readdirSync(casesDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(casesDir, file), 'utf-8');
    const parsed: TestCase[] = JSON.parse(raw);
    cases.push(...parsed);
  }
  return cases;
}

function gradeResponse(body: string, rubric: Rubric): string[] {
  const violations: string[] = [];
  const lower = body.toLowerCase();

  for (const phrase of rubric.mustContain) {
    if (!lower.includes(phrase.toLowerCase())) {
      violations.push(`mustContain missing: "${phrase}"`);
    }
  }

  for (const phrase of rubric.mustNotContain) {
    if (lower.includes(phrase.toLowerCase())) {
      violations.push(`mustNotContain found: "${phrase}"`);
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { baseUrl } = parseArgs();
  const casesDir = path.resolve(__dirname, 'cases');
  const resultsDir = path.resolve(__dirname, 'results');

  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const cases = loadCases(casesDir);
  console.log(`\n  Eval Pipeline -- ${cases.length} test case(s) against ${baseUrl}\n`);

  const results: CaseResult[] = [];

  for (const tc of cases) {
    const url = `${baseUrl}${tc.endpoint}`;
    const start = Date.now();
    let status: CaseResult['status'] = 'PASS';
    let violations: string[] = [];
    let responseSnippet = '';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tc.input),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        status = 'ERROR';
        violations = [`HTTP ${res.status} ${res.statusText}`];
        responseSnippet = (await res.text()).slice(0, 300);
      } else {
        // Try to extract text from the response. Endpoints may return JSON
        // with a `text` or `response` field, or they may stream. We handle
        // the simple JSON case and fall back to raw text.
        const raw = await res.text();
        let bodyText = raw;

        try {
          const json = JSON.parse(raw);
          bodyText = json.text ?? json.response ?? json.message ?? raw;
        } catch {
          // Not JSON -- use raw text (possibly streamed)
        }

        violations = gradeResponse(String(bodyText), tc.rubric);
        status = violations.length > 0 ? 'FAIL' : 'PASS';
        responseSnippet = String(bodyText).slice(0, 300);
      }
    } catch (err: unknown) {
      status = 'ERROR';
      const message = err instanceof Error ? err.message : String(err);
      violations = [`Request error: ${message}`];
    }

    const duration = Date.now() - start;
    const icon = status === 'PASS' ? 'OK' : status === 'FAIL' ? 'FAIL' : 'ERR';
    console.log(`  [${icon}] ${tc.id} (${duration}ms)${violations.length ? ' -- ' + violations.join('; ') : ''}`);

    results.push({
      id: tc.id,
      endpoint: tc.endpoint,
      status,
      durationMs: duration,
      violations,
      qualityCriteria: tc.rubric.qualityCriteria,
      responseSnippet,
    });
  }

  // Summary
  const summary: RunSummary = {
    timestamp: new Date().toISOString(),
    baseUrl,
    total: results.length,
    passed: results.filter((r) => r.status === 'PASS').length,
    failed: results.filter((r) => r.status === 'FAIL').length,
    errors: results.filter((r) => r.status === 'ERROR').length,
    results,
  };

  const outFile = path.join(resultsDir, `run-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));

  console.log(`\n  Summary: ${summary.passed} passed, ${summary.failed} failed, ${summary.errors} errors`);
  console.log(`  Results written to ${outFile}\n`);

  // Exit 1 if any critical failures
  if (summary.failed > 0 || summary.errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Eval runner crashed:', err);
  process.exit(1);
});
