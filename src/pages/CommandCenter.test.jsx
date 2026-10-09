import fc from 'fast-check';
import {
  render,
  screen,
  cleanup,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// Hoisted spies so vi.mock factories (themselves hoisted) can reference them.
// -----------------------------------------------------------------------------
const {
  selectSpy,
  insertSpy,
  updateSpy,
  upsertSpy,
  deleteSpy,
  fromSpy,
  eqSpy,
  subscribeSpy,
  onSpy,
  channelSpy,
  removeChannelSpy,
} = vi.hoisted(() => {
  const selectSpy = vi.fn();
  const insertSpy = vi.fn();
  const eqSpy = vi.fn();
  const updateSpy = vi.fn(() => ({ eq: eqSpy }));
  const upsertSpy = vi.fn();
  const deleteSpy = vi.fn();
  const fromSpy = vi.fn(() => ({
    select: selectSpy,
    insert: insertSpy,
    update: updateSpy,
    upsert: upsertSpy,
    delete: deleteSpy,
  }));
  const subscribeSpy = vi.fn();
  const onSpy = vi.fn(() => ({ subscribe: subscribeSpy }));
  const channelSpy = vi.fn(() => ({ on: onSpy }));
  const removeChannelSpy = vi.fn();
  return {
    selectSpy,
    insertSpy,
    updateSpy,
    upsertSpy,
    deleteSpy,
    fromSpy,
    eqSpy,
    subscribeSpy,
    onSpy,
    channelSpy,
    removeChannelSpy,
  };
});

// -----------------------------------------------------------------------------
// Mock react-leaflet (Requirement 9.1). Inert JSX stand-ins with testid hooks.
// -----------------------------------------------------------------------------
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center, zoom, className }) => (
    <div
      data-testid="map-container"
      data-center={JSON.stringify(center)}
      data-zoom={String(zoom)}
      className={className}
    >
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution }) => (
    <div
      data-testid="tile-layer"
      data-url={url}
      data-attribution={attribution}
    />
  ),
  Marker: ({ position, icon, children }) => (
    <div
      data-testid="marker"
      data-position={JSON.stringify(position)}
      data-icon-present={icon ? 'yes' : 'no'}
    >
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  Polygon: ({ positions, pathOptions, children }) => (
    <div
      data-testid="polygon"
      data-positions={JSON.stringify(positions)}
      data-interactive={String(pathOptions?.interactive ?? true)}
    >
      {children}
    </div>
  ),
  Circle: ({ center, radius, pathOptions }) => (
    <div
      data-testid="circle"
      data-center={JSON.stringify(center)}
      data-radius={String(radius)}
      data-color={pathOptions?.fillColor}
    />
  ),
  Rectangle: ({ bounds, pathOptions }) => (
    <div
      data-testid="rectangle"
      data-bounds={JSON.stringify(bounds)}
      data-fill-color={pathOptions?.fillColor}
    />
  ),
  useMap: () => ({ flyTo: vi.fn(), getZoom: vi.fn(() => 17) }),
}));

// Mock the GeoJSON import for MapMask
vi.mock('../data/Santa-Cruz-Boundary.geojson', () => ({
  default: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[[[121.39, 14.26], [121.40, 14.26], [121.40, 14.27], [121.39, 14.27], [121.39, 14.26]]]]
      },
      properties: {}
    }]
  }
}));

// -----------------------------------------------------------------------------
// Mock the Supabase client (Requirement 9.3).
// -----------------------------------------------------------------------------
vi.mock('../supabaseClient.js', () => ({
  supabase: {
    from: fromSpy,
    channel: channelSpy,
    removeChannel: removeChannelSpy,
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'test' } } } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
  },
}));

// Imports MUST come after the vi.mock declarations so they pick up the mocks.
import CommandCenter from './CommandCenter.jsx';
import App from '../App.jsx';
import { classifyPinColor, PIN_COLOR } from '../lib/pinColor.js';
import {
  treeRecordArb,
  treeRecordWithAnyCoordsArb,
} from '../test/arbitraries.js';

/**
 * A stand-in for a Supabase query builder: awaitable, and chainable through
 * .eq() the way the pending_trees read is. The page makes two reads on mount —
 * trees for the pins, then pending_trees filtered to the dispatched ones — so a
 * select that only resolves a value leaves the second read without an .eq().
 */
function chainable(result = { data: [], error: null }) {
  const settled = Promise.resolve(result);
  const builder = {
    then: (onFulfilled, onRejected) => settled.then(onFulfilled, onRejected),
    catch: (onRejected) => settled.catch(onRejected),
    eq: vi.fn(() => builder),
  };
  return builder;
}

/** Reset the select spy and put its default back, so later reads still chain. */
function resetSelect() {
  selectSpy.mockReset();
  selectSpy.mockImplementation(() => chainable());
}

const resolveWith = (payload) => selectSpy.mockReturnValueOnce(chainable(payload));
const resolveOk = (data) => resolveWith({ data, error: null });
const resolveErr = (error) => resolveWith({ data: null, error });

beforeEach(() => {
  resetSelect();
  insertSpy.mockReset();
  updateSpy.mockReset().mockReturnValue({ eq: eqSpy });
  upsertSpy.mockReset();
  deleteSpy.mockReset();
  fromSpy.mockClear();
  eqSpy.mockReset();
  channelSpy.mockClear();
  onSpy.mockClear();
  subscribeSpy.mockClear();
  removeChannelSpy.mockClear();
});

describe('CommandCenter / Command_Center_Map', () => {
  // ---------------------------------------------------------------------------
  // 7.2 — Base-map render + route wiring (example-based)
  // ---------------------------------------------------------------------------

  it('renders a MapContainer centred inside Santa Cruz at a working zoom', async () => {
    resolveOk([]);
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );

    const mapEl = await screen.findByTestId('map-container');
    // The exact point has moved before and may again; what matters is that the
    // map opens over Santa Cruz rather than somewhere in the sea.
    const [lat, lng] = JSON.parse(mapEl.getAttribute('data-center'));
    expect(lat).toBeGreaterThan(14.2);
    expect(lat).toBeLessThan(14.35);
    expect(lng).toBeGreaterThan(121.35);
    expect(lng).toBeLessThan(121.45);
    const zoom = Number(mapEl.getAttribute('data-zoom'));
    expect(zoom).toBeGreaterThanOrEqual(13);
    expect(zoom).toBeLessThanOrEqual(18);
    await waitFor(() => {
      expect(screen.queryByTestId('map-loading')).toBeNull();
    });
  });

  it('renders an OpenStreetMap TileLayer', async () => {
    resolveOk([]);
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    const tile = await screen.findByTestId('tile-layer');
    expect(tile.getAttribute('data-url')).toMatch(/tile\.openstreetmap\.org/);
    expect(tile.getAttribute('data-attribution') ?? '').toMatch(
      /OpenStreetMap/i
    );
    await waitFor(() => {
      expect(screen.queryByTestId('map-loading')).toBeNull();
    });
  });

  // The App shell — the session gate, the <main> padding per route, the
  // persistent header — is App.test.jsx's contract, not this page's.

  it('renders a visually-hidden Command Center heading (Phase 1 contract)', async () => {
    resolveOk([]);
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Command Center',
    });
    expect(heading.className).toContain('sr-only');
    await waitFor(() => {
      expect(screen.queryByTestId('map-loading')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 7.3 — Supabase fetch lifecycle (example-based)
  // ---------------------------------------------------------------------------

  it('calls supabase.from("trees").select("*") exactly once on mount', async () => {
    resolveOk([]);
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(fromSpy).toHaveBeenCalledWith('trees');
    });
    expect(selectSpy).toHaveBeenCalledWith('*');
    // Two reads: the trees behind the pins, and the dispatched pending_trees
    // drawn as grey markers.
    await waitFor(() => expect(fromSpy).toHaveBeenCalledWith('pending_trees'));
    expect(fromSpy).toHaveBeenCalledTimes(2);
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });

  it('shows a loading indicator while the Supabase promise is pending', () => {
    selectSpy.mockReturnValueOnce(new Promise(() => {}));
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    expect(screen.getByTestId('map-loading')).toBeInTheDocument();
  });

  it('renders zero markers and no error banner when Supabase returns an empty array', async () => {
    resolveOk([]);
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryByTestId('map-loading')).toBeNull();
    });
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
    expect(screen.queryByTestId('map-error')).toBeNull();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders a visible error banner when Supabase returns an error', async () => {
    resolveErr({ message: 'network down' });
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    const banner = await screen.findByTestId('map-error');
    expect(banner.textContent).toContain('network down');
    // Base map continues to render alongside the error banner.
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
  });

  it('never calls insert, update, upsert, or delete on the trees table', async () => {
    resolveOk([
      {
        id: 'row-1',
        tree_id: 'T-1',
        latitude: 14.281,
        longitude: 121.411,
        dbh: '10',
        species: 'Narra',
        scientific_name: 'Pterocarpus indicus',
        species_type: 'Endemic',
        is_leaning: false,
        has_powerline_conflict: false,
        is_decayed: false,
        is_root_problem: false,
        dateCaptured: '2024-03-15T08:30:00.000Z',
        assigned_to: null,
        has_cutting_permit: false,
        task_status: 'Pending',
        photo_url: null,
      },
    ]);
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryAllByTestId('marker').length).toBe(1);
    });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(upsertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 7.4 — Property 2: Coordinate Filtering
  // ---------------------------------------------------------------------------

  // Feature: command-center-map, Property 2: Coordinate Filtering
  it('renders exactly one marker per finite-coord tree and no marker for non-finite coords', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(treeRecordWithAnyCoordsArb, { maxLength: 10 }).map((arr) =>
          // Assign unique ids so React keys don't collide across arbitrary samples.
          arr.map((t, i) => ({ ...t, id: `row-${i}` }))
        ),
        async (trees) => {
          resetSelect();
          resolveOk(trees);
          render(
            <MemoryRouter>
              <CommandCenter />
            </MemoryRouter>
          );

          const expected = trees.filter(
            (t) =>
              Number.isFinite(t.latitude) && Number.isFinite(t.longitude)
          );
          try {
            await waitFor(() => {
              expect(screen.queryAllByTestId('marker').length).toBe(
                expected.length
              );
            });
            const renderedPositions = screen
              .queryAllByTestId('marker')
              .map((el) => el.getAttribute('data-position'))
              .sort();
            const expectedPositions = expected
              .map((t) => JSON.stringify([t.latitude, t.longitude]))
              .sort();
            expect(renderedPositions).toEqual(expectedPositions);
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 25 }
    );
  });

  // ---------------------------------------------------------------------------
  // 7.5 — Property 3: Marker Icon Matches Classification
  // ---------------------------------------------------------------------------

  // Feature: command-center-map, Property 3: Marker Icon Matches Classification
  it('every classifier-routed tree renders a marker with a non-default icon', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(treeRecordArb, { maxLength: 8 }).map((arr) =>
          arr.map((t, i) => ({ ...t, id: `row-${i}` }))
        ),
        async (trees) => {
          resetSelect();
          resolveOk(trees);
          render(
            <MemoryRouter>
              <CommandCenter />
            </MemoryRouter>
          );

          // Expected per-color counts from the classifier.
          const expectedCounts = {
            [PIN_COLOR.RED]: 0,
            [PIN_COLOR.ORANGE]: 0,
            [PIN_COLOR.YELLOW]: 0,
            [PIN_COLOR.GREEN]: 0,
          };
          trees.forEach((t) => {
            expectedCounts[classifyPinColor(t)] += 1;
          });
          const expectedTotal = Object.values(expectedCounts).reduce(
            (a, b) => a + b,
            0
          );

          try {
            await waitFor(() => {
              expect(screen.queryAllByTestId('marker').length).toBe(
                expectedTotal
              );
            });
            const markers = screen.queryAllByTestId('marker');
            markers.forEach((m) => {
              expect(m.getAttribute('data-icon-present')).toBe('yes');
            });
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 20 }
    );
  });

  // ---------------------------------------------------------------------------
  // 7.6 — Marker / Popup wiring (example-based)
  // ---------------------------------------------------------------------------

  it('pairs every Marker with a Popup descendant', async () => {
    const base = {
      dbh: '10',
      species: 'Narra',
      scientific_name: 'Pterocarpus indicus',
      species_type: 'Endemic',
      is_leaning: false,
      has_powerline_conflict: false,
      is_decayed: false,
      is_root_problem: false,
      dateCaptured: '2024-03-15T08:30:00.000Z',
      assigned_to: null,
      has_cutting_permit: false,
      task_status: 'Pending',
      photo_url: null,
    };
    resolveOk([
      { ...base, id: 'a', tree_id: 'T-A', latitude: 14.281, longitude: 121.411 },
      { ...base, id: 'b', tree_id: 'T-B', latitude: 14.282, longitude: 121.412 },
    ]);
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryAllByTestId('marker').length).toBe(2);
    });
    screen.queryAllByTestId('marker').forEach((marker) => {
      expect(marker.querySelector('[data-testid="popup"]')).not.toBeNull();
    });
  });

  it('does not emit a React key warning for unique ids', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const base = {
        dbh: '10',
        species: 'Narra',
        scientific_name: 'Pterocarpus indicus',
        species_type: 'Endemic',
        is_leaning: false,
        has_powerline_conflict: false,
        is_decayed: false,
        is_root_problem: false,
        dateCaptured: '2024-03-15T08:30:00.000Z',
        assigned_to: null,
        has_cutting_permit: false,
        task_status: 'Pending',
        photo_url: null,
      };
      resolveOk([
        { ...base, id: 'a', tree_id: 'T-A', latitude: 14.281, longitude: 121.411 },
        { ...base, id: 'b', tree_id: 'T-B', latitude: 14.282, longitude: 121.412 },
        { ...base, id: 'c', tree_id: 'T-C', latitude: 14.283, longitude: 121.413 },
      ]);
      render(
        <MemoryRouter>
          <CommandCenter />
        </MemoryRouter>
      );
      await waitFor(() => {
        expect(screen.queryAllByTestId('marker').length).toBe(3);
      });
      const keyWarnings = errSpy.mock.calls.filter((call) =>
        String(call[0] ?? '').match(/key/i)
      );
      expect(keyWarnings).toHaveLength(0);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('every rendered marker carries a non-default icon (data-icon-present=yes)', async () => {
    resolveOk([
      {
        id: 'a',
        tree_id: 'T-A',
        latitude: 14.281,
        longitude: 121.411,
        dbh: '10',
        species: 'Narra',
        scientific_name: 'Pterocarpus indicus',
        species_type: 'Endemic',
        is_leaning: true, // hazard → Red pin
        has_powerline_conflict: false,
        is_decayed: false,
        is_root_problem: false,
        dateCaptured: '2024-03-15T08:30:00.000Z',
        assigned_to: null,
        has_cutting_permit: false,
        task_status: 'Pending',
        photo_url: null,
      },
    ]);
    render(
      <MemoryRouter>
        <CommandCenter />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.queryAllByTestId('marker').length).toBe(1);
    });
    const markers = screen.queryAllByTestId('marker');
    markers.forEach((m) => {
      expect(m.getAttribute('data-icon-present')).toBe('yes');
    });
  });
});

// ---------------------------------------------------------------------------
// 8.x — Overlay toggle behavior (Requirements 8.1–8.6)
// ---------------------------------------------------------------------------

// The Urban Heat Island and PAGASA overlays are no longer part of this page.
// OverlayTogglePanel.test.jsx covers the panel itself.
