import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

describe('useUnsavedChanges', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    // No `globals: true` in vitest config, so testing-library's auto-cleanup
    // never runs — unmount explicitly or listeners leak across tests.
    cleanup();
    vi.restoreAllMocks();
  });

  it('adds beforeunload listener when true', () => {
    renderHook(() => useUnsavedChanges(true));
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('does not add beforeunload listener when false', () => {
    addSpy.mockClear();
    renderHook(() => useUnsavedChanges(false));
    const beforeunloadCalls = addSpy.mock.calls.filter(
      (call: unknown[]) => call[0] === 'beforeunload'
    );
    expect(beforeunloadCalls).toHaveLength(0);
  });

  it('removes listener on unmount', () => {
    const { unmount } = renderHook(() => useUnsavedChanges(true));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  it('removes listener when switching from true to false', () => {
    const { rerender } = renderHook(
      ({ hasChanges }) => useUnsavedChanges(hasChanges),
      { initialProps: { hasChanges: true } }
    );

    removeSpy.mockClear();
    rerender({ hasChanges: false });

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
  });

  describe('internal link click interception', () => {
    // happy-dom does not implement window.confirm — stub it globally.
    let confirmSpy: ReturnType<typeof vi.fn<(message?: string) => boolean>>;
    let anchor: HTMLAnchorElement;

    const makeAnchor = (href: string): HTMLAnchorElement => {
      const a = document.createElement('a');
      a.setAttribute('href', href);
      document.body.appendChild(a);
      return a;
    };

    // A target-phase guard records whether the hook prevented the click, then
    // preventDefaults itself so happy-dom never actually navigates (which
    // would corrupt window.location for later tests). If the hook cancelled
    // the click it also stopped propagation, so the guard never runs and the
    // event carries the hook's own preventDefault.
    const fireClick = (el: Element, init: MouseEventInit = {}): { prevented: boolean } => {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...init,
      });
      let preventedBeforeGuard: boolean | null = null;
      const guard = (e: Event) => {
        preventedBeforeGuard = e.defaultPrevented;
        e.preventDefault();
      };
      el.addEventListener('click', guard);
      try {
        el.dispatchEvent(event);
      } finally {
        el.removeEventListener('click', guard);
      }
      return { prevented: preventedBeforeGuard ?? event.defaultPrevented };
    };

    beforeEach(() => {
      confirmSpy = vi.fn<(message?: string) => boolean>();
      vi.stubGlobal('confirm', confirmSpy);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      anchor?.remove();
    });

    it('blocks navigation to another internal route when the user cancels', () => {
      confirmSpy.mockReturnValue(false);
      renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor('/other-page');

      const { prevented } = fireClick(anchor);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(prevented).toBe(true);
    });

    it('allows navigation when the user confirms', () => {
      confirmSpy.mockReturnValue(true);
      renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor('/other-page');

      const { prevented } = fireClick(anchor);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(prevented).toBe(false);
    });

    it('intercepts clicks on elements nested inside the anchor', () => {
      confirmSpy.mockReturnValue(false);
      renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor('/other-page');
      const child = document.createElement('span');
      anchor.appendChild(child);

      const { prevented } = fireClick(child);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(prevented).toBe(true);
    });

    it('does not intercept when there are no unsaved changes', () => {
      confirmSpy.mockReturnValue(false);
      renderHook(() => useUnsavedChanges(false));
      anchor = makeAnchor('/other-page');

      const { prevented } = fireClick(anchor);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });

    it.each([
      ['ctrl', { ctrlKey: true }],
      ['meta', { metaKey: true }],
      ['shift', { shiftKey: true }],
      ['alt', { altKey: true }],
      ['middle button', { button: 1 }],
    ] as const)('does not intercept %s clicks', (_label, init) => {
      confirmSpy.mockReturnValue(false);
      renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor('/other-page');

      const { prevented } = fireClick(anchor, init as MouseEventInit);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });

    it('does not intercept target="_blank" anchors', () => {
      confirmSpy.mockReturnValue(false);
      renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor('/other-page');
      anchor.target = '_blank';

      fireClick(anchor);

      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('does not intercept download anchors', () => {
      confirmSpy.mockReturnValue(false);
      renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor('/export.json');
      anchor.setAttribute('download', '');

      fireClick(anchor);

      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('does not intercept external links', () => {
      confirmSpy.mockReturnValue(false);
      renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor('https://example.com/somewhere');

      const { prevented } = fireClick(anchor);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });

    it('does not intercept links to the current pathname', () => {
      confirmSpy.mockReturnValue(false);
      renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor(window.location.pathname);

      const { prevented } = fireClick(anchor);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });

    it('stops intercepting after unmount', () => {
      confirmSpy.mockReturnValue(false);
      const { unmount } = renderHook(() => useUnsavedChanges(true));
      anchor = makeAnchor('/other-page');
      unmount();

      const { prevented } = fireClick(anchor);

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(prevented).toBe(false);
    });
  });
});
