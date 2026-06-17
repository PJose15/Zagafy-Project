import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing -- Zagafy',
  description: 'Simple, transparent pricing for every kind of writer.',
};

const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Perfect for trying Zagafy on a single project.',
    features: ['1 story', '50 AI requests per day', 'Local storage', 'Manuscript editor', 'Flow Mode'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Writer',
    price: '$9',
    period: '/mo',
    description: 'For dedicated writers who need room to grow.',
    features: [
      'Unlimited stories',
      '500 AI requests per day',
      'Cloud sync across devices',
      'Export to DOCX, PDF, EPUB',
      'Story Brain analysis',
      'Canon System',
    ],
    cta: 'Start Writing',
    highlighted: true,
  },
  {
    name: 'Author',
    price: '$19',
    period: '/mo',
    description: 'Everything you need to go from draft to publication.',
    features: [
      'Everything in Writer',
      'Collaboration tools',
      'Priority AI responses',
      'Publishing preparation tools',
      'Advanced analytics',
      'Priority support',
    ],
    cta: 'Go Pro',
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl md:text-5xl font-bold text-cream-50 text-center mb-4">
        Plans for Every Writer
      </h1>
      <p className="text-center text-cream-300 max-w-2xl mx-auto mb-16 text-lg">
        Start free, upgrade when you are ready. No surprise fees, cancel anytime.
      </p>

      <div className="grid md:grid-cols-3 gap-8 items-start">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={[
              'bg-parchment-100 border rounded-xl p-8 shadow-parchment texture-parchment text-sepia-900 flex flex-col',
              tier.highlighted
                ? 'border-brass-500 ring-2 ring-brass-500/40 scale-[1.03]'
                : 'border-sepia-300/50',
            ].join(' ')}
          >
            <h2 className="font-serif text-2xl font-bold mb-1">{tier.name}</h2>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-brass-700">{tier.price}</span>
              <span className="text-sepia-600 text-sm">{tier.period}</span>
            </div>
            <p className="text-sepia-600 mb-6">{tier.description}</p>

            <ul className="space-y-2 mb-8 flex-1">
              {tier.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-sepia-700">
                  <span className="text-forest-600 mt-0.5">&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>

            <Link
              href="/sign-up"
              className={[
                'block text-center py-3 rounded-lg font-medium transition-colors',
                tier.highlighted
                  ? 'bg-brass-600 hover:bg-brass-500 text-cream-50'
                  : 'bg-mahogany-800 hover:bg-mahogany-700 text-cream-100',
              ].join(' ')}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
