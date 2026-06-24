'use client';

import { BookOpen, Zap, MessageSquareText, BrainCircuit, Lock, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function FeaturesContent() {
  const t = useTranslations('marketing.features');
  const features = [
    { icon: BookOpen, title: t('manuscriptEditorTitle'), description: t('manuscriptEditorDesc') },
    { icon: Zap, title: t('flowModeTitle'), description: t('flowModeDesc') },
    { icon: MessageSquareText, title: t('aiCopilotTitle'), description: t('aiCopilotDesc') },
    { icon: BrainCircuit, title: t('storyBrainTitle'), description: t('storyBrainDesc') },
    { icon: Lock, title: t('canonSystemTitle'), description: t('canonSystemDesc') },
    { icon: MessageCircle, title: t('characterChatTitle'), description: t('characterChatDesc') },
  ];

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl md:text-5xl font-bold text-cream-50 text-center mb-4">
        {t('title')}
      </h1>
      <p className="text-center text-cream-300 max-w-2xl mx-auto mb-16 text-lg">
        {t('subtitle')}
      </p>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((f) => (
          <div
            key={f.title}
            className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-6 shadow-parchment texture-parchment text-sepia-900"
          >
            <f.icon size={32} className="text-brass-600 mb-4" />
            <h2 className="font-serif text-xl font-bold mb-2">{f.title}</h2>
            <p className="text-sepia-700 leading-relaxed">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
