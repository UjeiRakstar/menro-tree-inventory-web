import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ profile: null }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import { PGENRO_ADMIN, SANTA_CRUZ_ADMIN } from '../test/accounts.js';
import BiodiversityHub from './BiodiversityHub.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <BiodiversityHub />
    </MemoryRouter>
  );
}

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('trees:select', { data: [{ id: 't1', species: 'Narra' }], error: null });
  supabaseMock.setResponse('species_profiles:select', { data: [], error: null });
});
afterEach(cleanup);

describe('the Species (RISE) tab', () => {
  it('is there for PGENRO, whose forester keeps the write-ups', async () => {
    auth.profile = PGENRO_ADMIN;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Species \(RISE\)/ }));
    expect(await screen.findByRole('heading', { name: /Species, from RISE/ })).toBeInTheDocument();
    // The one tagged species with no write-up is waiting for one.
    expect(screen.getByRole('button', { name: 'Write up Narra' })).toBeInTheDocument();
  });

  it('is not there for an LGU office', async () => {
    auth.profile = SANTA_CRUZ_ADMIN;
    renderPage();
    expect(await screen.findByRole('button', { name: /Inventory/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Species \(RISE\)/ })).not.toBeInTheDocument();
  });
});

describe('the inventory, for the province (21 October)', () => {
  it('groups the trees by the city or municipality each stands in, opened on a click', async () => {
    auth.profile = PGENRO_ADMIN;
    supabaseMock.setResponse('trees:select', {
      data: [
        { id: 't1', species: 'Narra', barangay_psgc: 403426001 },
        { id: 't2', species: 'Mangga', barangay_psgc: 403426002 },
        { id: 't3', species: 'Molave', barangay_psgc: 403418001 },
      ],
      error: null,
    });
    renderPage();
    const groups = await screen.findByLabelText('Trees by city and municipality');
    const santaCruz = within(groups).getByRole('region', { name: 'Santa Cruz' });
    expect(within(santaCruz).getByText('2 trees')).toBeInTheDocument();
    expect(within(groups).getByRole('region', { name: 'Paete' })).toHaveTextContent('1 tree');
    expect(within(santaCruz).queryByText('Narra')).not.toBeInTheDocument();
    fireEvent.click(within(santaCruz).getByRole('button', { name: /Santa Cruz/ }));
    expect(within(santaCruz).getByText('Narra')).toBeInTheDocument();
  });

  it('stays one list for an LGU office', async () => {
    auth.profile = SANTA_CRUZ_ADMIN;
    supabaseMock.setResponse('trees:select', { data: [{ id: 't1', species: 'Narra', barangay_psgc: 403426001 }], error: null });
    renderPage();
    expect(await screen.findByText('Narra')).toBeInTheDocument();
    expect(screen.queryByLabelText('Trees by city and municipality')).not.toBeInTheDocument();
  });
});
