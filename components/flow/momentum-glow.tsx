'use client';

interface MomentumGlowProps {
  momentum: number; // 0 to 1
}

export function MomentumGlow({ momentum }: MomentumGlowProps) {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-300"
      style={{ opacity: momentum * 0.3 }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          // Antiquarian brass/amber glow (was off-brand indigo/purple).
          background: `radial-gradient(ellipse at center, rgba(196, 155, 72, ${momentum * 0.15}) 0%, rgba(150, 100, 50, ${momentum * 0.08}) 40%, transparent 70%)`,
        }}
      />
    </div>
  );
}
