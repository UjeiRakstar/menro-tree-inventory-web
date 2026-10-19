import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import TreeInventorySection from './TreeInventorySection.jsx';

const LGU = { name: 'Santa Cruz', label: 'Santa Cruz', psgc: 403426000 };
const csv = (text, name = 'inventory.csv') => new File([text], name, { type: 'text/csv' });

function choose(file) {
  fireEvent.change(screen.getByLabelText('Tree inventory spreadsheet'), { target: { files: [file] } });
}

beforeEach(() => supabaseMock.reset());
afterEach(cleanup);

describe('bringing in a tree inventory', () => {
  it('reads the spreadsheet, says what it left out, and brings its trees in as unverified imports', async () => {
    render(<TreeInventorySection lgu={LGU} bare />);
    choose(csv('Species,Latitude,Longitude,Barangay,DBH (cm),Owner\nNarra,14.2794,121.4157,Poblacion I,42,Juan dela Cruz\nMango,14.2117,121.1653,Bucal,30,Maria Santos\n'));

    expect(await screen.findByText(/1 tree ready to bring in, 1 row to look at/)).toBeInTheDocument();
    expect(screen.getByText('Left out as personal data: Owner.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Rows to look at' })).toHaveTextContent('1 row: This point is in Calamba, not Santa Cruz. (row 3)');

    fireEvent.click(screen.getByRole('button', { name: 'Bring in 1 tree' }));
    await waitFor(() => expect(supabaseMock.writesTo('pending_trees', 'insert')).toHaveLength(1));
    const [row] = supabaseMock.writesTo('pending_trees', 'insert')[0].payload;
    expect(row).toEqual(expect.objectContaining({
      species: 'Narra',
      barangay: 'Poblacion I',
      municipality: 'Santa Cruz',
      source: 'import',
      status: 'pending',
      details: { dbh_cm: 42, file: 'inventory.csv', row: 2 },
    }));
    expect(JSON.stringify(row)).not.toMatch(/Juan/);
    expect(await screen.findByRole('status')).toHaveTextContent('1 tree came in for Santa Cruz. Each is grey on the map until a field officer verifies it.');
  });

  it('says which column a spreadsheet lacks', async () => {
    render(<TreeInventorySection lgu={LGU} bare />);
    choose(csv('Species,Barangay\nNarra,Poblacion I\n'));
    expect(await screen.findByRole('alert')).toHaveTextContent('has no Latitude, Longitude column');
  });

  it('says when the database is not ready for imports', async () => {
    supabaseMock.setResponse('pending_trees:insert', { data: null, error: { code: 'PGRST204', message: "Could not find the 'source' column" } });
    render(<TreeInventorySection lgu={LGU} bare />);
    choose(csv('Species,Latitude,Longitude\nNarra,14.2794,121.4157\n'));
    fireEvent.click(await screen.findByRole('button', { name: 'Bring in 1 tree' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('needs supabase/community.sql');
  });
});

describe('bringing the same inventory in again', () => {
  it('adds nothing twice: trees already in are counted and left out', async () => {
    // Narra was brought in before; Mahogany at the same point is a different tree.
    supabaseMock.setResponse('pending_trees:select', {
      data: [{ id: 'old', species: 'Narra', latitude: 14.2794, longitude: 121.4157, details: {} }],
      error: null,
    });
    render(<TreeInventorySection lgu={LGU} bare />);
    choose(csv('Species,Latitude,Longitude\nNarra,14.2794,121.4157\nMahogany,14.2794,121.4157\n'));
    fireEvent.click(await screen.findByRole('button', { name: 'Bring in 2 trees' }));
    await waitFor(() => expect(supabaseMock.writesTo('pending_trees', 'insert')).toHaveLength(1));
    expect(supabaseMock.writesTo('pending_trees', 'insert')[0].payload.map((row) => row.species)).toEqual(['Mahogany']);
    expect(supabaseMock.queryFiltering('pending_trees', 'lgu_psgc').filters).toEqual([['source', 'import'], ['lgu_psgc', LGU.psgc]]);
    expect(await screen.findByRole('status')).toHaveTextContent('1 tree came in for Santa Cruz.');
    expect(screen.getByRole('status')).toHaveTextContent('1 tree was already in, from an earlier upload, and left out.');
  });
});

describe('PGENRO bringing an LGU’s inventory in for it', () => {
  it('chooses the city or municipality first, and reads the file against it', async () => {
    render(<TreeInventorySection pgenro bare />);
    expect(screen.getByRole('button', { name: /Choose a filled spreadsheet/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/For which city or municipality/), { target: { value: '403405000' } });
    expect(screen.getByRole('button', { name: /Choose a filled spreadsheet/ })).toBeEnabled();
    choose(csv('Species,Latitude,Longitude\nMango,14.2117,121.1653\nNarra,14.2794,121.4157\n'));
    expect(await screen.findByText(/1 tree ready to bring in, 1 row to look at/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Rows to look at' })).toHaveTextContent('This point is in Santa Cruz, not Calamba.');
    fireEvent.click(screen.getByRole('button', { name: 'Bring in 1 tree' }));
    await waitFor(() => expect(supabaseMock.writesTo('pending_trees', 'insert')).toHaveLength(1));
    expect(supabaseMock.writesTo('pending_trees', 'insert')[0].payload[0]).toEqual(expect.objectContaining({ municipality: 'Calamba', source: 'import' }));
  });
});
