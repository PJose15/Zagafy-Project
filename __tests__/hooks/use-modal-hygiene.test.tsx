import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModalHygiene } from '@/hooks/use-modal-hygiene';

function makeContainer(withButton = true): HTMLDivElement {
  const el = document.createElement('div');
  if (withButton) {
    const btn = document.createElement('button');
    btn.textContent = 'inside';
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  return el;
}

function pressEscape() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('useModalHygiene (stack behavior)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('locks body scroll while active and restores the previous value on unmount', () => {
    document.body.style.overflow = 'auto';
    const el = makeContainer();
    const ref = { current: el };
    const { unmount } = renderHook(() => useModalHygiene(ref, vi.fn(), true));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('does nothing while inactive', () => {
    const el = makeContainer();
    const ref = { current: el };
    const onClose = vi.fn();
    renderHook(() => useModalHygiene(ref, onClose, false));
    expect(document.body.style.overflow).not.toBe('hidden');
    act(() => pressEscape());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const el = makeContainer();
    const ref = { current: el };
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useModalHygiene(ref, onClose, true));
    act(() => pressEscape());
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('one Escape closes only the TOP overlay of a stack', () => {
    const bottomClose = vi.fn();
    const topClose = vi.fn();
    const bottomRef = { current: makeContainer() };
    const topRef = { current: makeContainer() };

    const bottom = renderHook(() => useModalHygiene(bottomRef, bottomClose, true));
    const top = renderHook(() => useModalHygiene(topRef, topClose, true));

    act(() => pressEscape());
    expect(topClose).toHaveBeenCalledTimes(1);
    expect(bottomClose).not.toHaveBeenCalled();

    // After the top layer unmounts, Escape reaches the next layer down.
    top.unmount();
    act(() => pressEscape());
    expect(bottomClose).toHaveBeenCalledTimes(1);
    bottom.unmount();
  });

  it('restores body overflow only when the whole stack empties, regardless of unmount order', () => {
    document.body.style.overflow = 'scroll';
    const aRef = { current: makeContainer() };
    const bRef = { current: makeContainer() };

    const a = renderHook(() => useModalHygiene(aRef, vi.fn(), true));
    const b = renderHook(() => useModalHygiene(bRef, vi.fn(), true));
    expect(document.body.style.overflow).toBe('hidden');

    // Unmount the FIRST-registered overlay first (out of order).
    a.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    b.unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('restores focus to the opener when the overlay deactivates', () => {
    vi.useFakeTimers();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const ref = { current: makeContainer() };
    const { unmount } = renderHook(() => useModalHygiene(ref, vi.fn(), true));
    // Simulate focus moving into the modal.
    ref.current.querySelector('button')?.focus();
    expect(document.activeElement).not.toBe(opener);

    unmount();
    act(() => {
      vi.runAllTimers();
    });
    expect(document.activeElement).toBe(opener);
    vi.useRealTimers();
  });

  it('does not steal focus back to an opener that left the DOM', () => {
    vi.useFakeTimers();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const ref = { current: makeContainer() };
    const { unmount } = renderHook(() => useModalHygiene(ref, vi.fn(), true));
    opener.remove();

    unmount();
    act(() => {
      vi.runAllTimers();
    });
    expect(document.activeElement).not.toBe(opener);
    vi.useRealTimers();
  });

  it('a changing onClose identity does not hoist the entry above a later overlay', () => {
    const bottomCloseA = vi.fn();
    const bottomCloseB = vi.fn();
    const topClose = vi.fn();
    const bottomRef = { current: makeContainer() };
    const topRef = { current: makeContainer() };

    const bottom = renderHook(
      ({ onClose }) => useModalHygiene(bottomRef, onClose, true),
      { initialProps: { onClose: bottomCloseA } },
    );
    const top = renderHook(() => useModalHygiene(topRef, topClose, true));

    // Re-render the bottom overlay with a new callback (common when parents
    // recreate closures). It must stay BELOW the top overlay…
    bottom.rerender({ onClose: bottomCloseB });
    act(() => pressEscape());
    expect(topClose).toHaveBeenCalledTimes(1);
    expect(bottomCloseA).not.toHaveBeenCalled();
    expect(bottomCloseB).not.toHaveBeenCalled();

    // …and when it becomes the top, Escape uses the LATEST callback.
    top.unmount();
    act(() => pressEscape());
    expect(bottomCloseB).toHaveBeenCalledTimes(1);
    expect(bottomCloseA).not.toHaveBeenCalled();
    bottom.unmount();
  });

  it('traps Tab inside the top overlay only', () => {
    const bottomRef = { current: makeContainer() };
    const topEl = makeContainer(false);
    const first = document.createElement('button');
    const last = document.createElement('button');
    topEl.appendChild(first);
    topEl.appendChild(last);

    const bottom = renderHook(() => useModalHygiene(bottomRef, vi.fn(), true));
    const topRef = { current: topEl };
    const top = renderHook(() => useModalHygiene(topRef, vi.fn(), true));

    // Focus outside the top overlay: Tab is redirected to its first focusable.
    document.body.focus();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(first);

    // From the last focusable, Tab wraps to the first.
    last.focus();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first wraps to the last.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(last);

    top.unmount();
    bottom.unmount();
  });
});
