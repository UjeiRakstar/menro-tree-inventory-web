import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
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

/** Where the admin can go from the header, and what each tab is called. */
const NAV = [
  ['Biodiversity Dashboard', '/biodiversity-dashboard'],
  ['Map', '/map'],
  ['Action Board', '/action-board'],
  ['Arborist', '/arborists'],
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

beforeEach(() => {
  supabaseMock.reset();
  navigateSpy.mockReset();
});

afterEach(cleanup);

describe('Header', () => {
  it('names the system it belongs to', () => {
    renderHeader();
    expect(screen.getByText('Tree Inventory System of MENRO Santa Cruz')).toBeInTheDocument();
  });

  it('offers one tab per admin section, and nothing else', () => {
    renderHeader();

    const links = screen.getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual(NAV);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('signs the admin out and sends them to the login page', async () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(supabaseMock.supabase.auth.signOut).toHaveBeenCalled());
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the admin where they are when signing out fails', async () => {
    supabaseMock.supabase.auth.signOut.mockResolvedValue({ error: { message: 'network down' } });
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

    // Saying nothing would look like a successful logout that did not happen.
    expect(await screen.findByRole('alert')).toHaveTextContent('Logout failed. Please try again.');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('does not fire a second sign-out while the first is in flight', async () => {
    let finish;
    supabaseMock.supabase.auth.signOut.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderHeader();

    const logout = screen.getByRole('button', { name: 'Logout' });
    fireEvent.click(logout);
    await waitFor(() => expect(logout).toBeDisabled());
    fireEvent.click(logout);

    expect(supabaseMock.supabase.auth.signOut).toHaveBeenCalledTimes(1);
    finish({ error: null });
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/login'));
  });
});

describe('Header, for whoever is signed in', () => {
  // It used to say "MENRO Santa Cruz" for every account. With one account per
  // LGU it names the office actually signed in.

  it('names the LGU an admin belongs to', async () => {
    supabaseMock.signInAs(SANTA_CRUZ_ADMIN, SANTA_CRUZ);
    renderHeader();
    expect(await screen.findByAltText('Santa Cruz seal')).toBeInTheDocument();
    expect(screen.getByText('Tree Inventory System of MENRO Santa Cruz')).toBeInTheDocument();
  });

  it('calls a city’s office the CENRO', async () => {
    supabaseMock.signInAs({ ...SANTA_CRUZ_ADMIN, id: 'calamba-admin', lgu_psgc: CALAMBA.psgc }, CALAMBA);
    renderHeader();
    expect(await screen.findByText('Tree Inventory System of CENRO Calamba City')).toBeInTheDocument();
  });

  it('names PGENRO for PGENRO, and gives it the Accounts page', async () => {
    supabaseMock.signInAs(PGENRO_ADMIN);
    renderHeader();
    expect(await screen.findByText('Tree Inventory System of PGENRO Laguna')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/accounts');
  });

  it('does not offer an LGU admin the Accounts page', async () => {
    supabaseMock.signInAs(SANTA_CRUZ_ADMIN, SANTA_CRUZ);
    renderHeader();
    await screen.findByAltText('Santa Cruz seal');
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument();
  });
});
