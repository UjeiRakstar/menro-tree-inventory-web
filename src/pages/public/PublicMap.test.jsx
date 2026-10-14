import { render, screen, cleanup, waitFor, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// react-leaflet stand-ins. The map itself is inert; what matters is which layers
// the page asks for, with which geometry and styling.
// -----------------------------------------------------------------------------
const {
  flyToBoundsSpy,
  fitBoundsSpy,
  featureHandlers,
  siteHandlers,
  panes,
  mapState,
  mapEventHandlers,
} = vi.hoisted(() => ({
  flyToBoundsSpy: vi.fn(),
  fitBoundsSpy: vi.fn(),
  featureHandlers: new Map(),
  // Drawn areas carry a `municipality` of their own, so keying everything by
  // that name would have the forest in Santa Cruz overwrite Santa Cruz itself.
  siteHandlers: new Map(),
  panes: new Map(),
  // Street level by default, where the test trees stand far enough apart to be
  // drawn one by one. A test that wants them grouped turns this down.
  mapState: { zoom: 18 },
  mapEventHandlers: {},
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
    const into = pane === 'map-sites' ? siteHandlers : featureHandlers;
    const keyOf = (feature) =>
      pane === 'map-sites' ? feature.properties.id : feature.properties.municipality;
    for (const feature of data.features) {
      onEachFeature?.(feature, {
        feature,
        bindTooltip: () => {},
        setStyle: () => {},
        bringToFront: () => {},
        on: (handlers) => into.set(keyOf(feature), handlers),
      });
    }
    return (
      <div
        data-testid={pane === 'map-sites' ? 'site-layer' : 'geojson'}
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
  // The line from a fanned-out pin back to where its group stood.
  Polyline: ({ positions }) => (
    <div data-testid="spider-leg" data-positions={JSON.stringify(positions)} />
  ),
  Circle: () => <div data-testid="circle" />,
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  // A grouped set of trees. The icon is a Leaflet divIcon, so what is asserted
  // is the count the page asked it to carry, not how it was drawn.
  Marker: ({ position, title, eventHandlers }) => (
    <div
      data-testid="tree-cluster"
      data-center={JSON.stringify(position)}
      data-label={title}
      onClick={() => eventHandlers?.click?.()}
    />
  ),
  // Leaflet tells the page when a zoom settles; the page then re-reads the
  // zoom and regroups. Holding the handler lets a test do the telling.
  useMapEvents: (handlers) => {
    Object.assign(mapEventHandlers, handlers);
    return {};
  },
  useMap: () => ({
    flyToBounds: flyToBoundsSpy,
    fitBounds: fitBoundsSpy,
    flyTo: vi.fn(),
    getZoom: () => mapState.zoom,
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
import { loadBarangayIndex } from '../../lib/barangayLookup.js';
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
const clusters = () => screen.queryAllByTestId('tree-cluster');

/**
 * One tree's pin, found by where it stands.
 *
 * Not by its place in the list: the open tree is drawn last so it sits on top
 * of the others, so an index says nothing about which tree it is.
 */
const markerFor = (tree) =>
  markers().find((m) => m.dataset.center === JSON.stringify([tree.latitude, tree.longitude]));

/** What colour each tree is drawn, keyed by species and position. */
const fills = () =>
  Object.fromEntries(TREES.map((tree) => [tree.id, markerFor(tree)?.dataset.fill]));

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

// The page works out a tree's barangay from where it stands, by fetching the
// boundaries. Loading them up front makes the assertions about which barangay
// a tree is in deterministic rather than a race with that fetch.
beforeAll(async () => {
  await loadBarangayIndex();
});

beforeEach(() => {
  supabaseMock.reset();
  featureHandlers.clear();
  siteHandlers.clear();
  panes.clear();
  flyToBoundsSpy.mockClear();
  fitBoundsSpy.mockClear();
  mapState.zoom = 18;
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

  it('zooms to a city or municipality chosen from the selector and opens its panel', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.change(screen.getByLabelText('Zoom to a city or municipality'), {
      target: { value: 'Santa Cruz' },
    });

    const panel = await screen.findByRole('complementary', { name: 'Biodiversity of Santa Cruz' });
    expect(within(panel).getByRole('heading', { name: 'Santa Cruz' })).toBeInTheDocument();
    // Three of the five trees stand in Santa Cruz, one of them invasive.
    expect(within(panel).getByText('3')).toBeInTheDocument();
    await waitFor(() =>
      expect(flyToBoundsSpy).toHaveBeenLastCalledWith(
        boundsOfMunicipality('Santa Cruz'),
        expect.objectContaining({ maxZoom: 15 })
      )
    );
  });

  it('selects the area that was clicked on the map, and reports it', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    featureHandlers.get('Pila').click();

    const panel = await screen.findByRole('complementary', { name: 'Biodiversity of Pila' });
    // Scoped to its own row: both Pila trees stand in one barangay, so the
    // figure 2 and that barangay's count are both on screen.
    const treeCount = within(panel).getByText('Total Number of Trees').closest('div');
    expect(within(treeCount).getByText('2')).toBeInTheDocument();
    // The same six figures as the analytics page, including the three that
    // have no source yet.
    expect(within(panel).getByText('Total Number of Trees')).toBeInTheDocument();
    // The public six, not the forestry terms: this panel tells a resident what
    // is here, and standing timber volume is not that.
    expect(within(panel).getByText('Species Recorded')).toBeInTheDocument();
    expect(
      within(panel).queryByText('Mean Annual Increment of Above Ground Biomass')
    ).not.toBeInTheDocument();
    // All six figures are real now: the growth ones stopped waiting on an
    // area to divide by once they were computed per tree.
    expect(within(panel).queryByText('Not available yet')).not.toBeInTheDocument();
    // And where they stand inside it — the barangay their coordinates fall in,
    // not the one typed into the record. Both Pila trees were recorded under
    // different names; they are both in Bulilan Sur.
    expect(within(panel).getByText('Bulilan Sur')).toBeInTheDocument();
    expect(within(panel).queryByText('Pansol')).not.toBeInTheDocument();
  });

  it('links through to the full analytics for that place', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    featureHandlers.get('Santa Cruz').click();
    const panel = await screen.findByRole('complementary', { name: 'Biodiversity of Santa Cruz' });

    expect(within(panel).getByRole('link', { name: /View full analytics/ })).toHaveAttribute(
      'href',
      '/biodiversity?lgu=Santa%20Cruz'
    );
  });

  it('asks who wants the data from the panel', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    featureHandlers.get('Santa Cruz').click();
    const panel = await screen.findByRole('complementary', { name: 'Biodiversity of Santa Cruz' });
    fireEvent.click(within(panel).getByRole('button', { name: /Download Data/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('puts the area panel away when a tree is opened', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    featureHandlers.get('Santa Cruz').click();
    await screen.findByRole('complementary', { name: 'Biodiversity of Santa Cruz' });

    // One panel at a time: the two share the strip down the left of the map.
    fireEvent.click(markers()[0]);

    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Biodiversity of Santa Cruz' })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByRole('complementary', { name: /Details for/ })).toBeInTheDocument();
  });

  it('clicking the area already in focus clears it without moving the map', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    featureHandlers.get('Santa Cruz').click();
    await screen.findByRole('complementary', { name: 'Biodiversity of Santa Cruz' });
    const flightsAfterSelecting = flyToBoundsSpy.mock.calls.length;

    featureHandlers.get('Santa Cruz').click();
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Biodiversity of Santa Cruz' })
      ).not.toBeInTheDocument()
    );
    expect(flyToBoundsSpy.mock.calls).toHaveLength(flightsAfterSelecting);
  });

  it('dismissing the area panel leaves the view where the visitor put it', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.change(screen.getByLabelText('Zoom to a city or municipality'), {
      target: { value: 'Santa Cruz' },
    });
    const panel = await screen.findByRole('complementary', { name: 'Biodiversity of Santa Cruz' });

    fireEvent.click(within(panel).getByRole('button', { name: 'Close Santa Cruz' }));

    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Biodiversity of Santa Cruz' })
      ).not.toBeInTheDocument()
    );
    // Zooming back out to the province is not what dismissing a panel asks for:
    // someone who went down to their barangay wants the panel gone, not the
    // view thrown away.
    expect(flyToBoundsSpy).not.toHaveBeenCalledWith(LAGUNA_BOUNDS, expect.anything());
  });

  it('choosing "All of Laguna" from the selector does fly back out', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    const selector = screen.getByLabelText('Zoom to a city or municipality');
    fireEvent.change(selector, { target: { value: 'Santa Cruz' } });
    await screen.findByRole('complementary', { name: 'Biodiversity of Santa Cruz' });

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
    // The barangay its coordinates fall in, not the "Poblacion" on the record.
    // Barangay III says Barangay once: "Brgy. Barangay III" would say it twice.
    expect(within(panel).getByText('Barangay III, Santa Cruz, Laguna')).toBeInTheDocument();
    expect(await within(panel).findByText('Narra is the national tree.')).toBeInTheDocument();
  });

  it('opening a tree picks out the rest of its species and fades the others', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markerFor(TREES[0]));
    await screen.findByRole('complementary');

    // The open Narra, the other two Narra picked out, Mango and Acacia faded.
    expect(fills()).toEqual({
      1: '#064e3b',
      2: '#94a3b8',
      3: '#94a3b8',
      4: '#16a34a',
      5: '#16a34a',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close tree details' }));
    await waitFor(() => expect(screen.queryByRole('complementary')).not.toBeInTheDocument());
    expect(Object.values(fills()).every((fill) => fill === '#16a34a')).toBe(true);
  });

  it('brings a collapsed panel back when another tree is tapped', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markerFor(TREES[0]));
    const panel = await screen.findByRole('complementary');
    fireEvent.click(screen.getByRole('button', { name: 'Hide tree details' }));
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    // Otherwise tapping a pin looks like it does nothing.
    fireEvent.click(markerFor(TREES[1]));
    await waitFor(() => expect(panel).toHaveAttribute('aria-hidden', 'false'));
    expect(within(panel).getByRole('heading', { level: 2, name: 'Mango' })).toBeInTheDocument();
  });

  it('tapping another pin mid-close keeps the panel, on the new tree', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markerFor(TREES[0]));
    const panel = await screen.findByRole('complementary');

    fireEvent.click(screen.getByRole('button', { name: 'Close tree details' }));
    fireEvent.click(markerFor(TREES[1]));

    // The close was abandoned, not honoured 300ms later on the wrong tree.
    expect(within(panel).getByRole('heading', { level: 2, name: 'Mango' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('a badge in the panel picks out every tree sharing that trait', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markerFor(TREES[0]));
    const panel = await screen.findByRole('complementary');

    const badge = within(panel).getByRole('button', { name: /Highlight every endemic species/i });
    fireEvent.click(badge);

    // Endemic: the open Narra and the Acacia. The invasive Mango and the two
    // Narra with no status recorded fade back.
    expect(fills()).toEqual({
      1: '#064e3b',
      2: '#94a3b8',
      3: '#16a34a',
      4: '#94a3b8',
      5: '#94a3b8',
    });
    expect(badge).toHaveAttribute('aria-pressed', 'true');

    // Pressing it again returns to the species the panel is showing.
    fireEvent.click(badge);
    expect(fills()).toEqual({
      1: '#064e3b',
      2: '#94a3b8',
      3: '#94a3b8',
      4: '#16a34a',
      5: '#16a34a',
    });
  });

  it('groups trees that would be drawn on top of each other, and counts them', async () => {
    // Seen from across the province rather than from the street.
    mapState.zoom = 11;
    renderMap();

    // Three in Santa Cruz, two in Pila: two bubbles, no loose pins.
    await waitFor(() => expect(clusters()).toHaveLength(2));
    expect(screen.queryAllByTestId('tree-marker')).toHaveLength(0);
    expect(clusters().map((c) => c.dataset.label).sort()).toEqual([
      '2 tagged trees — zoom in to see them',
      '3 tagged trees — zoom in to see them',
    ]);
  });

  it('zooms into a group when it is tapped, rather than opening one of them', async () => {
    mapState.zoom = 11;
    renderMap();
    await waitFor(() => expect(clusters()).toHaveLength(2));

    fireEvent.click(clusters()[0]);

    // The corners of what is inside it, not a tree panel.
    expect(fitBoundsSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ maxZoom: expect.any(Number) })
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('never hides the open tree inside a group', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));
    fireEvent.click(markerFor(TREES[0]));
    await screen.findByRole('complementary');

    // Zooming out would otherwise fold the open tree under a number, which
    // looks like the pin you just tapped has gone.
    mapState.zoom = 11;
    act(() => mapEventHandlers.zoomend());

    await waitFor(() => expect(clusters().length).toBeGreaterThan(0));
    expect(markerFor(TREES[0])).toBeDefined();
    expect(markerFor(TREES[0]).dataset.fill).toBe('#064e3b');
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

    // Drawn areas go between the two: over the municipal outlines, under the
    // trees, so a forest never swallows a tap meant for a tree standing in it.
    expect(z('map-sites')).toBeGreaterThan(z('laguna-boundaries'));
    expect(z('tree-points')).toBeGreaterThan(z('map-sites'));
    expect(screen.getByTestId('site-layer').dataset.pane).toBe('map-sites');

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

describe('the spaces on the map, as against the points', () => {
  it('opens a land cover area on the opposite side from a tree', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    siteHandlers.get('lc-labuin-secondary-forest').click();

    const panel = await screen.findByRole('complementary', { name: 'Labuin Secondary Forest' });
    expect(within(panel).getByText('Secondary forest')).toBeInTheDocument();
    expect(within(panel).getByText('Brgy. Labuin, Santa Cruz, Laguna')).toBeInTheDocument();
  });

  it('holds a tree and the ground it stands on at the same time', async () => {
    // The whole reason areas open on the right: a visitor who taps a forest
    // while a tree is open should get both, not watch one shove out the other.
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markerFor(TREES[0]));
    await screen.findByRole('complementary', { name: /Narra/i });

    siteHandlers.get('ps-labuin').click();
    expect(await screen.findByRole('complementary', { name: 'Labuin Tree Planting Site' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /Narra/i })).toBeInTheDocument();
  });

  it('closes the area when the same one is tapped again', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    siteHandlers.get('ps-labuin').click();
    await screen.findByRole('complementary', { name: 'Labuin Tree Planting Site' });

    siteHandlers.get('ps-labuin').click();
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Labuin Tree Planting Site' })).not.toBeInTheDocument()
    );
  });

  it('does not re-focus the city when an area inside it is opened', async () => {
    // The sample areas carry a municipality of their own. Opening one must not
    // also fly the map to Santa Cruz.
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    flyToBoundsSpy.mockClear();
    siteHandlers.get('lc-gatid-brushland').click();
    await screen.findByRole('complementary', { name: 'Gatid Brushland' });
    expect(flyToBoundsSpy).not.toHaveBeenCalled();
  });
});

describe('groups that zooming cannot pull apart', () => {
  /** Two trees tagged a metre and a half from each other, as happens in a yard. */
  const TOUCHING = [
    { id: 90, species: 'Narra', latitude: 14.2823, longitude: 121.4163, barangay: 'Poblacion' },
    { id: 91, species: 'Mango', latitude: 14.28231, longitude: 121.41631, barangay: 'Poblacion' },
  ];

  it('never leaves a bubble standing at the furthest zoom', async () => {
    // The visitor zoomed all the way in and was still looking at a number.
    // There is nothing left to zoom into, so the group has to come apart here.
    supabaseMock.setResponse('trees:select', { data: TOUCHING, error: null });
    mapState.zoom = 21;
    renderMap();

    await waitFor(() => expect(markers()).toHaveLength(2));
    expect(clusters()).toHaveLength(0);
  });

  it('fans the pins out so each one can be tapped', async () => {
    supabaseMock.setResponse('trees:select', { data: TOUCHING, error: null });
    mapState.zoom = 21;
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(2));

    // Both have been moved off the spot they were stacked on...
    const drawn = markers().map((m) => JSON.parse(m.dataset.center));
    for (const tree of TOUCHING) {
      expect(drawn).not.toContainEqual([tree.latitude, tree.longitude]);
    }
    // ...and a leg is drawn back to where the group stood.
    expect(screen.getAllByTestId('spider-leg')).toHaveLength(2);
  });

  it('leaves well-spaced pins exactly where they were tagged', async () => {
    // Fanning pins that already have room would pull them CLOSER together.
    mapState.zoom = 21;
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    expect(screen.queryAllByTestId('spider-leg')).toHaveLength(0);
    for (const tree of TREES) {
      expect(markerFor(tree)).toBeTruthy();
    }
  });

  it('still groups them at a zoom where zooming would help', async () => {
    supabaseMock.setResponse('trees:select', { data: TOUCHING, error: null });
    mapState.zoom = 14;
    renderMap();

    await waitFor(() => expect(clusters()).toHaveLength(1));
    expect(clusters()[0].dataset.label).toContain('2 tagged trees');
  });
});

describe('on a phone, one panel at a time', () => {
  // Every panel is the full width of a phone screen, so two open at once is
  // one lying on top of the other. On a desktop the two sides coexist.
  let realMatchMedia;
  beforeEach(() => {
    realMatchMedia = globalThis.matchMedia;
    globalThis.matchMedia = (query) => ({
      media: query,
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });
  afterEach(() => {
    globalThis.matchMedia = realMatchMedia;
  });

  it('closes the tree when an area is opened', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(markerFor(TREES[0]));
    await screen.findByRole('complementary', { name: /Narra/i });

    act(() => siteHandlers.get('ps-labuin').click());
    await screen.findByRole('complementary', { name: 'Labuin Tree Planting Site' });
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: /Narra/i })).not.toBeInTheDocument()
    );
  });

  it('closes the area when a tree is opened', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    act(() => siteHandlers.get('ps-labuin').click());
    await screen.findByRole('complementary', { name: 'Labuin Tree Planting Site' });

    fireEvent.click(markerFor(TREES[0]));
    await screen.findByRole('complementary', { name: /Narra/i });
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Labuin Tree Planting Site' })
      ).not.toBeInTheDocument()
    );
  });

  it('closes the area when a city is opened', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    act(() => siteHandlers.get('ps-labuin').click());
    await screen.findByRole('complementary', { name: 'Labuin Tree Planting Site' });

    act(() => featureHandlers.get('Santa Cruz').click());
    await screen.findByRole('complementary', { name: /Santa Cruz/ });
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Labuin Tree Planting Site' })
      ).not.toBeInTheDocument()
    );
  });
});
