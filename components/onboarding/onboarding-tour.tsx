'use client';

import { useState, useEffect, useCallback } from 'react';
import { TourProvider, useTour, type StylesObj } from '@reactour/tour';

const TOUR_STORAGE_KEY = 'zagafy_tour_completed';

const tourSteps = [
  {
    selector: '[href="/manuscript"]',
    content: 'Your manuscript lives here. Write, organize chapters, and build your story scene by scene.',
  },
  {
    selector: '[href="/flow"]',
    content: 'Flow mode for deep writing. A distraction-free environment that tracks your writing streaks.',
  },
  {
    selector: '[href="/assistant"]',
    content: 'AI copilot for stuck moments. Get suggestions, brainstorm ideas, and overcome writer\'s block.',
  },
  {
    selector: '[href="/story-brain"]',
    content: 'Story Brain catches inconsistencies. It watches your canon, timeline, and characters for conflicts.',
  },
  {
    selector: '[href="/settings"]',
    content: 'Settings, sync, and export. Manage your project, language preferences, and data backups.',
  },
];

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
    width: '12px',
    height: '12px',
  }),
  dot: (base: Record<string, unknown>, state: { current?: boolean }) => ({
    ...base,
    backgroundColor: state?.current ? '#c49b48' : '#e4cfa0',
    borderColor: '#c49b48',
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
  const { showTour, completeTour } = useTourState();

  useEffect(() => {
    if (showTour) {
      // Small delay to let the page render and selectors become available
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [showTour, setIsOpen]);

  // Listen for tour close to mark as completed
  useEffect(() => {
    const checkClosed = () => {
      // This effect is just for cleanup on unmount
    };
    checkClosed();
  }, [completeTour]);

  return null;
}

export function OnboardingTour({ children }: { children?: React.ReactNode }) {
  const { completeTour } = useTourState();

  return (
    <TourProvider
      steps={tourSteps}
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
