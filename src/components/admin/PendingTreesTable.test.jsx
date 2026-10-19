import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import PendingTreesTable from './PendingTreesTable.jsx';

/**
 * The crowdsourcing queue: what residents submitted, who is out verifying it,
 * and the step that finally puts a verified submission on the public map.
 */

const SUBMITTED = {
  id: 'pending-1',
  species: 'Narra',
  barangay: 'Poblacion',
  latitude: 14.28,
  longitude: 121.41,
  status: 'pending',
  submitted_at: '2026-10-01T02:00:00.000Z',
  photo_url: 'https://example.test/narra.jpg',
};

const OUT_FOR_VERIFICATION = {
  id: 'pending-2',
  species: 'Mango',
  barangay: 'Bubukal',
  latitude: 14.29,
  longitude: 121.42,
  status: 'dispatched',
  assigned_to: 'arb@menro.gov.ph',
  submitted_at: '2026-09-28T02:00:00.000Z',
};

const loadQueue = (rows) => supabaseMock.setResponse('pending_trees:select', { data: rows, error: null });

beforeEach(() => {
  supabaseMock.reset();
  loadQueue([SUBMITTED, OUT_FOR_VERIFICATION]);
  supabaseMock.supabase.rpc.mockResolvedValue({ data: 'tree-new', error: null });
});

afterEach(cleanup);

describe('PendingTreesTable', () => {
  it('separates what needs review from what is already out being verified', async () => {
    render(<PendingTreesTable />);

    const awaiting = await screen.findByRole('region', { name: 'Awaiting review' });
    expect(within(awaiting).getByText('Narra')).toBeInTheDocument();

    const out = screen.getByRole('region', { name: 'Out for verification' });
    expect(within(out).getByText('Mango')).toBeInTheDocument();
    expect(within(out).getByText(/arb@menro.gov.ph/)).toBeInTheDocument();
  });

  it('counts only the submissions still awaiting review', async () => {
    const onCountChange = vi.fn();
    render(<PendingTreesTable onCountChange={onCountChange} />);

    await screen.findByRole('region', { name: 'Awaiting review' });
    expect(onCountChange).toHaveBeenLastCalledWith(1);
  });

  it('publishes a verified submission through the database, in one call', async () => {
    render(<PendingTreesTable />);
    const out = await screen.findByRole('region', { name: 'Out for verification' });

    fireEvent.click(within(out).getByRole('button', { name: /Publish to map/ }));

    await waitFor(() =>
      expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('promote_pending_tree', {
        p_pending_id: 'pending-2',
      })
    );
    // Creating the tree, marking it crowdsourced and closing the submission all
    // happen inside that call — the page must not write any of it itself.
    expect(supabaseMock.calls.filter((c) => c.op !== 'select')).toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Out for verification' })).not.toBeInTheDocument()
    );
  });

  it('keeps the card and says why when publishing fails', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Not allowed to publish crowdsourced submissions' },
    });
    render(<PendingTreesTable />);
    const out = await screen.findByRole('region', { name: 'Out for verification' });

    fireEvent.click(within(out).getByRole('button', { name: /Publish to map/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed to publish');
    // Losing the card would leave the submission unreachable from here.
    expect(screen.getByRole('region', { name: 'Out for verification' })).toBeInTheDocument();
  });

  it('moves a submission across to verification when it is dispatched', async () => {
    loadQueue([SUBMITTED]);
    supabaseMock.setResponse('arborists:select', {
      data: [{ id: 'a-1', email: 'arb@menro.gov.ph', name: 'Juan' }],
      error: null,
    });
    supabaseMock.setResponse('pending_trees:update', { data: [SUBMITTED], error: null });
    render(<PendingTreesTable />);

    const awaiting = await screen.findByRole('region', { name: 'Awaiting review' });
    fireEvent.click(within(awaiting).getByRole('button', { name: /Verify/i }));
    fireEvent.click(await screen.findByRole('button', { name: /arb@menro.gov.ph/ }));

    const out = await screen.findByRole('region', { name: 'Out for verification' });
    expect(within(out).getByText('Narra')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Awaiting review' })).not.toBeInTheDocument();
  });

  it('shows PGENRO the queue without the buttons, and says whose work it is', async () => {
    render(<PendingTreesTable readOnly />);
    const awaiting = await screen.findByRole('region', { name: 'Awaiting review' });
    expect(within(awaiting).getByText('Narra')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Verify|Reject|Publish/i })).not.toBeInTheDocument();
    expect(screen.getByText(/done by the MENRO \/\s*CENRO/)).toBeInTheDocument();
  });

  it('says so when the queue cannot be read, rather than looking empty', async () => {
    supabaseMock.setResponse('pending_trees:select', { data: null, error: { message: 'offline' } });
    render(<PendingTreesTable />);

    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
  });

  it('shows the all-clear only when nothing is waiting anywhere', async () => {
    loadQueue([]);
    render(<PendingTreesTable />);

    expect(await screen.findByText('All caught up!')).toBeInTheDocument();
  });
});

describe('trees from the office’s inventory spreadsheet', () => {
  const imported = (id, barangay, extra = {}) => ({
    id, species: 'Mahogany', barangay, status: 'pending', source: 'import', latitude: 14.35, longitude: 121.04, ...extra,
  });
  const INVENTORY = [
    imported('i1', 'Pacita 1'), imported('i2', 'Pacita 1'), imported('i3', 'Pacita 1'),
    imported('i4', 'San Antonio'), imported('i5', 'San Antonio', { status: 'dispatched', assigned_to: 'ana@field.ph' }),
  ];

  it('counts them by barangay, apart from residents’ tags, with no card each', async () => {
    loadQueue([SUBMITTED, ...INVENTORY]);
    render(<PendingTreesTable />);
    const section = await screen.findByRole('region', { name: 'Inventory trees to verify' });
    expect(section).toHaveTextContent("5 trees brought in from the office's inventory, grey on the map; 4 not yet sent to a field officer.");
    const rows = within(section).getAllByRole('listitem').map((row) => row.textContent);
    expect(rows[0]).toMatch(/^Pacita 13 waiting/);
    expect(rows[1]).toMatch(/San Antonio1 waiting1 with ana@field\.ph/);
    // Residents' tags are still cards; the inventory's are not.
    expect(screen.getByText('1 submission awaiting review')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Verify|Dispatch/ }).length).toBeLessThanOrEqual(1);
  });

  it('sends one field officer to a barangay’s trees at once', async () => {
    loadQueue(INVENTORY);
    supabaseMock.setResponse('arborists:select', { data: [{ id: 'a1', email: 'ben@field.ph', name: 'Ben' }], error: null });
    render(<PendingTreesTable />);
    fireEvent.click(await screen.findByRole('button', { name: 'Send a field officer to Pacita 1' }));
    expect(await screen.findByText('3 inventory trees in Pacita 1')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Ben/ }));
    await waitFor(() => expect(supabaseMock.writesTo('pending_trees', 'update')).toHaveLength(1));
    const [update] = supabaseMock.writesTo('pending_trees', 'update');
    expect(update.payload).toEqual({ status: 'dispatched', assigned_to: 'ben@field.ph' });
    expect(update.filters).toEqual([['id', ['i1', 'i2', 'i3']]]);
    expect(await screen.findByText('3 with ben@field.ph')).toBeInTheDocument();
  });

  it('shows PGENRO the counts without the buttons', async () => {
    loadQueue(INVENTORY);
    render(<PendingTreesTable readOnly />);
    await screen.findByRole('region', { name: 'Inventory trees to verify' });
    expect(screen.queryByRole('button', { name: /Send a field officer/ })).not.toBeInTheDocument();
  });
});
