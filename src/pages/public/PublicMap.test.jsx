import { render, screen, cleanup, waitFor, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// react-leaflet stand-ins. The map itself is inert; what matters is which layers
// the page asks for, with which geometry and styling.
// -----------------------------------------------------------------------------
const {
  flyToBoundsSpy,
  flyToSpy,
  fitBoundsSpy,
  featureHandlers,
  siteHandlers,
  labelClicks,
  panes,
  mapState,
  mapEventHandlers,
} = vi.hoisted(() => ({
  flyToBoundsSpy: vi.fn(),
  flyToSpy: vi.fn(),
  fitBoundsSpy: vi.fn(),
  featureHandlers: new Map(),
  // Drawn areas carry a `municipality` of their own, so keying everything by
  // that name would have the forest in Santa Cruz overwrite Santa Cruz itself.
  siteHandlers: new Map(),
  // A barangay's name label, by the barangay, when it takes a click.
  labelClicks: new Map(),
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
        getTooltip: () => ({
          on: (event, fn) => {
            if (event === 'click' && feature.properties.barangay) labelClicks.set(feature.properties.barangay, fn);
          },
        }),
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
  // PGENRO's survey layers drawn as pictures.
  ImageOverlay: ({ url, bounds, pane }) => (
    <div data-testid="image-overlay" data-url={url} data-bounds={JSON.stringify(bounds)} data-pane={pane} />
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  // A grouped set of trees — and the hall, and a drawing's corners, which are
  // markers too. The icon is a real Leaflet divIcon, so its markup is kept for
  // what a bubble is drawn in, and what it does not say.
  Marker: ({ position, title, icon, eventHandlers }) => (
    <div
      data-testid="tree-cluster"
      data-center={JSON.stringify(position)}
      data-label={title}
      data-icon={icon?.options?.html}
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
    flyTo: flyToSpy,
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
import PublicMap, { TreeMap } from './PublicMap.jsx';
import { PGENRO_ADMIN, SANTA_CRUZ_ADMIN } from '../../test/accounts.js';

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
  flyToSpy.mockClear();
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

  describe('grouping', () => {
    const bubbles = () => clusters().filter((m) => /tagged trees/.test(m.dataset.label ?? ''));
    const standsOnATree = (bubble) => TREES.some((tree) => bubble.dataset.center === at(tree));

    it('groups trees that would sit on top of each other at province scale', async () => {
      mapState.zoom = 11;
      renderMap();

      await waitFor(() => expect(bubbles().length).toBeGreaterThan(0));
      // Everything is accounted for: the bubbles' trees plus the lone pins.
      const grouped = bubbles().reduce((sum, b) => sum + Number(b.dataset.label.match(/^\d+/)[0]), 0);
      expect(grouped + screen.queryAllByTestId('tree-marker').length).toBe(TREES.length);
    });

    it('stands each bubble on one of its own trees, not on empty ground between them', async () => {
      mapState.zoom = 11;
      renderMap();

      await waitFor(() => expect(bubbles().length).toBeGreaterThan(0));
      for (const bubble of bubbles()) expect(standsOnATree(bubble)).toBe(true);
    });

    it('carries no number on the bubble; the count is in its label only', async () => {
      mapState.zoom = 11;
      renderMap();

      await waitFor(() => expect(bubbles().length).toBeGreaterThan(0));
      for (const bubble of bubbles()) {
        expect(bubble.dataset.icon).not.toMatch(/>\s*\d+\s*</);
        expect(bubble.dataset.label).toMatch(/^\d+ tagged trees/);
      }
    });

    it('zooms into a bubble when it is tapped', async () => {
      mapState.zoom = 11;
      renderMap();

      await waitFor(() => expect(bubbles().length).toBeGreaterThan(0));
      fitBoundsSpy.mockClear();
      fireEvent.click(bubbles()[0]);
      expect(fitBoundsSpy).toHaveBeenCalledTimes(1);
    });

    it('lets the groups come apart as the map zooms in', async () => {
      mapState.zoom = 11;
      renderMap();
      await waitFor(() => expect(bubbles().length).toBeGreaterThan(0));

      mapState.zoom = 18;
      act(() => mapEventHandlers.zoomend());
      expect(bubbles()).toHaveLength(0);
      expect(markers()).toHaveLength(5);
    });

    it('draws every tree where it was tagged at the furthest zoom, with nothing fanned out', async () => {
      mapState.zoom = 21;
      renderMap();

      await waitFor(() => expect(markers()).toHaveLength(5));
      expect(bubbles()).toHaveLength(0);
      expect(screen.queryAllByTestId('spider-leg')).toHaveLength(0);
      for (const tree of TREES) expect(markerFor(tree)).toBeDefined();
    });
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

  it('gives a sample the real climate of its LGU once CLIRAM is in', async () => {
    supabaseMock.setResponse('lgu_climate:select', {
      data: [{ lgu_psgc: 403426000, place: 'Santa Cruz', scenario: 'SSP2-4.5', temperature: { meanC: 26.6 }, rainfall: { annualMm: 2765 } }],
      error: null,
    });
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));
    siteHandlers.get('lc-labuin-secondary-forest').click();

    const panel = await screen.findByRole('complementary', { name: 'Labuin Secondary Forest' });
    await waitFor(() => expect(panel).toHaveTextContent('2,765 mm a year'));
    const rainfall = within(panel).getByText('2,765 mm a year').closest('li');
    expect(rainfall.querySelector('[data-provisional]')).toBeNull();
    // The rest of the sample is still made up, and still says so.
    expect(panel).toHaveTextContent('a sample area');
    const soil = within(panel).getByText('Macolod clay loam').closest('li');
    expect(soil.querySelector('[data-provisional="placeholder"]')).toBeTruthy();
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

// =============================================================================
// The office's map: the public map with an LGU office's tools on it.
// =============================================================================

/** One of each colour, a tree in Pila, a stump, in Santa Cruz otherwise. */
const OFFICE_TREES = [
  { id: 'red', species: 'Narra', latitude: 14.2823, longitude: 121.4163, is_leaning: true, assigned_to: null },
  { id: 'orange', species: 'Mango', latitude: 14.2795, longitude: 121.4121, is_decayed: true, assigned_to: 'juan@field.ph' },
  { id: 'yellow', species: 'Acacia', latitude: 14.284, longitude: 121.418, has_cutting_permit: true },
  { id: 'green', species: 'Santol', latitude: 14.281, longitude: 121.415 },
  { id: 'pila', species: 'Narra', latitude: 14.2325, longitude: 121.3666, is_leaning: true },
  { id: 'cut', species: 'Gmelina', latitude: 14.2815, longitude: 121.4155, task_status: 'Cut' },
];
const OUT_FOR_CHECKING = { id: 7, species: 'Duhat', latitude: 14.283, longitude: 121.417, status: 'dispatched', assigned_to: 'ana@field.ph' };

const at = (tree) => JSON.stringify([tree.latitude, tree.longitude]);
const officePin = (tree) => markers().find((m) => m.dataset.center === at(tree));

function renderOffice({ fence = null, path = '/', profile = null, state = null } = {}) {
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: path, state } : path]}>
      <TreeMap mode="admin" fence={fence} profile={profile} />
    </MemoryRouter>
  );
}

/** Click the map, the way Leaflet hands the page a click. */
function clickMap(lat, lng) {
  act(() => mapEventHandlers.click({ latlng: { lat, lng } }));
}

describe('the office map', () => {
  beforeEach(() => {
    supabaseMock.setResponse('trees:select', { data: OFFICE_TREES, error: null });
    supabaseMock.setResponse('pending_trees:select', { data: [OUT_FOR_CHECKING], error: null });
    delete mapEventHandlers.click;
  });

  it('colours each tree by what it needs, as the Command Center did', async () => {
    renderOffice();
    await waitFor(() => expect(officePin(OFFICE_TREES[0])).toBeTruthy());

    expect(officePin(OFFICE_TREES[0]).dataset.fill).toBe('#dc2626'); // hazard, nobody sent
    expect(officePin(OFFICE_TREES[1]).dataset.fill).toBe('#f97316'); // hazard, dispatched
    expect(officePin(OFFICE_TREES[2]).dataset.fill).toBe('#eab308'); // permit issued
    expect(officePin(OFFICE_TREES[3]).dataset.fill).toBe('#16a34a'); // healthy
  });

  it('draws a group in its most urgent colour, so a hazard is never hidden in green', async () => {
    mapState.zoom = 11;
    renderOffice();

    const groups = () => clusters().filter((m) => /tagged trees/.test(m.dataset.label ?? ''));
    await waitFor(() => expect(groups().length).toBeGreaterThan(0));
    // Santa Cruz's group is mostly orange, yellow and green, with one
    // undispatched hazard in it: the red Narra.
    for (const group of groups()) expect(group.dataset.icon).toContain('#dc2626');
  });

  it('shows the tags out for field checking in grey, and leaves stumps off', async () => {
    renderOffice();
    await waitFor(() => expect(officePin(OUT_FOR_CHECKING)).toBeTruthy());
    expect(officePin(OUT_FOR_CHECKING).dataset.fill).toBe('#94a3b8');
    // A tree already cut is not something to send anybody to.
    expect(officePin(OFFICE_TREES[5])).toBeUndefined();
  });

  it('reads every column, which the public map does not', async () => {
    renderOffice();
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    // Hazards, assignment and permits are what the colours are made of.
    expect(supabaseMock.queryFiltering('pending_trees', 'status')).toBeTruthy();
  });

  it('fences an LGU account to its own LGU', async () => {
    renderOffice({ fence: 'Santa Cruz' });
    await waitFor(() => expect(officePin(OFFICE_TREES[0])).toBeTruthy());

    // Pila's tree is outside the fence, so it is not on the map at all.
    expect(officePin(OFFICE_TREES[4])).toBeUndefined();
    // One LGU: nothing to choose between.
    expect(screen.queryByLabelText('Zoom to a city or municipality')).not.toBeInTheDocument();
    // The legend is behind its tile on the office map.
    fireEvent.click(screen.getByRole('button', { name: 'Show the legend' }));
    expect(screen.getByText('Outside Santa Cruz')).toBeInTheDocument();
  });

  it('gives PGENRO the whole province', async () => {
    renderOffice();
    await waitFor(() => expect(officePin(OFFICE_TREES[4])).toBeTruthy());
    expect(screen.getByLabelText('Zoom to a city or municipality')).toBeInTheDocument();
  });

  it('centres the map on the office’s own area', async () => {
    renderOffice({ fence: 'Santa Cruz' });
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    flyToBoundsSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Centre the map on Santa Cruz' }));
    expect(flyToBoundsSpy).toHaveBeenCalledWith(boundsOfMunicipality('Santa Cruz'), expect.any(Object));

    // And again: pressing it twice flies twice.
    fireEvent.click(screen.getByRole('button', { name: 'Centre the map on Santa Cruz' }));
    expect(flyToBoundsSpy).toHaveBeenCalledTimes(2);
  });
});

describe('what an office can do to a tree', () => {
  beforeEach(() => {
    supabaseMock.setResponse('trees:select', { data: OFFICE_TREES, error: null });
    supabaseMock.setResponse('pending_trees:select', { data: [OUT_FOR_CHECKING], error: null });
  });

  async function open(tree, profile = SANTA_CRUZ_ADMIN) {
    renderOffice({ profile });
    await waitFor(() => expect(officePin(tree)).toBeTruthy());
    fireEvent.click(officePin(tree));
    return screen.findByRole('complementary', { name: new RegExp(tree.species, 'i') });
  }

  it('makes a printable map of the layers shown, for the office’s LGU', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderOffice({ fence: 'Santa Cruz', profile: SANTA_CRUZ_ADMIN });
    await waitFor(() => expect(screen.queryByText('Loading map data…')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Show the legend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose map layers' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Map layers' })).getByRole('checkbox', { name: /Tagged trees/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Make a map or report of the layers shown' }));
    expect(open).toHaveBeenCalledWith('/map-sheet?lgu=Santa+Cruz&trees=0', '_blank', 'noopener');
    open.mockRestore();
  });

  it('leaves dispatching and permits to the MENRO / CENRO, not PGENRO', async () => {
    const panel = await open(OFFICE_TREES[0], PGENRO_ADMIN);
    // PGENRO still sees what the tree needs.
    expect(within(panel).getByText('Hazard — needs dispatching')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /Dispatch|Re-assign|Issue permit/ })).not.toBeInTheDocument();
    expect(panel).toHaveTextContent('done by the MENRO / CENRO');
  });

  it('lets the super admin dispatch and issue permits, for any LGU (18 October)', async () => {
    const panel = await open(OFFICE_TREES[0], { ...PGENRO_ADMIN, is_super_admin: true });
    expect(within(panel).getByRole('button', { name: 'Dispatch' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Issue permit' })).toBeInTheDocument();
  });

  it('dispatches someone to a hazard nobody is on', async () => {
    const panel = await open(OFFICE_TREES[0]);
    expect(within(panel).getByText('Hazard — needs dispatching')).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Dispatch' }));
    expect(await screen.findByRole('heading', { name: 'Dispatch Field Worker' })).toBeInTheDocument();
  });

  it('re-assigns a hazard somebody is already on, and says who', async () => {
    const panel = await open(OFFICE_TREES[1]);
    expect(within(panel).getByRole('button', { name: 'Re-assign' })).toBeEnabled();
    expect(within(panel).getByText(/juan@field\.ph/)).toBeInTheDocument();
  });

  it('will not dispatch anyone to a healthy tree, and says why', async () => {
    const panel = await open(OFFICE_TREES[3]);
    const dispatch = within(panel).getByRole('button', { name: 'Dispatch' });
    expect(dispatch).toBeDisabled();
    expect(dispatch).toHaveAccessibleDescription('Only a tree with a hazard is dispatched.');
  });

  it('issues a permit once', async () => {
    const panel = await open(OFFICE_TREES[2]);
    expect(within(panel).getByRole('button', { name: 'Permit issued' })).toBeDisabled();
  });

  it('opens the permit form for a tree without one', async () => {
    const panel = await open(OFFICE_TREES[0]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Issue permit' }));
    expect(await screen.findByRole('heading', { name: 'Issue Cutting Permit' })).toBeInTheDocument();
  });

  it('offers nothing on a resident’s tag until it has been checked', async () => {
    const panel = await open(OUT_FOR_CHECKING);
    expect(within(panel).getByText('Unverified — awaiting field check')).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Dispatch' })).not.toBeInTheDocument();
  });

  it('opens a tree sent over from the Action Board', async () => {
    renderOffice({ path: '/?tree=green&lat=14.281&lng=121.415' });
    expect(await screen.findByRole('complementary', { name: /Santol/i })).toBeInTheDocument();
  });
});

describe('drawing and measuring an area', () => {
  beforeEach(() => {
    supabaseMock.setResponse('trees:select', { data: OFFICE_TREES, error: null });
    delete mapEventHandlers.click;
  });

  const vertices = () => clusters().filter((m) => /click to remove|close the shape/.test(m.dataset.label ?? ''));

  async function startDrawing(fence = 'Santa Cruz') {
    renderOffice({ fence });
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Draw and measure an area' }));
    return screen.getByRole('region', { name: 'Measure area' });
  }

  it('opens a measure box that says what to do next', async () => {
    const box = await startDrawing();
    expect(box).toHaveTextContent('Click on the map to place the first point.');
  });

  it('places points where the map is clicked, and closes on the first', async () => {
    const box = await startDrawing();
    clickMap(14.2823, 121.4163);
    clickMap(14.2823, 121.4173);
    clickMap(14.2832, 121.4173);

    expect(vertices()).toHaveLength(3);
    expect(box).toHaveTextContent('Click the first point to close the shape');
    expect(within(box).getByText('Close the shape to measure')).toBeInTheDocument();

    const first = vertices().find((m) => m.dataset.label === 'Click to close the shape');
    fireEvent.click(first);

    // Closed: an area, in square metres, and the perimeter.
    expect(within(box).getByText(/^[\d,.]+ m²$/)).toBeInTheDocument();
    expect(within(box).getByText('Perimeter')).toBeInTheDocument();
  });

  it('refuses a point outside the LGU, and says why', async () => {
    const box = await startDrawing('Santa Cruz');
    clickMap(14.2325, 121.3666); // Pila
    expect(vertices()).toHaveLength(0);
    expect(within(box).getByRole('alert')).toHaveTextContent('outside Santa Cruz');
  });

  it('takes the last point back', async () => {
    const box = await startDrawing();
    clickMap(14.2823, 121.4163);
    clickMap(14.2823, 121.4173);
    fireEvent.click(within(box).getByRole('button', { name: /Undo/ }));
    expect(vertices()).toHaveLength(1);
  });

  it('stops drawing and clears the shape', async () => {
    await startDrawing();
    clickMap(14.2823, 121.4163);
    fireEvent.click(screen.getByRole('button', { name: 'Stop drawing', pressed: true }));
    expect(screen.queryByRole('region', { name: 'Measure area' })).not.toBeInTheDocument();
    expect(vertices()).toHaveLength(0);
  });
});

// Santa Cruz's barangays in src/data/Laguna-Barangays.geojson.
const SANTA_CRUZ_BARANGAYS = 26;

describe('the public map stays the public map', () => {
  it('has the same layers as the offices, the survey layers marked as coming', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    fireEvent.click(screen.getByRole('button', { name: /^Survey layer: No layer/ }));
    const survey = screen.getByRole('radiogroup', { name: 'Survey layer' });
    expect(within(survey).getByRole('radio', { name: /No layer/ })).toBeChecked();
    for (const name of ['Soil', 'Elevation', 'Flood', 'Landslide']) {
      expect(within(survey).getByRole('radio', { name: new RegExp(name) })).toBeDisabled();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Map layers' }));
    const panel = screen.getByRole('dialog', { name: 'Map layers' });
    expect(within(panel).getByText('Every tree tagged in Laguna')).toBeInTheDocument();
    expect(within(panel).getByRole('checkbox', { name: /Barangay boundaries/ })).toBeChecked();

    // Turning the trees off takes them off the map.
    fireEvent.click(within(panel).getByRole('checkbox', { name: /Tagged trees/ }));
    expect(screen.queryAllByTestId('tree-marker')).toHaveLength(0);
  });

  it('moves the legend aside while the layers panel is open, so neither covers the other', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));
    expect(screen.getByText('Land cover — tap for details')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Map layers' }));
    expect(screen.queryByText('Land cover — tap for details')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Map layers' })).getByRole('button', { name: /Close/ }));
    expect(screen.getByText('Land cover — tap for details')).toBeInTheDocument();
  });

  it('switches on a survey layer PGENRO has uploaded, and draws it', async () => {
    supabaseMock.setResponse('map_layers:select', {
      data: [{
        id: 'flood-1', kind: 'flood', active: true, picture_path: 'flood/1/picture.png',
        // Published in today's colours (palette.js), so drawn as it is.
        meta: { kind: 'flood', bounds: [[13.95, 120.98], [14.61, 121.62]], legend: [{ value: 3, label: 'High', colour: [8, 48, 107, 190] }] },
      }],
      error: null,
    });
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));
    fireEvent.click(screen.getByRole('button', { name: /^Survey layer/ }));
    const survey = screen.getByRole('radiogroup', { name: 'Survey layer' });

    const flood = await within(survey).findByRole('radio', { name: /Flood/ });
    await waitFor(() => expect(flood).toBeEnabled());
    expect(within(survey).getByRole('radio', { name: /Soil/ })).toBeDisabled();
    expect(screen.queryByTestId('image-overlay')).not.toBeInTheDocument();

    fireEvent.click(flood);
    // Chosen, the row folds back into its picture, which now says so.
    expect(screen.queryByRole('radiogroup', { name: 'Survey layer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Survey layer: Flood/ })).toBeInTheDocument();
    const overlay = await screen.findByTestId('image-overlay');
    expect(overlay.dataset.url).toMatch(/map-layers\/flood\/1\/picture\.png$/);
    expect(overlay.dataset.pane).toBe('layer-overlays');
    // Its key, in the legend.
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText(/Flood hazard/)).toBeInTheDocument();

    // One at a time: back to none takes it off.
    fireEvent.click(screen.getByRole('button', { name: /^Survey layer/ }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Survey layer' })).getByRole('radio', { name: /No layer/ }));
    expect(screen.queryByTestId('image-overlay')).not.toBeInTheDocument();
  });

  it('picks the base map from a stack of pictures', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));
    expect(screen.getByTestId('tile-layer').dataset.url).toMatch(/openstreetmap/);

    fireEvent.click(screen.getByRole('button', { name: /^Base map: Street map/ }));
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Base map' })).getByRole('radio', { name: /Satellite/ }));
    expect(screen.getByTestId('tile-layer').dataset.url).toMatch(/arcgisonline/);
    expect(screen.getByRole('button', { name: /^Base map: Satellite/ })).toBeInTheDocument();
  });

  it('opens a barangay from its name: its area, people and households, and its trees', async () => {
    supabaseMock.setResponse('barangay_stats:select', { data: { population: 1659, households: 414 }, error: null });
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));
    act(() => featureHandlers.get('Santa Cruz').click());
    await waitFor(() => expect(labelClicks.has('Alipit')).toBe(true));

    act(() => labelClicks.get('Alipit')());
    const panel = await screen.findByRole('complementary', { name: 'Biodiversity of Brgy. Alipit' });
    expect(panel).toHaveTextContent('Barangay of Santa Cruz');
    await waitFor(() => expect(panel).toHaveTextContent('Population1,659'));
    expect(panel).toHaveTextContent('Households414');
    expect(panel).toHaveTextContent(/Area[\d,.]+ ha/);
    // A barangay has no barangays of its own to list.
    expect(within(panel).queryByText('Tagged trees by barangay')).not.toBeInTheDocument();
  });

  it('draws the barangays of the town in focus, and only of that town', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));
    const barangayLayer = () => screen.getAllByTestId('geojson').find((g) => g.dataset.name === 'barangays');
    expect(barangayLayer()).toBeUndefined();

    act(() => featureHandlers.get('Santa Cruz').click());
    await waitFor(() => expect(barangayLayer()).toBeDefined());
    expect(Number(barangayLayer().dataset.featureCount)).toBe(SANTA_CRUZ_BARANGAYS);
    expect(barangayLayer().dataset.pane).toBe('barangay-boundaries');
  });

  it('has none of the office’s tools', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));
    expect(screen.queryByRole('button', { name: 'Draw and measure an area' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Centre the map/ })).not.toBeInTheDocument();

    fireEvent.click(markerFor(TREES[0]));
    const panel = await screen.findByRole('complementary', { name: /Narra/i });
    expect(within(panel).queryByRole('button', { name: 'Dispatch' })).not.toBeInTheDocument();
    // A resident is shown trees, not a work queue: none of the office's
    // red, orange or yellow reaches the public map.
    for (const marker of markers()) {
      expect(['#dc2626', '#f97316', '#eab308']).not.toContain(marker.dataset.fill);
    }
  });
});

describe('the office map, round three', () => {
  const HALL = [14.2794, 121.4157];

  function renderOfficeWith(props = {}) {
    return render(
      <MemoryRouter>
        <TreeMap mode="admin" fence="Santa Cruz" {...props} />
      </MemoryRouter>
    );
  }

  beforeEach(() => {
    supabaseMock.setResponse('trees:select', { data: TREES, error: null });
    delete mapEventHandlers.click;
  });

  it('has no "where am I" — the office flies to its hall instead', async () => {
    renderOfficeWith({ hall: HALL });
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Go to my location' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Centre the map on the Municipal Hall' }));
    expect(flyToSpy).toHaveBeenCalledWith(HALL, 17, expect.any(Object));
  });

  it('shows the hall on the map, and lets its own office move it', async () => {
    renderOfficeWith({ hall: HALL, canPinHall: true, onPinHall: vi.fn() });
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));

    const hall = clusters().find((m) => m.dataset.label === 'Municipal Hall');
    fireEvent.click(hall);
    const card = screen.getByRole('dialog', { name: 'Municipal Hall' });
    expect(within(card).getByRole('button', { name: 'Move pin' })).toBeInTheDocument();
  });

  it('asks the office to pin a hall it has not pinned, and saves the click', async () => {
    const onPinHall = vi.fn().mockResolvedValue({});
    renderOfficeWith({ canPinHall: true, onPinHall });
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Pin it now' }));
    expect(screen.getByText(/Click the map where the Municipal Hall stands/)).toBeInTheDocument();

    // Outside the LGU: refused, with a sentence.
    await act(async () => mapEventHandlers.click({ latlng: { lat: 14.2325, lng: 121.3666 } }));
    expect(await screen.findByText(/outside Santa Cruz/)).toBeInTheDocument();
    expect(onPinHall).not.toHaveBeenCalled();

    await act(async () => mapEventHandlers.click({ latlng: { lat: HALL[0], lng: HALL[1] } }));
    await waitFor(() => expect(onPinHall).toHaveBeenCalledWith(HALL));
    await waitFor(() =>
      expect(screen.queryByText(/Click the map where the Municipal Hall stands/)).not.toBeInTheDocument()
    );
  });

  it('does not ask PGENRO to pin a hall', async () => {
    render(
      <MemoryRouter>
        <TreeMap mode="admin" />
      </MemoryRouter>
    );
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Pin it now' })).not.toBeInTheDocument();
  });

  it('flies PGENRO to the Provincial Capitol, and shows the halls the LGUs pinned', async () => {
    const CAPITOL = [14.2786, 121.4161];
    render(
      <MemoryRouter>
        <TreeMap
          mode="admin"
          hall={CAPITOL}
          hallName="Provincial Capitol"
          otherHalls={[{ psgc: 403405000, name: 'Calamba City City Hall', position: [14.2117, 121.1653] }]}
        />
      </MemoryRouter>
    );
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Centre the map on the Provincial Capitol' }));
    expect(flyToSpy).toHaveBeenCalledWith(CAPITOL, 17, expect.any(Object));
    expect(clusters().find((m) => m.dataset.label === 'Calamba City City Hall')).toBeTruthy();
    expect(clusters().find((m) => m.dataset.label === 'Provincial Capitol')).toBeTruthy();
  });

  it('lets the super admin move an LGU’s hall, inside that LGU only', async () => {
    const onMoveOtherHall = vi.fn().mockResolvedValue({});
    const CALAMBA_HALL = { psgc: 403405000, lgu: 'Calamba', name: 'Calamba City City Hall', position: [14.2117, 121.1653] };
    render(
      <MemoryRouter>
        <TreeMap mode="admin" hallName="Provincial Capitol" otherHalls={[CALAMBA_HALL]} onMoveOtherHall={onMoveOtherHall} />
      </MemoryRouter>
    );
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    fireEvent.click(clusters().find((m) => m.dataset.label === 'Calamba City City Hall'));
    const card = screen.getByRole('dialog', { name: 'Calamba City City Hall' });
    fireEvent.click(within(card).getByRole('button', { name: 'Move pin' }));
    expect(card).toHaveTextContent('Click the map where the Calamba City City Hall stands.');

    // Santa Cruz is not Calamba.
    await act(async () => mapEventHandlers.click({ latlng: { lat: 14.2794, lng: 121.4157 } }));
    expect(await screen.findByText('That is outside Calamba City.')).toBeInTheDocument();
    expect(onMoveOtherHall).not.toHaveBeenCalled();

    await act(async () => mapEventHandlers.click({ latlng: { lat: 14.2117, lng: 121.1653 } }));
    await waitFor(() => expect(onMoveOtherHall).toHaveBeenCalledWith(CALAMBA_HALL, [14.2117, 121.1653]));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Calamba City City Hall' })).not.toBeInTheDocument());
  });

  it('opens no card on an LGU’s hall for PGENRO, who does not move it', async () => {
    render(
      <MemoryRouter>
        <TreeMap mode="admin" hallName="Provincial Capitol" otherHalls={[{ psgc: 403405000, lgu: 'Calamba', name: 'Calamba City City Hall', position: [14.2117, 121.1653] }]} />
      </MemoryRouter>
    );
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    fireEvent.click(clusters().find((m) => m.dataset.label === 'Calamba City City Hall'));
    expect(screen.queryByRole('dialog', { name: 'Calamba City City Hall' })).not.toBeInTheDocument();
  });

  it('asks PGENRO to pin the Capitol when it is not pinned yet', async () => {
    render(
      <MemoryRouter>
        <TreeMap mode="admin" hallName="Provincial Capitol" canPinHall onPinHall={vi.fn()} />
      </MemoryRouter>
    );
    expect(await screen.findByText(/Pin your Provincial Capitol./)).toBeInTheDocument();
    expect(screen.getByText(/until then it shows the whole of Laguna/)).toBeInTheDocument();
  });

  it('turns layers off and on, and lists the PGENRO ones as not uploaded yet', async () => {
    renderOfficeWith();
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: 'Choose map layers' }));
    const panel = screen.getByRole('dialog', { name: 'Map layers' });

    fireEvent.click(within(panel).getByRole('checkbox', { name: /Tagged trees/ }));
    expect(screen.queryAllByTestId('tree-marker')).toHaveLength(0);
    fireEvent.click(within(panel).getByRole('checkbox', { name: /Tagged trees/ }));
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole('button', { name: /^Survey layer/ }));
    const survey = screen.getByRole('radiogroup', { name: 'Survey layer' });
    for (const name of ['Soil', 'Elevation', 'Flood', 'Landslide']) {
      expect(within(survey).getByRole('radio', { name: new RegExp(name) })).toBeDisabled();
    }
    expect(within(survey).getAllByText('Not uploaded yet')).toHaveLength(4);
  });

  it('opens the legend with the key when a survey layer is chosen, and keeps the key out of the picker', async () => {
    supabaseMock.setResponse('map_layers:select', {
      data: [{
        id: 'flood-1', kind: 'flood', active: true, picture_path: 'flood/1/picture.png',
        meta: { kind: 'flood', bounds: [[13.95, 120.98], [14.61, 121.62]], legend: [{ value: 3, label: 'High', colour: [8, 48, 107, 190] }] },
      }],
      error: null,
    });
    renderOfficeWith();
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: /^Survey layer/ }));
    const flood = await within(screen.getByRole('radiogroup', { name: 'Survey layer' })).findByRole('radio', { name: /Flood/ });
    await waitFor(() => expect(flood).toBeEnabled());
    expect(screen.queryByText('High')).not.toBeInTheDocument();

    fireEvent.click(flood);
    const legend = screen.getByRole('dialog', { name: 'Legend' });
    expect(within(legend).getByText('High')).toBeInTheDocument();
    expect(within(legend).getByText(/Flood hazard/)).toBeInTheDocument();
  });

  it('keeps the legend shut until it is asked for', async () => {
    renderOfficeWith();
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    expect(screen.queryByRole('dialog', { name: 'Legend' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show the legend' }));
    expect(screen.getByRole('dialog', { name: 'Legend' })).toHaveTextContent('Hazard — needs dispatching');
  });

  it('puts no green wash over the town, and no "in focus" card', async () => {
    renderOfficeWith();
    await waitFor(() => expect(markers().length).toBeGreaterThan(0));
    act(() => featureHandlers.get('Santa Cruz').click());
    expect(screen.queryByText('In focus')).not.toBeInTheDocument();
  });
});

describe('the public map, round three', () => {
  it('closes a land cover or planting site panel when a town is opened', async () => {
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(5));

    act(() => siteHandlers.get('ps-labuin').click());
    await screen.findByRole('complementary', { name: 'Labuin Tree Planting Site' });

    act(() => featureHandlers.get('Santa Cruz').click());
    await screen.findByRole('complementary', { name: /Santa Cruz/ });
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Labuin Tree Planting Site' })).not.toBeInTheDocument()
    );
  });
});

// =============================================================================
// Saving what is drawn — phase 3.
// =============================================================================

describe('saving an area', () => {
  // Ten tagged trees of six species, all inside the triangle drawn below.
  const SPECIES = ['Narra', 'Molave', 'Banaba', 'Balete', 'Duhat', 'Santol'];
  const STAND = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i}`,
    species: SPECIES[i % SPECIES.length],
    latitude: 14.2824 + (i % 3) * 0.00005,
    longitude: 121.417 + (i % 4) * 0.00004,
  }));
  const SAVED = {
    id: 'area-1',
    kind: 'land-cover',
    name: 'Labuin Secondary Forest',
    cover_class: 'open-forest',
    municipality: 'Santa Cruz',
    barangay: 'Labuin',
    lgu_psgc: 403426000,
    created_by_role: 'lgu_admin',
    updated_at: '2026-10-15T08:00:00Z',
    geometry: {
      type: 'Polygon',
      coordinates: [[[121.4163, 14.2823], [121.4173, 14.2823], [121.4173, 14.2832], [121.4163, 14.2823]]],
    },
  };

  beforeEach(() => {
    supabaseMock.setResponse('trees:select', { data: STAND, error: null });
    supabaseMock.setResponse('map_areas:insert', { data: { id: 'new-area' }, error: null });
    delete mapEventHandlers.click;
  });

  const vertices = () => clusters().filter((m) => /click to remove|close the shape/.test(m.dataset.label ?? ''));

  async function drawTriangle(profile = SANTA_CRUZ_ADMIN) {
    renderOffice({ fence: profile?.role === 'lgu_admin' ? 'Santa Cruz' : null, profile });
    // The stand is grouped into one bubble at this zoom, so wait for the map, not a pin.
    await waitFor(() => expect(screen.queryByText('Loading map data…')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Draw and measure an area' }));
    clickMap(14.2823, 121.4163);
    clickMap(14.2823, 121.4173);
    clickMap(14.2832, 121.4173);
    fireEvent.click(vertices().find((m) => m.dataset.label === 'Click to close the shape'));
    return screen.getByRole('region', { name: 'Measure area' });
  }

  async function openForm(profile) {
    const box = await drawTriangle(profile);
    fireEvent.click(within(box).getByRole('button', { name: /Save this area/ }));
    return screen.findByRole('form', { name: 'Save this area' });
  }

  it('offers saving only to an office, and only once there is an area', async () => {
    const box = await drawTriangle(null);
    expect(within(box).queryByRole('button', { name: /Save this area/ })).not.toBeInTheDocument();
  });

  it('reviews what the map measured, and suggests a class from the trees inside', async () => {
    const form = await openForm();
    const measured = within(form).getByRole('region', { name: 'What the map measured' });
    expect(measured).toHaveTextContent(/Area[\d,.]+ m²/);
    expect(measured).toHaveTextContent('10 inside, 6 species');
    expect(within(form).getByRole('region', { name: 'Suggestion' })).toHaveTextContent('Suggested: Open forest');

    fireEvent.click(within(form).getByRole('button', { name: 'Use this' }));
    expect(within(form).getByLabelText(/Land cover \(NAMRIA\)/)).toHaveValue('open-forest');
  });

  it('says, for a planting site, that species suggestions wait on the layers', async () => {
    const form = await openForm();
    fireEvent.click(within(form).getByRole('radio', { name: 'Tree planting site' }));
    expect(await within(form).findByText(/Suggestions need PGENRO’s layers/)).toBeInTheDocument();
  });

  describe('an area brought in from a file, in Settings', () => {
    const square = (lng, lat, d = 0.001) => [[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]];
    // What Settings → Import areas hands the map.
    async function handOver(name, ring) {
      renderOffice({
        fence: 'Santa Cruz',
        profile: SANTA_CRUZ_ADMIN,
        state: { importArea: { name, geometry: { type: 'Polygon', coordinates: [ring] } } },
      });
      await waitFor(() => expect(screen.queryByText('Loading map data…')).not.toBeInTheDocument());
    }

    it('opens in the save form, drawn, with its name filled in', async () => {
      await handOver('Labuin Riverbank', square(121.4163, 14.2823));
      const form = await screen.findByRole('form', { name: 'Save this area' });
      expect(within(form).getByLabelText(/^Name/)).toHaveValue('Labuin Riverbank');
      // 0.001° a side at 14°N: about 108 m by 111 m.
      expect(within(form).getByRole('region', { name: 'What the map measured' })).toHaveTextContent('Area1.20 ha');
      expect(screen.getByRole('region', { name: 'Measure area' })).toHaveTextContent('Brought in from the file');
    });

    it('will not take an area outside the LGU', async () => {
      // Calamba, not Santa Cruz.
      await handOver('Elsewhere', square(121.165, 14.21));
      expect(await screen.findByRole('alert')).toHaveTextContent('outside Santa Cruz');
      expect(screen.queryByRole('form', { name: 'Save this area' })).not.toBeInTheDocument();
    });

    it('has no import of its own any more — that is in Settings', async () => {
      renderOffice({ fence: 'Santa Cruz', profile: SANTA_CRUZ_ADMIN });
      await waitFor(() => expect(screen.queryByText('Loading map data…')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /Bring in an area/ })).not.toBeInTheDocument();
    });
  });

  it('sends an office’s planting site to PGENRO as a request, and says so', async () => {
    const form = await openForm();
    fireEvent.click(within(form).getByRole('radio', { name: 'Tree planting site' }));
    expect(within(form).getByRole('note')).toHaveTextContent('This goes to PGENRO as a request');
    expect(within(form).getByRole('button', { name: 'Send the request' })).toBeInTheDocument();
  });

  it('lets PGENRO save a planting site outright', async () => {
    const form = await openForm(PGENRO_ADMIN);
    fireEvent.click(within(form).getByRole('radio', { name: 'Tree planting site' }));
    expect(within(form).queryByRole('note')).not.toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Save the area' })).toBeInTheDocument();
  });

  it('says what is missing before saving', async () => {
    const form = await openForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Save the area' }));
    expect(await within(form).findByText('Give the area a name.')).toBeInTheDocument();
    expect(within(form).getByText('Choose its land cover.')).toBeInTheDocument();
    expect(supabaseMock.writesTo('map_areas', 'insert')).toHaveLength(0);
  });

  it('saves the polygon, its class and where it is', async () => {
    const form = await openForm();
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Labuin Forest' } });
    fireEvent.change(within(form).getByLabelText(/Land cover \(NAMRIA\)/), { target: { value: 'closed-forest' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the area' }));

    await waitFor(() => expect(supabaseMock.writesTo('map_areas', 'insert')).toHaveLength(1));
    const [insert] = supabaseMock.writesTo('map_areas', 'insert');
    expect(insert.payload).toMatchObject({
      kind: 'land-cover',
      name: 'Labuin Forest',
      cover_class: 'closed-forest',
      suggested_class: 'open-forest',
      trees_inside: 10,
      municipality: 'Santa Cruz',
      designation: null,
    });
    expect(insert.payload.geometry.coordinates[0]).toHaveLength(4);
    expect(insert.payload.area_m2).toBeGreaterThan(0);
    // Saved: the drawing and the form close.
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Save this area' })).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Measure area' })).not.toBeInTheDocument();
  });

  it('will not claim a legal designation without its document', async () => {
    const form = await openForm();
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Protected' } });
    fireEvent.change(within(form).getByLabelText(/Land cover \(NAMRIA\)/), { target: { value: 'closed-forest' } });
    fireEvent.change(within(form).getByLabelText('Legal designation'), { target: { value: 'protected-area' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the area' }));
    expect(await within(form).findByText('A legal designation needs its document (PDF).')).toBeInTheDocument();
  });

  it('warns that a document is published before taking one, then uploads it with the area', async () => {
    const form = await openForm();
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Zoned' } });
    fireEvent.change(within(form).getByLabelText(/Land cover \(NAMRIA\)/), { target: { value: 'open-forest' } });
    fireEvent.change(within(form).getByLabelText('Legal designation'), { target: { value: 'zoning' } });
    fireEvent.change(within(form).getByLabelText(/Kind of document/), { target: { value: 'Municipal Ordinance' } });
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: 'Zoning Ordinance of Santa Cruz' } });

    fireEvent.click(within(form).getByRole('button', { name: /Attach the PDF/ }));
    const notice = screen.getByRole('dialog', { name: 'Before you upload' });
    expect(notice).toHaveTextContent('published on the website for anyone to read');
    fireEvent.click(within(notice).getByRole('button', { name: /I understand/ }));

    const pdf = new File(['%PDF-1.4'], 'zoning.pdf', { type: 'application/pdf' });
    fireEvent.change(within(form).getByLabelText('Document PDF'), { target: { files: [pdf] } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the area' }));

    await waitFor(() => expect(supabaseMock.writesTo('map_areas', 'insert')).toHaveLength(1));
    const [bucket, path] = supabaseMock.supabase.storage.upload.mock.calls[0];
    expect(bucket).toBe('area-documents');
    // Filed in the office's own folder, which is all the database lets it write.
    expect(path).toMatch(/^403426000\/.+\.pdf$/);
    expect(supabaseMock.writesTo('map_areas', 'insert')[0].payload).toMatchObject({
      designation: 'zoning',
      doc_type: 'Municipal Ordinance',
      doc_title: 'Zoning Ordinance of Santa Cruz',
      doc_url: expect.stringMatching(/^https:\/\/storage\.test\/area-documents\/403426000\//),
    });
  });

  it('says which file to run when areas cannot be saved yet', async () => {
    supabaseMock.setResponse('map_areas:insert', {
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.map_areas'" },
    });
    const form = await openForm();
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'A' } });
    fireEvent.change(within(form).getByLabelText(/Land cover \(NAMRIA\)/), { target: { value: 'open-forest' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save the area' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('map_areas.sql');
  });

  describe('a saved area', () => {
    beforeEach(() => {
      supabaseMock.setResponse('map_areas:select', { data: [SAVED], error: null });
      supabaseMock.setResponse('lgus:select', { data: [{ psgc: 403426000, label: 'Santa Cruz' }], error: null });
    });

    async function openSaved(profile) {
      if (profile) renderOffice({ fence: profile.role === 'lgu_admin' ? 'Santa Cruz' : null, profile });
      else renderMap();
      await waitFor(() => expect(siteHandlers.has('area-1')).toBe(true));
      act(() => siteHandlers.get('area-1').click());
      return screen.getByRole('complementary', { name: /^Labuin Secondary Forest/ });
    }

    it('shows what PGENRO’s layers and CLIRAM say about the ground', async () => {
      supabaseMock.setResponse('map_areas:select', {
        data: [{
          ...SAVED,
          layer_facts: {
            soil: [{ series: 'Marikina', description: 'Marikina silty clay loam', zone: 'Lowlands', share: 1 }],
            elevation: { min: 11, max: 18, mean: 14 },
            flood: { low: 36822, medium: 0, high: 0, total: 36822 },
          },
        }],
        error: null,
      });
      supabaseMock.setResponse('lgu_climate:select', {
        data: [{ lgu_psgc: 403426000, place: 'Santa Cruz', scenario: 'SSP2-4.5', temperature: { meanC: 26.6 }, rainfall: { annualMm: 2765 } }],
        error: null,
      });
      const panel = await openSaved(null);
      expect(panel).toHaveTextContent('Lowland — 11–18 m asl');
      expect(panel).toHaveTextContent('Marikina silty clay loam');
      expect(panel).toHaveTextContent('2,765 mm a year');
      expect(panel).toHaveTextContent('26.6 °C');
      expect(panel).toHaveTextContent(/36,822[\d,.]* m²|36,822 m²/);
      expect(panel).toHaveTextContent('DOST-PAGASA CLIRAM');
    });

    it('replaces the samples on the public map, real and planning-only', async () => {
      const panel = await openSaved(null);
      // One layer, drawing only the saved area: the samples are gone.
      expect(screen.getByTestId('site-layer').dataset.featureCount).toBe('1');
      expect(panel).toHaveTextContent('Open forest');
      expect(panel).toHaveTextContent('For planning purposes only. Not a land title');
      expect(panel).not.toHaveTextContent('everything but the area');
      expect(within(panel).queryByRole('button', { name: /Edit|Delete|Propose/ })).not.toBeInTheDocument();
    });

    it('is a request PGENRO approves or declines, when an office asked for a planting site', async () => {
      const request = { ...SAVED, kind: 'planting-site', cover_class: null, approval: 'requested' };
      supabaseMock.setResponse('map_areas:select', { data: [request], error: null });
      supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
      const panel = await openSaved(PGENRO_ADMIN);
      const asked = within(panel).getByRole('region', { name: 'Planting site request' });
      expect(asked).toHaveTextContent('Requested by the Santa Cruz MENRO / CENRO');
      expect(within(panel).queryByRole('button', { name: /Edit|Propose/ })).not.toBeInTheDocument();
      fireEvent.click(within(asked).getByRole('button', { name: 'Approve' }));
      await waitFor(() =>
        expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('decide_planting_request', { p_id: 'area-1', p_approve: true, p_note: null })
      );
    });

    it('tells the office that asked why PGENRO declined, and lets it ask again', async () => {
      const declined = { ...SAVED, kind: 'planting-site', cover_class: null, approval: 'declined', review_note: 'Inside the easement' };
      supabaseMock.setResponse('map_areas:select', { data: [declined], error: null });
      const panel = await openSaved(SANTA_CRUZ_ADMIN);
      expect(within(panel).getByRole('status')).toHaveTextContent('PGENRO declined this request.“Inside the easement”');
      expect(within(panel).getByRole('button', { name: /Edit/ })).toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: /Withdraw/ })).toBeInTheDocument();
    });

    it('makes a map of this one area, from its panel', async () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      const panel = await openSaved(SANTA_CRUZ_ADMIN);
      fireEvent.click(within(panel).getByRole('button', { name: /Make a map of this area/ }));
      expect(open).toHaveBeenCalledWith('/map-sheet?area=area-1', '_blank', 'noopener');
      open.mockRestore();
    });

    it('can be edited and deleted by the office that drew it', async () => {
      const panel = await openSaved(SANTA_CRUZ_ADMIN);
      expect(within(panel).getByRole('button', { name: /Edit/ })).toBeInTheDocument();

      fireEvent.click(within(panel).getByRole('button', { name: /Delete/ }));
      fireEvent.click(within(screen.getByRole('alertdialog', { name: /Delete Labuin/ })).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(supabaseMock.writesTo('map_areas', 'delete')).toHaveLength(1));
      expect(supabaseMock.writesTo('map_areas', 'delete')[0].filters).toContainEqual(['id', 'area-1']);
    });

    it('takes its document down with it when it is deleted', async () => {
      supabaseMock.setResponse('map_areas:select', {
        data: [{ ...SAVED, designation: 'zoning', doc_type: 'Ordinance', doc_title: 'Zoning',
          doc_url: 'https://storage.test/area-documents/403426000/old.pdf' }],
        error: null,
      });
      const panel = await openSaved(SANTA_CRUZ_ADMIN);
      fireEvent.click(within(panel).getByRole('button', { name: /Delete/ }));
      fireEvent.click(within(screen.getByRole('alertdialog', { name: /Delete Labuin/ })).getByRole('button', { name: 'Delete' }));
      await waitFor(() =>
        expect(supabaseMock.supabase.storage.remove).toHaveBeenCalledWith('area-documents', ['403426000/old.pdf'])
      );
    });

    it('opens for editing with its boundary back on the map and its details filled in', async () => {
      const panel = await openSaved(SANTA_CRUZ_ADMIN);
      fireEvent.click(within(panel).getByRole('button', { name: /Edit/ }));

      const form = await screen.findByRole('form', { name: 'Edit this area' });
      expect(within(form).getByLabelText(/^Name/)).toHaveValue('Labuin Secondary Forest');
      expect(within(form).getByLabelText(/Land cover \(NAMRIA\)/)).toHaveValue('open-forest');
      expect(vertices()).toHaveLength(3);

      fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Labuin Forest' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Save the area' }));
      await waitFor(() => expect(supabaseMock.writesTo('map_areas', 'update')).toHaveLength(1));
      const [update] = supabaseMock.writesTo('map_areas', 'update');
      expect(update.payload.name).toBe('Labuin Forest');
      expect(update.filters).toContainEqual(['id', 'area-1']);
    });

    it('takes PGENRO’s change to an office’s area as a proposal, not an edit', async () => {
      const panel = await openSaved(PGENRO_ADMIN);
      expect(within(panel).queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
      fireEvent.click(within(panel).getByRole('button', { name: /Propose a change/ }));

      const form = await screen.findByRole('form', { name: 'Propose a change' });
      fireEvent.change(within(form).getByLabelText(/Land cover \(NAMRIA\)/), { target: { value: 'closed-forest' } });
      fireEvent.change(within(form).getByLabelText(/what and why/), { target: { value: 'The canopy is closed.' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Send the proposal' }));

      await waitFor(() => expect(supabaseMock.writesTo('map_area_proposals', 'insert')).toHaveLength(1));
      expect(supabaseMock.writesTo('map_areas', 'update')).toHaveLength(0);
      expect(supabaseMock.writesTo('map_area_proposals', 'insert')[0].payload).toMatchObject({
        area_id: 'area-1',
        note: 'The canopy is closed.',
        changes: expect.objectContaining({ cover_class: 'closed-forest' }),
      });
    });

    it('shows the MENRO what PGENRO proposes, to approve or decline', async () => {
      supabaseMock.setResponse('map_area_proposals:select', {
        data: [{ id: 'p1', area_id: 'area-1', status: 'pending', note: 'Closed canopy', changes: { ...SAVED, cover_class: 'closed-forest' } }],
        error: null,
      });
      supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
      const panel = await openSaved(SANTA_CRUZ_ADMIN);

      const proposal = await within(panel).findByRole('region', { name: "PGENRO's proposal" });
      expect(proposal).toHaveTextContent('Land cover: Open forest → Closed forest');
      expect(proposal).toHaveTextContent('Closed canopy');
      fireEvent.click(within(proposal).getByRole('button', { name: 'Approve and apply' }));
      await waitFor(() =>
        expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('approve_area_proposal', { p_id: 'p1', p_note: null })
      );
    });

    it('opens the area a header link points at, with its proposal', async () => {
      supabaseMock.setResponse('map_area_proposals:select', {
        data: [{ id: 'p1', area_id: 'area-1', status: 'pending', changes: { ...SAVED, name: 'Renamed' } }],
        error: null,
      });
      renderOffice({ fence: 'Santa Cruz', profile: SANTA_CRUZ_ADMIN, path: '/?area=area-1' });
      const panel = await screen.findByRole('complementary', { name: 'Labuin Secondary Forest' });
      expect(await within(panel).findByRole('region', { name: "PGENRO's proposal" })).toHaveTextContent('Name: Labuin Secondary Forest → Renamed');
      expect(flyToSpy).toHaveBeenCalled();
    });

    it('updates live when an area or a proposal changes elsewhere, without a refresh', async () => {
      await openSaved(SANTA_CRUZ_ADMIN);
      // The latest listener: the stand-in channel keeps every earlier test's too.
      const listenerFor = (table) =>
        supabaseMock.supabase.channel().on.mock.calls.filter(([, filter]) => filter?.table === table).pop()?.[2];
      const before = supabaseMock.writesTo('map_areas', 'select').length;

      // PGENRO proposes, somewhere else: the database tells the page.
      supabaseMock.setResponse('map_area_proposals:select', {
        data: [{ id: 'p9', area_id: 'area-1', status: 'pending', changes: { ...SAVED, name: 'From PGENRO' } }],
        error: null,
      });
      act(() => listenerFor('map_area_proposals')());

      const panel = screen.getByRole('complementary', { name: 'Labuin Secondary Forest' });
      expect(await within(panel).findByRole('region', { name: "PGENRO's proposal" })).toHaveTextContent('From PGENRO');
      expect(supabaseMock.writesTo('map_areas', 'select').length).toBeGreaterThan(before);
      expect(listenerFor('map_areas')).toBeTypeOf('function');
    });

    it('gives another LGU’s office nothing to change', async () => {
      const panel = await openSaved({ ...SANTA_CRUZ_ADMIN, lgu_psgc: 403405000 });
      expect(within(panel).queryByRole('button', { name: /Edit|Delete|Propose/ })).not.toBeInTheDocument();
    });
  });
});

describe('trees tagged and not yet verified (19 October)', () => {
  const WAITING = { id: 'w1', species: 'Mahogany', latitude: 14.281, longitude: 121.412, barangay: 'Bubukal', source: 'import', status: 'pending' };

  it('shows them to the public, grey, so nobody tags one twice', async () => {
    supabaseMock.supabase.rpc.mockImplementation(async (name) =>
      name === 'public_unverified_trees' ? { data: [WAITING], error: null } : { data: null, error: null }
    );
    renderMap();
    await waitFor(() => expect(markers()).toHaveLength(6));
    expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('public_unverified_trees');
    const pin = markerFor(WAITING);
    expect(pin.dataset.fill).toBe('#94a3b8');
    expect(markerFor(TREES[0]).dataset.fill).not.toBe('#94a3b8');
    expect(screen.getByText('Tagged, not yet verified')).toBeInTheDocument();

    fireEvent.click(pin);
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('From the LGU’s inventory.');
    expect(note).toHaveTextContent('It is already tagged — no need to tag it again.');
  });
});

describe('an office deleting a tag still waiting', () => {
  const WAITING_TAG = { id: 'p9', species: 'Duhat', latitude: 14.283, longitude: 121.417, status: 'pending', source: 'community', barangay: 'Labuin' };

  const renderOfficeMap = () => renderOffice({ profile: SANTA_CRUZ_ADMIN });
  const pinOf = (tag) => officePin(tag);

  beforeEach(() => {
    supabaseMock.setResponse('pending_trees:select', { data: [WAITING_TAG], error: null });
  });

  it('deletes it from its panel, after asking', async () => {
    supabaseMock.setResponse('pending_trees:delete', { data: [{ id: 'p9' }], error: null });
    renderOfficeMap();
    await waitFor(() => expect(pinOf(WAITING_TAG)).toBeTruthy());
    fireEvent.click(pinOf(WAITING_TAG));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this tag' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete this tag?' });
    expect(supabaseMock.writesTo('pending_trees', 'delete')).toHaveLength(0);
    fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(supabaseMock.writesTo('pending_trees', 'delete')).toHaveLength(1));
    expect(supabaseMock.writesTo('pending_trees', 'delete')[0].filters).toEqual([['id', 'p9']]);
    await waitFor(() => expect(pinOf(WAITING_TAG)).toBeUndefined());
  });

  it('says so when the database refuses it', async () => {
    supabaseMock.setResponse('pending_trees:delete', { data: [], error: null });
    renderOfficeMap();
    await waitFor(() => expect(pinOf(WAITING_TAG)).toBeTruthy());
    fireEvent.click(pinOf(WAITING_TAG));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete this tag' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not your LGU’s');
  });
});
