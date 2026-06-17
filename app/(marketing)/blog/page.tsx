import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Blog -- Zagafy',
  description: 'Writing craft insights, product updates, and storytelling wisdom.',
};

const placeholderPosts = [
  {
    title: 'The Art of Consistent World-Building',
    date: 'Coming soon',
    excerpt:
      'How to maintain internal consistency across sprawling fictional worlds without losing your creative momentum.',
  },
  {
    title: 'Why Your Characters Need Contradictions',
    date: 'Coming soon',
    excerpt:
      'Exploring the paradox of believable characters: they must be consistent enough to trust, yet contradictory enough to feel real.',
  },
  {
    title: 'Flow State and the Writer\'s Mind',
    date: 'Coming soon',
    excerpt:
      'The science behind deep focus writing and how the right environment can help you access it more reliably.',
  },
];

export default function BlogPage() {
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl md:text-5xl font-bold text-cream-50 mb-4">
        Blog
      </h1>
      <p className="text-cream-300 mb-12 text-lg">
        Writing craft insights, product updates, and storytelling wisdom. Coming soon.
      </p>

      <div className="space-y-6">
        {placeholderPosts.map((post) => (
          <div
            key={post.title}
            className="bg-parchment-100 border border-sepia-300/50 rounded-xl p-6 shadow-parchment texture-parchment text-sepia-900"
          >
            <p className="text-xs uppercase tracking-wide text-sepia-600 mb-1">{post.date}</p>
            <h2 className="font-serif text-xl font-bold mb-2">{post.title}</h2>
            <p className="text-sepia-700 leading-relaxed">{post.excerpt}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
