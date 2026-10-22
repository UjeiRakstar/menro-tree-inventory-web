import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import TreeDatabasePage from './TreeDatabasePage.jsx';
import PublicNavbar from '../../components/PublicNavbar.jsx';

const CLOUD = 'https://res.cloudinary.com/demo/image/upload/v1/';

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('trees:select', {
    data: [
      { id: 't1', species: 'Narra', scientific_name: 'Pterocarpus indicus', barangay_psgc: 403426001, source: 'field',
        imageUrl: CLOUD + 'narra.jpg', leaves_url: CLOUD + 'narra-leaf.jpg' },
      { id: 't2', species: 'Molave' },
      { id: 't3', species: 'Narra', barangay_psgc: 403405001, source: 'crowdsource', photo_url: CLOUD + 'resident.jpg' },
    ],
    error: null,
  });
  supabaseMock.setResponse('species_profiles:select', {
    data: [
      { species: 'Narra', scientific_name: 'Pterocarpus indicus', description: 'A large deciduous tree.' },
      { species: 'Ipil', description: 'Not tagged anywhere yet.' },
    ],
    error: null,
  });
});

describe('the public Tree Database (22 October)', () => {
  it('lists every species tagged in Laguna, and only those, with PGENRO’s write-up to read', async () => {
    render(<TreeDatabasePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tree Database');
    const list = await screen.findByRole('list', { name: 'Species tagged' });
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringMatching(/^Molave.*1 tree.*No write-up yet/),
      expect.stringMatching(/^Narra.*2 trees/),
    ]);
    expect(list).not.toHaveTextContent('Ipil');
    fireEvent.click(within(list).getByRole('button', { name: /^Narra/ }));
    const narra = screen.getByRole('article', { name: 'Narra' });
    expect(narra).toHaveTextContent('A large deciduous tree.');
    expect(within(narra).queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/Kept by PGENRO Laguna/)).toBeInTheDocument();
    // Only the species are read from the trees: nothing else of them goes out.
    expect(supabaseMock.calls.find((c) => c.table === 'trees').columns).toBe(
      'id,species,scientific_name,barangay_psgc,source,imageUrl,photo_url,leaves_url,bark_url,fruits_url'
    );
    // Where it is tagged, by city and municipality.
    const where = within(narra).getByRole('region', { name: /Where it is tagged/ });
    expect(within(where).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Calamba City 1', 'Santa Cruz 1']);
  });

  it('shows a species with the field officers’ photos, sized by Cloudinary, never a resident’s', async () => {
    render(<TreeDatabasePage />);
    expect(screen.getByRole('region', { name: 'Tree Database of Laguna' })).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Species tagged' });
    fireEvent.click(within(list).getByRole('button', { name: /^Narra/ }));
    const photos = screen.getByRole('figure', { name: 'Photos of Narra' });
    expect(within(photos).getByRole('img', { name: 'Narra — the tree' })).toHaveAttribute(
      'src', CLOUD.replace('v1/', 'w_900,c_limit,f_auto,q_auto/v1/') + 'narra.jpg'
    );
    expect(within(photos).getByRole('img', { name: 'Narra — leaves' })).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('resident.jpg');
    // The public chooses nothing.
    expect(screen.queryByRole('region', { name: 'Choose the photos' })).not.toBeInTheDocument();
  });

  it('is in the public navigation', () => {
    render(
      <MemoryRouter>
        <PublicNavbar />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link', { name: 'Tree Database' })[0]).toHaveAttribute('href', '/tree-database');
  });
});
