import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});
const { saveAsSpy } = vi.hoisted(() => ({ saveAsSpy: vi.fn() }));
vi.mock('file-saver', () => ({ saveAs: saveAsSpy, default: { saveAs: saveAsSpy } }));

import { supabaseMock } from '../../test/supabaseMock.js';
import DataRequestModal from './DataRequestModal.jsx';

const TREES = [
  // Santa Cruz's poblacion and Pagsanjan's: one in, one out when Santa Cruz is asked for.
  { id: 't1', species: 'Narra', scientific_name: 'Pterocarpus indicus', latitude: 14.2794, longitude: 121.4157, dbh: '37 cm', total_height: 14, biodiversity_status: 'Endemic', barangay: 'Barangay I' },
  { id: 't2', species: 'Mangga', latitude: 14.2729, longitude: 121.4553, dbh: '30 cm', total_height: 8 },
];

/** A Blob's text: jsdom's Blob has no text(). */
const textOf = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });

function fill(dialog) {
  const type = (label, value) => fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  type(/First Name/, 'Ana');
  type(/Last Name/, 'Reyes');
  type(/Email/, 'ana@uplb.edu.ph');
  type(/Affiliation/, 'UPLB');
  type(/Purpose/, 'Thesis on urban trees');
}

beforeEach(() => {
  supabaseMock.reset();
  saveAsSpy.mockClear();
  supabaseMock.setResponse('trees:select', { data: TREES, error: null });
  supabaseMock.supabase.rpc.mockResolvedValue({ data: 'request-id', error: null });
});

describe('the data request form', () => {
  it('records who asked, then downloads the trees of the place chosen', async () => {
    render(<DataRequestModal open onClose={() => {}} place="Santa Cruz" />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Trees of')).toHaveValue('Santa Cruz');
    fill(dialog);
    fireEvent.click(within(dialog).getByLabelText(/GeoJSON/));
    fireEvent.click(within(dialog).getByLabelText(/I agree that PGENRO Laguna keeps/));
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Download' }).closest('form'));

    expect(await within(dialog).findByText(/Downloaded: 1 tree in Santa Cruz/, {}, { timeout: 10000 })).toBeInTheDocument();
    expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('log_data_request', {
      p_first_name: 'Ana',
      p_last_name: 'Reyes',
      p_email: 'ana@uplb.edu.ph',
      p_affiliation: 'UPLB',
      p_purpose: 'Thesis on urban trees',
      p_place: 'Santa Cruz',
      p_formats: ['xlsx', 'geojson'],
    });
    const names = saveAsSpy.mock.calls.map(([, name]) => name);
    expect(names).toEqual([expect.stringMatching(/^Green-Tag_trees_Santa-Cruz_\d{4}-\d{2}-\d{2}\.xlsx$/), expect.stringMatching(/\.geojson$/)]);

    // The GeoJSON holds the one Santa Cruz tree, and nothing of who tagged it.
    const geojson = JSON.parse(await textOf(saveAsSpy.mock.calls[1][0]));
    expect(geojson.features).toHaveLength(1);
    expect(geojson.features[0].properties).toMatchObject({ species: 'Narra', municipality: 'Santa Cruz', origin: 'Endemic' });
    expect(Object.keys(geojson.features[0].properties)).not.toContain('id');
  });

  it('shows what the database refuses, and downloads nothing', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Give an email address.' } });
    render(<DataRequestModal open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    fill(dialog);
    fireEvent.click(within(dialog).getByLabelText(/I agree that PGENRO Laguna keeps/));
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Download' }).closest('form'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Give an email address.');
    expect(saveAsSpy).not.toHaveBeenCalled();
  });

  it('still releases the data before data_requests.sql has been run', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Could not find the function public.log_data_request' } });
    render(<DataRequestModal open onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    fill(dialog);
    fireEvent.click(within(dialog).getByLabelText(/I agree that PGENRO Laguna keeps/));
    fireEvent.submit(within(dialog).getByRole('button', { name: 'Download' }).closest('form'));
    await waitFor(() => expect(saveAsSpy).toHaveBeenCalledTimes(1), { timeout: 10000 });
    expect(within(dialog).getByText(/Downloaded: 2 trees in Laguna/)).toBeInTheDocument();
  });
});
