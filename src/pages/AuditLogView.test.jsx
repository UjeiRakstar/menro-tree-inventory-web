import { render, screen } from '@testing-library/react';

// -----------------------------------------------------------------------------
// Hoisted spies so the `vi.mock` factory (itself hoisted above all imports) can
// reference them. Follows the same proven pattern as `Inventory.test.jsx`.
// The AuditLogView chain is: supabase.from('trees').select('*').eq('task_status', 'Cancelled')
// -----------------------------------------------------------------------------
const { eqSpy, selectSpy, fromSpy } = vi.hoisted(() => {
  const eqSpy = vi.fn();
  const selectSpy = vi.fn(() => ({ eq: eqSpy }));
  const fromSpy = vi.fn(() => ({ select: selectSpy }));
  return { eqSpy, selectSpy, fromSpy };
});

// -----------------------------------------------------------------------------
// Mock the Supabase_Client singleton with the chainable query builder that
// supports the `.eq()` filter used by AuditLogView.
// -----------------------------------------------------------------------------
vi.mock('../supabaseClient.js', () => ({
  supabase: { from: fromSpy },
}));

// Imports MUST come after the `vi.mock` declarations so they pick up the mocks.
import AuditLogView from './AuditLogView.jsx';

// -----------------------------------------------------------------------------
// Resolution helpers — push a single `{ data, error }` payload onto `eqSpy`.
// Each `render(<AuditLogView />)` consumes exactly one enqueued resolution.
// -----------------------------------------------------------------------------
const resolveOk = (data) =>
  eqSpy.mockResolvedValueOnce({ data, error: null });
const resolveErr = (error) =>
  eqSpy.mockResolvedValueOnce({ data: null, error });

// -----------------------------------------------------------------------------
// MOCK_CANCELLED_TREES — cancelled Tree_Records for the Ghost_Log_Table tests.
// Exercises: non-null assigned_to (row 0), null assigned_to (row 1).
// -----------------------------------------------------------------------------
const MOCK_CANCELLED_TREES = [
  {
    id: 'c-1',
    tree_id: 'T-100',
    latitude: 14.300,
    longitude: 121.400,
    dbh: '35',
    species: 'Narra',
    scientific_name: 'Pterocarpus indicus',
    species_type: 'Endemic',
    is_leaning: false,
    has_powerline_conflict: false,
    is_decayed: false,
    is_root_problem: false,
    dateCaptured: '2024-05-10T08:00:00.000Z',
    assigned_to: 'arb-005',
    has_cutting_permit: false,
    task_status: 'Cancelled',
    photo_url: null,
  },
  {
    id: 'c-2',
    tree_id: 'T-101',
    latitude: 14.301,
    longitude: 121.401,
    dbh: '28',
    species: 'Acacia',
    scientific_name: 'Acacia confusa',
    species_type: 'Invasive',
    is_leaning: false,
    has_powerline_conflict: false,
    is_decayed: false,
    is_root_problem: false,
    dateCaptured: '2024-06-01T10:30:00.000Z',
    assigned_to: null,
    has_cutting_permit: false,
    task_status: 'Cancelled',
    photo_url: null,
  },
];

// -----------------------------------------------------------------------------
// Per-test setup / teardown
// -----------------------------------------------------------------------------
beforeEach(() => {
  eqSpy.mockReset();
  selectSpy.mockReset().mockReturnValue({ eq: eqSpy });
  fromSpy.mockReset().mockReturnValue({ select: selectSpy });
});

describe('AuditLogView', () => {
  // ---------------------------------------------------------------------------
  // Loading state — Requirement 9.3
  // ---------------------------------------------------------------------------
  it('renders a loading indicator with data-testid="audit-log-loading" and role="status"', () => {
    // Never resolve the Supabase call so the component stays in loading state.
    eqSpy.mockReturnValue(new Promise(() => {}));

    render(<AuditLogView />);

    const loading = screen.getByTestId('audit-log-loading');
    expect(loading).toBeInTheDocument();
    expect(loading).toHaveAttribute('role', 'status');
  });

  // ---------------------------------------------------------------------------
  // Error state — Requirement 9.3
  // ---------------------------------------------------------------------------
  it('renders an error message with data-testid="audit-log-error" and role="alert"', async () => {
    resolveErr({ message: 'Network failure' });

    render(<AuditLogView />);

    const errorEl = await screen.findByTestId('audit-log-error');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveAttribute('role', 'alert');
    expect(errorEl.textContent).toContain('Network failure');
  });

  // ---------------------------------------------------------------------------
  // Loaded state with data — Requirement 9.2
  // ---------------------------------------------------------------------------
  it('renders the Ghost_Log_Table with correct columns and data rows', async () => {
    resolveOk(MOCK_CANCELLED_TREES);

    render(<AuditLogView />);

    const table = await screen.findByTestId('ghost-log-table');
    expect(table).toBeInTheDocument();

    // Verify column headers
    const headers = table.querySelectorAll('thead th');
    const headerTexts = Array.from(headers).map((th) => th.textContent);
    expect(headerTexts).toContain('Tree ID');
    expect(headerTexts).toContain('Species');
    expect(headerTexts).toContain('Assigned Arborist');
    expect(headerTexts).toContain('Date Captured/Cancelled');

    // Verify row count matches data
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(MOCK_CANCELLED_TREES.length);

    // Verify first row cell content
    const firstRowCells = bodyRows[0].querySelectorAll('td');
    expect(firstRowCells[0].textContent).toBe('T-100');
    expect(firstRowCells[1].textContent).toBe('Narra');
    expect(firstRowCells[2].textContent).toBe('arb-005');
    expect(firstRowCells[3].textContent).toBe('2024-05-10T08:00:00.000Z');
  });

  // ---------------------------------------------------------------------------
  // Empty state — Requirement 9.3
  // ---------------------------------------------------------------------------
  it('renders "No cancelled records found." when loaded with empty data', async () => {
    resolveOk([]);

    render(<AuditLogView />);

    const emptyEl = await screen.findByTestId('audit-log-empty');
    expect(emptyEl).toBeInTheDocument();
    expect(emptyEl.textContent).toContain('No cancelled records found.');
  });

  // ---------------------------------------------------------------------------
  // Supabase query contract — Requirement 9.2, 9.6
  // ---------------------------------------------------------------------------
  it('calls Supabase with from("trees").select("*").eq("task_status", "Cancelled")', async () => {
    resolveOk(MOCK_CANCELLED_TREES);

    render(<AuditLogView />);

    await screen.findByTestId('ghost-log-table');

    expect(fromSpy).toHaveBeenCalledWith('trees');
    expect(selectSpy).toHaveBeenCalledWith('*');
    expect(eqSpy).toHaveBeenCalledWith('task_status', 'Cancelled');
  });

  // ---------------------------------------------------------------------------
  // Cancelled badge on each row — Requirement 9.2
  // ---------------------------------------------------------------------------
  it('renders a Cancelled badge on each row with data-testid="cancelled-badge"', async () => {
    resolveOk(MOCK_CANCELLED_TREES);

    render(<AuditLogView />);

    await screen.findByTestId('ghost-log-table');

    const badges = screen.getAllByTestId('cancelled-badge');
    expect(badges).toHaveLength(MOCK_CANCELLED_TREES.length);
    badges.forEach((badge) => {
      expect(badge.textContent).toBe('Cancelled');
    });
  });

  // ---------------------------------------------------------------------------
  // Null assigned_to renders "—" — Requirement 9.2
  // ---------------------------------------------------------------------------
  it('renders "—" placeholder when assigned_to is null', async () => {
    resolveOk(MOCK_CANCELLED_TREES);

    render(<AuditLogView />);

    const table = await screen.findByTestId('ghost-log-table');
    const bodyRows = table.querySelectorAll('tbody tr');

    // Row 1 (c-2) has assigned_to: null — Assigned Arborist column (col 2)
    const secondRowCells = bodyRows[1].querySelectorAll('td');
    expect(secondRowCells[2].textContent).toBe('—');
  });
});
