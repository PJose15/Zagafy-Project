import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ user: { id: 'one' }, fetch: vi.fn(), toast: vi.fn() }));
vi.mock('@clerk/nextjs', () => ({ useUser: () => ({ user: mocks.user, isLoaded: true, isSignedIn: true }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: Record<string, unknown>) => values?.name ? `${key} ${values.name}` : key }));
vi.mock('@/components/toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
import { BillingSection } from '@/components/billing/billing-section';
const response = (plan: string, hasBillingAccount = true) => new Response(JSON.stringify({ ok: true, plan, hasBillingAccount }));
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_example');
  vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'saas');
  mocks.user = { id: 'one' };
  mocks.fetch.mockReset().mockResolvedValue(response('author'));
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('loads the actual paid plan and provides portal access', async () => {
  render(<BillingSection />);
  expect(await screen.findByText('Author')).not.toBeNull();
  expect(screen.getByText('manageBilling')).not.toBeNull();
  expect(screen.queryByText('Free')).toBeNull();
});
it('shows lookup failures and retries without presenting a false Free plan', async () => {
  mocks.fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response('writer'));
  render(<BillingSection />);
  expect((await screen.findByRole('alert')).textContent).toContain('statusError');
  expect(screen.queryByText('Free')).toBeNull();
  fireEvent.click(screen.getByText('retry'));
  expect(await screen.findByText('Writer')).not.toBeNull();
});
it('ignores a late billing response after the account changes', async () => {
  let resolve!: (value: Response) => void;
  mocks.fetch.mockReturnValueOnce(new Promise<Response>(done => { resolve = done; })).mockResolvedValueOnce(response('writer'));
  const view = render(<BillingSection />);
  mocks.user = { id: 'two' }; view.rerender(<BillingSection />);
  expect(await screen.findByText('Writer')).not.toBeNull();
  resolve(response('studio'));
  await waitFor(() => expect(view.container.querySelector('.bg-brass-100')?.textContent).toBe('Writer'));
});
it('sends the selected yearly interval for an upgrade', async () => {
  mocks.fetch.mockResolvedValueOnce(response('free', false)).mockResolvedValue(new Response(JSON.stringify({ ok: true, url: null })));
  render(<BillingSection />);
  await screen.findByText('Free');
  fireEvent.click(screen.getByRole('radio', { name: 'yearly' }));
  fireEvent.click(screen.getByText('upgradeTo Writer'));
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith('/api/billing/checkout', expect.objectContaining({ body: JSON.stringify({ plan: 'writer', interval: 'yearly' }) })));
});
it('keeps billing history accessible after cancellation', async () => {
  mocks.fetch.mockResolvedValue(response('free', true));
  render(<BillingSection />);
  expect(await screen.findByText('manageBilling')).not.toBeNull();
});
