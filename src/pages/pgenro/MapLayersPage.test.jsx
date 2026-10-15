import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

// The file work is tested on its own (src/lib/layers); here it is the page.
const { prepareSpy, publishSpy, refreshSpy, climateSpy } = vi.hoisted(() => ({
  prepareSpy: vi.fn(),
  publishSpy: vi.fn(),
  refreshSpy: vi.fn(),
  climateSpy: vi.fn(),
}));
vi.mock('../../lib/layers/browser.js', async (importOriginal) => ({
  ...(await importOriginal()),
  prepareInBackground: prepareSpy,
  publishLayer: publishSpy,
}));
vi.mock('../../lib/layers/facts.js', () => ({ refreshAllAreaFacts: refreshSpy }));
vi.mock('../../lib/layers/climateFiles.js', () => ({ readClimateFiles: climateSpy }));

import { supabaseMock } from '../../test/supabaseMock.js';
import MapLayersPage from './MapLayersPage.jsx';

const FLOOD_META = {
  kind: 'flood',
  field: 'Var',
  hectares: { low: 19872, medium: 21743, high: 16237 },
  legend: [{ value: 1, label: 'Low', colour: [255, 255, 0, 150] }],
};

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('map_layers:select', { data: [], error: null });
  supabaseMock.setResponse('lgu_climate:select', { data: [], error: null });
  prepareSpy.mockReset();
  publishSpy.mockReset();
  refreshSpy.mockReset();
  climateSpy.mockReset();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview');
  globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const card = (name) => screen.findByRole('region', { name });

describe('the map layers page', () => {
  it('lists each layer, saying which are not uploaded yet', async () => {
    render(<MapLayersPage />);
    for (const name of ['Soil type', 'Elevation', 'Flood hazard', 'Rain-induced landslide hazard']) {
      expect(await card(name)).toHaveTextContent('Not uploaded yet');
    }
  });

  it('shows what is live, and from which file', async () => {
    supabaseMock.setResponse('map_layers:select', {
      data: [{ id: 'l1', kind: 'flood', active: true, file_name: 'Project_NOAH_Flooding.geojson', uploaded_at: '2026-10-15T00:00:00Z', meta: FLOOD_META }],
      error: null,
    });
    render(<MapLayersPage />);
    const flood = await card('Flood hazard');
    expect(flood).toHaveTextContent('Live on the maps');
    expect(flood).toHaveTextContent('Project_NOAH_Flooding.geojson');
    expect(flood).toHaveTextContent('19,872 ha low · 21,743 ha medium · 16,237 ha high');
  });

  it('prepares a file, shows it, and publishes it only when asked — then measures every area', async () => {
    prepareSpy.mockResolvedValue({ meta: FLOOD_META, files: { 'picture.png': new Blob(['png']) } });
    publishSpy.mockResolvedValue({ id: 'l2', kind: 'flood' });
    refreshSpy.mockImplementation(async (_s, _l, { onProgress }) => {
      onProgress(3, 3);
      return { done: 3, failed: 0 };
    });
    render(<MapLayersPage />);
    const flood = await card('Flood hazard');

    const file = new File(['{}'], 'Project_NOAH_Flooding.geojson', { type: 'application/geo+json' });
    fireEvent.change(within(flood).getByLabelText('Flood hazard file'), { target: { files: [file] } });

    expect(await within(flood).findByText(/Ready to publish/)).toBeInTheDocument();
    expect(within(flood).getByText(/read from the “Var” property/)).toBeInTheDocument();
    expect(within(flood).getByRole('img', { name: 'Flood hazard as it will be drawn' })).toBeInTheDocument();
    expect(publishSpy).not.toHaveBeenCalled();

    fireEvent.click(within(flood).getByRole('button', { name: 'Publish' }));
    expect(await within(flood).findByText(/Live\. 3 saved areas measured against it/)).toBeInTheDocument();
    expect(publishSpy).toHaveBeenCalledWith(expect.anything(), 'flood', expect.objectContaining({ meta: FLOOD_META }), 'Project_NOAH_Flooding.geojson');
    // Measured against the new layer, not the one it replaces.
    expect(refreshSpy.mock.calls[0][1].flood).toEqual({ id: 'l2', kind: 'flood' });
  });

  it('says what is wrong with a file it cannot use, and publishes nothing', async () => {
    prepareSpy.mockRejectedValue(new Error('No property in every shape gives a hazard level of 1, 2 or 3.'));
    render(<MapLayersPage />);
    const flood = await card('Flood hazard');
    fireEvent.change(within(flood).getByLabelText('Flood hazard file'), { target: { files: [new File(['{}'], 'x.geojson')] } });
    expect(await within(flood).findByRole('alert')).toHaveTextContent('hazard level of 1, 2 or 3');
    expect(within(flood).queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
  });

  it('reads CLIRAM workbooks, lists each LGU’s figures, and saves them', async () => {
    climateSpy.mockResolvedValue([
      {
        fileName: 'CMIP6-CLIRAM_Santa Cruz_climap_download.zip',
        lgu: { name: 'Santa Cruz', label: 'Santa Cruz', psgc: 403426000 },
        climate: { place: 'Santa Cruz', scenario: 'SSP2-4.5', temperature: { meanC: 26.6 }, rainfall: { annualMm: 2765 } },
      },
      { fileName: 'notes.xlsx', error: 'This is not a CLIRAM workbook.' },
    ]);
    supabaseMock.setResponse('lgu_climate:upsert', { data: null, error: null });
    render(<MapLayersPage />);
    const climate = await card('Climate (CLIRAM)');
    fireEvent.change(within(climate).getByLabelText('CLIRAM files'), { target: { files: [new File(['x'], 'a.zip')] } });

    const table = await within(climate).findByRole('table', { name: 'Climate figures to save' });
    expect(table).toHaveTextContent('Santa Cruz');
    expect(table).toHaveTextContent('26.6 °C');
    expect(table).toHaveTextContent('2,765 mm');
    expect(within(climate).getByText(/notes\.xlsx: This is not a CLIRAM workbook/)).toBeInTheDocument();

    fireEvent.click(within(climate).getByRole('button', { name: 'Save for 1 LGU' }));
    await waitFor(() => expect(supabaseMock.writesTo('lgu_climate', 'upsert')).toHaveLength(1));
    expect(supabaseMock.writesTo('lgu_climate', 'upsert')[0].payload).toEqual([
      expect.objectContaining({ lgu_psgc: 403426000, scenario: 'SSP2-4.5', temperature: { meanC: 26.6 } }),
    ]);
  });

  it('says what to run when the layers are not in the database yet', async () => {
    supabaseMock.setResponse('map_layers:select', { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } });
    render(<MapLayersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('map_layers.sql');
  });
});
