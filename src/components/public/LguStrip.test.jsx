import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import LguStrip from './LguStrip.jsx';

const renderStrip = (props = {}) =>
  render(<LguStrip selected="" onSelect={() => {}} {...props} />);

/** Every seal in the rail, clones included. */
const seals = () => document.querySelectorAll('[role="tablist"] > button');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LguStrip', () => {
  it('lays the list out three times so the rail has no ends', () => {
    renderStrip();

    // 31 choices — the province and its thirty cities and municipalities.
    expect(screen.getAllByRole('tab')).toHaveLength(31);
    expect(seals()).toHaveLength(93);
  });

  it('keeps the copies out of the way of anything but the eye', () => {
    renderStrip();

    const clones = [...seals()].filter((seal) => seal.getAttribute('aria-hidden') === 'true');
    expect(clones).toHaveLength(62);
    // Hidden from screen readers and skipped by the tab key, so a keyboard
    // still meets each place exactly once.
    for (const clone of clones) {
      expect(clone).toHaveAttribute('tabindex', '-1');
      expect(clone).not.toHaveAttribute('role', 'tab');
    }
  });

  it('selects the same place whichever copy was clicked', () => {
    const onSelect = vi.fn();
    renderStrip({ onSelect });

    const copies = [...seals()].filter((seal) => seal.title === 'Santa Cruz');
    expect(copies).toHaveLength(3);
    for (const copy of copies) fireEvent.click(copy);

    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect.mock.calls.every(([name]) => name === 'Santa Cruz')).toBe(true);
  });

  it('drifts while the pointer rests on an arrow, and stops when it leaves', () => {
    const frame = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    renderStrip();

    const right = screen.getByLabelText('Scroll to later cities and municipalities');
    fireEvent.mouseEnter(right);
    expect(frame).toHaveBeenCalled();

    fireEvent.mouseLeave(right);
    expect(cancel).toHaveBeenCalledWith(1);
  });

  it('does not drift for anyone who asked for less motion', () => {
    const previous = globalThis.matchMedia;
    globalThis.matchMedia = (query) => ({
      media: query,
      matches: query.includes('reduced-motion'),
      addEventListener() {},
      removeEventListener() {},
    });
    const frame = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1);

    try {
      renderStrip();
      fireEvent.mouseEnter(screen.getByLabelText('Scroll to later cities and municipalities'));
      expect(frame).not.toHaveBeenCalled();
    } finally {
      globalThis.matchMedia = previous;
    }
  });

  it('marks the selected place for a screen reader, not just with a ring', () => {
    renderStrip({ selected: 'Pila' });

    expect(screen.getByRole('tab', { name: 'Pila' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Santa Cruz' })).toHaveAttribute('aria-selected', 'false');
  });
});
