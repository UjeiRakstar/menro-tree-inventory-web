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
