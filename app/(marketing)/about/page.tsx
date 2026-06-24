import type { Metadata } from 'next';
import { AboutContent } from '../_components/about-content';

export const metadata: Metadata = {
  title: 'About -- Zagafy',
  description: 'Learn about Zagafy and our mission to help writers craft consistent, deep stories.',
};

export default function AboutPage() {
  return <AboutContent />;
}
