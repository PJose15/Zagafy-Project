import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy -- Zagafy',
  description: 'How Zagafy handles your data, manuscripts, and privacy.',
};

export default function PrivacyPage() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl font-bold text-cream-50 mb-8">Privacy Policy</h1>

      <div className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-8 shadow-parchment texture-parchment text-sepia-900 space-y-6 leading-relaxed">
        <p className="text-sm text-sepia-600">Last updated: June 2026</p>

        <h2 className="font-serif text-xl font-bold pt-2">1. Data Collection</h2>
        <p>
          Zagafy collects minimal data. We store your authentication credentials (managed by
          Clerk) and basic usage analytics via PostHog. Analytics are opt-in -- you can decline
          tracking at any time through the consent banner, and we will respect your choice
          immediately.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">2. Manuscript Storage</h2>
        <p>
          Your manuscripts are stored locally on your device by default. If you enable cloud
          sync, your story data is encrypted in transit and at rest on our servers. You can
          delete your cloud data at any time from the Settings page, and we will purge it within
          30 days.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">3. AI Processing</h2>
        <p>
          When you use AI features (Copilot, Story Brain, Character Chat), relevant portions of
          your manuscript are sent to the Google Gemini API for processing. Google does not store
          your content after processing is complete and does not use it for model training. We
          send only the minimum context necessary for each request.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">4. GDPR Rights</h2>
        <p>
          If you are in the European Economic Area, you have the right to access, rectify,
          delete, or export your personal data. You may also object to processing or request
          restriction. To exercise any of these rights, contact us at privacy@zagafy.com and we
          will respond within 30 days.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">5. Cookies</h2>
        <p>
          We use essential cookies for authentication and session management. Analytics cookies
          are only set if you opt in. We do not use advertising cookies or share data with
          third-party advertisers.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">6. Contact</h2>
        <p>
          For questions about this policy, contact us at privacy@zagafy.com.
        </p>
      </div>
    </section>
  );
}
