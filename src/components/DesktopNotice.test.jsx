import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import DesktopNotice from './DesktopNotice.jsx';

/** Pretend to be a screen this many pixels wide. */
function screenWidth(px) {
  globalThis.matchMedia = (query) => {
    const max = Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity);
    return { media: query, matches: px <= max, addEventListener: () => {}, removeEventListener: () => {} };
  };
}

let realMatchMedia;
beforeEach(() => {
  realMatchMedia = globalThis.matchMedia;
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  globalThis.matchMedia = realMatchMedia;
});

describe('DesktopNotice', () => {
  it('says nothing on a desktop', () => {
    screenWidth(1440);
    render(<DesktopNotice />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('tells a tablet most tools work, but not all', () => {
    screenWidth(800);
    render(<DesktopNotice />);
    expect(screen.getByRole('note')).toHaveTextContent('On a tablet most tools work, but not all');
  });

  it('tells a phone plainly that this is not the tool, and which one is', () => {
    screenWidth(390);
    render(<DesktopNotice />);
    expect(screen.getByRole('note')).toHaveTextContent('do not work properly on a phone');
    expect(screen.getByRole('note')).toHaveTextContent('Green Tag mobile app');
  });

  it('stays dismissed for the session', () => {
    screenWidth(800);
    const { unmount } = render(<DesktopNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();

    unmount();
    render(<DesktopNotice />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
