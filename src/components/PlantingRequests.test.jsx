import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import PlantingRequests from './PlantingRequests.jsx';

const row = (id, name, approval, extra = {}) => ({
  id, name, approval, kind: 'planting-site', municipality: 'Santa Cruz', barangay: 'Pagsawitan',
  area_m2: 19554, created_at: '2026-10-15T08:00:00Z', review_note: null, reviewed_at: null, ...extra,
});

const ROWS = [
  row('a1', 'Riverbank', 'requested'),
  row('a2', 'Old quarry', 'declined', { review_note: 'Slope too steep', reviewed_at: '2026-10-15T09:00:00Z' }),
  row('a3', 'School grounds', 'approved', { reviewed_at: '2026-10-14T09:00:00Z' }),
  // PGENRO's own, never asked for: not a request.
  row('a4', 'PGENRO site', 'approved'),
];

const show = (props = {}) =>
  render(
    <MemoryRouter>
      <PlantingRequests {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('map_areas:select', { data: ROWS, error: null });
  supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(cleanup);

describe('PlantingRequests', () => {
  it('lists the requests, waiting first, and leaves out sites nobody asked for', async () => {
    show({ decides: true });
    const table = await screen.findByRole('table');
    const names = within(table).getAllByRole('rowheader').map((cell) => cell.textContent);
    expect(names).toEqual(['Riverbank', 'Old quarry', 'School grounds']);
    expect(within(table).getByText('Slope too steep')).toBeInTheDocument();
    expect(screen.getByText(/1 waiting for your decision/)).toBeInTheDocument();
    expect(within(table).getAllByRole('link', { name: /On the map/ })[0]).toHaveAttribute('href', '/map?area=a1');
  });

  it('lets PGENRO approve a request from the table', async () => {
    show({ decides: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Approve Riverbank' }));
    await waitFor(() =>
      expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('decide_planting_request', { p_id: 'a1', p_approve: true, p_note: null })
    );
  });

  it('asks why before declining, and sends the note', async () => {
    show({ decides: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Decline…' }));
    fireEvent.change(screen.getByLabelText(/Why not\?/), { target: { value: 'Inside the riverbank easement' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decline Riverbank' }));
    await waitFor(() =>
      expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('decide_planting_request', {
        p_id: 'a1', p_approve: false, p_note: 'Inside the riverbank easement',
      })
    );
  });

  it('shows an office where its requests stand, with nothing to decide', async () => {
    show();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Approve|Decline/ })).not.toBeInTheDocument();
    expect(screen.getByText(/1 waiting for PGENRO’s decision/)).toBeInTheDocument();
  });

  it('says which file to run when requests are not in the database yet', async () => {
    supabaseMock.setResponse('map_areas:select', { data: null, error: { code: '42703', message: 'column map_areas.approval does not exist' } });
    show({ decides: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('planting_requests.sql');
  });
});
