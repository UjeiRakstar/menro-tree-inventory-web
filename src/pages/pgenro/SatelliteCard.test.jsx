import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

vi.mock('../../lib/satellite.js', async (importOriginal) => ({
  ...(await importOriginal()),
  takeSnapshot: vi.fn(),
}));

import { supabaseMock } from '../../test/supabaseMock.js';
import { takeSnapshot } from '../../lib/satellite.js';
import SatelliteCard from './SatelliteCard.jsx';

const INSTANCE = '0b9c2f1e-1111-4222-8333-944455556666';
const LIVE = {
  id: 'live1', status: 'live', imagery_from: '2026-08-01', imagery_to: '2026-09-30',
  taken_at: '2026-09-30T02:00:00Z', tile_count: 588, requests: 410, tiles_done: 406,
};

beforeEach(() => {
  supabaseMock.reset();
  takeSnapshot.mockReset();
});

describe('PGENRO’s satellite snapshots', () => {
  it('wants the instance ID before a snapshot, and keeps it with the cadence', async () => {
    supabaseMock.setResponse('satellite_settings:select', { data: null, error: null });
    render(<SatelliteCard />);
    expect(await screen.findByText('Save the instance ID first.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Take a new snapshot' })).toBeDisabled();
    expect(screen.getByText('No snapshot yet. The maps offer Esri’s satellite until there is one.')).toBeInTheDocument();

    const form = screen.getByRole('form', { name: 'Copernicus settings' });
    fireEvent.change(within(form).getByLabelText('Instance ID'), { target: { value: `  ${INSTANCE} ` } });
    fireEvent.change(within(form).getByLabelText('A new snapshot'), { target: { value: '15' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(supabaseMock.writesTo('satellite_settings', 'upsert')).toHaveLength(1));
    expect(supabaseMock.writesTo('satellite_settings', 'upsert')[0].payload).toEqual({ id: true, instance_id: INSTANCE, cadence_days: 15 });
  });

  it('says when one is due, takes it over the last sixty days, and puts it live', async () => {
    supabaseMock.setResponse('satellite_settings:select', { data: { instance_id: INSTANCE, cadence_days: 7 }, error: null });
    supabaseMock.setResponse('satellite_snapshots:select', { data: [LIVE], error: null });
    supabaseMock.setResponse('satellite_snapshots:insert', (record) => ({ data: { ...record.payload, id: 'new1', tiles_done: 0, requests: 0 }, error: null }));
    takeSnapshot.mockImplementation(async (client, { snapshot, onProgress }) => {
      onProgress({ phase: 'copernicus', done: 120, total: 406 });
      return { ...snapshot, status: 'live', tile_count: 588 };
    });
    render(<SatelliteCard />);
    expect(await screen.findByText('A new snapshot is due.')).toBeInTheDocument();
    expect(screen.getByText(/Imagery from Aug 1, 2026 to Sept? 30, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/of 30,000 Copernicus requests/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Take a new snapshot' }));
    expect(await screen.findByText(/Live on every map/)).toBeInTheDocument();
    const [insert] = supabaseMock.writesTo('satellite_snapshots', 'insert');
    expect(insert.payload).toMatchObject({ imagery_from: expect.stringMatching(/^\d{4}-\d\d-\d\d$/), min_zoom: 9, max_zoom: 14 });
    const days = (new Date(insert.payload.imagery_to) - new Date(insert.payload.imagery_from)) / 86400000;
    expect(days).toBe(60);
    expect(takeSnapshot).toHaveBeenCalledWith(supabaseMock.supabase, expect.objectContaining({ instanceId: INSTANCE, snapshot: expect.objectContaining({ id: 'new1' }) }));
  });

  it('carries on a snapshot that stopped, from where it stopped', async () => {
    const stopped = { ...LIVE, id: 'half', status: 'building', tiles_done: 200, imagery_to: '2026-10-21', taken_at: '2026-10-21T01:00:00Z' };
    supabaseMock.setResponse('satellite_settings:select', { data: { instance_id: INSTANCE, cadence_days: 7 }, error: null });
    supabaseMock.setResponse('satellite_snapshots:select', { data: [stopped, LIVE], error: null });
    takeSnapshot.mockRejectedValue(new Error('Copernicus is not answering just now. Carry on later.'));
    render(<SatelliteCard />);
    fireEvent.click(await screen.findByRole('button', { name: /Carry on the snapshot of Oct 21, 2026 \(200 of/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Copernicus is not answering just now. Carry on later. What was fetched is kept');
    expect(takeSnapshot).toHaveBeenCalledWith(supabaseMock.supabase, expect.objectContaining({ snapshot: stopped }));
    expect(supabaseMock.writesTo('satellite_snapshots', 'insert')).toHaveLength(0);
  });
});

describe('the schedule (22 October)', () => {
  it('is switched on with the tile list the server needs', async () => {
    supabaseMock.setResponse('satellite_settings:select', { data: { instance_id: INSTANCE, cadence_days: 7, auto: false }, error: null });
    render(<SatelliteCard />);
    const form = await screen.findByRole('form', { name: 'Copernicus settings' });
    await waitFor(() => expect(within(form).getByLabelText('Instance ID')).toHaveValue(INSTANCE));
    fireEvent.click(within(form).getByRole('checkbox', { name: /Take it automatically/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/taken by itself when one is due/)).toBeInTheDocument();
    expect(supabaseMock.writesTo('satellite_settings', 'upsert')[0].payload).toMatchObject({ auto: true });
    const [bucket, path, blob, options] = supabaseMock.supabase.storage.upload.mock.calls[0];
    expect([bucket, path, options.contentType]).toEqual(['satellite-tiles', 'plan.json', 'application/json']);
    const text = await new Promise((done) => {
      const reader = new FileReader();
      reader.onload = () => done(reader.result);
      reader.readAsText(blob);
    });
    expect(JSON.parse(text).tiles['14'].length).toBeGreaterThan(300);
  });

  it('shows a snapshot the schedule is taking, and leaves it to the schedule', async () => {
    supabaseMock.setResponse('satellite_settings:select', { data: { instance_id: INSTANCE, cadence_days: 7, auto: true }, error: null });
    supabaseMock.setResponse('satellite_snapshots:select', {
      data: [{ ...LIVE, id: 'sched', status: 'building', by_schedule: true, tiles_done: 120, taken_at: '2026-10-22T01:00:00Z' }, LIVE],
      error: null,
    });
    render(<SatelliteCard />);
    expect(await screen.findByText(/Being taken on schedule: 120 of/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Carry on/ })).not.toBeInTheDocument();
  });
});
