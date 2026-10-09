import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// The map is a picture here, and recharts needs a width jsdom will not give it.
// Both are stood in for, so the assertions are about what the page asks them to
// draw rather than how they draw it.
// -----------------------------------------------------------------------------
const { flyToBoundsSpy } = vi.hoisted(() => ({ flyToBoundsSpy: vi.fn() }));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, zoomControl, dragging, scrollWheelZoom }) => (
    <div
      data-testid="map"
      data-zoom-control={String(zoomControl)}
      data-dragging={String(dragging)}
      data-scroll-zoom={String(scrollWheelZoom)}
    >
      {children}
    </div>
  ),
  TileLayer: () => null,
  Polygon: () => <div data-testid="mask" />,
  GeoJSON: ({ data, onEachFeature }) => (
    <div data-testid="geojson" data-name={data.name}>
      {onEachFeature &&
        (data.features || []).map((feature, i) => {
          const handlers = {};
          const layer = {
            feature,
            setStyle: () => {},
            bindTooltip: () => {},
            on: (map) => Object.assign(handlers, map),
          };
          onEachFeature(feature, layer);
          return (
            <button
              key={i}
              type="button"
              data-testid="place"
              data-name={feature.properties.municipality}
              onClick={() => handlers.click?.({ target: layer })}
            />
          );
        })}
    </div>
  ),
  CircleMarker: ({ interactive }) => <div data-testid="pin" data-interactive={String(interactive)} />,
  useMap: () => ({ flyToBounds: flyToBoundsSpy }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ data, children }) => (
    <div data-testid="chart" data-rows={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ dataKey, name }) => <div data-testid="series" data-key={dataKey} data-name={name} />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import PublicDashboard from './PublicDashboard.jsx';

// Santa Cruz holds three, one of them invasive; Pila holds one.
const TREES = [
  { id: '1', species: 'Narra', barangay: 'Bubukal', dbh: '10 cm', biodiversity_status: 'Endemic', latitude: 14.2823, longitude: 121.4163 },
  { id: '2', species: 'Mango', barangay: 'Bubukal', dbh: '20 cm', biodiversity_status: 'Invasive', latitude: 14.2795, longitude: 121.4121 },
  { id: '3', species: 'Acacia', barangay: 'Pagsawitan', dbh: '4 cm', biodiversity_status: 'Endemic', latitude: 14.2840, longitude: 121.4180 },
  { id: '4', species: 'Narra', barangay: 'Pansol', dbh: '8 cm', biodiversity_status: 'Endemic', latitude: 14.2330, longitude: 121.3670 },
];

// The selection lives in the query string, so the page needs a router around it.
const renderDashboard = (path = '/biodiversity') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PublicDashboard />
    </MemoryRouter>
  );
const chartRows = () => JSON.parse(screen.getByTestId('chart').dataset.rows);
const seriesKeys = () => screen.getAllByTestId('series').map((s) => s.dataset.key);

beforeEach(() => {
  supabaseMock.reset();
  flyToBoundsSpy.mockClear();
  supabaseMock.setResponse('trees:select', { data: TREES, error: null });
});

afterEach(cleanup);

describe('PublicDashboard', () => {
  it('opens on the whole province', async () => {
    renderDashboard();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Laguna Biodiversity Analytics' })
    ).toBeInTheDocument();
    // All four trees, not one municipality's worth.
    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('follows the city or municipality that was picked', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 1, name: 'Laguna Biodiversity Analytics' });

    fireEvent.click(screen.getByRole('tab', { name: 'Santa Cruz' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Santa Cruz Biodiversity Analytics' })
    ).toBeInTheDocument();
    // Three of the four trees stand in Santa Cruz, one of them invasive.
    await waitFor(() => expect(chartRows().map((r) => r.name)).toEqual(['Bubukal', 'Pagsawitan']));
    expect(screen.getAllByTestId('pin')).toHaveLength(3);
  });

  it('charts places by LGU across the province, and by barangay inside one', async () => {
    renderDashboard();
    await waitFor(() => expect(chartRows().map((r) => r.name)).toEqual(['Santa Cruz', 'Pila']));

    fireEvent.click(screen.getByRole('tab', { name: 'Pila' }));

    await waitFor(() => expect(chartRows().map((r) => r.name)).toEqual(['Pansol']));
  });

  it('charts the pair whose figure was pressed', async () => {
    renderDashboard();
    await screen.findByText('Total Number of Trees');

    // Trees and invasives to begin with.
    await waitFor(() => expect(seriesKeys()).toEqual(['treeCount', 'invasiveCount']));

    // Anchored: the ⓘ beside the figure is its own button, named "What …".
    fireEvent.click(screen.getByRole('button', { name: /^Total Estimated Carbon Sequestered/ }));

    // Carbon: only the half of the pair that has a source.
    await waitFor(() => expect(seriesKeys()).toEqual(['carbonKg']));
    expect(screen.getByText(/Total Carbon Emission is not connected yet/)).toBeInTheDocument();
  });

  it('says a figure has no source rather than showing an invented one', async () => {
    renderDashboard();

    // Anchored: the ⓘ beside it is its own button, named "What …".
    const cover = await screen.findByRole('button', { name: /^Forest \/ Tree Cover Area/ });
    expect(within(cover).getByText('—')).toBeInTheDocument();
    expect(within(cover).getByText('Not available yet')).toBeInTheDocument();

    // And its pair charts nothing, with a reason.
    fireEvent.click(cover);
    expect(await screen.findByText(/have no source yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  });

  it('selects a city or municipality clicked on the map, and unselects it on a second click', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 1, name: 'Laguna Biodiversity Analytics' });

    const place = (name) => screen.getAllByTestId('place').find((p) => p.dataset.name === name);

    fireEvent.click(place('Santa Cruz'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Santa Cruz Biodiversity Analytics' })
    ).toBeInTheDocument();
    // The seal above follows the map, not just the other way round.
    expect(screen.getByRole('tab', { name: 'Santa Cruz' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(place('Santa Cruz'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Laguna Biodiversity Analytics' })
    ).toBeInTheDocument();
  });

  it('draws the map as a picture: no zoom, no panning, no clickable pins', async () => {
    renderDashboard();
    await screen.findByTestId('map');

    const map = screen.getByTestId('map');
    expect(map.dataset.zoomControl).toBe('false');
    expect(map.dataset.dragging).toBe('false');
    expect(map.dataset.scrollZoom).toBe('false');
    for (const pin of screen.getAllByTestId('pin')) {
      expect(pin.dataset.interactive).toBe('false');
    }
    // The boundaries are still drawn, with the cover over everything outside.
    expect(screen.getByTestId('mask')).toBeInTheDocument();
    expect(screen.getAllByTestId('geojson').map((l) => l.dataset.name)).toEqual([
      'Laguna-Municipalities',
      'Laguna-Province',
    ]);
  });

  it('asks who wants the data, and admits the download is not ready', async () => {
    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: /Download Data/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/First Name/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Email/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Purpose/)).toBeInTheDocument();

    fireEvent.submit(within(dialog).getByRole('button', { name: 'Download' }).closest('form'));

    expect(await screen.findByRole('status')).toHaveTextContent(/not available yet/i);
    expect(supabaseMock.calls.every((c) => c.op === 'select')).toBe(true);
  });

  it('closes the request form on Escape', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('button', { name: /Download Data/ }));
    await screen.findByRole('dialog');

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('explains each figure in its own ⓘ rather than in a footnote', async () => {
    renderDashboard();
    await screen.findByText('Total Number of Trees');

    // No sources list at the foot of the page any more.
    expect(screen.queryByRole('region', { name: 'Sources' })).not.toBeInTheDocument();

    // The citations live in the tooltips instead, one per figure.
    const tooltips = screen.getAllByRole('tooltip').map((t) => t.textContent);
    expect(tooltips.some((t) => /Lasco/.test(t))).toBe(true);
    expect(tooltips.some((t) => /Climate Change Commission \(July 31, 2024\)/.test(t))).toBe(true);
    expect(tooltips.some((t) => /diameter at breast height/.test(t))).toBe(true);
  });

  it('spells out the biomass figure instead of abbreviating it', async () => {
    renderDashboard();
    expect(
      await screen.findByText('Mean Annual Increment of Above Ground Biomass')
    ).toBeInTheDocument();
    expect(screen.queryByText('MAI AGB')).not.toBeInTheDocument();
  });

  it('opens on the place a link named', async () => {
    renderDashboard('/biodiversity?lgu=Santa%20Cruz');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Santa Cruz Biodiversity Analytics' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Santa Cruz' })).toHaveAttribute('aria-selected', 'true');
  });

  it('ignores a place that is not in Laguna', async () => {
    renderDashboard('/biodiversity?lgu=Atlantis');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Laguna Biodiversity Analytics' })
    ).toBeInTheDocument();
  });

  it('says so when the inventory cannot be read', async () => {
    supabaseMock.setResponse('trees:select', { data: null, error: { message: 'connection refused' } });
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('connection refused');
  });
});
