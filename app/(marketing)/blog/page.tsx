import type { Metadata } from 'next';
import { BlogContent } from '../_components/blog-content';

export const metadata: Metadata = {
  title: 'Blog — Zagafy',
  description: 'Writing craft insights, product updates, and storytelling wisdom.',
};

export default function BlogPage() {
  return <BlogContent />;
}
