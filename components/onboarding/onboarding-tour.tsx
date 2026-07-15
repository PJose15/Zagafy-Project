'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { TourProvider, useTour, type StylesObj } from '@reactour/tour';

const TOUR_STORAGE_KEY = 'zagafy_tour_completed';

// Selector + translation key per step. Content is resolved from the `tour`
// message namespace so the tour is localized (previously hardcoded English).
const TOUR_STEP_DEFS = [
  { selector: '[href="/manuscript"]', key: 'manuscript' },
  { selector: '[href="/flow"]', key: 'flow' },
  { selector: '[href="/assistant"]', key: 'assistant' },
  { selector: '[href="/story-brain"]', key: 'storyBrain' },
  { selector: '[href="/settings"]', key: 'settings' },
] as const;

const tourStyles = {
  popover: (base: Record<string, unknown>) => ({
    ...base,
    backgroundColor: '#f8edd8',
    color: '#2c1e0f',
    borderRadius: '12px',
    border: '1px solid rgba(90, 61, 30, 0.3)',
    boxShadow: '0 10px 25px rgba(44, 30, 15, 0.20), 0 4px 10px rgba(44, 30, 15, 0.12)',
    fontFamily: 'serif',
    padding: '20px',
  }),
  maskArea: (base: Record<string, unknown>) => ({
    ...base,
    rx: 8,
  }),
  badge: (base: Record<string, unknown>) => ({
    ...base,
    backgroundColor: '#c49b48',
    color: '#fdf5e6',
    fontFamily: 'serif',
    fontWeight: '600',
  }),
  controls: (base: Record<string, unknown>) => ({
    ...base,
    marginTop: '16px',
  }),
  close: (base: Record<string, unknown>) => ({
    ...base,
    color: '#7a5a30',
    // WCAG 2.2 (2.5.8) target size: keep the glyph small but give it a
    // 24x24 clickable box via padding + box-sizing.
    width: '24px',
    height: '24px',
    padding: '6px',
    boxSizing: 'border-box',
    top: '10px',
    right: '10px',
  }),
  dot: (base: Record<string, unknown>, state: { current?: boolean }) => ({
    ...base,
    backgroundColor: state?.current ? '#c49b48' : '#e4cfa0',
    // Full shorthand (not borderColor): reactour's base style sets `border`,
    // and React warns when shorthand + longhand target the same property.
    border: '1px solid #c49b48',
    // WCAG 2.2 (2.5.8): 12px dots with 6px side margin put target centers
    // ~24px apart, satisfying the undersized-target spacing exception.
    width: '12px',
    height: '12px',
    margin: '0 6px',
  }),
  arrow: (base: Record<string, unknown>) => ({
    ...base,
    color: '#f8edd8',
  }),
};

export function useTourState() {
  const [hasCompletedTour, setHasCompletedTour] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    } catch {
      return true;
    }
  });

  const completeTour = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // best effort
    }
    setHasCompletedTour(true);
  }, []);

  const startTour = useCallback(() => {
    try {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    } catch {
      // best effort
    }
    setHasCompletedTour(false);
  }, []);

  return {
    showTour: !hasCompletedTour,
    startTour,
    completeTour,
    hasCompletedTour,
  };
}

function TourAutoStart() {
  const { setIsOpen } = useTour();
  const { showTour } = useTourState();

  useEffect(() => {
    if (showTour) {
      // Small delay to let the page render and selectors become available
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [showTour, setIsOpen]);

  return null;
}

export function OnboardingTour({ children }: { children?: React.ReactNode }) {
  const { completeTour } = useTourState();
  const t = useTranslations('tour');
  const steps = TOUR_STEP_DEFS.map(({ selector, key }) => ({ selector, content: t(key) }));

  return (
    <TourProvider
      steps={steps}
      styles={tourStyles as StylesObj}
      onClickClose={({ setIsOpen }) => {
        setIsOpen(false);
        completeTour();
      }}
      onClickMask={({ setIsOpen }) => {
        setIsOpen(false);
        completeTour();
      }}
      afterOpen={() => {
        // Tour opened
      }}
      beforeClose={() => {
        completeTour();
      }}
      padding={{ mask: 8, popover: [16, 12] }}
      showBadge={true}
      showDots={true}
      showCloseButton={true}
      scrollSmooth
    >
      <TourAutoStart />
      {children}
    </TourProvider>
  );
}
