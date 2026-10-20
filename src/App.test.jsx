import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// The map pages are not what these tests are about, so react-leaflet is inert.
// -----------------------------------------------------------------------------
vi.mock('react-leaflet', () => {
  const passthrough = ({ children }) => <div>{children}</div>;
  return {
    MapContainer: passthrough,
    TileLayer: () => null,
    Marker: passthrough,
    CircleMarker: passthrough,
    Circle: () => null,
    Polygon: () => null,
    Polyline: () => null,
    GeoJSON: () => null,
    Popup: passthrough,
    useMapEvents: () => ({}),
    useMap: () => ({
      flyTo: vi.fn(),
      flyToBounds: vi.fn(),
      fitBounds: vi.fn(),
      getZoom: () => 15,
      getPane: () => ({ style: {} }),
      createPane: () => ({ style: {} }),
    }),
  };
});

vi.mock('./supabaseClient.js', async () => {
  const { supabaseMock } = await import('./test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from './test/supabaseMock.js';
import { PGENRO_ADMIN, SANTA_CRUZ, SANTA_CRUZ_ADMIN } from './test/accounts.js';
import App from './App.jsx';

/**
 * Sign in as the Santa Cruz MENRO before rendering.
 *
 * With a profile, as a real sign-in has: a session alone is no longer enough
 * to reach the dashboard, because the website now asks who the account
 * belongs to before letting it in.
 */
function signedIn(profile = SANTA_CRUZ_ADMIN, lgu = SANTA_CRUZ) {
  supabaseMock.signInAs(profile, lgu);
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

/** The admin header, which is also the app's navigation. */
const adminHeader = () => screen.queryByText('Green Tag Tree Inventory System');

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
});

afterEach(cleanup);

describe('App shell and routing', () => {
  it('waits for the session before deciding what to show', async () => {
    // A route that resolved before the session was known would flash the login
    // page at a signed-in admin.
    supabaseMock.supabase.auth.getSession.mockReturnValue(new Promise(() => {}));

    renderAt('/map');

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(adminHeader()).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor from a protected route to the login page', async () => {
    renderAt('/map');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tree Inventory & Carbon Dashboard' })
    ).toBeInTheDocument();
    expect(adminHeader()).not.toBeInTheDocument();
  });

  it('opens the public About page at the root, with no admin chrome', async () => {
    renderAt('/');

    // The public shell links to About from the navbar, the mobile menu and the
    // footer, so there is more than one.
    expect((await screen.findAllByRole('link', { name: 'About Us' })).length).toBeGreaterThan(0);
    expect(adminHeader()).not.toBeInTheDocument();
  });

  it('starts each page at the top', async () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    renderAt('/about');
    await screen.findAllByRole('link', { name: 'About Us' });

    // Following a link from the foot of a long page used to land on the foot
    // of the next one, with the charts above the fold.
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 })));
    vi.unstubAllGlobals();
  });

  it('drops the footer on the map page, and keeps it everywhere else', async () => {
    const { unmount } = renderAt('/about');
    expect(await screen.findByRole('contentinfo')).toBeInTheDocument();

    unmount();
    renderAt('/public-map');

    // The map fills the screen; a footer under it only competes with it.
    await waitFor(() => expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument());
    expect(screen.getAllByRole('link', { name: 'Map' }).length).toBeGreaterThan(0);
  });

  it('lets a signed-in admin reach the map under the header', async () => {
    signedIn();
    renderAt('/map');

    // The first test to open the map pays for loading it — the boundary
    // files are large — so it is given longer than the default second.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Map' }, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(adminHeader()).toBeInTheDocument();
  });

  it('gives the map route the full pane, and every other route its padding', async () => {
    signedIn();
    const { container, unmount } = renderAt('/map');

    await screen.findByRole('heading', { level: 1, name: 'Map' });
    const mapMain = container.querySelector('main');
    // The map is sized to the space it is given, so it must not scroll.
    expect(mapMain.className).toContain('overflow-hidden');
    expect(mapMain.className).not.toContain('p-6');

    unmount();
    signedIn();
    const { container: second } = renderAt('/arborists');

    await screen.findByRole('heading', { level: 1, name: 'Arborists' });
    expect(second.querySelector('main').className).toContain('p-6');
  });

  it('puts <main> after the header, inside the same shell', async () => {
    signedIn();
    const { container } = renderAt('/map');

    await screen.findByRole('heading', { level: 1, name: 'Map' });
    const header = container.querySelector('header');
    const main = container.querySelector('main');
    expect(header.parentElement).toBe(main.parentElement);
    const children = Array.from(main.parentElement.children);
    expect(children.indexOf(header)).toBeLessThan(children.indexOf(main));
  });

  it('shows Page Not Found for an unknown route, keeping the admin signed in', async () => {
    signedIn();
    renderAt('/does-not-exist');

    expect(await screen.findByRole('heading', { level: 1, name: 'Page Not Found' })).toBeInTheDocument();
    expect(adminHeader()).toBeInTheDocument();
  });

  it('keeps the header mounted when navigating between routes', async () => {
    signedIn();
    renderAt('/map');

    await screen.findByRole('heading', { level: 1, name: 'Map' });
    const headerBefore = adminHeader().closest('header');

    // Field officers live behind the office's seal now, with the other
    // pages an office visits rather than lives in.
    fireEvent.click(within(headerBefore).getByRole('button', { name: /account menu/ }));
    fireEvent.click(within(headerBefore).getByRole('link', { name: /Field officers/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Arborists' })).toBeInTheDocument();
    // The same DOM node: a navigation, not a reload.
    expect(adminHeader().closest('header')).toBe(headerBefore);
  });

  it('stops listening for auth changes when it unmounts', async () => {
    const unsubscribe = vi.fn();
    supabaseMock.supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe } },
    });
    signedIn();
    const { unmount } = renderAt('/map');

    await screen.findByRole('heading', { level: 1, name: 'Map' });
    unmount();

    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  });
});

describe('who the signed-in side is for', () => {
  // Signed in is not enough any more. Each kind of account the website turns
  // away is told why, instead of getting a dashboard the database would then
  // refuse to fill.

  it('sends a field officer to the mobile app', async () => {
    signedIn({ ...SANTA_CRUZ_ADMIN, role: 'field_officer' });
    renderAt('/map');
    expect(await screen.findByRole('heading', { name: 'Field officers use the mobile app' })).toBeInTheDocument();
    expect(adminHeader()).not.toBeInTheDocument();
  });

  it('tells a field officer still waiting that they are waiting', async () => {
    signedIn({ ...SANTA_CRUZ_ADMIN, role: 'field_officer', is_approved: false });
    renderAt('/map');
    expect(await screen.findByRole('heading', { name: 'Waiting for approval' })).toBeInTheDocument();
  });

  it('keeps a locked account out, whatever its role', async () => {
    signedIn({ ...SANTA_CRUZ_ADMIN, status: 'locked' });
    renderAt('/map');
    expect(await screen.findByRole('heading', { name: 'This account is locked' })).toBeInTheDocument();
    expect(adminHeader()).not.toBeInTheDocument();
  });

  it('lets a turned-away account sign out', async () => {
    signedIn({ ...SANTA_CRUZ_ADMIN, status: 'archived' });
    renderAt('/map');
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(supabaseMock.supabase.auth.signOut).toHaveBeenCalled());
  });

  it('keeps the Accounts page to PGENRO', async () => {
    signedIn();
    renderAt('/accounts');
    // The same answer as a page that does not exist: an LGU admin has no
    // reason to learn that it does.
    expect(await screen.findByRole('heading', { name: 'Page Not Found' })).toBeInTheDocument();
  });

  it('opens the Accounts page for PGENRO', async () => {
    signedIn(PGENRO_ADMIN, null);
    supabaseMock.setResponse('lgus:select', { data: [SANTA_CRUZ], error: null });
    renderAt('/accounts');
    expect(await screen.findByRole('heading', { level: 1, name: /Accounts/ })).toBeInTheDocument();
  });

  it('sends the old sign-up address to account activation', async () => {
    renderAt('/signup');
    expect(await screen.findByRole('heading', { name: 'Activate your LGU account' })).toBeInTheDocument();
  });
});

describe('the login page', () => {
  it('has a way back to the public site', async () => {
    renderAt('/login');
    expect(await screen.findByRole('link', { name: /Back to the public map/ })).toHaveAttribute('href', '/public-map');
    expect(screen.getByRole('link', { name: 'About Green Tag' })).toHaveAttribute('href', '/about');
  });
});
