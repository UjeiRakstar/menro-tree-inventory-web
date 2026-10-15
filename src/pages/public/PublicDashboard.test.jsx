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

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import PublicDashboard from './PublicDashboard.jsx';

// Santa Cruz holds three, one of them invasive; Pila holds one.
const TREES = [
  { id: '1', dateCaptured: '2026-08-01T09:00:00', species: 'Narra', barangay: 'Bubukal', dbh: '10 cm', biodiversity_status: 'Endemic', latitude: 14.2823, longitude: 121.4163 },
  { id: '2', dateCaptured: '2026-09-02T09:00:00', species: 'Mango', barangay: 'Bubukal', dbh: '20 cm', biodiversity_status: 'Invasive', latitude: 14.2795, longitude: 121.4121 },
  { id: '3', dateCaptured: '2026-07-15T09:00:00', species: 'Acacia', barangay: 'Pagsawitan', dbh: '4 cm', biodiversity_status: 'Endemic', latitude: 14.2840, longitude: 121.4180 },
  { id: '4', dateCaptured: '2026-07-20T09:00:00', species: 'Narra', barangay: 'Pansol', dbh: '8 cm', biodiversity_status: 'Endemic', latitude: 14.2330, longitude: 121.3670 },
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
    // All four trees, not one municipality's worth. Scoped to its own card:
    // the species section counts things too, and "4" appears there as well.
    const treeCount = (await screen.findByText('Total Number of Trees')).closest('button');
    expect(within(treeCount).getByText('4')).toBeInTheDocument();
  });

  it('follows the city or municipality that was picked', async () => {
    renderDashboard();
    await screen.findByRole('heading', { level: 1, name: 'Laguna Biodiversity Analytics' });

    fireEvent.click(screen.getByRole('tab', { name: 'Santa Cruz' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Santa Cruz Biodiversity Analytics' })
    ).toBeInTheDocument();
    // Three of the four trees stand in Santa Cruz, one of them invasive. The
    // bars are the barangays their coordinates fall in, not the names on the
    // records: two of these were recorded as Bubukal, in different barangays.
    await waitFor(() =>
      expect(chartRows().map((r) => r.name).sort()).toEqual([
        'Barangay III',
        'San Pablo Sur',
        'Santo Angel Sur',
      ])
    );
    expect(screen.getAllByTestId('pin')).toHaveLength(3);
  });

  it('charts places by LGU across the province, and by barangay inside one', async () => {
    renderDashboard();
    await waitFor(() => expect(chartRows().map((r) => r.name)).toEqual(['Santa Cruz', 'Pila']));

    fireEvent.click(screen.getByRole('tab', { name: 'Pila' }));

    // Recorded as Pansol; it stands in Bulilan Sur.
    await waitFor(() => expect(chartRows().map((r) => r.name)).toEqual(['Bulilan Sur']));
  });

  it('charts the pair whose figure was pressed', async () => {
    renderDashboard();
    await screen.findByText('Total Number of Trees');

    // Trees and species to begin with: how many, and how varied.
    await waitFor(() => expect(seriesKeys()).toEqual(['treeCount', 'speciesCount']));

    // Anchored: the ⓘ beside the figure is its own button, named "What …".
    fireEvent.click(screen.getByRole('button', { name: /^Total Estimated Carbon Stored/ }));

    // Both halves chart now: what the trees hold, and what they take up in a
    // year. A stock and a rate, which are different questions.
    await waitFor(() => expect(seriesKeys()).toEqual(['carbonKg', 'carbonPerYearKg']));
  });

  it('keeps the forestry figures behind their own tab', async () => {
    renderDashboard();
    await screen.findByText('Total Number of Trees');

    // Standing volume and mean annual increment are inventory terms. They are
    // not a headline a public page owes its public.
    expect(screen.queryByText('Standing Timber Volume')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Forestry' }));

    const forestry = await screen.findByRole('region', { name: 'Forestry figures' });
    expect(within(forestry).getByText('Standing Timber Volume')).toBeInTheDocument();

    // Scoped to the tab: the headline chart is still on screen above it, so an
    // unscoped query would collect the series from both.
    const series = within(forestry)
      .getAllByTestId('series')
      .map((s) => s.dataset.key);
    expect(series).toEqual(['timberVolumeM3', 'maiAgbMg']);
  });

  it('shows the workings beside the forestry figures, not an empty column', async () => {
    renderDashboard();
    await screen.findByText('Total Number of Trees');
    fireEvent.click(screen.getByRole('tab', { name: 'Forestry' }));

    const forestry = await screen.findByRole('region', { name: 'Forestry figures' });

    // Anybody putting standing volume into a report needs every constant
    // behind it, and this is the tab those readers are on.
    expect(within(forestry).getByText('How these are worked out')).toBeInTheDocument();
    expect(within(forestry).getByText('V = c × D² × H')).toBeInTheDocument();
    expect(within(forestry).getByText('0.57 t/m³')).toBeInTheDocument();
    expect(within(forestry).getByText('1.5×')).toBeInTheDocument();
    expect(within(forestry).getByText('0.47')).toBeInTheDocument();

    // The growth rate is the only figure on this page with nothing behind it,
    // so it is called out rather than listed among the sourced constants —
    // and marked ASSUMED, which is the kind that moves only when somebody
    // changes it, as against a figure that is waiting on another system.
    const assumed = forestry.querySelector('[data-provisional="assumed"]');
    expect(assumed).toBeTruthy();
    expect(assumed).toHaveTextContent('0.5 cm of diameter growth a year');
    expect(assumed).toHaveTextContent(/no measurement or publication behind it/);

    // Hectares are a different kind of gap: nothing here can derive them.
    expect(forestry.querySelector('[data-provisional="awaiting"]')).toHaveTextContent(
      /mapping feature/
    );
  });

  it('marks in amber only what will not move as the inventory grows', async () => {
    renderDashboard();

    const pending = await screen.findByRole('region', { name: 'Figures not available yet' });

    // The two figures no amount of tagging produces.
    expect(pending.querySelectorAll('[data-provisional="awaiting"]').length).toBeGreaterThanOrEqual(
      2
    );

    // And a key, so the colour means something rather than being a mood.
    expect(within(pending).getByText('Reading the figures')).toBeInTheDocument();
    expect(within(pending).getByText(/except where it is marked in amber/)).toBeInTheDocument();

    // The coverage note is NOT amber: it moves every time a height is
    // recorded. Amber that covers live figures too stops meaning anything.
    // All six headline figures are counted from the tagged trees, so not one
    // of them is marked. Amber that covered live figures too would stop
    // meaning anything.
    for (const label of ['Total Number of Trees', 'Species Recorded', 'Total Estimated Carbon Stored']) {
      const card = screen.getByText(label).closest('div');
      expect(card.querySelector('[data-provisional]')).toBeNull();
    }
  });

  it('shows what it cannot give yet, small and with a reason', async () => {
    renderDashboard();

    // Still shown, because the public looks for them — but out of the
    // headline, since an empty figure should not hold a quarter of the page.
    const pending = await screen.findByRole('region', { name: 'Figures not available yet' });

    const cover = within(pending).getByText('Forest / Tree Cover Area').closest('li');
    expect(within(cover).getByText('—')).toBeInTheDocument();
    expect(within(cover).getByText(/Waiting on the LGU offices mapping their tree cover/)).toBeInTheDocument();

    const emission = within(pending).getByText('Total Carbon Emission').closest('li');
    expect(within(emission).getByText(/Climate Change Commission/)).toBeInTheDocument();

    // And neither is a card that can be pressed to chart nothing.
    expect(
      screen.queryByRole('button', { name: /^Forest \/ Tree Cover Area/ })
    ).not.toBeInTheDocument();
  });

  it('shows the tree cover the offices have mapped, once there is some — and says it is only that', async () => {
    // About a hectare of open forest in Santa Cruz, saved by its office.
    const dLat = 100 / 111320;
    const dLng = 100 / (111320 * Math.cos((14.28 * Math.PI) / 180));
    supabaseMock.setResponse('map_areas:select', {
      data: [
        {
          id: 'a1', kind: 'land-cover', name: 'Labuin Forest', cover_class: 'open-forest',
          municipality: 'Santa Cruz', lgu_psgc: 403426000, created_by_role: 'lgu_admin',
          geometry: { type: 'Polygon', coordinates: [[[121.41, 14.28], [121.41 + dLng, 14.28], [121.41 + dLng, 14.28 + dLat], [121.41, 14.28]]] },
        },
      ],
      error: null,
    });
    renderDashboard();

    const mapped = await screen.findByRole('region', { name: 'Mapped tree cover' });
    expect(mapped).toHaveTextContent(/0\.50\s*ha/);
    expect(mapped).toHaveTextContent('Open forest');
    expect(mapped).toHaveTextContent(/Only what has been mapped/);
    expect(mapped).toHaveTextContent(/For planning purposes only/);
    // No longer listed as waiting.
    const pending = screen.getByRole('region', { name: 'Figures not available yet' });
    expect(within(pending).queryByText('Forest / Tree Cover Area')).not.toBeInTheDocument();
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

    // The citations live in the tooltips instead, one per figure. Each is
    // opened in turn: a tooltip exists only while it is showing, because it
    // goes through a portal to escape the figure grid's rounded `overflow`,
    // which used to cut every one of these explanations off mid-sentence.
    const tooltips = [];
    for (const button of screen.getAllByRole('button', { name: /^What .* means$/ })) {
      fireEvent.click(button);
      tooltips.push(screen.getByRole('tooltip').textContent);
      fireEvent.click(button);
    }
    expect(tooltips.length).toBeGreaterThan(0);
    expect(tooltips.some((t) => /FMB Technical Bulletin No\. 3/.test(t))).toBe(true);
    expect(tooltips.some((t) => /diameter at breast height/.test(t))).toBe(true);
    // The growth assumption is named in the ⓘ, not buried in the arithmetic.
    expect(tooltips.some((t) => /conservative/.test(t))).toBe(true);
    // And NOT attributed to Lasco et al. The earlier mock-up cited them for
    // this figure, but the number here does not come from them: it comes from
    // the DENR equation and our own stated growth rate. Citing a source the
    // figure was not taken from would be worse than citing none.
    expect(tooltips.some((t) => /Lasco/.test(t))).toBe(false);
  });

  it('spells out the biomass figure instead of abbreviating it', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('tab', { name: 'Forestry' }));

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


  it('says when the inventory was last added to', async () => {
    renderDashboard();

    // Every figure on the page was true at some moment; this says which.
    expect(await screen.findByText(/Newest tag 2 September 2026/)).toBeInTheDocument();
  });

  it('admits when nothing records a date at all', async () => {
    supabaseMock.setResponse('trees:select', {
      data: TREES.map(({ dateCaptured, ...rest }) => rest),
      error: null,
    });
    renderDashboard();

    expect(
      await screen.findByText('No tree here records when it was tagged.')
    ).toBeInTheDocument();
  });
  it('says so when the inventory cannot be read', async () => {
    supabaseMock.setResponse('trees:select', { data: null, error: { message: 'connection refused' } });
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('connection refused');
  });
});

describe('reading the detail one question at a time', () => {
  it('opens on the species view, and shows only that one', async () => {
    renderDashboard();
    await screen.findByRole('tab', { name: 'Species' });

    expect(screen.getByRole('region', { name: 'What is growing here' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Where the trees are' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'How old the trees are' })).not.toBeInTheDocument();
  });

  it('swaps the panel when another question is chosen', async () => {
    renderDashboard();
    fireEvent.click(await screen.findByRole('tab', { name: 'Places' }));

    expect(
      await screen.findByRole('region', { name: 'Where the trees are' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What is growing here' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Sizes' }));
    expect(await screen.findByRole('region', { name: 'How old the trees are' })).toBeInTheDocument();
  });

  it('marks which question is open for a screen reader, not only by tint', async () => {
    renderDashboard();
    const species = await screen.findByRole('tab', { name: 'Species' });
    const places = screen.getByRole('tab', { name: 'Places' });

    expect(species).toHaveAttribute('aria-selected', 'true');
    expect(places).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(places);
    expect(places).toHaveAttribute('aria-selected', 'true');
  });
});

describe('a figure card', () => {
  it('reads its name before its number, however it is laid out', async () => {
    renderDashboard();

    // On screen the number comes first, because six cards are scanned rather
    // than read. Spoken, a bare number before its name is useless.
    const card = await screen.findByRole('button', { name: /^Total Number of Trees, 4/ });
    expect(card).toBeInTheDocument();
  });
});

describe('charting a pair whose figures are not on the same scale', () => {
  const axes = () => screen.getAllByTestId('axis');
  const seriesAxes = () => screen.getAllByTestId('series').map((s) => s.dataset.axis);

  it('gives each figure its own axis', async () => {
    renderDashboard();
    await screen.findByText('Total Estimated Carbon Stored');

    // Carbon stored is eighty times what is taken up in a year. Sharing an
    // axis would draw the second series as a flat line along the bottom —
    // truthful and completely unreadable.
    fireEvent.click(screen.getByRole('button', { name: /^Total Estimated Carbon Stored/ }));

    await waitFor(() => expect(seriesAxes()).toEqual(['left', 'right']));
    expect(axes().map((a) => a.dataset.side).sort()).toEqual(['left', 'right']);
  });

  it('puts a lone figure on one axis, with no empty second scale', async () => {
    renderDashboard();
    await screen.findByText('Total Number of Trees');

    // Trees and invasive trees are both counts of trees: one scale is right.
    await waitFor(() => expect(seriesAxes()).toEqual(['left', 'right']));
  });
});
