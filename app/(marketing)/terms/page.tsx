import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service -- Zagafy',
  description: 'Terms and conditions for using the Zagafy platform.',
};

export default function TermsPage() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl font-bold text-cream-50 mb-8">Terms of Service</h1>

      <div className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-8 shadow-parchment texture-parchment text-sepia-900 space-y-6 leading-relaxed">
        <p className="text-sm text-sepia-500">Last updated: June 2026</p>

        <h2 className="font-serif text-xl font-bold pt-2">1. Service Description</h2>
        <p>
          Zagafy is a web-based narrative writing platform that provides manuscript editing, AI
          writing assistance, story consistency analysis, and related tools. The service is
          provided &quot;as is&quot; and may be updated, modified, or discontinued at our
          discretion.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">2. User Responsibilities</h2>
        <p>
          You are responsible for maintaining the security of your account credentials. You agree
          not to use the platform to generate content that is unlawful, harmful, or infringes on
          the rights of others. You must be at least 13 years old to use Zagafy.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">3. Intellectual Property</h2>
        <p>
          You retain full ownership of all content you create using Zagafy. Your manuscripts,
          characters, outlines, and other creative work belong entirely to you. We claim no
          rights over your content and will never use it for training AI models or any other
          purpose without your explicit consent.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">4. AI-Generated Content</h2>
        <p>
          Content suggested by AI features is provided as creative assistance. You are
          responsible for reviewing, editing, and accepting any AI suggestions before
          incorporating them into your work. We make no guarantees about the originality or
          accuracy of AI-generated content.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">5. Limitation of Liability</h2>
        <p>
          Zagafy is provided without warranties of any kind, express or implied. We are not
          liable for any loss of data, manuscripts, or creative work. We strongly recommend
          maintaining local backups of your important manuscripts. Our total liability shall not
          exceed the amount you paid for the service in the preceding 12 months.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">6. Termination</h2>
        <p>
          You may cancel your account at any time from the Settings page. Upon cancellation, you
          will have 30 days to export your data before it is permanently deleted from our
          servers. We reserve the right to suspend or terminate accounts that violate these
          terms.
        </p>

        <h2 className="font-serif text-xl font-bold pt-2">7. Contact</h2>
        <p>
          For questions about these terms, contact us at legal@zagafy.com.
        </p>
      </div>
    </section>
  );
}
