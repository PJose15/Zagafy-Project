'use client';

import { useTranslations } from 'next-intl';

export function BlogContent() {
  const t = useTranslations('marketing.blog');
  const posts = [
    { title: t('post1Title'), excerpt: t('post1Excerpt') },
    { title: t('post2Title'), excerpt: t('post2Excerpt') },
    { title: t('post3Title'), excerpt: t('post3Excerpt') },
  ];

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl md:text-5xl font-bold text-cream-50 mb-4">
        {t('title')}
      </h1>
      <p className="text-cream-300 mb-12 text-lg">{t('intro')}</p>

      <div className="space-y-6">
        {posts.map((post) => (
          <div
            key={post.title}
            className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-6 shadow-parchment texture-parchment text-sepia-900"
          >
            <p className="text-xs uppercase tracking-wide text-sepia-600 mb-1">{t('comingSoon')}</p>
            <h2 className="font-serif text-xl font-bold mb-2">{post.title}</h2>
            <p className="text-sepia-700 leading-relaxed">{post.excerpt}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
