import type { Metadata } from 'next';
import { TermsContent } from '../_components/terms-content';

export const metadata: Metadata = {
  title: 'Terms of Service — Zagafy',
  description: 'Terms and conditions for using the Zagafy platform.',
};

export default function TermsPage() {
  return <TermsContent />;
}
