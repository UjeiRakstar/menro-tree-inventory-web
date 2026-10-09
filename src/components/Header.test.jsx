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
      <Header />
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
