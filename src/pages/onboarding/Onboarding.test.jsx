import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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
    useMap: () => ({ flyTo: vi.fn(), flyToBounds: vi.fn(), fitBounds: vi.fn(), getZoom: () => 15, getPane: () => ({ style: {} }), createPane: () => ({ style: {} }) }),
  };
});

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import { SANTA_CRUZ, SANTA_CRUZ_ADMIN } from '../../test/accounts.js';
import { needsOnboarding } from '../../lib/roles.js';
import App from '../../App.jsx';

const NEW_MENRO = { ...SANTA_CRUZ_ADMIN, full_name: 'Maria Santos', onboarded_at: null, designation: null, address: null, avatar_url: null };

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(cleanup);

describe('who is asked to set up their account', () => {
  it('is a new MENRO / CENRO account only', () => {
    expect(needsOnboarding(NEW_MENRO)).toBe(true);
    expect(needsOnboarding({ ...NEW_MENRO, onboarded_at: '2026-10-19T00:00:00Z' })).toBe(false);
    // Before onboarding.sql has run there is no such column, and nobody is stopped.
    expect(needsOnboarding(SANTA_CRUZ_ADMIN)).toBe(false);
    expect(needsOnboarding({ ...NEW_MENRO, is_training: true })).toBe(false);
    expect(needsOnboarding({ ...NEW_MENRO, role: 'pgenro', lgu_psgc: null })).toBe(false);
  });
});

describe('a new office account’s first sign-in', () => {
  it('asks for name, designation, address and photo before anything opens', async () => {
    supabaseMock.signInAs(NEW_MENRO, SANTA_CRUZ);
    renderAt('/biodiversity-dashboard');
    const form = await screen.findByRole('form', { name: 'Your details' });
    expect(screen.queryByText('Green Tag Tree Inventory System')).not.toBeInTheDocument();
    expect(within(form).getByLabelText('Full name')).toHaveValue('Maria Santos');

    fireEvent.click(within(form).getByRole('button', { name: 'Save and continue' }));
    expect(await within(form).findByText('Your designation is needed.')).toBeInTheDocument();
    expect(within(form).getByText('An address is needed.')).toBeInTheDocument();
    expect(within(form).getByText('A photo is needed.')).toBeInTheDocument();
    expect(supabaseMock.writesTo('profiles', 'update')).toHaveLength(0);

    const photo = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    fireEvent.change(within(form).getByLabelText('Your photo'), { target: { files: [photo] } });
    expect(await within(form).findByRole('img', { name: 'Your photo' })).toBeInTheDocument();
    const [bucket, path] = supabaseMock.supabase.storage.upload.mock.calls[0];
    expect(bucket).toBe('office-logos');
    expect(path).toMatch(new RegExp(`^${SANTA_CRUZ.psgc}/holder-`));

    fireEvent.change(within(form).getByLabelText(/^Designation/), { target: { value: 'MENRO' } });
    fireEvent.change(within(form).getByLabelText(/^Address/), { target: { value: 'Municipal Hall, Santa Cruz' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save and continue' }));

    await waitFor(() => expect(supabaseMock.writesTo('profiles', 'update')).toHaveLength(1));
    expect(supabaseMock.writesTo('profiles', 'update')[0].payload).toEqual({
      full_name: 'Maria Santos',
      designation: 'MENRO',
      address: 'Municipal Hall, Santa Cruz',
      avatar_url: expect.stringContaining('office-logos'),
    });
    expect(await screen.findByRole('button', { name: /Barangays/ })).toBeInTheDocument();
  });

  it('lets the barangay and inventory steps be skipped, then opens the dashboard', async () => {
    const done = { ...NEW_MENRO, designation: 'MENRO', address: 'Municipal Hall', avatar_url: 'https://x/me.jpg' };
    supabaseMock.signInAs(done, SANTA_CRUZ);
    renderAt('/biodiversity-dashboard');
    // Details already saved: straight to the barangays.
    expect(await screen.findByRole('button', { name: /Barangays/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByRole('button', { name: /Download the template/ })).toBeInTheDocument();

    supabaseMock.signInAs({ ...done, onboarded_at: '2026-10-19T00:00:00Z' }, SANTA_CRUZ);
    fireEvent.click(screen.getByRole('button', { name: 'Finish and open the dashboard' }));
    await waitFor(() => expect(supabaseMock.writesTo('profiles', 'update')).toHaveLength(1));
    expect(supabaseMock.writesTo('profiles', 'update')[0].payload).toEqual({ onboarded_at: expect.any(String) });
    expect(await screen.findByText('Green Tag Tree Inventory System')).toBeInTheDocument();
  });

  it('does not stop an account that was already in use', async () => {
    supabaseMock.signInAs({ ...SANTA_CRUZ_ADMIN, onboarded_at: '2026-01-01T00:00:00Z' }, SANTA_CRUZ);
    renderAt('/biodiversity-dashboard');
    expect(await screen.findByText('Green Tag Tree Inventory System')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Your details' })).not.toBeInTheDocument();
  });
});

describe('a resident signed in with Google', () => {
  beforeEach(() => {
    supabaseMock.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'resident-ana', email: 'ana@gmail.com' } } },
      error: null,
    });
    supabaseMock.setResponse('residents:select', {
      data: { id: 'resident-ana', full_name: 'Ana Reyes', show_as: 'name', consented_at: '2026-10-19T00:00:00Z' },
      error: null,
    });
  });

  it('is sent from the offices’ pages to the community', async () => {
    renderAt('/action-board');
    expect(await screen.findByText('You have joined as', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText('This account has no profile')).not.toBeInTheDocument();
  });

  it('is sent from the office sign-in to the community too', async () => {
    renderAt('/login');
    expect(await screen.findByText('You have joined as', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('is shown in the public navbar by an avatar, whose menu goes to the community and logs out', async () => {
    renderAt('/about');
    const [avatar] = await screen.findAllByRole('button', { name: 'Account: Ana Reyes' }, { timeout: 5000 });
    expect(screen.queryByRole('link', { name: 'Log In / Sign Up' })).not.toBeInTheDocument();
    // No photo from Google here: her initials.
    expect(avatar).toHaveTextContent('AR');
    fireEvent.click(avatar);
    const menu = screen.getByRole('menu', { name: 'Account' });
    expect(within(menu).getByText('Resident')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /My community page/ })).toHaveAttribute('href', '/community');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Log out/ }));
    await waitFor(() => expect(supabaseMock.supabase.auth.signOut).toHaveBeenCalled());
  });

  it('shows the photo Google gives the session', async () => {
    supabaseMock.supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'resident-ana', email: 'ana@gmail.com', user_metadata: { avatar_url: 'https://lh3.example/ana.jpg' } } } },
      error: null,
    });
    const { container } = renderAt('/about');
    await screen.findAllByRole('button', { name: 'Account: Ana Reyes' }, { timeout: 5000 });
    expect(container.querySelector('img[src="https://lh3.example/ana.jpg"]')).toBeTruthy();
  });
});

describe('an office account on the public pages', () => {
  it('is shown by its avatar too, with the way back to the dashboard', async () => {
    supabaseMock.signInAs({ ...SANTA_CRUZ_ADMIN, full_name: 'Maria Santos', avatar_url: 'https://example.test/maria.png' }, SANTA_CRUZ);
    const { container } = renderAt('/community');
    const [avatar] = await screen.findAllByRole('button', { name: 'Account: Maria Santos' }, { timeout: 5000 });
    expect(container.querySelector('img[src="https://example.test/maria.png"]')).toBeTruthy();
    fireEvent.click(avatar);
    const menu = screen.getByRole('menu', { name: 'Account' });
    expect(within(menu).getByText('MENRO Santa Cruz')).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /Go to the dashboard/ })).toHaveAttribute('href', '/biodiversity-dashboard');
    expect(within(menu).getByRole('menuitem', { name: /Log out/ })).toBeInTheDocument();
  });
});
