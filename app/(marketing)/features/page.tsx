import { BookOpen, Zap, MessageSquareText, BrainCircuit, Lock, MessageCircle } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Features -- Zagafy',
  description: 'Explore the tools that make Zagafy your antiquarian narrative workshop.',
};

const features = [
  {
    icon: BookOpen,
    title: 'Manuscript Editor',
    description:
      'Write with continuity awareness. The editor keeps track of every character, location, and timeline detail across your entire manuscript, surfacing relevant context as you draft new scenes. No more flipping back through chapters to remember what color the door was.',
  },
  {
    icon: Zap,
    title: 'Flow Mode',
    description:
      'Enter deep focus writing with a distraction-free environment designed for sustained creative output. Flow Mode strips away everything except your words, tracks your sprint progress, and gently nudges you to keep momentum without breaking your concentration.',
  },
  {
    icon: MessageSquareText,
    title: 'AI Copilot',
    description:
      'Get unstuck with context-aware suggestions. The copilot has read your entire story and can brainstorm plot directions, draft dialogue, describe settings, or help you work through structural problems -- all while respecting your unique voice and established canon.',
  },
  {
    icon: BrainCircuit,
    title: 'Story Brain',
    description:
      'Catch inconsistencies automatically. Story Brain continuously analyzes your manuscript for contradictions in character details, timeline errors, and factual drift. It flags problems before your beta readers do, saving you painful revision cycles.',
  },
  {
    icon: Lock,
    title: 'Canon System',
    description:
      'Lock story facts and prevent contradictions. When you establish that a character has blue eyes or that the war ended in 1847, the Canon System treats those as immutable truths and warns you -- and the AI -- whenever something conflicts with established canon.',
  },
  {
    icon: MessageCircle,
    title: 'Character Chat',
    description:
      'Interview your characters to discover their depths. Engage in freeform conversation with any character from your story. They respond based on their established personality, backstory, and current arc position -- helping you uncover motivations you had not considered.',
  },
];

export default function FeaturesPage() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl md:text-5xl font-bold text-cream-50 text-center mb-4">
        Craft Better Stories
      </h1>
      <p className="text-center text-cream-300 max-w-2xl mx-auto mb-16 text-lg">
        Every tool in Zagafy is designed to keep your narrative consistent, your creativity flowing, and your characters alive.
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
