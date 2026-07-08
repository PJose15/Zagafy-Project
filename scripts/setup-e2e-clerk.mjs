#!/usr/bin/env node
/**
 * S6-M3 — one-command E2E Clerk setup.
 *
 * Given the DEVELOPMENT-instance Clerk keys, this script:
 *   1. Creates (or reuses) the dedicated E2E test user via the Clerk Backend
 *      API — `e2e+clerk_test@zagafy.com` with a freshly generated password
 *      (`+clerk_test` addresses are Clerk test identifiers; no email is sent).
 *   2. Sets the four GitHub repo secrets the CI e2e job consumes
 *      (E2E_CLERK_PUBLISHABLE_KEY / E2E_CLERK_SECRET_KEY /
 *       E2E_CLERK_USER_EMAIL / E2E_CLERK_USER_PASSWORD) via `gh secret set`,
 *      passing values over stdin so they never hit shell history or argv.
 *
 * Usage (run from the repo root, in your own terminal):
 *   node scripts/setup-e2e-clerk.mjs pk_test_... sk_test_...
 * or via env vars (keeps keys out of the command line entirely):
 *   E2E_SETUP_PK=pk_test_... E2E_SETUP_SK=sk_test_... node scripts/setup-e2e-clerk.mjs
 *
 * Keys live at https://dashboard.clerk.com → Zagafy app → make sure the
 * DEVELOPMENT instance is selected → Configure → API Keys.
 */

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const TEST_EMAIL = 'e2e+clerk_test@zagafy.com';
const CLERK_API = 'https://api.clerk.com/v1';

const pk = process.argv[2] || process.env.E2E_SETUP_PK || '';
const sk = process.argv[3] || process.env.E2E_SETUP_SK || '';

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

if (!pk || !sk) {
  fail(
    'Missing keys.\n  Usage: node scripts/setup-e2e-clerk.mjs pk_test_... sk_test_...\n' +
    '  (or set E2E_SETUP_PK / E2E_SETUP_SK env vars)',
  );
}
if (!pk.startsWith('pk_test_')) {
  fail(`Publishable key must be a DEVELOPMENT-instance key (pk_test_…), got "${pk.slice(0, 8)}…". Never use pk_live for E2E.`);
}
if (!sk.startsWith('sk_test_')) {
  fail(`Secret key must be a DEVELOPMENT-instance key (sk_test_…), got "${sk.slice(0, 8)}…". Never use sk_live for E2E.`);
}

async function clerk(path, init = {}) {
  const res = await fetch(`${CLERK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${sk}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

function setSecret(name, value) {
  const r = spawnSync('gh', ['secret', 'set', name], {
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (r.status !== 0) fail(`gh secret set ${name} failed (is gh authenticated and are you in the repo?)`);
  console.log(`✓ secret ${name} set`);
}

const password = randomBytes(24).toString('base64url'); // 32 chars, high entropy

// 1. Find or create the test user.
console.log(`→ Ensuring test user ${TEST_EMAIL} exists on the development instance…`);
const { res: findRes, body: found } = await clerk(
  `/users?email_address=${encodeURIComponent(TEST_EMAIL)}`,
);
if (!findRes.ok) fail(`Clerk API lookup failed (${findRes.status}): ${JSON.stringify(found)}`);

if (Array.isArray(found) && found.length > 0) {
  const userId = found[0].id;
  console.log(`→ User exists (${userId}); rotating its password…`);
  const { res: patchRes, body: patched } = await clerk(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ password, skip_password_checks: true }),
  });
  if (!patchRes.ok) fail(`Password rotation failed (${patchRes.status}): ${JSON.stringify(patched)}`);
  console.log('✓ password rotated');
} else {
  const { res: createRes, body: created } = await clerk('/users', {
    method: 'POST',
    body: JSON.stringify({
      email_address: [TEST_EMAIL],
      password,
      first_name: 'E2E',
      last_name: 'Test',
      skip_password_checks: true,
    }),
  });
  if (!createRes.ok) fail(`User creation failed (${createRes.status}): ${JSON.stringify(created)}`);
  console.log(`✓ test user created (${created.id})`);
}

// 2. Set the four repo secrets.
console.log('→ Setting GitHub repo secrets…');
setSecret('E2E_CLERK_PUBLISHABLE_KEY', pk);
setSecret('E2E_CLERK_SECRET_KEY', sk);
setSecret('E2E_CLERK_USER_EMAIL', TEST_EMAIL);
setSecret('E2E_CLERK_USER_PASSWORD', password);

console.log(
  '\n✓ Done. The next pull request\'s e2e job will boot with Clerk auth enabled\n' +
  '  and sign in as the test user. (The generated password lives only in the\n' +
  '  GitHub secret — rerun this script any time to rotate it.)',
);
