import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ profile: null }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});
const { saveAsSpy } = vi.hoisted(() => ({ saveAsSpy: vi.fn() }));
vi.mock('file-saver', () => ({ saveAs: saveAsSpy, default: { saveAs: saveAsSpy } }));

import { supabaseMock } from '../../test/supabaseMock.js';
import { PGENRO_ADMIN } from '../../test/accounts.js';
import ActionBoard from '../ActionBoard.jsx';
import ActionSummary, { ProvinceOverview } from '../../components/board/ActionSummary.jsx';

const SCZ = 403426000;
const PILA = 403422000;

const LGUS = [
  { psgc: PILA, name: 'Pila', label: 'Pila' },
  { psgc: SCZ, name: 'Santa Cruz', label: 'Santa Cruz' },
];

const TREES = [
  { id: 'a', species: 'Narra', tree_id: 'SCZ-1', barangay: 'Labuin', barangay_psgc: 403426001, isLeaning: true, stem_quality: 'Code 3 (Several Defects)' },
  { id: 'b', species: 'Mango', barangay: 'Labuin', barangay_psgc: 403426001, isLeaning: true },
  { id: 'c', species: 'Acacia', barangay: 'Pansol', barangay_psgc: 403422005, isDecayed: true, assigned_to: 'ana@field.ph', stem_quality: 'Code 2 (Little Defects)' },
];

const PERMITS = [
  { id: 'p1', tree_id: 'a', lgu_psgc: SCZ, client_name: 'Maria Santos', reason: 'Road widening', created_at: '2026-10-01T08:00:00Z' },
  { id: 'p2', tree_id: 'c', lgu_psgc: PILA, client_name: 'Jose Reyes', reason: 'Leaning over a house', created_at: '2026-10-05T08:00:00Z' },
  { id: 'p3', tree_id: 'b', lgu_psgc: SCZ, client_name: 'Liza Cruz', reason: 'Construction', created_at: '2026-09-01T08:00:00Z' },
];

/** Where the board has sent the page, for the redirects. */
function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderBoard(path = '/action-board') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/action-board" element={<ActionBoard />} />
        <Route path="*" element={<Where />} />
      </Routes>
      <Where />
    </MemoryRouter>
  );
}

/** The province's summary — on PGENRO's BioDashboard now, not the Action Board. */
async function renderOverview({ table = true } = {}) {
  render(
    <MemoryRouter>
      <ProvinceOverview />
    </MemoryRouter>
  );
  // The table of every LGU opens when wanted, below the tiles.
  if (table) fireEvent.click(await screen.findByRole('button', { name: /Show the numbers by city and municipality/ }));
}

beforeEach(() => {
  supabaseMock.reset();
  auth.profile = PGENRO_ADMIN;
  supabaseMock.setResponse('trees:select', { data: TREES, error: null });
  supabaseMock.setResponse('pending_trees:select', {
    data: [{ id: 9, species: 'Duhat', lgu_psgc: SCZ, status: 'pending' }],
    error: null,
  });
  supabaseMock.setResponse('lgus:select', { data: LGUS, error: null });
  supabaseMock.setResponse('permits:select', { data: PERMITS, error: null });
  supabaseMock.setResponse('map_areas:select', {
    data: [
      { id: 'f1', name: 'Labuin Forest', lgu_psgc: SCZ, kind: 'land-cover', cover_class: 'open-forest', area_m2: 25000 },
      { id: 's1', name: 'Pansol Riverbank', lgu_psgc: PILA, kind: 'planting-site', planting_status: 'open', area_m2: 4000 },
    ],
    error: null,
  });
  supabaseMock.setResponse('profiles:select', {
    data: [{ id: 'm1', role: 'lgu_admin', status: 'active', lgu_psgc: SCZ }],
    error: null,
  });
  saveAsSpy.mockReset();
});
afterEach(cleanup);

describe('the province overview', () => {
  it('counts each LGU’s hazards, tags and stem quality, worst first', async () => {
    await renderOverview();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    // Santa Cruz has two hazards nobody is on; Pila has none.
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual(['Santa Cruz', 'Pila']);
    expect(within(rows[0]).getByRole('button', { name: '2 — Hazards, nobody sent, Santa Cruz' })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: /1 — Public tags awaiting a field check/ })).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: '1 — Stem Code 3 — several defects, to watch, Santa Cruz' })).toBeInTheDocument();
    // Codes 1 and 2 are not on the board: sound and mildly flawed stems call for nothing.
    expect(screen.queryByRole('columnheader', { name: /Code 2/ })).not.toBeInTheDocument();
  });

  it('opens the trees behind a number, each a link to the map', async () => {
    await renderOverview();
    fireEvent.click(await screen.findByRole('button', { name: '2 — Hazards, nobody sent, Santa Cruz' }));

    const dialog = screen.getByRole('dialog', { name: 'Hazards, nobody sent — Santa Cruz' });
    const links = within(dialog).getAllByRole('link', { name: /On the map/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/map?tree=a', '/map?tree=b']);
  });

  it('opens the province’s from the totals at the top', async () => {
    await renderOverview();
    fireEvent.click(await screen.findByRole('button', { name: '2 — Hazards, nobody sent, all of Laguna' }));
    expect(screen.getByRole('dialog', { name: 'Hazards, nobody sent — All of Laguna' })).toBeInTheDocument();
  });

  it('lists the province’s by city or municipality, each opened when wanted, with no tree ids', async () => {
    await renderOverview();
    fireEvent.click(await screen.findByRole('button', { name: '2 — Hazards, nobody sent, all of Laguna' }));
    const dialog = screen.getByRole('dialog', { name: 'Hazards, nobody sent — All of Laguna' });
    expect(dialog).toHaveTextContent('2 trees in 1 city or municipality');
    const santaCruz = within(dialog).getByRole('button', { name: /Santa Cruz/ });
    // One town only: it opens already.
    expect(santaCruz).toHaveAttribute('aria-expanded', 'true');
    const links = within(dialog).getAllByRole('link', { name: /On the map/ });
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/map?tree=a', '/map?tree=b']);
    fireEvent.click(santaCruz);
    expect(within(dialog).queryAllByRole('link')).toHaveLength(0);
  });

  it('shows progress across the province: areas mapped, sites open, and which LGUs have an office', async () => {
    await renderOverview();
    const progress = await screen.findByRole('region', { name: 'Progress' });
    expect(within(progress).getByRole('button', { name: '1 — Land cover areas mapped, all of Laguna' })).toHaveTextContent('2.5 ha of tree cover');
    expect(within(progress).getByText('LGUs with an active MENRO / CENRO account').parentElement).toHaveTextContent(/1\s*of 2/);

    const table = screen.getByRole('table');
    const santaCruz = within(table).getByRole('rowheader', { name: 'Santa Cruz' }).closest('tr');
    const pila = within(table).getByRole('rowheader', { name: 'Pila' }).closest('tr');
    expect(santaCruz).toHaveTextContent('✓ 1');
    expect(pila).toHaveTextContent('None');

    // An area count opens the areas, each a link to it on the map.
    fireEvent.click(within(pila).getByRole('button', { name: '1 — Tree planting sites open for planting, Pila' }));
    const dialog = screen.getByRole('dialog', { name: 'Tree planting sites open for planting — Pila' });
    expect(within(dialog).getByRole('link', { name: /On the map/ })).toHaveAttribute('href', '/map?area=s1');
  });

  it('keeps the tiles in one row, and the long table shut until asked for', async () => {
    await renderOverview({ table: false });
    expect(await screen.findByRole('button', { name: '2 — Hazards, nobody sent, all of Laguna' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('is read-only: nothing on it dispatches or issues a permit', async () => {
    await renderOverview();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Dispatch|Re-assign|Issue permit/ })).not.toBeInTheDocument();
  });

  it('is not on the Action Board', async () => {
    renderBoard();
    await screen.findByRole('tab', { name: 'Permit logs' });
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();
  });
});

describe('one LGU’s summary, on its office’s BioDashboard', () => {
  const DATA = {
    trees: TREES,
    tags: [{ id: 9, species: 'Duhat', lgu_psgc: SCZ, status: 'pending' }],
    areas: [],
    profiles: [],
    lgus: LGUS,
    permits: [],
  };
  const labelOf = (lgu) => LGUS.find((row) => row.psgc === lgu)?.label ?? String(lgu);

  it('counts that LGU alone, with no table of the others', () => {
    render(
      <MemoryRouter>
        <ActionSummary data={DATA} labelOf={labelOf} lgu={SCZ} />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: '2 — Hazards, nobody sent, Santa Cruz' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('LGUs with an active MENRO / CENRO account')).not.toBeInTheDocument();
  });

  it('lists what is behind a number by barangay', () => {
    render(
      <MemoryRouter>
        <ActionSummary data={DATA} labelOf={labelOf} lgu={SCZ} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: '2 — Hazards, nobody sent, Santa Cruz' }));
    const dialog = screen.getByRole('dialog', { name: 'Hazards, nobody sent — Santa Cruz' });
    expect(dialog).toHaveTextContent('2 trees in 1 barangay');
    expect(within(dialog).getByRole('button', { name: /Labuin/ })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('PGENRO’s Action Board (22 October)', () => {
  it('has the permit logs, field officers, accounts and climate plans as its tabs', async () => {
    renderBoard();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent.replace('!', ''))).toEqual(['Permit logs', 'Field officers', 'Accounts', 'Climate plans']);
    expect(screen.getByRole('tab', { name: 'Permit logs' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: /Planting site requests/ })).not.toBeInTheDocument();
  });

  it('keeps the tab in the address, so a link opens it', async () => {
    renderBoard('/action-board?tab=climate-plans');
    expect(await screen.findByRole('tab', { name: 'Climate plans' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /^Field officers/ }));
    expect(screen.getAllByTestId('where')[0]).toHaveTextContent('/action-board?tab=officers');
  });

  it('sends the old planting site requests link to Trees, where they are now', async () => {
    renderBoard('/action-board?tab=requests');
    await waitFor(() => expect(screen.getAllByTestId('where')[0]).toHaveTextContent('/inventory?tab=requests'));
  });

  it('marks the tabs with something waiting: a field officer to approve, a plan to check', async () => {
    supabaseMock.setResponse('profiles:select', (record) =>
      record.filters.some(([column]) => column === 'is_approved')
        ? { data: [{ id: 'f1' }, { id: 'f2' }], error: null }
        : { data: [{ id: 'm1', role: 'lgu_admin', status: 'active', lgu_psgc: SCZ }], error: null }
    );
    supabaseMock.setResponse('lccap_submissions:select', { data: [{ id: 'l1' }], error: null });
    renderBoard();
    expect(await screen.findByLabelText('2 field officers are waiting for approval')).toBeInTheDocument();
    expect(screen.getByLabelText('1 climate plan is waiting to be checked')).toBeInTheDocument();
  });
});

describe('the permit logs', () => {
  async function openPermits() {
    renderBoard();
    // The permits page is the Action Board's first tab now (22 October).
    await screen.findByRole('heading', { name: 'Permit Logs' });
  }

  it('lists every LGU’s permits under it, each opened when wanted', async () => {
    await openPermits();
    fireEvent.click(await screen.findByRole('button', { name: /Santa Cruz/ }));
    const santaCruz = screen.getByRole('region', { name: 'Santa Cruz' });
    expect(santaCruz).toHaveTextContent('Maria Santos');
    expect(santaCruz).toHaveTextContent('Liza Cruz');
    fireEvent.click(screen.getByRole('button', { name: /Pila/ }));
    expect(screen.getByRole('region', { name: 'Pila' })).toHaveTextContent('Jose Reyes');
    // The report by year, quarter, month or dates is there too.
    expect(screen.getByRole('button', { name: /Report/ })).toBeInTheDocument();
  });

  it('reads every permit and acts on none: no archive, no restore (18 October)', async () => {
    await openPermits();
    fireEvent.click(await screen.findByRole('button', { name: /Pila/ }));
    expect(screen.getByRole('region', { name: 'Pila' })).toHaveTextContent('Jose Reyes');
    expect(screen.queryByRole('button', { name: /^(Archive|Restore) the permit/ })).not.toBeInTheDocument();
    expect(supabaseMock.supabase.rpc).not.toHaveBeenCalledWith('archive_permit', expect.anything());
  });
});

describe('the super admin (18 October)', () => {
  it('archives and restores a permit, which PGENRO cannot', async () => {
    auth.profile = { ...PGENRO_ADMIN, is_super_admin: true };
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: /Pila/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive the permit for Jose Reyes' }));
    await waitFor(() => expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('archive_permit', { p_id: 'p2', p_archived: true }));
    expect(await screen.findByRole('button', { name: 'Restore the permit for Jose Reyes' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pila' })).toHaveTextContent('Archived');
  });
});
