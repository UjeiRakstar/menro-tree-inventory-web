import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// react-leaflet stand-ins. The map itself is inert; what matters is which layers
// the page asks for, with which geometry and styling.
// -----------------------------------------------------------------------------
const { flyToBoundsSpy, featureHandlers } = vi.hoisted(() => ({
  flyToBoundsSpy: vi.fn(),
  featureHandlers: new Map(),
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, bounds }) => (
    <div data-testid="map-container" data-bounds={JSON.stringify(bounds)}>
      {children}
    </div>
  ),
  TileLayer: ({ url }) => <div data-testid="tile-layer" data-url={url} />,
  Polygon: ({ positions, pathOptions, interactive }) => (
    <div
      data-testid="mask"
      data-ring-count={String(positions.length)}
      data-outer-ring={JSON.stringify(positions[0])}
      data-fill={pathOptions?.fillColor}
      data-interactive={String(interactive)}
    />
  ),
  GeoJSON: ({ data, onEachFeature }) => {
    for (const feature of data.features) {
      onEachFeature?.(feature, {
        feature,
        bindTooltip: () => {},
        setStyle: () => {},
        bringToFront: () => {},
        on: (handlers) => featureHandlers.set(feature.properties.municipality, handlers),
      });
    }
    return <div data-testid="geojson" data-name={data.name} data-feature-count={String(data.features.length)} />;
  },
  CircleMarker: ({ center, pathOptions, eventHandlers, children }) => (
    <div
      data-testid="tree-marker"
      data-center={JSON.stringify(center)}
      data-fill={pathOptions?.fillColor}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </div>
  ),
  Circle: () => <div data-testid="circle" />,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ flyToBounds: flyToBoundsSpy, flyTo: vi.fn() }),
}));

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import { boundsOfMunicipality, LAGUNA_BOUNDS } from '../../lib/lagunaBoundaries.js';
import PublicMap from './PublicMap.jsx';

// Two trees in Santa Cruz, one in Pila, so the per-area count has something to
// be wrong about.
const TREES = [
  { id: 1, species: 'Narra', tree_category: 'Timber', latitude: 14.2823, longitude: 121.4163, barangay: 'Poblacion' },
  // Stored as plain "Fruit", the spelling the category filter used to drop.
  { id: 2, species: 'Mango', tree_category: 'Fruit', latitude: 14.2795, longitude: 121.4121, barangay: 'Poblacion' },
  { id: 3, species: 'Acacia', tree_category: 'Ornamental', latitude: 14.2325, longitude: 121.3666, barangay: 'Santa Clara Sur' },
  // Two more Narra — one in Pila, one back in Santa Cruz — so the distribution
  // list has something to order by.
  { id: 4, species: 'Narra', tree_category: 'Timber', latitude: 14.2330, longitude: 121.3670, barangay: 'Pansol' },
  { id: 5, species: 'Narra', tree_category: 'Timber', latitude: 14.2840, longitude: 121.4180, barangay: 'Bubukal' },
];

function renderMap() {
  return render(
    <MemoryRouter>
      <PublicMap />
    </MemoryRouter>
  );
}

const markers = () => screen.getAllByTestId('tree-marker');

beforeEach(() => {
  supabaseMock.reset();
  featureHandlers.clear();
  flyToBoundsSpy.mockClear();
  supabaseMock.setResponse('trees:select', { data: TREES, error: null });
  supabaseMock.setResponse('species_profiles:select', {
    data: { species: 'Narra', description: 'Narra is the national tree.', details: 'Used for furniture.' },
    error: null,
  });
});

afterEach(cleanup);

describe('PublicMap', () => {
  it('opens on the whole province rather than one municipality', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    const container = screen.getByTestId('map-container');
    expect(JSON.parse(container.dataset.bounds)).toEqual(LAGUNA_BOUNDS);
  });

  it('covers everything outside Laguna with a world polygon punched out by the province', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    const mask = screen.getByTestId('mask');
    expect(JSON.parse(mask.dataset.outerRing)).toEqual([
      [90, -180],
      [90, 180],
      [-90, 180],
      [-90, -180],
    ]);
    // World ring plus at least one hole for the province.
    expect(Number(mask.dataset.ringCount)).toBeGreaterThan(1);
    // The cover must not swallow clicks meant for the areas underneath it.
    expect(mask.dataset.interactive).toBe('false');
  });

  it('draws every Laguna city and municipality, and the province outline', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    const layers = screen.getAllByTestId('geojson');
    const byName = Object.fromEntries(layers.map((l) => [l.dataset.name, Number(l.dataset.featureCount)]));
    expect(byName['Laguna-Municipalities']).toBe(30);
    expect(byName['Laguna-Province']).toBe(1);
  });

  it('draws all tree points in the same green', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    const colors = new Set(markers().map((m) => m.dataset.fill));
    expect([...colors]).toEqual(['#16a34a']);
  });

  it('zooms to a city or municipality chosen from the selector and counts its trees', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.change(screen.getByLabelText('Zoom to a city or municipality'), {
      target: { value: 'Santa Cruz' },
    });

    // The name is also an <option>, so look for the card's own heading.
    expect(await screen.findByText('Santa Cruz', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('3 tagged trees')).toBeInTheDocument();
    await waitFor(() =>
      expect(flyToBoundsSpy).toHaveBeenLastCalledWith(
        boundsOfMunicipality('Santa Cruz'),
        expect.objectContaining({ maxZoom: 15 })
      )
    );
  });

  it('selects the area that was clicked on the map', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    featureHandlers.get('Pila').click();

    expect(await screen.findByText('Pila', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('2 tagged trees')).toBeInTheDocument();
  });

  it('clicking the area already in focus goes back to the whole province', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    featureHandlers.get('Santa Cruz').click();
    expect(await screen.findByText('In focus')).toBeInTheDocument();

    featureHandlers.get('Santa Cruz').click();
    await waitFor(() => expect(screen.queryByText('In focus')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(flyToBoundsSpy).toHaveBeenLastCalledWith(LAGUNA_BOUNDS, expect.objectContaining({ maxZoom: 12 }))
    );
  });

  it('opens the side panel for the tree that was tapped', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markers()[0]);

    const panel = await screen.findByRole('complementary');
    expect(within(panel).getByRole('heading', { level: 2, name: 'Narra' })).toBeInTheDocument();
    // The municipality is not stored on the tree; it comes from the boundaries.
    expect(within(panel).getByText('Brgy. Poblacion, Santa Cruz, Laguna')).toBeInTheDocument();
    expect(await within(panel).findByText('Narra is the national tree.')).toBeInTheDocument();
  });

  it('marks the open tree apart from the rest, and closes again', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markers()[0]);
    await screen.findByRole('complementary');

    const fills = markers().map((m) => m.dataset.fill);
    expect(fills[0]).toBe('#064e3b');
    expect(fills.slice(1)).toEqual(['#16a34a', '#16a34a', '#16a34a', '#16a34a']);

    fireEvent.click(screen.getByRole('button', { name: 'Close tree details' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(markers().map((m) => m.dataset.fill)).toEqual(['#16a34a', '#16a34a', '#16a34a', '#16a34a', '#16a34a']);
  });

  it('says the write-up is unpublished when the species has no row', async () => {
    supabaseMock.setResponse('species_profiles:select', { data: null, error: null });
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markers()[0]);

    const panel = await screen.findByRole('complementary');
    expect(
      await within(panel).findByText(/description for this species has not been published yet/i)
    ).toBeInTheDocument();
  });

  it('treats a missing species_profiles table as an unpublished write-up', async () => {
    // Running the app before supabase/species_profiles.sql must not break the panel.
    supabaseMock.setResponse('species_profiles:select', {
      data: null,
      error: { message: 'relation "public.species_profiles" does not exist' },
    });
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markers()[0]);

    const panel = await screen.findByRole('complementary');
    expect(
      await within(panel).findByText(/has not been published yet/i)
    ).toBeInTheDocument();
  });

  it('lists every city or municipality where this species was tagged', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markers()[0]);
    const panel = await screen.findByRole('complementary');
    fireEvent.click(within(panel).getByRole('tab', { name: 'Tree Details' }));

    const distribution = within(panel).getByRole('region', { name: 'Distribution by City/Municipality' });
    // All three Narra are counted, most-tagged area first; Mango and Acacia are not.
    expect(within(distribution).getAllByRole('listitem').map((c) => c.textContent)).toEqual([
      'Santa Cruz',
      'Pila',
    ]);
  });

  it('keeps the category filter working alongside the area selection', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(screen.getByRole('button', { name: 'Fruit Trees' }));
    await waitFor(() => expect(markers()).toHaveLength(1));

    fireEvent.change(screen.getByLabelText('Zoom to a city or municipality'), {
      target: { value: 'Santa Cruz' },
    });
    expect(await screen.findByText('1 tagged tree')).toBeInTheDocument();
  });
});
