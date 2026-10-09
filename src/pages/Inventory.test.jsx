import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// Hoisted spies so the `vi.mock` factory (itself hoisted above all imports) can
// reference them. Mirrors the proven pattern in `CommandCenter.test.jsx`.
// -----------------------------------------------------------------------------
const {
  selectSpy,
  insertSpy,
  updateSpy,
  upsertSpy,
  deleteSpy,
  fromSpy,
} = vi.hoisted(() => {
  const selectSpy = vi.fn();
  const insertSpy = vi.fn();
  const updateSpy = vi.fn();
  const upsertSpy = vi.fn();
  const deleteSpy = vi.fn();
  const fromSpy = vi.fn(() => ({
    select: selectSpy,
    insert: insertSpy,
    update: updateSpy,
    upsert: upsertSpy,
    delete: deleteSpy,
  }));
  return { selectSpy, insertSpy, updateSpy, upsertSpy, deleteSpy, fromSpy };
});

// -----------------------------------------------------------------------------
// Mock the Supabase_Client singleton so `supabase.from('trees').select('*')`
// returns a controllable stub. Unlike `ManageArborists.supabase.test.jsx`,
// `InventoryView.jsx` is supposed to import Supabase, so the mock substitutes
// a real chainable query builder rather than throwing on import.
// -----------------------------------------------------------------------------
vi.mock('../supabaseClient.js', () => ({
  supabase: { from: fromSpy },
}));

// -----------------------------------------------------------------------------
// Mock `qrcode.react` so the QRCodeSVG component renders a testable element
// with the value prop exposed as a data attribute.
// -----------------------------------------------------------------------------
// The page builds a real workbook; this test is about the wiring, not exceljs.
vi.mock('../lib/excelExport.js', () => ({
  generateMenroExcel: vi.fn(() => Promise.resolve()),
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props) => <div data-testid="qr-code-svg" data-value={props.value} />,
}));

// Imports MUST come after the `vi.mock` declarations so they pick up the mocks.
import InventoryView from './InventoryView.jsx';
import { generateMenroExcel } from '../lib/excelExport.js';

// -----------------------------------------------------------------------------
// Resolution helpers — push a single `{ data, error }` payload onto `selectSpy`.
// Each `renderInventory()` consumes exactly one enqueued resolution.
//
// The page navigates to a tree's detail view, and useNavigate throws outside a
// router, so every render needs one.
// -----------------------------------------------------------------------------
const resolveOk = (data) =>
  selectSpy.mockResolvedValueOnce({ data, error: null });
const resolveErr = (error) =>
  selectSpy.mockResolvedValueOnce({ data: null, error });

// -----------------------------------------------------------------------------
// MOCK_TREES — 3 dummy Tree_Records that collectively exercise:
//   • Both Hazard_Classifier outputs (Hazard on row 0, Safe on rows 1 & 2)
//   • Both Permit_Classifier outputs (None on rows 0 & 2, Approved on row 1)
//   • null tree_id (row 2) and null assigned_to (rows 1 & 2)
//   • A comma in `species` (row 2: "Mahogany, large"), which the export path
//     has to carry through untouched.
// -----------------------------------------------------------------------------
const MOCK_TREES = [
  {
    id: 't-1',
    tree_id: 'T-001',
    latitude: 14.281,
    longitude: 121.411,
    dbh: '42',
    species: 'Narra',
    scientific_name: 'Pterocarpus indicus',
    species_type: 'Endemic',
    is_leaning: true,
    has_powerline_conflict: false,
    is_decayed: false,
    is_root_problem: false,
    dateCaptured: '2024-03-15T08:30:00.000Z',
    assigned_to: 'arb-001',
    has_cutting_permit: false,
    task_status: 'Pending',
    photo_url: null,
  },
  {
    id: 't-2',
    tree_id: 'T-002',
    latitude: 14.282,
    longitude: 121.412,
    dbh: '30',
    species: 'Acacia',
    scientific_name: 'Acacia confusa',
    species_type: 'Invasive',
    is_leaning: false,
    has_powerline_conflict: false,
    is_decayed: false,
    is_root_problem: false,
    dateCaptured: '2024-04-01T09:00:00.000Z',
    assigned_to: null,
    has_cutting_permit: true,
    task_status: 'Acknowledged',
    photo_url: null,
  },
  {
    id: 't-3',
    tree_id: null,
    latitude: 14.283,
    longitude: 121.413,
    dbh: '55',
    species: 'Mahogany, large',
    scientific_name: 'Swietenia macrophylla',
    species_type: 'Invasive',
    is_leaning: false,
    has_powerline_conflict: false,
    is_decayed: false,
    is_root_problem: false,
    dateCaptured: '2024-04-05T10:15:00.000Z',
    assigned_to: null,
    has_cutting_permit: false,
    task_status: 'Pending',
    photo_url: null,
  },
];

// -----------------------------------------------------------------------------
// Per-test setup / teardown
//
//   • Reset every Supabase spy so enqueued resolutions don't leak across tests.
//   • Stub `URL.createObjectURL` / `URL.revokeObjectURL` — jsdom does not
//     implement either, and the CSV_Export tests in tasks 6.4/6.5 need both to
//     be observable `vi.fn()` spies.
//   • Spy on `console.log` so the Batch_QR_Print_Button log assertions in task
//     6.5 never leak into sibling tests.
// -----------------------------------------------------------------------------
let consoleLogSpy;

beforeEach(() => {
  selectSpy.mockReset();
  insertSpy.mockReset();
  updateSpy.mockReset();
  upsertSpy.mockReset();
  deleteSpy.mockReset();
  fromSpy.mockClear();
  generateMenroExcel.mockClear();

  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();

  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  delete global.URL.createObjectURL;
  delete global.URL.revokeObjectURL;

  consoleLogSpy.mockRestore();
});

const renderInventory = () =>
  render(
    <MemoryRouter>
      <InventoryView />
    </MemoryRouter>,
  );

describe('InventoryView / Central_Inventory', () => {
  // Smoke test — proves the scaffold runs end-to-end: the Supabase mock is
  // consumed, the fetch-on-mount useEffect resolves, and the Loaded_State
  // renders one row per Tree_Record. Fully-detailed assertions live in the
  // subsequent tasks (6.2 table structure, 6.3 pills, 6.4 CSV, 6.5 QR stub).
  it('renders the MOCK_TREES fixture after the Inventory_Fetch resolves', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    // Wait for the useEffect-driven fetch to resolve and the Loaded_State to
    // swap in the Master_Data_Table.
    const table = await screen.findByTestId('inventory-table');
    expect(table).toBeInTheDocument();

    // One body row per Tree_Record in the fixture.
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(MOCK_TREES.length);
  });

  // ---------------------------------------------------------------------------
  // Task 6.2 — Master_Data_Table structure after a successful Inventory_Fetch
  // ---------------------------------------------------------------------------

  it('issues the Inventory_Fetch contract: supabase.from("trees").select("*")', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    // Wait for the Loaded_State so the useEffect-driven fetch has run.
    await screen.findByTestId('inventory-table');

    // Exactly one `from('trees')` call, and the chained `select('*')` call,
    // pin Requirement 3.2's Inventory_Fetch contract.
    expect(fromSpy).toHaveBeenCalledWith('trees');
    expect(selectSpy).toHaveBeenCalledWith('*');
  });

  it('renders the Master_Data_Table column headers in order', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    const table = await screen.findByTestId('inventory-table');
    const headerCells = table.querySelectorAll('thead th');

    // Sortable headers carry an arrow icon beside their label, so compare the
    // trimmed text.
    expect(Array.from(headerCells).map((th) => th.textContent.trim())).toEqual([
      'Photo',
      'Species',
      'Barangay',
      'DBH',
      'Height',
      'Hazard',
      'Date Captured',
      'Assigned To',
    ]);
  });

  it('renders one body row per Tree_Record with its species, barangay, DBH and owner', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    const table = await screen.findByTestId('inventory-table');
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(MOCK_TREES.length);

    // Columns: Photo, Species, Barangay, DBH, Height, Hazard, Date Captured,
    // Assigned To. The hazard cell has its own tests below.
    // The table sorts by date captured, newest first, so look each row up by
    // its species rather than assuming fixture order.
    const DASH = '—';
    const bySpecies = new Map(
      Array.from(bodyRows).map((row) => {
        const cells = row.querySelectorAll('td');
        return [cells[1].textContent, cells];
      }),
    );

    const expected = [
      { species: 'Narra', dbh: '42 cm', assignedTo: 'arb-001' },
      { species: 'Acacia', dbh: '30 cm', assignedTo: DASH },
      { species: 'Mahogany, large', dbh: '55 cm', assignedTo: DASH },
    ];

    for (const row of expected) {
      const cells = bySpecies.get(row.species);
      expect(cells, `row for ${row.species}`).toBeDefined();
      expect(cells[3].textContent).toBe(row.dbh);
      expect(cells[7].textContent).toBe(row.assignedTo);
    }
  });

  // ---------------------------------------------------------------------------
  // Task 6.3 — Hazard_Pill and Permit_Pill rendering across the MOCK_TREES
  // fixture. Pins Requirements 9.6 (Hazard_Pill visible text) and 9.7
  // (Permit_Pill visible text + "None" plain-text branch).
  //
  // Fixture coverage:
  //   • Row 0 (T-001): is_leaning:true, has_cutting_permit:false → Hazard + None
  //   • Row 1 (T-002): all flags false,  has_cutting_permit:true  → Safe   + Approved
  //   • Row 2 (null):  all flags false,  has_cutting_permit:false → Safe   + None
  // ---------------------------------------------------------------------------

  it('names each hazard on a row that carries one', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    const table = await screen.findByTestId('inventory-table');
    const bodyRows = table.querySelectorAll('tbody tr');

    // T-001 is leaning. The column says which hazard it is rather than a bare
    // "Hazard", so a reader knows what they are being sent to look at.
    const narraRow = Array.from(bodyRows).find(
      (row) => row.querySelectorAll('td')[1].textContent === 'Narra',
    );
    const hazardCell = narraRow.querySelectorAll('td')[5];
    const chip = hazardCell.querySelector('span');
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('Leaning');
    expect(chip.className).toMatch(/rounded-full/);
    expect(chip.className).toMatch(/bg-red-/);
  });

  it('marks a row with no hazard flags as Safe', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    const table = await screen.findByTestId('inventory-table');
    const bodyRows = table.querySelectorAll('tbody tr');

    // T-002 has all four hazard flags false.
    const acaciaRow = Array.from(bodyRows).find(
      (row) => row.querySelectorAll('td')[1].textContent === 'Acacia',
    );
    const safeCell = acaciaRow.querySelectorAll('td')[5];
    const safePill = safeCell.querySelector('span');
    expect(safePill).not.toBeNull();
    expect(safePill.textContent).toBe('Safe');
    expect(safePill.className).toMatch(/rounded-full/);
    expect(safePill.className).toMatch(/bg-emerald-/);
  });

  // The permit column was taken off this table — a cutting permit is the
  // Action Board's and PermitsLog's business, not the inventory's.

  // ---------------------------------------------------------------------------
  // The export button. It builds the MENRO workbook through
  // lib/excelExport.js (stubbed above) rather than the old native CSV blob,
  // and does nothing at all when there is nothing to export.
  // ---------------------------------------------------------------------------

  it('renders the Export to Excel button after the Inventory_Fetch resolves', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();
    await screen.findByTestId('inventory-table');

    expect(screen.getByRole('button', { name: /Export to Excel/ })).toBeInTheDocument();
  });

  it('hands the rows on screen to the workbook builder, and downloads nothing itself', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();
    await screen.findByTestId('inventory-table');

    fireEvent.click(screen.getByRole('button', { name: /Export to Excel/ }));

    await waitFor(() => expect(generateMenroExcel).toHaveBeenCalledTimes(1));
    const [exported] = generateMenroExcel.mock.calls[0];
    expect(exported.map((t) => t.id).sort()).toEqual(MOCK_TREES.map((t) => t.id).sort());
    // The workbook builder owns the download; the page must not also wire one.
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('does nothing when there is nothing to export', async () => {
    resolveOk([]);

    renderInventory();
    // An empty inventory renders its empty state instead of the table, so wait
    // on the toolbar rather than on the table.
    const exportButton = await screen.findByRole('button', { name: /Export to Excel/ });
    expect(exportButton).toBeDisabled();
    fireEvent.click(exportButton);
    expect(generateMenroExcel).not.toHaveBeenCalled();
  });

  it('renders the Print QR Codes button after the Inventory_Fetch resolves', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    // Wait for the Loaded_State so the useEffect-driven fetch has run.
    await screen.findByTestId('inventory-table');

    const qrButton = screen.getByRole('button', { name: 'Print QR Codes' });
    expect(qrButton).toBeInTheDocument();
  });

  it('calls window.print() on click and does not touch the network, Supabase, or downloads', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    resolveOk(MOCK_TREES);

    renderInventory();

    await screen.findByTestId('inventory-table');

    // The useEffect-driven Inventory_Fetch already called `fromSpy` exactly
    // once with 'trees'. Capture that baseline so the post-click assertion
    // can prove the QR handler issued zero additional Supabase calls.
    expect(fromSpy).toHaveBeenCalledTimes(1);
    expect(fromSpy).toHaveBeenCalledWith('trees');

    const qrButton = screen.getByRole('button', { name: 'Print QR Codes' });
    fireEvent.click(qrButton);

    // Requirement 2.1 — window.print() is invoked exactly once.
    expect(printSpy).toHaveBeenCalledTimes(1);

    // Requirement 2.2 — no file download. The CSV_Export sequence wires
    // `URL.createObjectURL` / `URL.revokeObjectURL`; the QR handler must touch
    // neither.
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();

    // No additional Supabase call beyond the initial Inventory_Fetch.
    expect(fromSpy).toHaveBeenCalledTimes(1);
    expect(fromSpy).toHaveBeenCalledWith('trees');

    printSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Task 6.3 (QR Stickers) — QR_Sticker_Sheet and QR_Sticker rendering.
  // Pins Requirements 9.4 (QRCodeSVG components present in DOM) and 9.5
  // (existing test baseline remains passing).
  //
  // The QR_Sticker_Sheet is rendered with `hidden print:block` so it is
  // invisible on screen but present in the DOM for testing purposes.
  // ---------------------------------------------------------------------------

  it('renders the QR_Sticker_Sheet container with data-testid="qr-sticker-sheet"', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    await screen.findByTestId('inventory-table');

    const stickerSheet = screen.getByTestId('qr-sticker-sheet');
    expect(stickerSheet).toBeInTheDocument();
  });

  it('renders one QR_Sticker per Tree_Record in the loaded list', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    await screen.findByTestId('inventory-table');

    const stickers = screen.getAllByTestId('qr-sticker');
    expect(stickers).toHaveLength(MOCK_TREES.length);
  });

  it('renders a QRCodeSVG component inside each QR_Sticker (Requirement 9.4)', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    await screen.findByTestId('inventory-table');

    const qrCodes = screen.getAllByTestId('qr-code-svg');
    expect(qrCodes).toHaveLength(MOCK_TREES.length);

    // A sticker carries the tag number, falling back to the row id when a tree
    // has not been given one — an empty QR code would be a wasted sticker.
    const values = qrCodes.map((qr) => qr.getAttribute('data-value')).sort();
    expect(values).toEqual(['T-001', 'T-002', 't-3']);
  });

  it('renders an LGU_Logo_Placeholder inside each QR_Sticker', async () => {
    resolveOk(MOCK_TREES);

    renderInventory();

    await screen.findByTestId('inventory-table');

    const logos = screen.getAllByTestId('lgu-logo-placeholder');
    expect(logos).toHaveLength(MOCK_TREES.length);
  });

  it('renders zero QR_Stickers when the tree list is empty', async () => {
    resolveOk([]);

    renderInventory();

    await screen.findByTestId('inventory-empty');

    // The sticker sheet is still in the DOM but contains no sticker children.
    const stickerSheet = screen.getByTestId('qr-sticker-sheet');
    expect(stickerSheet).toBeInTheDocument();

    const stickers = screen.queryAllByTestId('qr-sticker');
    expect(stickers).toHaveLength(0);
  });
});
