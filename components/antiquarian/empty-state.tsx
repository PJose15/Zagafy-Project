'use client';

import { motion } from 'motion/react';
import { fadeUp } from '@/lib/animations';
import Link from 'next/link';
import { InkStampButton } from './ink-stamp-button';

type EmptyStateVariant =
  | 'manuscript'
  | 'characters'
  | 'timeline'
  | 'conflicts'
  | 'canon'
  | 'loops'
  | 'bible'
  | 'import'
  | 'generic';

interface EmptyStateProps {
  variant: EmptyStateVariant;
  title: string;
  subtitle?: string;
  action?: { label: string; onClick: () => void } | { label: string; href: string };
}

// ─── SVG Illustrations ───

function ManuscriptIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Table surface */}
      <rect x="20" y="110" width="160" height="4" rx="2" fill="#5a3d1e" opacity="0.2" />
      {/* Left page */}
      <path d="M40 30 Q100 25 100 30 L100 105 Q100 100 40 105 Z" fill="#f8edd8" stroke="#7a5a30" strokeWidth="1" />
      {/* Right page */}
      <path d="M100 30 Q160 25 160 30 L160 105 Q160 100 100 105 Z" fill="#f0dfc0" stroke="#7a5a30" strokeWidth="1" />
      {/* Spine */}
      <line x1="100" y1="25" x2="100" y2="108" stroke="#4a2c1a" strokeWidth="2" />
      {/* Text lines on left page */}
      <line x1="52" y1="45" x2="90" y2="45" stroke="#9a7a4a" strokeWidth="1" opacity="0.3" strokeDasharray="3 2" />
      <line x1="52" y1="55" x2="85" y2="55" stroke="#9a7a4a" strokeWidth="1" opacity="0.25" strokeDasharray="3 2" />
      <line x1="52" y1="65" x2="88" y2="65" stroke="#9a7a4a" strokeWidth="1" opacity="0.2" strokeDasharray="3 2" />
      <line x1="52" y1="75" x2="80" y2="75" stroke="#9a7a4a" strokeWidth="1" opacity="0.15" strokeDasharray="3 2" />
      {/* Quill pen across right page */}
      <path d="M110 95 Q140 50 165 25" stroke="#a88540" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M165 25 Q170 20 168 15 Q163 18 160 22 Q162 24 165 25Z" fill="#7a5a30" opacity="0.6" />
      {/* Ink pot */}
      <ellipse cx="170" cy="108" rx="10" ry="5" fill="#2c1e0f" />
      <rect x="162" y="98" width="16" height="10" rx="2" fill="#3e2a15" />
      <ellipse cx="170" cy="98" rx="8" ry="3" fill="#1a0e08" />
    </svg>
  );
}

function CharactersIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Spotlight glow */}
      <circle cx="100" cy="70" r="55" fill="url(#charGlow)" />
      {/* Center bust (protagonist) */}
      <ellipse cx="100" cy="100" rx="22" ry="12" fill="#e4cfa0" opacity="0.5" />
      <circle cx="100" cy="62" r="16" fill="#d4b880" opacity="0.6" />
      <ellipse cx="100" cy="78" rx="10" ry="4" fill="#d4b880" opacity="0.5" />
      {/* Left bust */}
      <ellipse cx="55" cy="105" rx="18" ry="10" fill="#e4cfa0" opacity="0.35" />
      <circle cx="55" cy="72" r="13" fill="#c4a06e" opacity="0.45" />
      <ellipse cx="55" cy="85" rx="8" ry="3" fill="#c4a06e" opacity="0.35" />
      {/* Right bust */}
      <ellipse cx="145" cy="105" rx="18" ry="10" fill="#e4cfa0" opacity="0.35" />
      <circle cx="145" cy="72" r="13" fill="#c4a06e" opacity="0.45" />
      <ellipse cx="145" cy="85" rx="8" ry="3" fill="#c4a06e" opacity="0.35" />
      {/* Sparkles */}
      <circle cx="30" cy="45" r="2" fill="#c49b48" opacity="0.3" />
      <circle cx="170" cy="40" r="1.5" fill="#c49b48" opacity="0.25" />
      <circle cx="75" cy="30" r="1" fill="#c49b48" opacity="0.2" />
      <circle cx="130" cy="35" r="1.5" fill="#c49b48" opacity="0.2" />
      <circle cx="50" cy="120" r="1" fill="#c49b48" opacity="0.15" />
      <defs>
        <radialGradient id="charGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#c49b48" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#c49b48" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function TimelineIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Hourglass frame */}
      <path d="M70 25 L130 25" stroke="#a88540" strokeWidth="2" strokeLinecap="round" />
      <path d="M70 115 L130 115" stroke="#a88540" strokeWidth="2" strokeLinecap="round" />
      {/* Upper glass */}
      <path d="M75 28 Q75 65 100 70 Q125 65 125 28" fill="#f0dfc0" stroke="#8b6b38" strokeWidth="1.5" />
      {/* Lower glass */}
      <path d="M75 112 Q75 75 100 70 Q125 75 125 112" fill="#f8edd8" stroke="#8b6b38" strokeWidth="1.5" />
      {/* Sand in bottom */}
      <path d="M82 112 Q82 95 100 88 Q118 95 118 112" fill="#d4b050" opacity="0.3" />
      {/* Falling sand stream */}
      <line x1="100" y1="72" x2="100" y2="86" stroke="#c49b48" strokeWidth="1" opacity="0.4" strokeDasharray="2 3" />
      {/* Sand particles */}
      <circle cx="95" cy="100" r="1.5" fill="#c49b48" opacity="0.35" />
      <circle cx="105" cy="104" r="1" fill="#c49b48" opacity="0.3" />
      <circle cx="100" cy="107" r="1.5" fill="#c49b48" opacity="0.25" />
      <circle cx="92" cy="106" r="1" fill="#c49b48" opacity="0.2" />
      <circle cx="108" cy="100" r="1" fill="#c49b48" opacity="0.3" />
      {/* Dotted timeline extending left/right */}
      <line x1="10" y1="70" x2="65" y2="70" stroke="#9a7a4a" strokeWidth="1" opacity="0.25" strokeDasharray="4 4" />
      <line x1="135" y1="70" x2="190" y2="70" stroke="#9a7a4a" strokeWidth="1" opacity="0.25" strokeDasharray="4 4" />
    </svg>
  );
}

function ConflictsIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Scroll underneath */}
      <rect x="55" y="85" width="90" height="35" rx="3" fill="#f0dfc0" stroke="#9a7a4a" strokeWidth="1" opacity="0.5" />
      <ellipse cx="55" cy="102" rx="4" ry="17" fill="#f8edd8" stroke="#9a7a4a" strokeWidth="0.5" />
      <ellipse cx="145" cy="102" rx="4" ry="17" fill="#f8edd8" stroke="#9a7a4a" strokeWidth="0.5" />
      {/* Left quill */}
      <path d="M60 90 Q85 50 120 20" stroke="#a88540" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M120 20 Q125 15 123 10 Q118 13 115 17 Q117 19 120 20Z" fill="#5a3d1e" opacity="0.6" />
      {/* Right quill */}
      <path d="M140 90 Q115 50 80 20" stroke="#a88540" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M80 20 Q75 15 77 10 Q82 13 85 17 Q83 19 80 20Z" fill="#5a3d1e" opacity="0.6" />
      {/* Cross point emphasis */}
      <circle cx="100" cy="55" r="6" fill="none" stroke="#c49b48" strokeWidth="0.5" opacity="0.3" />
      {/* Text lines on scroll */}
      <line x1="70" y1="95" x2="130" y2="95" stroke="#9a7a4a" strokeWidth="0.5" opacity="0.2" strokeDasharray="3 2" />
      <line x1="75" y1="102" x2="125" y2="102" stroke="#9a7a4a" strokeWidth="0.5" opacity="0.15" strokeDasharray="3 2" />
      <line x1="80" y1="109" x2="120" y2="109" stroke="#9a7a4a" strokeWidth="0.5" opacity="0.1" strokeDasharray="3 2" />
    </svg>
  );
}

function CanonIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Parchment underneath */}
      <rect x="50" y="65" width="100" height="60" rx="4" fill="#f8edd8" stroke="#9a7a4a" strokeWidth="1" opacity="0.5" />
      {/* Press impression circle on parchment */}
      <circle cx="100" cy="95" r="20" fill="none" stroke="#9a7a4a" strokeWidth="1" strokeDasharray="3 3" opacity="0.3" />
      {/* Stamp base (viewed from above) */}
      <circle cx="100" cy="50" r="24" fill="#8b6b38" />
      <circle cx="100" cy="50" r="20" fill="#6b5030" />
      {/* Stamp design (simple Z monogram) */}
      <text x="100" y="56" textAnchor="middle" fill="#c49b48" fontSize="18" fontFamily="serif" fontWeight="bold" opacity="0.7">Z</text>
      {/* Handle */}
      <rect x="94" y="18" width="12" height="14" rx="3" fill="#4a2c1a" />
      <rect x="96" y="14" width="8" height="8" rx="2" fill="#6b3e25" />
      {/* Shine highlight */}
      <ellipse cx="92" cy="42" rx="6" ry="3" fill="white" opacity="0.08" transform="rotate(-15 92 42)" />
    </svg>
  );
}

function LoopsIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Thread forming loose figure-8 loop */}
      <path
        d="M40 70 Q40 30 80 30 Q120 30 100 60 Q80 90 120 90 Q160 90 160 70 Q160 50 140 50"
        stroke="#c49b48"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* Second loose thread */}
      <path
        d="M40 70 Q30 80 35 95 Q38 105 50 105"
        stroke="#c49b48"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* Needle at thread end */}
      <path d="M140 50 L155 35" stroke="#5a4c3e" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="155" cy="35" r="1.5" fill="none" stroke="#5a4c3e" strokeWidth="1" />
      {/* Small scattered thread wisps */}
      <path d="M70 110 Q75 115 80 112" stroke="#c49b48" strokeWidth="0.5" opacity="0.2" fill="none" />
      <path d="M130 25 Q135 20 140 22" stroke="#c49b48" strokeWidth="0.5" opacity="0.2" fill="none" />
    </svg>
  );
}

function BibleIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Book body */}
      <rect x="45" y="25" width="110" height="90" rx="4" fill="#6b3e25" />
      <rect x="48" y="28" width="104" height="84" rx="3" fill="#4a2c1a" />
      {/* Spine accent */}
      <rect x="45" y="25" width="8" height="90" rx="2" fill="#2d1a0f" />
      {/* Cover decoration - border */}
      <rect x="60" y="38" width="80" height="62" rx="2" fill="none" stroke="#a88540" strokeWidth="1" opacity="0.5" />
      <rect x="64" y="42" width="72" height="54" rx="1" fill="none" stroke="#a88540" strokeWidth="0.5" opacity="0.3" />
      {/* Title plate */}
      <rect x="72" y="55" width="56" height="18" rx="2" fill="#8b6b38" opacity="0.4" />
      <line x1="80" y1="63" x2="120" y2="63" stroke="#c49b48" strokeWidth="1" opacity="0.3" />
      <line x1="85" y1="68" x2="115" y2="68" stroke="#c49b48" strokeWidth="0.5" opacity="0.2" />
      {/* Brass clasp on right edge */}
      <rect x="150" y="60" width="8" height="20" rx="2" fill="#a88540" />
      <circle cx="154" cy="70" r="3" fill="#6b5030" />
      <circle cx="154" cy="70" r="1.5" fill="#4a3728" />
      {/* Page edges visible at bottom */}
      <line x1="50" y1="112" x2="152" y2="112" stroke="#f0dfc0" strokeWidth="2" opacity="0.4" />
      <line x1="50" y1="114" x2="152" y2="114" stroke="#f0dfc0" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}

function ImportIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Envelope body */}
      <rect x="40" y="55" width="120" height="70" rx="4" fill="#e4cfa0" stroke="#9a7a4a" strokeWidth="1" />
      {/* Envelope flap (open) */}
      <path d="M40 58 L100 30 L160 58" fill="#f0dfc0" stroke="#9a7a4a" strokeWidth="1" />
      <path d="M40 58 L100 90 L160 58" fill="none" stroke="#9a7a4a" strokeWidth="0.5" opacity="0.3" />
      {/* Document peeking out */}
      <rect x="60" y="15" width="80" height="55" rx="3" fill="#fdf8f0" stroke="#b8965a" strokeWidth="0.5" />
      {/* Text lines on document */}
      <line x1="72" y1="28" x2="128" y2="28" stroke="#9a7a4a" strokeWidth="1" opacity="0.25" strokeDasharray="3 2" />
      <line x1="72" y1="36" x2="120" y2="36" stroke="#9a7a4a" strokeWidth="1" opacity="0.2" strokeDasharray="3 2" />
      <line x1="72" y1="44" x2="125" y2="44" stroke="#9a7a4a" strokeWidth="1" opacity="0.15" strokeDasharray="3 2" />
      <line x1="72" y1="52" x2="110" y2="52" stroke="#9a7a4a" strokeWidth="1" opacity="0.1" strokeDasharray="3 2" />
      {/* Small wax seal on envelope */}
      <circle cx="100" cy="100" r="8" fill="#991b1b" opacity="0.5" />
      <text x="100" y="104" textAnchor="middle" fill="#f0dfc0" fontSize="8" fontFamily="serif" fontWeight="bold" opacity="0.6">Z</text>
    </svg>
  );
}

function GenericIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-40 h-28 opacity-85">
      {/* Quill feather */}
      <path
        d="M150 20 Q130 40 100 80 Q90 95 85 110"
        stroke="#a88540"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Feather barbs (left) */}
      <path d="M150 20 Q140 15 130 25 Q135 30 140 28" fill="#7a5a30" opacity="0.4" />
      <path d="M145 28 Q135 22 125 32 Q130 37 135 35" fill="#7a5a30" opacity="0.35" />
      <path d="M140 36 Q130 30 120 40 Q125 45 130 43" fill="#7a5a30" opacity="0.3" />
      {/* Feather barbs (right) */}
      <path d="M150 20 Q155 28 148 32 Q144 28 146 24" fill="#7a5a30" opacity="0.35" />
      <path d="M146 30 Q152 38 144 42 Q140 38 142 34" fill="#7a5a30" opacity="0.3" />
      {/* Ink trail */}
      <path
        d="M85 110 Q80 115 70 118 Q55 120 40 118"
        stroke="#2c1e0f"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M40 118 Q30 116 25 118"
        stroke="#2c1e0f"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.2"
      />
      {/* Ink splatter dots */}
      <circle cx="82" cy="112" r="2" fill="#2c1e0f" opacity="0.3" />
      <circle cx="75" cy="116" r="1" fill="#2c1e0f" opacity="0.2" />
      <circle cx="60" cy="120" r="1.5" fill="#2c1e0f" opacity="0.15" />
    </svg>
  );
}

const illustrations: Record<EmptyStateVariant, React.FC> = {
  manuscript: ManuscriptIllustration,
  characters: CharactersIllustration,
  timeline: TimelineIllustration,
  conflicts: ConflictsIllustration,
  canon: CanonIllustration,
  loops: LoopsIllustration,
  bible: BibleIllustration,
  import: ImportIllustration,
  generic: GenericIllustration,
};

export function EmptyState({ variant, title, subtitle, action }: EmptyStateProps) {
  const Illustration = illustrations[variant];

  return (
    <motion.div
      {...fadeUp}
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      {/* Idle breathing — the scene is alive, waiting. MotionConfig
          reducedMotion="user" zeroes the transform loop automatically. */}
      <motion.div
        className="mb-6"
        animate={{ scale: [1, 1.02, 1], y: [0, -3, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Illustration />
      </motion.div>
      <h3 className="text-lg font-serif font-semibold text-sepia-700">{title}</h3>
      {subtitle && (
        <p className="text-sm text-sepia-600 mt-2 max-w-sm">{subtitle}</p>
      )}
      {action && (
        <div className="mt-5">
          {'href' in action ? (
            <Link
              href={action.href}
              className="text-sm font-medium text-forest-700 hover:text-forest-600 transition-colors underline underline-offset-4"
            >
              {action.label}
            </Link>
          ) : (
            <InkStampButton size="sm" onClick={action.onClick}>
              {action.label}
            </InkStampButton>
          )}
        </div>
      )}
    </motion.div>
  );
}
