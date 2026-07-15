/**
 * Engraved SVG flourishes — the ornament vocabulary that replaces icon soup.
 * Hairline strokes in brass/sepia, drawn to feel plate-engraved rather than
 * drawn-with-a-marker. All ornaments are decorative (aria-hidden).
 */

/** Symmetric centerpiece: mirrored vine curls flanking a cut diamond. */
export function EngravedFlourish({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 140 18"
      className={`h-4 ${className}`}
      fill="none"
      aria-hidden="true"
    >
      {/* Left vine curling outward */}
      <path
        d="M58 9 C48 9 44 3.5 36 3.5 C28 3.5 26 9 18 9 C13 9 10 6.5 10 4.5"
        stroke="#9a7a4a"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path d="M36 3.5 C33 6 33 8 35 10.5" stroke="#9a7a4a" strokeWidth="0.8" strokeLinecap="round" />
      <circle cx="10" cy="4.5" r="1.2" fill="#a88540" opacity="0.7" />
      {/* Right vine (mirror) */}
      <path
        d="M82 9 C92 9 96 3.5 104 3.5 C112 3.5 114 9 122 9 C127 9 130 6.5 130 4.5"
        stroke="#9a7a4a"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path d="M104 3.5 C107 6 107 8 105 10.5" stroke="#9a7a4a" strokeWidth="0.8" strokeLinecap="round" />
      <circle cx="130" cy="4.5" r="1.2" fill="#a88540" opacity="0.7" />
      {/* Cut diamond centerpiece */}
      <rect x="70" y="3" width="8.5" height="8.5" rx="1" transform="rotate(45 70 3)" fill="#a88540" opacity="0.55" />
      <rect x="70" y="5.8" width="4.5" height="4.5" rx="0.5" transform="rotate(45 70 5.8)" fill="#f0dfc0" opacity="0.5" />
    </svg>
  );
}

/** Small leafy sprig — terminal ornament for rules and headers. */
export function EngravedSprig({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 26 14"
      className={`h-3 w-6 ${className}`}
      fill="none"
      aria-hidden="true"
    >
      {/* Stem */}
      <path d="M1 7 C8 7 14 7 22 7" stroke="#9a7a4a" strokeWidth="1" strokeLinecap="round" />
      {/* Upper leaf */}
      <path d="M10 7 C11 3.5 14 2.5 17 3 C15.5 6 13 7 10 7 Z" fill="#a88540" opacity="0.45" />
      {/* Lower leaf */}
      <path d="M14 7 C15 10 18 11 21 10.5 C19.5 8 17 7 14 7 Z" fill="#a88540" opacity="0.35" />
      {/* Bud */}
      <circle cx="23.5" cy="7" r="1.5" fill="#a88540" opacity="0.7" />
    </svg>
  );
}
