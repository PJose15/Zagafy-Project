import type { Metadata } from 'next';
import { FeaturesContent } from '../_components/features-content';

export const metadata: Metadata = {
  title: 'Features — Zagafy',
  description: 'Explore the tools that make Zagafy your antiquarian narrative workshop.',
};

export default function FeaturesPage() {
  return <FeaturesContent />;
}
