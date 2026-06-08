import 'server-only';
import { Resend } from 'resend';
import { log } from '@/lib/logger';

/**
 * Phase 5.10 — transactional email via Resend.
 *
 * Follows the lazy-init singleton pattern. No-ops when RESEND_API_KEY
 * is unset so the app works without email in dev/embed mode.
 */

let cached: Resend | null = null;

function resend(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  cached = new Resend(key);
  return cached;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const FROM_ADDRESS = 'Zagafy <noreply@zagafy.com>';

export type EmailTemplate =
  | 'welcome'
  | 'subscription_confirmed'
  | 'payment_failed'
  | 'subscription_canceled'
  | 'onboarding_day1'
  | 'onboarding_day3'
  | 'onboarding_day7';

interface SendEmailOptions {
  to: string;
  template: EmailTemplate;
  data?: Record<string, string>;
}

function renderSubject(template: EmailTemplate, data?: Record<string, string>): string {
  switch (template) {
    case 'welcome':
      return 'Welcome to Zagafy — your antiquarian writing workshop';
    case 'subscription_confirmed':
      return `Your ${data?.plan ?? ''} plan is active`;
    case 'payment_failed':
      return 'Action needed: payment failed for your Zagafy subscription';
    case 'subscription_canceled':
      return 'Your Zagafy subscription has been canceled';
    case 'onboarding_day1':
      return 'Tip: start your first story in Zagafy';
    case 'onboarding_day3':
      return 'How is your story coming along?';
    case 'onboarding_day7':
      return 'Your first week with Zagafy — a quick recap';
  }
}

function renderHtml(template: EmailTemplate, data?: Record<string, string>): string {
  const name = data?.name ?? 'Writer';
  const appUrl = data?.appUrl ?? 'https://zagafy.com';
  const unsubscribeUrl = `${appUrl}/settings`;

  const footer = `
    <hr style="border:none;border-top:1px solid #d4c5a9;margin:32px 0 16px" />
    <p style="font-size:12px;color:#8b7355;">
      You received this because you have a Zagafy account.
      <a href="${unsubscribeUrl}" style="color:#8b7355;">Manage preferences</a>
    </p>`;

  const wrap = (body: string) => `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="font-family:Georgia,'Times New Roman',serif;background:#faf6f0;color:#3d2e1f;max-width:600px;margin:0 auto;padding:24px;">
${body}
${footer}
</body>
</html>`;

  switch (template) {
    case 'welcome':
      return wrap(`
        <h1 style="font-size:24px;color:#5c3d2e;">Welcome to Zagafy</h1>
        <p>Hello ${name},</p>
        <p>Your antiquarian writing workshop is ready. Zagafy helps you build novels with
        an AI copilot that remembers your characters, timeline, conflicts, and world.</p>
        <p><a href="${appUrl}" style="display:inline-block;padding:12px 24px;background:#8b6914;color:#faf6f0;text-decoration:none;border-radius:8px;font-weight:bold;">Open Zagafy</a></p>
        <p>Happy writing,<br/>The Zagafy Team</p>`);

    case 'subscription_confirmed':
      return wrap(`
        <h1 style="font-size:24px;color:#5c3d2e;">Subscription Active</h1>
        <p>Hello ${name},</p>
        <p>Your <strong>${data?.plan ?? 'paid'}</strong> plan is now active. You have access to
        all the features included in your tier.</p>
        <p><a href="${appUrl}/settings" style="display:inline-block;padding:12px 24px;background:#8b6914;color:#faf6f0;text-decoration:none;border-radius:8px;font-weight:bold;">View your plan</a></p>
        <p>Thank you for supporting Zagafy.</p>`);

    case 'payment_failed':
      return wrap(`
        <h1 style="font-size:24px;color:#5c3d2e;">Payment Failed</h1>
        <p>Hello ${name},</p>
        <p>We were unable to process your latest payment. Please update your payment
        method within 7 days to keep your subscription active.</p>
        <p><a href="${appUrl}/settings" style="display:inline-block;padding:12px 24px;background:#8b6914;color:#faf6f0;text-decoration:none;border-radius:8px;font-weight:bold;">Update payment method</a></p>
        <p>If you need help, reply to this email.</p>`);

    case 'subscription_canceled':
      return wrap(`
        <h1 style="font-size:24px;color:#5c3d2e;">Subscription Canceled</h1>
        <p>Hello ${name},</p>
        <p>Your subscription has been canceled. You still have access to the Free tier
        with all your existing stories preserved locally.</p>
        <p>If you change your mind, you can resubscribe anytime from Settings.</p>
        <p>We hope to see you again.</p>`);

    case 'onboarding_day1':
      return wrap(`
        <h1 style="font-size:24px;color:#5c3d2e;">Getting Started</h1>
        <p>Hello ${name},</p>
        <p>Here is a quick tip to get the most out of Zagafy: start by creating your
        first story and adding a few characters. The AI copilot learns your world as
        you build it.</p>
        <p><a href="${appUrl}" style="display:inline-block;padding:12px 24px;background:#8b6914;color:#faf6f0;text-decoration:none;border-radius:8px;font-weight:bold;">Start writing</a></p>`);

    case 'onboarding_day3':
      return wrap(`
        <h1 style="font-size:24px;color:#5c3d2e;">How Is It Going?</h1>
        <p>Hello ${name},</p>
        <p>You have been a Zagafy writer for 3 days now. Have you tried the Story Brain?
        It analyzes your manuscript for plot holes, inconsistencies, and pacing.</p>
        <p><a href="${appUrl}/story-brain" style="display:inline-block;padding:12px 24px;background:#8b6914;color:#faf6f0;text-decoration:none;border-radius:8px;font-weight:bold;">Try Story Brain</a></p>`);

    case 'onboarding_day7':
      return wrap(`
        <h1 style="font-size:24px;color:#5c3d2e;">Your First Week</h1>
        <p>Hello ${name},</p>
        <p>One week in! Check your Writing Map to see your progress, flow scores,
        and writing streaks. Keep the momentum going.</p>
        <p><a href="${appUrl}/writing-map" style="display:inline-block;padding:12px 24px;background:#8b6914;color:#faf6f0;text-decoration:none;border-radius:8px;font-weight:bold;">View Writing Map</a></p>`);
  }
}

/**
 * Send a transactional email. No-ops when Resend is not configured.
 * Returns true on success, false on failure (never throws).
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  if (!isEmailConfigured()) {
    log.info('Email skipped (RESEND_API_KEY not configured)', { template: options.template, to: options.to });
    return false;
  }

  const subject = renderSubject(options.template, options.data);
  const html = renderHtml(options.template, options.data);

  try {
    const { error } = await resend().emails.send({
      from: FROM_ADDRESS,
      to: options.to,
      subject,
      html,
    });

    if (error) {
      log.warn('Email send failed', { template: options.template, to: options.to, error: error.message });
      return false;
    }

    log.info('Email sent', { template: options.template, to: options.to });
    return true;
  } catch (e) {
    log.error('Email send error', e, { template: options.template, to: options.to });
    return false;
  }
}
