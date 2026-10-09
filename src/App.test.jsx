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
    GeoJSON: () => null,
    Popup: passthrough,
    useMap: () => ({
      flyTo: vi.fn(),
      flyToBounds: vi.fn(),
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
import App from './App.jsx';

const SESSION = { user: { id: 'menro-admin', email: 'menro@example.gov.ph' } };

/** Sign in, or stay signed out, before rendering. */
function signedIn(session = SESSION) {
  supabaseMock.supabase.auth.getSession.mockResolvedValue({ data: { session }, error: null });
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

/** The admin header, which is also the app's navigation. */
const adminHeader = () => screen.queryByText('Tree Inventory System of MENRO Santa Cruz');

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

  it('lets a signed-in admin reach the Command Center under the header', async () => {
    signedIn();
    renderAt('/map');

    expect(await screen.findByRole('heading', { level: 1, name: 'Command Center' })).toBeInTheDocument();
    expect(adminHeader()).toBeInTheDocument();
  });

  it('gives the map route the full pane, and every other route its padding', async () => {
    signedIn();
    const { container, unmount } = renderAt('/map');

    await screen.findByRole('heading', { level: 1, name: 'Command Center' });
    const mapMain = container.querySelector('main');
    expect(mapMain.className).toContain('overflow-auto');
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

    await screen.findByRole('heading', { level: 1, name: 'Command Center' });
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

    await screen.findByRole('heading', { level: 1, name: 'Command Center' });
    const headerBefore = adminHeader().closest('header');

    fireEvent.click(within(headerBefore).getByRole('link', { name: 'Arborist' }));

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

    await screen.findByRole('heading', { level: 1, name: 'Command Center' });
    unmount();

    await waitFor(() => expect(unsubscribe).toHaveBeenCalled());
  });
});
