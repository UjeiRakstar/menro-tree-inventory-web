import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import { CALAMBA, PGENRO_ADMIN, SANTA_CRUZ, SANTA_CRUZ_ADMIN } from '../test/accounts.js';
import { AuthProvider } from '../context/AuthContext.jsx';
import Header from './Header.jsx';

/** The four daily places, in the order of the mockup. */
const NAV = [
  ['BioDashboard', '/biodiversity-dashboard'],
  ['Action Board', '/action-board'],
  ['Map', '/map'],
  ['Trees', '/inventory'],
];

function renderHeader() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Header />
      </AuthProvider>
    </MemoryRouter>
  );
}

const mainNav = () => screen.getByRole('navigation', { name: 'Main' });
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /account menu/ }));

/** A hazard nobody has been sent to, in the given barangay. */
const hazard = (id, barangayPsgc) => ({ id, is_leaning: true, assigned_to: null, barangay_psgc: barangayPsgc });

beforeEach(() => {
  supabaseMock.reset();
  navigateSpy.mockReset();
});

afterEach(cleanup);

describe('Header', () => {
  it('names the system, as the public site does', () => {
    renderHeader();
    expect(screen.getByText('Green Tag Tree Inventory System')).toBeInTheDocument();
  });

  it('offers the four daily places as tabs, and nothing else', () => {
    renderHeader();
    const links = within(mainNav()).getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual(NAV);
  });

  it('keeps the pages visited less often behind the office’s seal', () => {
    renderHeader();
    expect(screen.queryByRole('link', { name: /Field officers/ })).not.toBeInTheDocument();
    openMenu();
    expect(screen.getByRole('link', { name: /Field officers/ })).toHaveAttribute('href', '/arborists');
    expect(screen.getByRole('link', { name: /Permit logs/ })).toHaveAttribute('href', '/permits');
  });

  it('signs the admin out and sends them to the login page', async () => {
    renderHeader();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(supabaseMock.supabase.auth.signOut).toHaveBeenCalled());
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the admin where they are when signing out fails', async () => {
    supabaseMock.supabase.auth.signOut.mockResolvedValue({ error: { message: 'network down' } });
    renderHeader();
    openMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    // Saying nothing would look like a successful logout that did not happen.
    expect(await screen.findByRole('alert')).toHaveTextContent('Logout failed. Please try again.');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('does not fire a second sign-out while the first is in flight', async () => {
    let finish;
    supabaseMock.supabase.auth.signOut.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderHeader();
    openMenu();

    const signOut = screen.getByRole('button', { name: 'Sign out' });
    fireEvent.click(signOut);
    await waitFor(() => expect(signOut).toBeDisabled());
    fireEvent.click(signOut);

    expect(supabaseMock.supabase.auth.signOut).toHaveBeenCalledTimes(1);
    finish({ error: null });
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/login'));
  });
});

describe('Header, for whoever is signed in', () => {
  it('shows the LGU’s seal and names the office', async () => {
    supabaseMock.signInAs(SANTA_CRUZ_ADMIN, SANTA_CRUZ);
    renderHeader();
    expect(await screen.findByAltText('Santa Cruz seal')).toBeInTheDocument();
    openMenu();
    expect(screen.getByText('MENRO Santa Cruz')).toBeInTheDocument();
  });

  it('calls a city’s office the CENRO', async () => {
    supabaseMock.signInAs({ ...SANTA_CRUZ_ADMIN, id: 'calamba-admin', lgu_psgc: CALAMBA.psgc }, CALAMBA);
    renderHeader();
    await screen.findByAltText('Calamba City seal');
    openMenu();
    expect(screen.getByText('CENRO Calamba City')).toBeInTheDocument();
  });

  it('gives PGENRO the Accounts page', async () => {
    supabaseMock.signInAs(PGENRO_ADMIN);
    renderHeader();
    await screen.findByAltText('PGENRO Laguna');
    openMenu();
    expect(screen.getByRole('link', { name: /Accounts/ })).toHaveAttribute('href', '/accounts');
  });

  it('does not offer an LGU admin the Accounts page', async () => {
    supabaseMock.signInAs(SANTA_CRUZ_ADMIN, SANTA_CRUZ);
    renderHeader();
    await screen.findByAltText('Santa Cruz seal');
    openMenu();
    expect(screen.queryByRole('link', { name: /Accounts/ })).not.toBeInTheDocument();
  });
});

describe('the badges', () => {
  it('counts the hazards nobody has been sent to, on Action Board', async () => {
    supabaseMock.setResponse('trees:select', {
      data: [
        hazard('t1', 403426001),
        hazard('t2', 403426002),
        { ...hazard('t3', 403426003), assigned_to: 'juan@field.ph' }, // already dispatched
        { id: 't4', is_leaning: false, barangay_psgc: 403426004 }, // healthy
      ],
      error: null,
    });
    renderHeader();
    expect(await within(mainNav()).findByText('2')).toBeInTheDocument();
    expect(screen.getByLabelText('2 hazards need dispatching')).toBeInTheDocument();
  });

  it('counts only the LGU’s own hazards for an LGU account', async () => {
    supabaseMock.signInAs(SANTA_CRUZ_ADMIN, SANTA_CRUZ);
    supabaseMock.setResponse('trees:select', {
      data: [hazard('scz', 403426001), hazard('clb-1', 403405001), hazard('clb-2', 403405002)],
      error: null,
    });
    renderHeader();
    // PSA codes nest: 403426001 is a barangay of 403426000, Santa Cruz.
    expect(await screen.findByLabelText('1 hazard needs dispatching')).toBeInTheDocument();
  });

  it('marks the seal when field officers are waiting for approval', async () => {
    supabaseMock.setResponse('profiles:select', { data: [{ id: 'p1' }, { id: 'p2' }], error: null });
    renderHeader();
    expect(await screen.findByLabelText('2 field officers are waiting for approval')).toHaveTextContent('!');
    openMenu();
    expect(screen.getByText('2 waiting')).toBeInTheDocument();
  });

  it('shows nothing when nothing needs the office', async () => {
    renderHeader();
    await waitFor(() => expect(supabaseMock.writesTo('trees', 'select')).toHaveLength(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
