'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

const SECTION_KEYS = [
  'gettingStarted',
  'genesis',
  'manuscript',
  'flowMode',
  'aiCopilot',
  'storyBrain',
  'canonSystem',
  'heteronyms',
  'syncDevices',
  'billing',
  'troubleshooting',
  'privacySecurity',
] as const;

export default function DocsPage() {
  const t = useTranslations('marketing.docs');
  const [filter, setFilter] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const sections = SECTION_KEYS.map((key) => ({
    title: t(`${key}Title`),
    content: t(`${key}Content`),
  }));

  const filtered = sections.filter((s) =>
    s.title.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl font-bold text-cream-50 mb-4">{t('title')}</h1>
      <p className="text-cream-300 mb-8 text-lg">{t('intro')}</p>

      <input
        type="text"
        placeholder={t('filterPlaceholder')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-8 px-4 py-3 rounded-lg bg-parchment-100 border border-sepia-300/50 text-sepia-900 placeholder:text-sepia-600 focus:outline-none focus:ring-2 focus:ring-brass-500/50"
      />

      <div className="space-y-3">
        {filtered.map((section) => {
          const idx = sections.indexOf(section);
          const isOpen = openIndex === idx;

          return (
            <div
              key={section.title}
              className="bg-parchment-100 border border-sepia-300/50 rounded-xl shadow-parchment texture-parchment text-sepia-900 overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(isOpen ? null : idx)}
                className="w-full flex items-center justify-between px-6 py-4 text-left font-serif text-lg font-bold hover:bg-parchment-200/50 transition-colors"
              >
                {section.title}
                <ChevronDown
                  size={20}
                  className={`text-sepia-600 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && (
                <div className="px-6 pb-6 text-sepia-700 leading-relaxed whitespace-pre-line">
                  {section.content}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-cream-400 text-center py-8">
            {t('noResults')}
          </p>
        )}
      </div>
    </section>
  );
}
