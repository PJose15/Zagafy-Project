import type { Metadata } from 'next';
import { PricingContent } from '../_components/pricing-content';

export const metadata: Metadata = {
  title: 'Pricing -- Zagafy',
  description: 'Simple, transparent pricing for every kind of writer.',
};

export default function PricingPage() {
  return <PricingContent />;
}
