import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { account } = vi.hoisted(() => ({ account: { profile: null } }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuthIfAny: () => account }));

import DesktopNotice, { ComputerOnly } from './DesktopNotice.jsx';

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

describe('ComputerOnly', () => {
  const show = (role) => {
    account.profile = { role };
    return render(
      <MemoryRouter>
        <ComputerOnly what="The office map"><p>The map itself</p></ComputerOnly>
      </MemoryRouter>
    );
  };

  it('sends a city or municipal office on a phone to a computer, and the field to the app', () => {
    screenWidth(390);
    show('lgu_admin');
    expect(screen.queryByText('The map itself')).toBeNull();
    expect(screen.getByRole('heading', { name: 'The office map needs a computer' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Green Tag mobile app');
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute('href', '/biodiversity-dashboard');
  });

  it('opens on a tablet or a computer, and for PGENRO on a phone', () => {
    screenWidth(800);
    const { unmount } = show('lgu_admin');
    expect(screen.getByText('The map itself')).toBeInTheDocument();
    unmount();
    screenWidth(390);
    show('pgenro');
    expect(screen.getByText('The map itself')).toBeInTheDocument();
  });
});
