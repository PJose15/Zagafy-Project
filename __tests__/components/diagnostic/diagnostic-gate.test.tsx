import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

const mockSession = vi.hoisted(() => ({
  session: {
    blockType: null,
    diagnosticCompleted: false,
    diagnosticSkipped: false,
    ritualCompleted: false,
    ritualMode: null,
    sessionStartedAt: '2025-01-01T00:00:00.000Z',
    flowChapterId: null,
  },
  setBlockType: vi.fn(),
  completeDiagnostic: vi.fn(),
  completeRitual: vi.fn(),
  setFlowChapterId: vi.fn(),
  resetSession: vi.fn(),
}));

const mockNav = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('@/lib/session', () => ({
  useSession: () => mockSession,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockNav.pathname,
}));

vi.mock('@/components/diagnostic/diagnostic-overlay', () => ({
  DiagnosticOverlay: () => <div data-testid="diagnostic-overlay">Diagnostic</div>,
}));

vi.mock('@/components/ritual/ritual-overlay', () => ({
  RitualOverlay: () => <div data-testid="ritual-overlay">Ritual</div>,
}));

import { DiagnosticGate } from '@/components/diagnostic/diagnostic-gate';

describe('DiagnosticGate', () => {
  beforeEach(() => {
    cleanup();
    mockNav.pathname = '/';
    mockSession.session = {
      blockType: null,
      diagnosticCompleted: false,
      diagnosticSkipped: false,
      ritualCompleted: false,
      ritualMode: null,
      sessionStartedAt: '2025-01-01T00:00:00.000Z',
      flowChapterId: null,
    };
  });

  it('does NOT gate setup/library routes — children render even before the ritual', () => {
    for (const path of ['/genesis', '/projects', '/import', '/settings', '/projects/abc']) {
      cleanup();
      mockNav.pathname = path;
      render(
        <DiagnosticGate>
          <div data-testid="children">Main content</div>
        </DiagnosticGate>
      );
      expect(screen.queryByTestId('diagnostic-overlay')).toBeNull();
      expect(screen.queryByTestId('ritual-overlay')).toBeNull();
      expect(screen.getByTestId('children')).toBeDefined();
    }
  });

  it('shows DiagnosticOverlay when diagnostic not completed', () => {
    render(
      <DiagnosticGate>
        <div data-testid="children">Main content</div>
      </DiagnosticGate>
    );

    expect(screen.getByTestId('diagnostic-overlay')).toBeDefined();
    expect(screen.queryByTestId('ritual-overlay')).toBeNull();
    expect(screen.queryByTestId('children')).toBeNull();
  });

  it('shows RitualOverlay after diagnostic completed but ritual not completed', () => {
    mockSession.session.diagnosticCompleted = true;

    render(
      <DiagnosticGate>
        <div data-testid="children">Main content</div>
      </DiagnosticGate>
    );

    expect(screen.queryByTestId('diagnostic-overlay')).toBeNull();
    expect(screen.getByTestId('ritual-overlay')).toBeDefined();
    expect(screen.queryByTestId('children')).toBeNull();
  });

  it('shows children when both diagnostic and ritual are completed', () => {
    mockSession.session.diagnosticCompleted = true;
    mockSession.session.ritualCompleted = true;

    render(
      <DiagnosticGate>
        <div data-testid="children">Main content</div>
      </DiagnosticGate>
    );

    expect(screen.queryByTestId('diagnostic-overlay')).toBeNull();
    expect(screen.queryByTestId('ritual-overlay')).toBeNull();
    expect(screen.getByTestId('children')).toBeDefined();
    expect(screen.getByTestId('children').textContent).toBe('Main content');
  });

  it('shows children when diagnostic was skipped and ritual completed', () => {
    mockSession.session.diagnosticCompleted = true;
    mockSession.session.diagnosticSkipped = true;
    mockSession.session.ritualCompleted = true;

    render(
      <DiagnosticGate>
        <div data-testid="children">Main content</div>
      </DiagnosticGate>
    );

    expect(screen.getByTestId('children')).toBeDefined();
  });

  it('renders multiple children after both steps complete', () => {
    mockSession.session.diagnosticCompleted = true;
    mockSession.session.ritualCompleted = true;

    render(
      <DiagnosticGate>
        <div data-testid="first">First</div>
        <div data-testid="second">Second</div>
      </DiagnosticGate>
    );

    expect(screen.getByTestId('first')).toBeDefined();
    expect(screen.getByTestId('second')).toBeDefined();
  });
});
