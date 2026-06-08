import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

const originalEnv = { ...process.env };

describe('lib/email', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    mockSend.mockReset();
  });

  describe('isEmailConfigured', () => {
    it('returns false when RESEND_API_KEY is unset', async () => {
      delete process.env.RESEND_API_KEY;
      const { isEmailConfigured } = await import('@/lib/email');
      expect(isEmailConfigured()).toBe(false);
    });

    it('returns true when RESEND_API_KEY is set', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      const { isEmailConfigured } = await import('@/lib/email');
      expect(isEmailConfigured()).toBe(true);
    });
  });

  describe('sendEmail', () => {
    it('returns false and skips when RESEND_API_KEY is unset', async () => {
      delete process.env.RESEND_API_KEY;
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({ to: 'test@example.com', template: 'welcome' });
      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends welcome email successfully', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null });
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'welcome',
        data: { name: 'Pedro' },
      });
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'pj@example.com',
          subject: expect.stringContaining('Welcome'),
          html: expect.stringContaining('Pedro'),
        }),
      );
    });

    it('sends subscription_confirmed email with plan name', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: { id: 'msg_2' }, error: null });
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'subscription_confirmed',
        data: { name: 'Pedro', plan: 'Writer' },
      });
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Writer'),
          html: expect.stringContaining('Writer'),
        }),
      );
    });

    it('sends payment_failed email', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: { id: 'msg_3' }, error: null });
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'payment_failed',
      });
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('payment failed'),
        }),
      );
    });

    it('sends subscription_canceled email', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: { id: 'msg_4' }, error: null });
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'subscription_canceled',
      });
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('canceled'),
        }),
      );
    });

    it('sends onboarding_day1 email', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: { id: 'msg_5' }, error: null });
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'onboarding_day1',
      });
      expect(result).toBe(true);
    });

    it('sends onboarding_day3 email', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: { id: 'msg_6' }, error: null });
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'onboarding_day3',
      });
      expect(result).toBe(true);
    });

    it('sends onboarding_day7 email', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: { id: 'msg_7' }, error: null });
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'onboarding_day7',
      });
      expect(result).toBe(true);
    });

    it('returns false when Resend returns an error', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'welcome',
      });
      expect(result).toBe(false);
    });

    it('returns false when Resend throws', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockRejectedValue(new Error('network error'));
      const { sendEmail } = await import('@/lib/email');
      const result = await sendEmail({
        to: 'pj@example.com',
        template: 'welcome',
      });
      expect(result).toBe(false);
    });

    it('includes manage preferences link in all templates', async () => {
      process.env.RESEND_API_KEY = 're_test_123';
      mockSend.mockResolvedValue({ data: { id: 'msg_x' }, error: null });
      const { sendEmail } = await import('@/lib/email');
      const templates = [
        'welcome', 'subscription_confirmed', 'payment_failed',
        'subscription_canceled', 'onboarding_day1', 'onboarding_day3', 'onboarding_day7',
      ] as const;
      for (const template of templates) {
        mockSend.mockClear();
        await sendEmail({ to: 'test@example.com', template });
        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('Manage preferences'),
          }),
        );
      }
    });
  });
});
