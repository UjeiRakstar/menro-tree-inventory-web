import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// react-leaflet stand-ins. The map itself is inert; what matters is which layers
// the page asks for, with which geometry and styling.
// -----------------------------------------------------------------------------
const { flyToBoundsSpy, featureHandlers, panes } = vi.hoisted(() => ({
  flyToBoundsSpy: vi.fn(),
  featureHandlers: new Map(),
  panes: new Map(),
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, bounds }) => (
    <div data-testid="map-container" data-bounds={JSON.stringify(bounds)}>
      {children}
    </div>
  ),
  TileLayer: ({ url }) => <div data-testid="tile-layer" data-url={url} />,
  Polygon: ({ positions, pathOptions, interactive, pane }) => (
    <div
      data-testid="mask"
      data-ring-count={String(positions.length)}
      data-outer-ring={JSON.stringify(positions[0])}
      data-fill={pathOptions?.fillColor}
      data-interactive={String(interactive)}
      data-pane={pane}
    />
  ),
  GeoJSON: ({ data, onEachFeature, pane }) => {
    for (const feature of data.features) {
      onEachFeature?.(feature, {
        feature,
        bindTooltip: () => {},
        setStyle: () => {},
        bringToFront: () => {},
        on: (handlers) => featureHandlers.set(feature.properties.municipality, handlers),
      });
    }
    return (
      <div
        data-testid="geojson"
        data-name={data.name}
        data-feature-count={String(data.features.length)}
        data-pane={pane}
      />
    );
  },
  CircleMarker: ({ center, pathOptions, eventHandlers, pane, children }) => (
    <div
      data-testid={pane === 'tree-points' ? 'tree-marker' : 'location-marker'}
      data-center={JSON.stringify(center)}
      data-fill={pathOptions?.fillColor}
      data-pane={pane}
      onClick={() => eventHandlers?.click?.()}
    >
      {children}
    </div>
  ),
  Circle: () => <div data-testid="circle" />,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({
    flyToBounds: flyToBoundsSpy,
    flyTo: vi.fn(),
    getPane: (name) => panes.get(name),
    createPane: (name) => {
      const element = { style: {} };
      panes.set(name, element);
      return element;
    },
  }),
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
  { id: 1, species: 'Narra', tree_category: 'Timber', biodiversity_status: 'Endemic', latitude: 14.2823, longitude: 121.4163, barangay: 'Poblacion' },
  // Stored as plain "Fruit", the spelling the category filter used to drop.
  { id: 2, species: 'Mango', tree_category: 'Fruit', biodiversity_status: 'Invasive', latitude: 14.2795, longitude: 121.4121, barangay: 'Poblacion' },
  { id: 3, species: 'Acacia', tree_category: 'Ornamental', biodiversity_status: 'Endemic', latitude: 14.2325, longitude: 121.3666, barangay: 'Santa Clara Sur' },
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

/** The blue dot only draws once the browser reports a position. */
function locateAt(latitude, longitude) {
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: {
      watchPosition: (onSuccess) => {
        onSuccess({ coords: { latitude, longitude, accuracy: 8 } });
        return 1;
      },
      clearWatch: () => {},
    },
  });
}

beforeEach(() => {
  supabaseMock.reset();
  featureHandlers.clear();
  panes.clear();
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

  it('clicking the area already in focus clears it without moving the map', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    featureHandlers.get('Santa Cruz').click();
    expect(await screen.findByText('In focus')).toBeInTheDocument();
    const flightsAfterSelecting = flyToBoundsSpy.mock.calls.length;

    featureHandlers.get('Santa Cruz').click();
    await waitFor(() => expect(screen.queryByText('In focus')).not.toBeInTheDocument());
    expect(flyToBoundsSpy.mock.calls).toHaveLength(flightsAfterSelecting);
  });

  it('dismissing the focus card leaves the view where the visitor put it', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.change(screen.getByLabelText('Zoom to a city or municipality'), {
      target: { value: 'Santa Cruz' },
    });
    await screen.findByText('In focus');
    const flightsAfterSelecting = flyToBoundsSpy.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Clear selected area' }));

    await waitFor(() => expect(screen.queryByText('In focus')).not.toBeInTheDocument());
    // Zooming back out to the province is not what dismissing a card asks for.
    expect(flyToBoundsSpy.mock.calls).toHaveLength(flightsAfterSelecting);
  });

  it('choosing "All of Laguna" from the selector does fly back out', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    const selector = screen.getByLabelText('Zoom to a city or municipality');
    fireEvent.change(selector, { target: { value: 'Santa Cruz' } });
    await screen.findByText('In focus');

    fireEvent.change(selector, { target: { value: '' } });

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

  it('opening a tree picks out the rest of its species and fades the others', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markers()[0]);
    await screen.findByRole('complementary');

    // The open Narra, then Mango and Acacia faded, then the other two Narra.
    expect(markers().map((m) => m.dataset.fill)).toEqual([
      '#064e3b',
      '#94a3b8',
      '#94a3b8',
      '#16a34a',
      '#16a34a',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Close tree details' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(markers().map((m) => m.dataset.fill)).toEqual([
      '#16a34a',
      '#16a34a',
      '#16a34a',
      '#16a34a',
      '#16a34a',
    ]);
  });

  it('brings a collapsed panel back when another tree is tapped', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markers()[0]);
    const panel = await screen.findByRole('complementary');
    fireEvent.click(screen.getByRole('button', { name: 'Hide tree details' }));
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    // Otherwise tapping a pin looks like it does nothing.
    fireEvent.click(markers()[1]);
    await waitFor(() => expect(panel).toHaveAttribute('aria-hidden', 'false'));
    expect(within(panel).getByRole('heading', { level: 2, name: 'Mango' })).toBeInTheDocument();
  });

  it('a badge in the panel picks out every tree sharing that trait', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markers()[0]);
    const panel = await screen.findByRole('complementary');

    const badge = within(panel).getByRole('button', { name: /Highlight every endemic species/i });
    fireEvent.click(badge);

    // Endemic: the open Narra and the Acacia. The invasive Mango and the two
    // Narra with no status recorded fade back.
    expect(markers().map((m) => m.dataset.fill)).toEqual([
      '#064e3b',
      '#94a3b8',
      '#16a34a',
      '#94a3b8',
      '#94a3b8',
    ]);
    expect(badge).toHaveAttribute('aria-pressed', 'true');

    // Pressing it again returns to the species the panel is showing.
    fireEvent.click(badge);
    expect(markers().map((m) => m.dataset.fill)).toEqual([
      '#064e3b',
      '#94a3b8',
      '#94a3b8',
      '#16a34a',
      '#16a34a',
    ]);
  });

  it('keeps the tree points in a pane above the boundaries, so they stay clickable', async () => {
    // Selecting a municipality brings its outline to the front; without panes
    // that outline lands on top of the points and eats their clicks.
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    const z = (name) => Number(panes.get(name).style.zIndex);
    expect(z('tree-points')).toBeGreaterThan(z('laguna-boundaries'));
    expect(z('laguna-boundaries')).toBeGreaterThan(z('laguna-mask'));

    expect(markers()[0].dataset.pane).toBe('tree-points');
    // The blue dot sits higher still: a boundary over it means a resident
    // cannot tap the thing that starts a tag.
    expect(z('user-location')).toBeGreaterThan(z('laguna-boundaries'));
    expect(screen.getByTestId('mask').dataset.pane).toBe('laguna-mask');
    for (const layer of screen.getAllByTestId('geojson')) {
      expect(layer.dataset.pane).toBe('laguna-boundaries');
    }

    // And a point still opens its panel after an area has been selected.
    featureHandlers.get('Santa Cruz').click();
    fireEvent.click(markers()[0]);
    expect(await screen.findByRole('complementary')).toBeInTheDocument();
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

  it('says when the trees could not be loaded, instead of showing a bare map', async () => {
    supabaseMock.setResponse('trees:select', { data: null, error: { message: 'connection refused' } });
    renderMap();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The tagged trees could not be loaded');
    expect(alert).toHaveTextContent('connection refused');
    expect(screen.queryAllByTestId('tree-marker')).toHaveLength(0);

    // Trying again picks the trees up once the connection is back.
    supabaseMock.setResponse('trees:select', { data: TREES, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(markers()).toHaveLength(5));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers no category filter buttons', () => {
    // Fruit/Timber/Ornamental pills were removed: the badges in the panel are
    // how a visitor narrows the map now.
    renderMap();

    expect(screen.queryByRole('button', { name: 'Fruit Trees' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Timber Trees' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ornamental Trees' })).not.toBeInTheDocument();
  });

  /** Put the page in the phone-sized view, or leave it on a desktop. */
  function setViewport(isMobile) {
    globalThis.matchMedia = (query) => ({
      media: query,
      matches: isMobile,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }

  it('lets a resident in the mobile view tag the tree they are standing at', async () => {
    locateAt(14.2823, 121.4163);
    setViewport(true);
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(screen.getAllByTestId('location-marker')[0]);

    // What to know before tagging comes first.
    expect(await screen.findByText(/standing as close to the tree as possible/)).toBeInTheDocument();
    const start = screen.getByRole('button', { name: 'Start Tagging' });
    expect(start).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(start);

    expect(await screen.findByRole('heading', { name: 'Tag a Tree' })).toBeInTheDocument();
    // The tag goes to pending_trees for the field team to verify; nothing is
    // written to the trees table from here.
    expect(supabaseMock.calls.some((c) => c.table === 'trees' && c.op !== 'select')).toBe(false);
  });

  it('sends a desktop visitor to their phone instead of tagging from a computer', async () => {
    locateAt(14.2823, 121.4163);
    setViewport(false);
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(screen.getAllByTestId('location-marker')[0]);

    expect(await screen.findByText(/Open this map on your phone/)).toBeInTheDocument();
    // No tagging flow on a desktop: the GPS fix would be the computer's.
    expect(screen.queryByRole('button', { name: 'Start Tagging' })).not.toBeInTheDocument();
    expect(supabaseMock.calls.some((c) => c.op !== 'select')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByText(/Open this map on your phone/)).not.toBeInTheDocument());
  });
});
