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
    fireEvent.click(await screen.findByRole('tab', { name: /Species \(RISE\)/ }));
    expect(await screen.findByRole('heading', { name: /Species, from RISE/ })).toBeInTheDocument();
    // The one tagged species with no write-up is waiting for one.
    expect(screen.getByRole('button', { name: 'Write up Narra' })).toBeInTheDocument();
  });

  it('is not there for an LGU office', async () => {
    auth.profile = SANTA_CRUZ_ADMIN;
    renderPage();
    expect(await screen.findByRole('tab', { name: /Inventory/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Species \(RISE\)/ })).not.toBeInTheDocument();
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

describe('PGENRO’s Trees (22 October)', () => {
  it('has the planting site requests to decide, and not the carbon charts, which are on the BioDashboard', async () => {
    auth.profile = PGENRO_ADMIN;
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Planting site requests/ }));
    expect(await screen.findByRole('region', { name: 'Planting site requests' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Carbon Sink/ })).not.toBeInTheDocument();
  });

  it('opens on the requests from ?tab=requests, as the old links had them', async () => {
    auth.profile = PGENRO_ADMIN;
    render(
      <MemoryRouter initialEntries={['/inventory?tab=requests']}>
        <BiodiversityHub />
      </MemoryRouter>
    );
    expect(await screen.findByRole('region', { name: 'Planting site requests' })).toBeInTheDocument();
  });

  it('gives an LGU office no requests here: they are on its Action Board', async () => {
    auth.profile = SANTA_CRUZ_ADMIN;
    renderPage();
    await screen.findByRole('tab', { name: /Inventory/ });
    expect(screen.queryByRole('tab', { name: /Planting site requests/ })).not.toBeInTheDocument();
  });
});

describe('an office’s Trees (22 October)', () => {
  beforeEach(() => {
    auth.profile = SANTA_CRUZ_ADMIN;
    supabaseMock.setResponse('trees:select', {
      data: [
        { id: 't1', species: 'Narra', scientific_name: 'Pterocarpus indicus', barangay_psgc: 403426001 },
        { id: 't2', species: 'narra', barangay_psgc: 403426002 },
        { id: 't3', species: 'Acacia', barangay_psgc: 403426003 },
        // Another LGU's tree: not Santa Cruz's species.
        { id: 't4', species: 'Molave', barangay_psgc: 403418001 },
      ],
      error: null,
    });
    supabaseMock.setResponse('species_profiles:select', {
      data: [
        { species: 'Narra', scientific_name: 'Pterocarpus indicus', description: 'A large deciduous tree.', family: 'Fabaceae', rise_citation: 'RISE Vol. 21 No. 2' },
        { species: 'Molave', description: 'Hardwood.' },
      ],
      error: null,
    });
  });

  it('has the inventory, the tags and the Tree Database — no carbon charts', async () => {
    renderPage();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent.replace(/^\S+\s/, ''))).toEqual(['Inventory', 'Tags', 'Tree Database']);
  });

  it('keeps the tags to check, opened from ?tab=tags', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory?tab=tags']}>
        <BiodiversityHub />
      </MemoryRouter>
    );
    expect(await screen.findByRole('tab', { name: /Tags/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists only the species tagged in the LGU, with PGENRO’s write-up, read-only', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Tree Database/ }));
    const list = await screen.findByRole('list', { name: 'Species tagged' });
    const names = within(list).getAllByRole('button').map((b) => b.textContent);
    expect(names).toHaveLength(2);
    expect(names[0]).toMatch(/^Acacia.*1 tree.*No write-up yet/);
    expect(names[1]).toMatch(/^Narra.*Pterocarpus indicus.*2 trees/);
    expect(list).not.toHaveTextContent('Molave');

    fireEvent.click(within(list).getByRole('button', { name: /^Narra/ }));
    const narra = screen.getByRole('article', { name: 'Narra' });
    expect(narra).toHaveTextContent('A large deciduous tree.');
    expect(narra).toHaveTextContent('Fabaceae');
    expect(narra).toHaveTextContent('RISE Vol. 21 No. 2');
    // Nothing on it edits the write-up: that is PGENRO's.
    expect(within(narra).queryByRole('button')).not.toBeInTheDocument();
    expect(within(narra).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Kept by PGENRO — read-only here/)).toBeInTheDocument();
  });
});
