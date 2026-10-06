import { randomUUID } from 'node:crypto';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { gotoApp, type E2EIdentity } from './helpers/auth';

// Real Clerk, cloud routes and database are required. Only model generation is
// stubbed, so these checks exercise persistence/sync without consuming AI funds.
test.describe('Authenticated two-device cloud history', () => {
  test.skip(process.env.E2E_REQUIRE_CLOUD !== 'true', 'Requires the isolated staging cloud acceptance workflow');
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  let contexts: BrowserContext[];
  let cleanupPage: Page | undefined;
  let fixtureTitle: string;
  let fixtureId: string;

  async function api(page: Page, path: string, method = 'GET', body?: unknown) {
    return page.evaluate(async ({ path, method, body }) => {
      const response = await fetch(path, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    }, { path, method, body });
  }
  async function device(browser: Browser, identity?: E2EIdentity) {
    const context = await browser.newContext({ reducedMotion: 'reduce', storageState: { cookies: [], origins: [{
      origin: new URL(process.env.BASE_URL!).origin,
      localStorage: [{ name: 'zagafy_skip_intake', value: 'true' }, { name: 'zagafy_tour_completed', value: 'true' }],
    }] } });
    contexts.push(context);
    const page = await context.newPage();
    await gotoApp(page, '/projects', identity);
    return page;
  }
  async function seed(page: Page) {
    fixtureId = randomUUID(); fixtureTitle = `E2E cloud ${fixtureId}`;
    const messageId = randomUUID(); const sessionId = randomUUID(); const now = new Date().toISOString();
    const delta = (entityType: string, entityId: string, payload: unknown) => ({ entityType, entityId, payload, op: 'upsert', timestamp: Date.now() });
    const result = await api(page, '/api/sync/push', 'POST', { storyId: fixtureId, storyTitle: fixtureTitle, deltas: [
      delta('story', fixtureId, { title: fixtureTitle, chapters: [], characters: [], scenes: [], chat_messages: [], version: 0 }),
      delta('chatMessage', messageId, { role: 'assistant', content: `Original history ${fixtureId}`, timestamp: Date.now(), version: 0,
        metadata: { kind: 'assistant', message: { id: messageId, role: 'assistant', content: `Original history ${fixtureId}` } } }),
      delta('chatMessage', sessionId, { role: 'assistant', content: '', timestamp: Date.now(), version: 0, metadata: {
        kind: 'character-session', payload: { id: sessionId, characterId: randomUUID(), characterName: 'Test keeper', mode: 'exploration',
          messages: [{ id: randomUUID(), role: 'character', content: 'Character history remains', mode: 'exploration', timestamp: now }], createdAt: now, updatedAt: now },
      } }),
    ] });
    expect(result.status, 'Dedicated owner must have paid staging cloud entitlement').toBe(200);
    expect(result.body.data.applied).toBe(3);
    return { messageId, sessionId, text: `Original history ${fixtureId}` };
  }
  async function open(page: Page) {
    await page.goto('/projects');
    const row = page.getByText(fixtureTitle, { exact: true }).locator('../..');
    await row.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(page).not.toHaveURL(/\/projects/);
    await page.goto('/assistant');
    await expect(page.getByText(`Original history ${fixtureId}`, { exact: true })).toBeVisible();
  }
  async function pull(page: Page) {
    const response = await api(page, `/api/sync/pull?storyId=${fixtureId}`);
    expect(response.status).toBe(200);
    return response.body.data;
  }
  async function restore(page: Page, name: string) {
    await page.goto('/versions');
    await page.getByText(name, { exact: true }).locator('../..').getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByText(`Restored "${name}".`, { exact: true })).toBeVisible();
  }
  test.beforeEach(() => { contexts = []; cleanupPage = undefined; fixtureTitle = ''; fixtureId = ''; });
  test.afterEach(async () => {
    try {
      if (cleanupPage && fixtureId) {
        const catalog = await api(cleanupPage, '/api/stories');
        const copies: string[] = catalog.body.data?.stories?.filter((story: { title: string; role: string }) =>
          story.title === fixtureTitle && story.role === 'owner').map((story: { storyId: string }) => story.storyId) ?? [];
        for (const storyId of new Set([fixtureId, ...copies])) {
          const removed = await api(cleanupPage, '/api/stories', 'DELETE', { storyId });
          expect(removed.status, 'Synthetic fixture cleanup must succeed').toBe(200);
        }
      }
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });

  test('concurrent turns survive fresh-device import and reload', async ({ browser }) => {
    const a = await device(browser); const b = await device(browser); cleanupPage = b;
    await seed(a); await open(a); await open(b);
    for (const page of [a, b]) await page.route('**/api/chat', async route => {
      const input = route.request().postDataJSON().userInput;
      await route.fulfill({ json: { text: `Verified reply: ${input}` } });
    });
    await Promise.all([a, b].map(async (page, i) => {
      const input = `Device ${i} turn ${fixtureId}`;
      await page.locator('textarea').fill(input);
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page.getByText(`Verified reply: ${input}`, { exact: true })).toBeVisible();
    }));
    await expect.poll(async () => (await pull(a)).chatMessages.filter((row: { metadata?: { kind?: string } }) => row.metadata?.kind === 'assistant').length,
      { timeout: 75_000, intervals: [2000, 5000] }).toBe(5);
    for (const page of [a, b]) {
      await page.reload();
      for (const i of [0, 1]) await expect(page.getByText(`Verified reply: Device ${i} turn ${fixtureId}`, { exact: true })).toBeVisible();
    }
  });

  test('offline clear reaches the other device and explicit restore uses new IDs', async ({ browser }) => {
    const a = await device(browser); const b = await device(browser); cleanupPage = b;
    const original = await seed(a); await open(a); await open(b);
    await a.context().setOffline(true);
    try {
      await a.getByRole('button', { name: 'Clear chat history', exact: true }).click();
      await a.getByRole('alertdialog').getByRole('button', { name: 'Clear', exact: true }).click();
      await expect(a.getByText(original.text, { exact: true })).toHaveCount(0);
    } finally { await a.context().setOffline(false); }
    await expect.poll(async () => (await pull(b)).chatMessages.some((row: { id: string }) => row.id === original.messageId),
      { timeout: 75_000, intervals: [2000, 5000] }).toBe(false);
    await b.reload(); await expect(b.getByText(original.text, { exact: true })).toHaveCount(0);
    await restore(a, 'Chat clear recovery (local only)');
    await expect.poll(async () => (await pull(b)).chatMessages.some((row: { id: string; content: string }) => row.content === original.text && row.id !== original.messageId),
      { timeout: 75_000, intervals: [2000, 5000] }).toBe(true);
    const recovered = await pull(b);
    expect(recovered.chatMessages.some((row: { id: string }) => row.id === original.messageId)).toBe(false);
    expect(recovered.chatMessages.some((row: { id: string }) => row.id === original.sessionId)).toBe(true);
    await b.reload(); await expect(b.getByText(original.text, { exact: true })).toBeVisible();
  });

  test('a second account cannot read the fixture or sync the first account’s workspace', async ({ browser }) => {
    const a = await device(browser); cleanupPage = await device(browser);
    const original = await seed(a); await open(a);
    const other = { email: process.env.E2E_OTHER_CLERK_USER_EMAIL!, password: process.env.E2E_OTHER_CLERK_USER_PASSWORD! };
    const otherPage = await device(browser, other);
    const catalog = await api(otherPage, '/api/stories');expect(catalog.status).toBe(200);
    expect(catalog.body.data.stories.some((story: { storyId: string }) => story.storyId === fixtureId)).toBe(false);
    const denied=await api(otherPage, `/api/sync/pull?storyId=${fixtureId}`);expect(denied.status).toBe(200);expect(denied.body.data.story).toBeNull();expect(denied.body.data.chatMessages).toEqual([]);expect(JSON.stringify(denied.body)).not.toContain(fixtureTitle);
    await a.evaluate(async () => { await (window as unknown as { Clerk: { signOut: () => Promise<void> } }).Clerk.signOut(); });
    await gotoApp(a, '/assistant', other);
    await expect(a.getByText('Cloud sync is paused:', { exact: false })).toBeVisible();
    await expect(a.getByText(original.text, { exact: true })).toBeVisible();
    const switched=await api(a, `/api/sync/pull?storyId=${fixtureId}`);expect(switched.body.data.story).toBeNull();expect(switched.body.data.chatMessages).toEqual([]);
    expect((await api(a,'/api/sync/push','POST',{storyId:fixtureId,deltas:[{entityType:'story',entityId:fixtureId,op:'upsert',timestamp:Date.now(),payload:{title:'Denied edit',version:0}}]})).status).toBe(403);
  });
});
