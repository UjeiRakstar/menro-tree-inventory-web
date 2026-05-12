import { fireEvent, render, screen } from '@testing-library/react';

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
vi.mock('qrcode.react', () => ({
  QRCodeSVG: (props) => <div data-testid="qr-code-svg" data-value={props.value} />,
}));

// Imports MUST come after the `vi.mock` declarations so they pick up the mocks.
import InventoryView from './InventoryView.jsx';

// -----------------------------------------------------------------------------
// Resolution helpers — push a single `{ data, error }` payload onto `selectSpy`.
// Each `render(<InventoryView />)` consumes exactly one enqueued resolution.
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
//   • A comma in `species` (row 2: "Mahogany, large") so the CSV RFC 4180
//     quoting path is exercised through the rendered row.
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

  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();

  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  delete global.URL.createObjectURL;
  delete global.URL.revokeObjectURL;

  consoleLogSpy.mockRestore();
});

describe('InventoryView / Central_Inventory', () => {
  // Smoke test — proves the scaffold runs end-to-end: the Supabase mock is
  // consumed, the fetch-on-mount useEffect resolves, and the Loaded_State
  // renders one row per Tree_Record. Fully-detailed assertions live in the
  // subsequent tasks (6.2 table structure, 6.3 pills, 6.4 CSV, 6.5 QR stub).
  it('renders the MOCK_TREES fixture after the Inventory_Fetch resolves', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

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

    render(<InventoryView />);

    // Wait for the Loaded_State so the useEffect-driven fetch has run.
    await screen.findByTestId('inventory-table');

    // Exactly one `from('trees')` call, and the chained `select('*')` call,
    // pin Requirement 3.2's Inventory_Fetch contract.
    expect(fromSpy).toHaveBeenCalledWith('trees');
    expect(selectSpy).toHaveBeenCalledWith('*');
  });

  it('renders the six Master_Data_Table column headers in order', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    const table = await screen.findByTestId('inventory-table');
    const headerCells = table.querySelectorAll('thead th');

    expect(Array.from(headerCells).map((th) => th.textContent)).toEqual([
      'Tree ID',
      'Species',
      'DBH (cm)',
      'Hazard Status',
      'Permit Status',
      'Assigned To',
    ]);
  });

  it('renders one body row per Tree_Record with populated id/species/dbh/assigned_to cells', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    const table = await screen.findByTestId('inventory-table');
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(MOCK_TREES.length);

    // Cell-by-cell projection check. The Hazard Status (col 3) and Permit
    // Status (col 4) cells are driven by the classifiers and are pinned by
    // task 6.3 — this test only asserts the four directly-projected columns
    // Requirement 9.5 calls out: Tree ID, Species, DBH, Assigned To.
    const DASH = '—';
    const expectedRows = [
      { treeId: 'T-001', species: 'Narra', dbh: '42', assignedTo: 'arb-001' },
      { treeId: 'T-002', species: 'Acacia', dbh: '30', assignedTo: DASH },
      { treeId: DASH, species: 'Mahogany, large', dbh: '55', assignedTo: DASH },
    ];

    bodyRows.forEach((row, i) => {
      const cells = row.querySelectorAll('td');
      const expected = expectedRows[i];
      expect(cells[0].textContent).toBe(expected.treeId);
      expect(cells[1].textContent).toBe(expected.species);
      expect(cells[2].textContent).toBe(expected.dbh);
      expect(cells[5].textContent).toBe(expected.assignedTo);
    });
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

  it('renders the Hazard_Pill with visible text "Hazard" on rows with any Hazard_Flag true', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    const table = await screen.findByTestId('inventory-table');
    const bodyRows = table.querySelectorAll('tbody tr');

    // Row 0 (T-001) has `is_leaning: true` — Hazard Status cell (col 3) must
    // render a pill whose visible text is exactly "Hazard" and whose wrapping
    // span carries the red-palette pill utilities.
    const hazardCell = bodyRows[0].querySelectorAll('td')[3];
    const hazardPill = hazardCell.querySelector('span');
    expect(hazardPill).not.toBeNull();
    expect(hazardPill.textContent).toBe('Hazard');
    expect(hazardPill.className).toMatch(/rounded-full/);
    expect(hazardPill.className).toMatch(/bg-red-/);
  });

  it('renders the Hazard_Pill with visible text "Safe" on rows with all four Hazard_Flags false', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    const table = await screen.findByTestId('inventory-table');
    const bodyRows = table.querySelectorAll('tbody tr');

    // Row 1 (T-002) has all four Hazard_Flags set to false — Hazard Status
    // cell (col 3) must render a pill whose visible text is exactly "Safe"
    // and whose wrapping span carries the emerald/green-palette pill utilities.
    const safeCell = bodyRows[1].querySelectorAll('td')[3];
    const safePill = safeCell.querySelector('span');
    expect(safePill).not.toBeNull();
    expect(safePill.textContent).toBe('Safe');
    expect(safePill.className).toMatch(/rounded-full/);
    expect(safePill.className).toMatch(/bg-emerald-/);
  });

  it('renders the Permit_Pill with visible text "Approved" when has_cutting_permit is true', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    const table = await screen.findByTestId('inventory-table');
    const bodyRows = table.querySelectorAll('tbody tr');

    // Row 1 (T-002) has `has_cutting_permit: true` — Permit Status cell
    // (col 4) must render a pill whose visible text is exactly "Approved"
    // and whose wrapping span carries the amber/yellow-palette pill utilities.
    const permitCell = bodyRows[1].querySelectorAll('td')[4];
    const permitPill = permitCell.querySelector('span');
    expect(permitPill).not.toBeNull();
    expect(permitPill.textContent).toBe('Approved');
    expect(permitPill.className).toMatch(/rounded-full/);
    expect(permitPill.className).toMatch(/bg-amber-/);
  });

  it('renders plain text "None" without a pill background when has_cutting_permit is false', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    const table = await screen.findByTestId('inventory-table');
    const bodyRows = table.querySelectorAll('tbody tr');

    // Rows 0 (T-001) and 2 (null tree_id) both have `has_cutting_permit: false`
    // — the Permit Status cell (col 4) must render the plain text "None"
    // without any pill-like styling. We verify by checking that whatever
    // wraps the text does NOT carry the `rounded-full` + `bg-amber-*`
    // Tailwind tokens the Permit_Pill would otherwise apply.
    for (const rowIndex of [0, 2]) {
      const noneCell = bodyRows[rowIndex].querySelectorAll('td')[4];
      expect(noneCell.textContent).toBe('None');

      // If the cell uses an inner <span> for layout/colour, that span must
      // NOT look like a pill — no rounded-full, no amber background.
      const inner = noneCell.querySelector('span');
      const classForPillCheck = inner ? inner.className : noneCell.className;
      expect(classForPillCheck).not.toMatch(/rounded-full/);
      expect(classForPillCheck).not.toMatch(/bg-amber-/);
    }
  });

  // ---------------------------------------------------------------------------
  // Task 6.4 — CSV_Export_Button wiring. Pins Requirements 7.2 (full native
  // Blob → object URL → dynamic <a> → click → revoke sequence) and 7.8
  // (activation on an empty Tree_Record_List is a no-op).
  //
  // `URL.createObjectURL` and `URL.revokeObjectURL` are stubbed in `beforeEach`
  // because jsdom does not implement them. `HTMLAnchorElement.prototype.click`
  // is spied *inside* the test so the spy is scoped to the activation and
  // restored before sibling tests run (a real anchor click would otherwise
  // attempt a navigation under jsdom).
  // ---------------------------------------------------------------------------

  it('renders the Download CSV button after the Inventory_Fetch resolves', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    // Wait for the Loaded_State so the useEffect-driven fetch has run.
    await screen.findByTestId('inventory-table');

    const csvButton = screen.getByRole('button', { name: 'Download CSV' });
    expect(csvButton).toBeInTheDocument();
  });

  it('activates the native CSV_Export sequence: Blob(text/csv) → createObjectURL → anchor click → revokeObjectURL', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    await screen.findByTestId('inventory-table');

    // Spy on the anchor prototype's `click` BEFORE activation so we observe
    // the programmatic click inside `handleExportCsv` without dispatching a
    // real jsdom navigation. `mockImplementation(() => {})` neutralises the
    // default click behaviour.
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      const csvButton = screen.getByRole('button', { name: 'Download CSV' });
      fireEvent.click(csvButton);

      // `URL.createObjectURL` called exactly once with a Blob whose MIME
      // type is `text/csv` — pins the `new Blob([csv], { type: 'text/csv' })`
      // contract from Requirement 7.2.
      expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1);
      const blobArg = global.URL.createObjectURL.mock.calls[0][0];
      expect(blobArg).toBeInstanceOf(Blob);
      expect(blobArg.type).toBe('text/csv');

      // The dynamically-created anchor's `.click()` fired exactly once.
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);

      // And the object URL was released exactly once via revokeObjectURL.
      expect(global.URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      anchorClickSpy.mockRestore();
    }
  });

  it('no-ops the CSV_Export_Button when the Tree_Record_List is empty (Requirement 7.8)', async () => {
    // Empty Inventory_Fetch resolution → Empty_State. The button itself is
    // `disabled={trees.length === 0}` in the implementation, so fireEvent.click
    // generally won't fire onClick on a disabled button. Belt-and-suspenders:
    // even if the guard on the button ever regresses, the handler's own
    // `trees.length === 0` early return still ensures no download fires.
    resolveOk([]);

    render(<InventoryView />);

    // Wait for the Empty_State to resolve so the useEffect-driven fetch has run.
    await screen.findByTestId('inventory-empty');

    const csvButton = screen.getByRole('button', { name: 'Download CSV' });

    // Belt: the button itself is guarded via the `disabled` attribute.
    expect(csvButton).toBeDisabled();

    // Suspenders: activating it must not trigger any CSV machinery.
    fireEvent.click(csvButton);

    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Task 6.5 — Batch_QR_Print_Button console.log stub. Pins Requirements 8.2
  // (single `console.log` with the exact `Initiating A4 QR Print Layout for
  // X trees` message) and 8.3 (no file download, no Supabase call, no print
  // dialog, no navigation in Phase 4).
  //
  // `consoleLogSpy` is already wired in the top-level `beforeEach` /
  // `afterEach` so log assertions never leak across sibling tests.
  // ---------------------------------------------------------------------------

  it('renders the Print QR Stickers (A4) button after the Inventory_Fetch resolves', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    // Wait for the Loaded_State so the useEffect-driven fetch has run.
    await screen.findByTestId('inventory-table');

    const qrButton = screen.getByRole('button', {
      name: 'Print QR Stickers (A4)',
    });
    expect(qrButton).toBeInTheDocument();
  });

  it('calls window.print() on click and does not touch the network, Supabase, or downloads', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    await screen.findByTestId('inventory-table');

    // The useEffect-driven Inventory_Fetch already called `fromSpy` exactly
    // once with 'trees'. Capture that baseline so the post-click assertion
    // can prove the QR handler issued zero additional Supabase calls.
    expect(fromSpy).toHaveBeenCalledTimes(1);
    expect(fromSpy).toHaveBeenCalledWith('trees');

    const qrButton = screen.getByRole('button', {
      name: 'Print QR Stickers (A4)',
    });
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

    render(<InventoryView />);

    await screen.findByTestId('inventory-table');

    const stickerSheet = screen.getByTestId('qr-sticker-sheet');
    expect(stickerSheet).toBeInTheDocument();
  });

  it('renders one QR_Sticker per Tree_Record in the loaded list', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    await screen.findByTestId('inventory-table');

    const stickers = screen.getAllByTestId('qr-sticker');
    expect(stickers).toHaveLength(MOCK_TREES.length);
  });

  it('renders a QRCodeSVG component inside each QR_Sticker (Requirement 9.4)', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    await screen.findByTestId('inventory-table');

    const qrCodes = screen.getAllByTestId('qr-code-svg');
    expect(qrCodes).toHaveLength(MOCK_TREES.length);

    // Verify the QR code values match the tree_id fields (empty string for null).
    expect(qrCodes[0]).toHaveAttribute('data-value', 'T-001');
    expect(qrCodes[1]).toHaveAttribute('data-value', 'T-002');
    expect(qrCodes[2]).toHaveAttribute('data-value', '');
  });

  it('renders an LGU_Logo_Placeholder inside each QR_Sticker', async () => {
    resolveOk(MOCK_TREES);

    render(<InventoryView />);

    await screen.findByTestId('inventory-table');

    const logos = screen.getAllByTestId('lgu-logo-placeholder');
    expect(logos).toHaveLength(MOCK_TREES.length);
  });

  it('renders zero QR_Stickers when the tree list is empty', async () => {
    resolveOk([]);

    render(<InventoryView />);

    await screen.findByTestId('inventory-empty');

    // The sticker sheet is still in the DOM but contains no sticker children.
    const stickerSheet = screen.getByTestId('qr-sticker-sheet');
    expect(stickerSheet).toBeInTheDocument();

    const stickers = screen.queryAllByTestId('qr-sticker');
    expect(stickers).toHaveLength(0);
  });
});
