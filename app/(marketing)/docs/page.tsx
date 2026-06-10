'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const sections = [
  {
    title: 'Getting Started',
    content: `Zagafy is your antiquarian narrative workshop -- a writing environment built for novelists, screenwriters, and storytellers who care about consistency and craft. When you first sign up, you will land on the Library page where all your stories live.\n\nTo create your first story, click the "New Story" button. You can start from scratch or use the Genesis wizard to build a structured foundation with characters, settings, and plot outlines. Once your story is created, you will be taken to the Manuscript editor where the real writing begins.\n\nZagafy saves your work locally by default. If you enable cloud sync, your manuscripts are available across all your devices.`,
  },
  {
    title: 'Genesis',
    content: `The Genesis wizard is your story's origin point. It walks you through a structured process to establish the foundational elements of your narrative before you write a single chapter.\n\nDuring Genesis, you will define your story's genre, setting, time period, and core premise. You will create initial characters with personality traits, backstories, and relationships. The wizard also helps you outline major plot arcs and establish the canon facts that the AI will reference throughout your writing process.\n\nYou can revisit Genesis at any time to add new characters or update your story's foundational details.`,
  },
  {
    title: 'Manuscript',
    content: `The Manuscript editor is where you write and organize your chapters. It provides a clean, distraction-minimal writing surface with your story's context always accessible in the sidebar.\n\nChapters can be reordered by dragging, and you can split or merge chapters as your structure evolves. The editor supports rich text formatting, inline comments, and version history so you can track how your manuscript has changed over time.\n\nWord count targets can be set per chapter or for the entire manuscript, giving you clear progress indicators as you draft.`,
  },
  {
    title: 'Flow Mode',
    content: `Flow Mode is a deep focus writing environment that strips away everything except your words. When you enter Flow Mode, the interface dims to a single column of text with a gentle progress indicator.\n\nYou can set sprint targets by word count or time. Flow Mode tracks your writing velocity and streaks, helping you build a consistent writing habit. A subtle ambient sound option is available to help maintain concentration.\n\nTo enter Flow Mode, click the lightning bolt icon in the Manuscript editor or use the keyboard shortcut.`,
  },
  {
    title: 'AI Copilot',
    content: `The AI Copilot is your context-aware writing assistant. Unlike generic AI tools, the Copilot has read your entire manuscript and understands your characters, plot, setting, and established canon.\n\nYou can ask the Copilot to brainstorm plot directions, draft dialogue, describe settings, identify pacing issues, or help you work through structural problems. It responds with suggestions that respect your story's established facts and your unique voice.\n\nThe Copilot is available through the chat panel on the right side of the Manuscript editor. Your conversation history is preserved per story.`,
  },
  {
    title: 'Story Brain',
    content: `Story Brain is Zagafy's automatic consistency checker. It continuously analyzes your manuscript for contradictions in character details, timeline errors, factual drift, and unresolved plot threads.\n\nWhen Story Brain detects a potential issue, it surfaces a notification with the specific chapters and passages involved. You can dismiss false positives, mark issues as intentional, or navigate directly to the relevant text to make corrections.\n\nStory Brain runs in the background and updates its analysis as you write. You can also trigger a full manuscript scan from the Story Brain dashboard.`,
  },
  {
    title: 'Canon System',
    content: `The Canon System lets you lock story facts so they become immutable truths in your narrative. When you establish that a character has blue eyes or that the capital city is named Aldenmere, the Canon System treats these as ground truth.\n\nIf you or the AI ever contradict a canon fact, the system will flag the inconsistency immediately. Canon entries can be created manually or promoted from Story Brain suggestions.\n\nYou can organize canon entries by category -- characters, locations, timeline, rules of the world -- and export your entire canon as a reference document.`,
  },
  {
    title: 'Heteronyms',
    content: `Heteronyms are writing personas you can adopt within Zagafy. Inspired by the literary tradition of Fernando Pessoa, each heteronym has its own voice, style preferences, and writing tendencies.\n\nWhen you write under a heteronym, the AI adjusts its suggestions to match that persona's style. This is useful for authors who write across genres or who want to experiment with different narrative voices within the same project.\n\nYou can create and switch between heteronyms from the Settings page. Each heteronym maintains its own style profile and writing history.`,
  },
  {
    title: 'Sync & Devices',
    content: `By default, Zagafy stores your manuscripts locally in your browser. This means your data never leaves your device unless you choose to enable cloud sync.\n\nCloud sync, powered by Clerk authentication, keeps your stories, settings, and preferences synchronized across all your devices. Changes are merged automatically, and conflict resolution preserves both versions when simultaneous edits occur.\n\nYou can enable or disable cloud sync at any time from the Settings page. Disabling sync does not delete your cloud data -- you can remove it separately if desired.`,
  },
  {
    title: 'Billing',
    content: `Zagafy offers three plans: Free, Writer ($9/month), and Author ($19/month). The Free plan includes one story and 50 AI requests per day. Writer adds unlimited stories, cloud sync, and export features. Author includes collaboration tools and priority AI.\n\nYou can upgrade, downgrade, or cancel your plan at any time from the Settings page. When you downgrade, you retain access to your current plan until the end of your billing cycle.\n\nAll payments are processed securely. We do not store your payment card details directly.`,
  },
  {
    title: 'Troubleshooting',
    content: `If the AI Copilot is not responding, check your internet connection and ensure you have not exceeded your daily AI request limit. Free accounts are limited to 50 requests per day.\n\nIf your manuscript is not saving, try refreshing the page. Zagafy auto-saves every 30 seconds, but a manual save can be triggered with Ctrl+S (or Cmd+S on Mac). If cloud sync is enabled and not working, try signing out and back in.\n\nFor persistent issues, clear your browser cache and reload. If problems continue, contact support at help@zagafy.com with a description of the issue and your browser version.`,
  },
  {
    title: 'Privacy & Security',
    content: `Zagafy is built with privacy as a default. Manuscripts are stored locally unless you opt into cloud sync. Analytics via PostHog are opt-in and can be disabled at any time through the consent banner.\n\nWhen you use AI features, relevant portions of your manuscript are sent to the Google Gemini API for processing. Google does not retain your content after the request is complete and does not use it for training.\n\nAll data in transit is encrypted via TLS. Cloud-stored manuscripts are encrypted at rest. You can delete all your data at any time from the Settings page.`,
  },
];

export default function DocsPage() {
  const [filter, setFilter] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const filtered = sections.filter((s) =>
    s.title.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-serif text-4xl font-bold text-cream-50 mb-4">Help Documentation</h1>
      <p className="text-cream-300 mb-8 text-lg">
        Everything you need to know about using Zagafy.
      </p>

      <input
        type="text"
        placeholder="Filter sections..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full mb-8 px-4 py-3 rounded-lg bg-parchment-100 border border-sepia-300/50 text-sepia-900 placeholder:text-sepia-400 focus:outline-none focus:ring-2 focus:ring-brass-500/50"
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
                  className={`text-sepia-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
            No sections match your filter. Try a different search term.
          </p>
        )}
      </div>
    </section>
  );
}
