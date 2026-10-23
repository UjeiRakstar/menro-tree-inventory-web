import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
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

  it('marks the requests tab with how many are waiting for PGENRO', async () => {
    auth.profile = PGENRO_ADMIN;
    supabaseMock.setResponse('map_areas:select', { data: [{ id: 'a1' }, { id: 'a2' }], error: null });
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Planting site requests, 2 waiting for your decision/ });
    expect(tab).toHaveTextContent('2');
  });

  it('puts no number on the tab when nothing is waiting', async () => {
    auth.profile = PGENRO_ADMIN;
    supabaseMock.setResponse('map_areas:select', { data: [], error: null });
    renderPage();
    const tab = await screen.findByRole('tab', { name: /Planting site requests/ });
    expect(tab).not.toHaveTextContent(/waiting/);
  });

  it('has the province’s Tree Database, where PGENRO chooses each species’ cover and hides a photo', async () => {
    auth.profile = PGENRO_ADMIN;
    const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1/';
    supabaseMock.setResponse('trees:select', {
      data: [
        { id: 't1', species: 'Narra', barangay_psgc: 403426001, source: 'field', imageUrl: `${CLOUD}a.jpg`, leaves_url: `${CLOUD}b.jpg` },
        { id: 't2', species: 'Narra', barangay_psgc: 403405001, source: 'field', imageUrl: `${CLOUD}c.jpg` },
      ],
      error: null,
    });
    supabaseMock.setResponse('species_photo_choices:select', { data: [], error: null });
    supabaseMock.setResponse('species_photo_choices:upsert', { data: null, error: null });
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Tree Database/ }));
    const narra = await screen.findByRole('article', { name: 'Narra' });
    expect(within(narra).getByRole('region', { name: /by city and municipality/ })).toHaveTextContent('Calamba City');
    const chooser = within(narra).getByRole('region', { name: 'Choose the photos' });
    fireEvent.click(within(chooser).getAllByRole('button', { name: 'Make the cover: Main' })[1]);
    await waitFor(() => expect(supabaseMock.writesTo('species_photo_choices', 'upsert')).toHaveLength(1));
    expect(supabaseMock.writesTo('species_photo_choices', 'upsert')[0].payload).toEqual({
      species: 'narra', cover_url: `${CLOUD}c.jpg`, hidden_urls: [],
    });
    await waitFor(() =>
      expect(within(narra).getByRole('img', { name: 'Narra — the tree' }).getAttribute('src')).toMatch(/c\.jpg$/)
    );
    fireEvent.click(within(chooser).getByRole('button', { name: 'Hide: Leaves' }));
    await waitFor(() => expect(supabaseMock.writesTo('species_photo_choices', 'upsert')).toHaveLength(2));
    expect(supabaseMock.writesTo('species_photo_choices', 'upsert')[1].payload.hidden_urls).toEqual([`${CLOUD}b.jpg`]);
    expect(await within(chooser).findByText('Hidden (1)')).toBeInTheDocument();
  });

  it('gives a PGENRO training account the Tree Database without the choosing', async () => {
    auth.profile = { ...PGENRO_ADMIN, is_training: true };
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Tree Database/ }));
    await screen.findByRole('article', { name: 'Narra' });
    expect(screen.queryByRole('region', { name: 'Choose the photos' })).not.toBeInTheDocument();
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

describe('the inventory table (22 October)', () => {
  const OFFICER = { id: 'u-ana', full_name: 'Ana Reyes', email: 'ana@field.ph', lgu_psgc: 403426000, is_approved: true, status: 'active', role: 'field_officer' };
  beforeEach(() => {
    auth.profile = SANTA_CRUZ_ADMIN;
    supabaseMock.setResponse('trees:select', {
      data: [
        { id: 't1', species: 'Narra', barangay: 'Labuin', barangay_psgc: 403426001, dbh: '30 cm', total_height: '12', captured_by: 'u-ana', dateCaptured: '2026-10-01T00:00:00Z' },
        { id: 't2', species: 'Acacia', barangay: 'Gatid', barangay_psgc: 403426002, is_leaning: true, has_powerline_conflict: true, assigned_to: 'ANA@field.ph', task_status: 'Pending', source: 'crowdsource' },
      ],
      error: null,
    });
    supabaseMock.setResponse('profiles:select', { data: [OFFICER], error: null });
  });

  it('shows each tree’s barangay, heights, health, who tagged it and who it is assigned to', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Tree inventory' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Photo', 'Species', 'Barangay', 'DBH', 'Total height', 'Health', 'Date recorded', 'Tagged by', 'Assigned to', 'Actions']);
    const [narra, acacia] = within(table).getAllByRole('row').slice(1);
    expect(narra).toHaveTextContent('Labuin');
    expect(narra).toHaveTextContent('12 m');
    expect(narra).toHaveTextContent('Healthy');
    // Tagged by the officer who captured it, by name, once the team is in.
    await waitFor(() => expect(narra).toHaveTextContent('Ana Reyes'));
    expect(acacia).toHaveTextContent('Community');
    // Assigned to the officer, by name, whatever the email's case.
    expect(within(acacia).getAllByText('Ana Reyes').length).toBeGreaterThan(0);
    fireEvent.click(within(acacia).getByRole('button', { name: /Not healthy: 2 warnings/ }));
    const warnings = within(acacia).getByRole('dialog', { name: 'Warnings' });
    expect(warnings).toHaveTextContent('Leaning');
    expect(warnings).toHaveTextContent('In conflict with power lines');
    // Dispatch is offered for the tree that is not healthy only.
    expect(within(acacia).getByRole('button', { name: /Re-assign for Acacia/ })).toBeInTheDocument();
    expect(within(narra).queryByRole('button', { name: /Dispatch|Re-assign/ })).not.toBeInTheDocument();
  });

  it('archives a tree with its reason, and puts it back from Archived', async () => {
    supabaseMock.supabase.rpc.mockImplementation(async (name) =>
      name === 'archived_trees'
        ? { data: [{ id: 't1', species: 'Narra', barangay: 'Labuin', archive_reason: 'Cut under a permit — permit 14', archived_at: '2026-10-22T00:00:00Z' }], error: null }
        : { data: null, error: null }
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Narra' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive the tree' });
    fireEvent.click(within(dialog).getByRole('button', { name: /Archive it/ }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Choose why it is archived.');
    fireEvent.click(within(dialog).getByLabelText('Cut under a permit'));
    fireEvent.change(within(dialog).getByLabelText(/Note/), { target: { value: 'permit 14' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Archive it/ }));
    expect(await screen.findByText(/Narra archived: Cut under a permit — permit 14/)).toBeInTheDocument();
    expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('archive_tree', { p_id: 't1', p_archived: true, p_reason: 'Cut under a permit — permit 14' });
    expect(screen.queryByRole('button', { name: 'Archive Narra' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    const list = await screen.findByRole('region', { name: 'Archived trees' });
    fireEvent.click(within(list).getByRole('button', { name: 'Put back Narra' }));
    await waitFor(() => expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('archive_tree', { p_id: 't1', p_archived: false, p_reason: null }));
    expect(await screen.findByText('Narra is back in the inventory.')).toBeInTheDocument();
  });

  it('shows PGENRO the city or municipality, and no actions', async () => {
    auth.profile = PGENRO_ADMIN;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Santa Cruz/ }));
    const table = await screen.findByRole('table', { name: 'Tree inventory' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(
      ['Photo', 'Species', 'City / municipality', 'DBH', 'Total height', 'Health', 'Date recorded', 'Tagged by']
    );
    expect(within(table).queryByRole('button', { name: /Archive/ })).not.toBeInTheDocument();
  });
});
