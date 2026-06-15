import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About -- Zagafy',
  description: 'Learn about Zagafy and our mission to help writers craft consistent, deep stories.',
};

export default function AboutPage() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl md:text-5xl font-bold text-cream-50 mb-8">
        About Zagafy
      </h1>

      <div className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-8 shadow-parchment texture-parchment text-sepia-900 space-y-6 leading-relaxed">
        <p className="text-lg font-serif text-sepia-800">
          Zagafy is your antiquarian narrative workshop -- a place where stories are crafted with
          the care and precision of a master bookbinder, supported by modern AI that understands
          the weight of every word you write.
        </p>

        <h2 className="font-serif text-2xl font-bold text-sepia-900 pt-4">Our Mission</h2>
        <p>
          We believe every story deserves internal consistency and depth. Too often, writers lose
          track of details as their manuscripts grow -- a character&apos;s eye color shifts, a
          timeline contradicts itself, a subplot disappears without resolution. These small
          fractures accumulate and weaken the reader&apos;s trust in the narrative.
        </p>
        <p>
          Zagafy exists to solve that problem. By combining a thoughtful writing environment with
          AI that has actually read your manuscript, we give writers a creative partner that
          catches contradictions, remembers every detail, and suggests possibilities without
          overriding your voice.
        </p>

        <h2 className="font-serif text-2xl font-bold text-sepia-900 pt-4">Our Philosophy</h2>
        <p>
          We draw inspiration from the antiquarian tradition -- the idea that knowledge and
          stories are precious artifacts worth preserving with care. Our interface reflects this
          with warm parchment tones, brass accents, and typography that honors the printed word.
          Behind the aesthetic is a commitment to craft: every feature in Zagafy is designed to
          help you write better, not just faster.
        </p>
        <p>
          Your stories belong to you. Zagafy stores manuscripts locally by default, processes AI
          requests without retaining your content, and never trains on your work. We are a tool
          in service of your creativity, nothing more.
        </p>
      </div>
    </section>
  );
}
