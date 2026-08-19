'use client';

import { useModalA11y } from '@/hooks/use-modal-a11y';

interface SceneChangeRecoveryModalProps {
  originalChapterTitle: string;
  onReturn: () => void;
  onStayHere: () => void;
}

export function SceneChangeRecoveryModal({
  originalChapterTitle,
  onReturn,
  onStayHere,
}: SceneChangeRecoveryModalProps) {
  // Escape resolves to "stay here" — the non-navigating default.
  const dialogRef = useModalA11y<HTMLDivElement>(true, onStayHere);
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
      aria-describedby="recovery-message"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div ref={dialogRef} className="relative bg-parchment-100 border border-sepia-300/40 rounded-xl shadow-2xl max-w-md w-full p-6 texture-parchment">
        <div className="space-y-4">
          <div className="text-center">
            <span className="text-3xl" aria-hidden="true">&#x1F500;</span>
          </div>
          <h3 id="recovery-title" className="text-lg font-serif font-semibold text-sepia-900 text-center">
            Scene Change Expired
          </h3>
          <p id="recovery-message" className="text-sm text-sepia-600 text-center leading-relaxed">
            Your scene change timer ran out while you were away. Return to <strong className="text-sepia-700">{originalChapterTitle}</strong>?
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={onStayHere}
              className="px-4 py-2 rounded-lg text-sm font-medium text-sepia-700 hover:bg-parchment-200 transition-colors"
            >
              Stay here
            </button>
            <button
              onClick={onReturn}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-forest-700 text-cream-50 hover:bg-forest-600 transition-colors"
            >
              Return to original
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
