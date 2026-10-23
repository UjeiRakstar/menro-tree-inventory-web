import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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
              data-name={feature.properties.barangay ?? feature.properties.municipality}
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
  Bar: ({ dataKey, name, yAxisId }) => (
    <div data-testid="series" data-key={dataKey} data-name={name} data-axis={yAxisId} />
  ),
  XAxis: () => null,
  YAxis: ({ yAxisId, orientation }) => (
    <div data-testid="axis" data-id={yAxisId} data-side={orientation ?? 'left'} />
  ),
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});
const auth = vi.hoisted(() => ({ profile: null, lgu: null }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

import { supabaseMock } from '../test/supabaseMock.js';
import OfficeBioDashboard from './OfficeBioDashboard.jsx';

// Three in Santa Cruz (two of them hazards nobody is on), one in Pila.
const TREES = [
  { id: '1', species: 'Narra', barangay: 'Barangay III', barangay_psgc: 403426003, biodiversity_status: 'Endemic', latitude: 14.2823, longitude: 121.4163, is_leaning: true },
  { id: '2', species: 'Mango', barangay: 'San Pablo Sur', barangay_psgc: 403426020, biodiversity_status: 'Invasive', species_type: 'Invasive', latitude: 14.2795, longitude: 121.4121, is_decayed: true },
  { id: '3', species: 'Acacia', barangay: 'Santo Angel Sur', barangay_psgc: 403426025, biodiversity_status: 'Endemic', latitude: 14.284, longitude: 121.418 },
  { id: '4', species: 'Narra', barangay: 'Pansol', barangay_psgc: 403422005, biodiversity_status: 'Endemic', latitude: 14.233, longitude: 121.367 },
];
const LGUS = [
  { psgc: 403422000, name: 'Pila', label: 'Pila' },
  { psgc: 403426000, name: 'Santa Cruz', label: 'Santa Cruz' },
];
const SANTA_CRUZ = { role: 'lgu_admin', status: 'active', lgu_psgc: 403426000 };
const PGENRO = { role: 'pgenro', status: 'active' };

function show(profile, path = '/biodiversity-dashboard') {
  auth.profile = profile;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OfficeBioDashboard />
    </MemoryRouter>
  );
}
const treeCount = async () => within((await screen.findByText('Total Number of Trees')).closest('button'));

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('trees:select', { data: TREES, error: null });
  supabaseMock.setResponse('lgus:select', { data: LGUS, error: null });
  supabaseMock.setResponse('pending_trees:select', { data: [{ id: 9, species: 'Duhat', lgu_psgc: 403426000, status: 'pending' }], error: null });
});
afterEach(cleanup);

describe('the BioDashboard of a MENRO / CENRO', () => {
  it('is its own LGU, what needs action first, with no seals to choose and nothing to download', async () => {
    show(SANTA_CRUZ);
    expect(await screen.findByRole('heading', { level: 1, name: 'Santa Cruz Biodiversity Analytics' })).toBeInTheDocument();
    expect((await treeCount()).getByText('3')).toBeInTheDocument();
    const action = screen.getByRole('region', { name: 'What needs action' });
    expect(action).toHaveTextContent('Santa Cruz — what needs action');
    expect(await within(action).findByRole('button', { name: '2 — Hazards, nobody sent, Santa Cruz' })).toBeInTheDocument();
    // What needs action comes before the figures.
    const figures = (await screen.findByText('Total Number of Trees')).closest('button');
    expect(action.compareDocumentPosition(figures) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Pila' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download Data/ })).not.toBeInTheDocument();
    // Its map can be explored, and opens the office map in full.
    expect(screen.getByTestId('map').dataset.dragging).toBe('true');
    expect(screen.getByRole('link', { name: 'Enlarge map' })).toHaveAttribute('href', '/map');
  });

  it('narrows to a barangay from the list, the bars still comparing them all', async () => {
    show(SANTA_CRUZ);
    await screen.findByRole('heading', { level: 1, name: 'Santa Cruz Biodiversity Analytics' });
    fireEvent.change(screen.getByLabelText('Barangay'), { target: { value: 'Barangay III' } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Brgy. Barangay III, Santa Cruz Biodiversity Analytics' })).toBeInTheDocument();
    expect((await treeCount()).getByText('1')).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(screen.getAllByTestId('chart')[0].dataset.rows)).toHaveLength(3));
  });

  it('narrows what needs action to the barangay chosen too, and flies the map to it', async () => {
    show(SANTA_CRUZ);
    const action = await screen.findByRole('region', { name: 'What needs action' });
    await within(action).findByRole('button', { name: '2 — Hazards, nobody sent, Santa Cruz' });
    flyToBoundsSpy.mockClear();
    fireEvent.change(screen.getByLabelText('Barangay'), { target: { value: 'Barangay III' } });
    expect(action).toHaveTextContent('Brgy. Barangay III, Santa Cruz — what needs action');
    expect(within(action).getByRole('button', { name: '1 — Hazards, nobody sent, Brgy. Barangay III' })).toBeInTheDocument();
    await waitFor(() => expect(flyToBoundsSpy).toHaveBeenCalled());
  });

  it('deletes a tag still waiting from the list behind the Tags figure, after asking', async () => {
    supabaseMock.setResponse('pending_trees:delete', { data: [{ id: 'x' }], error: null });
    show(SANTA_CRUZ);
    const action = await screen.findByRole('region', { name: 'What needs action' });
    fireEvent.click(await within(action).findByRole('button', { name: '1 — Public tags awaiting a field check, Santa Cruz' }));
    const list = await screen.findByRole('dialog');
    fireEvent.click(within(list).getByRole('button', { name: /Delete the tag: Duhat/ }));
    expect(supabaseMock.writesTo('pending_trees', 'delete')).toHaveLength(0);
    fireEvent.click(within(within(list).getByRole('group', { name: 'Delete this tag?' })).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(supabaseMock.writesTo('pending_trees', 'delete')).toHaveLength(1));
  });

  it('leaves the community tags to Trees, where the office verifies them (22 October)', async () => {
    show(SANTA_CRUZ);
    expect(await screen.findByRole('region', { name: 'What needs action' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Tags/ })).not.toBeInTheDocument();
  });
});

describe('the BioDashboard of PGENRO', () => {
  it('is the province with its seals — no download — and the summary follows the seal chosen', async () => {
    show(PGENRO);
    expect(await screen.findByRole('heading', { level: 1, name: 'Laguna Biodiversity Analytics' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download Data/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What needs action' })).toHaveTextContent('Laguna — what needs action');
    fireEvent.click(screen.getByRole('tab', { name: 'Santa Cruz' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Santa Cruz Biodiversity Analytics' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What needs action' })).toHaveTextContent('Santa Cruz — what needs action');
  });

  it('deletes no tag from the province’s lists: that is the office’s', async () => {
    show(PGENRO);
    const action = await screen.findByRole('region', { name: 'What needs action' });
    fireEvent.click(await within(action).findByRole('button', { name: /Public tags awaiting a field check, all of Laguna/ }));
    const list = await screen.findByRole('dialog');
    expect(within(list).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  });

  it('reads the community tags, and verifies none', async () => {
    show(PGENRO);
    fireEvent.click(await screen.findByRole('tab', { name: /^Tags/ }));
    expect(await screen.findByText('Duhat')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Verify/ })).not.toBeInTheDocument();
  });
});

describe('the super admin (18 October)', () => {
  it('verifies the LGUs’ tags as their office would, where PGENRO only reads', async () => {
    show({ ...PGENRO, is_super_admin: true });
    fireEvent.click(await screen.findByRole('tab', { name: /^Tags/ }));
    expect(await screen.findByText('Duhat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify/ })).toBeInTheDocument();
  });
});
