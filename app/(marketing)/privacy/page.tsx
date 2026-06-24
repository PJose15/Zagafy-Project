import type { Metadata } from 'next';
import { PrivacyContent } from '../_components/privacy-content';

export const metadata: Metadata = {
  title: 'Privacy Policy -- Zagafy',
  description: 'How Zagafy handles your data, manuscripts, and privacy.',
};

export default function PrivacyPage() {
  return <PrivacyContent />;
}
