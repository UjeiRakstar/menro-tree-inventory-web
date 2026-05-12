import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// -----------------------------------------------------------------------------
// Hoisted spies so vi.mock factories (themselves hoisted) can reference them.
// -----------------------------------------------------------------------------
const { selectSpy, fromSpy } = vi.hoisted(() => {
  const selectSpy = vi.fn();
  const fromSpy = vi.fn(() => ({
    select: selectSpy,
  }));
  return { selectSpy, fromSpy };
});

// -----------------------------------------------------------------------------
// Mock the Supabase client using the hoisted pattern.
// -----------------------------------------------------------------------------
vi.mock('../supabaseClient.js', () => ({
  supabase: { from: fromSpy },
}));

// Import AFTER vi.mock declarations so the mock is picked up.
import AnalyticsView from './AnalyticsView.jsx';

// -----------------------------------------------------------------------------
// Mock data: 5 Tree_Records across 2 barangays with diverse fields.
// -----------------------------------------------------------------------------
const mockTrees = [
  {
    id: 'tree-1',
    tree_id: 'T-001',
    species: 'Narra',
    species_type: 'Endemic',
    tree_category: 'Timber',
    dbh: '20',
    barangay: 'San Isidro',
    latitude: 14.281,
    longitude: 121.411,
  },
  {
    id: 'tree-2',
    tree_id: 'T-002',
    species: 'Mahogany',
    species_type: 'Invasive',
    tree_category: 'Timber',
    dbh: '15',
    barangay: 'San Isidro',
    latitude: 14.282,
    longitude: 121.412,
  },
  {
    id: 'tree-3',
    tree_id: 'T-003',
    species: 'Mango',
    species_type: 'Endemic',
    tree_category: 'Fruit',
    dbh: '30',
    barangay: 'Bagumbayan',
    latitude: 14.283,
    longitude: 121.413,
  },
  {
    id: 'tree-4',
    tree_id: 'T-004',
    species: 'Bougainvillea',
    species_type: 'Invasive',
    tree_category: 'Ornamental',
    dbh: '8',
    barangay: 'Bagumbayan',
    latitude: 14.284,
    longitude: 121.414,
  },
  {
    id: 'tree-5',
    tree_id: 'T-005',
    species: 'Kamagong',
    species_type: 'Endemic',
    tree_category: undefined,
    dbh: '25',
    barangay: 'San Isidro',
    latitude: 14.285,
    longitude: 121.415,
  },
];

const resolveOk = (data) =>
  selectSpy.mockResolvedValueOnce({ data, error: null });
const resolveErr = (error) =>
  selectSpy.mockResolvedValueOnce({ data: null, error });

beforeEach(() => {
  selectSpy.mockReset();
  fromSpy.mockClear();
});

describe('AnalyticsView', () => {
  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('renders a loading indicator with role="status" while fetch is pending', () => {
    selectSpy.mockReturnValueOnce(new Promise(() => {}));
    render(<AnalyticsView />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  it('renders an error alert with the error message when Supabase returns an error', async () => {
    resolveErr({ message: 'Failed to fetch trees' });
    render(<AnalyticsView />);
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toContain('Failed to fetch trees');
  });

  // ---------------------------------------------------------------------------
  // Loaded state — headings
  // ---------------------------------------------------------------------------

  it('renders "Biodiversity Dashboard" heading when loaded', async () => {
    resolveOk(mockTrees);
    render(<AnalyticsView />);
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: 'Biodiversity Dashboard',
    });
    expect(heading).toBeInTheDocument();
  });

  it('renders "Carbon Sequestration & Stand Table" heading when loaded', async () => {
    resolveOk(mockTrees);
    render(<AnalyticsView />);
    const heading = await screen.findByRole('heading', {
      level: 2,
      name: /Carbon Sequestration/,
    });
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toContain('Carbon Sequestration');
    expect(heading.textContent).toContain('Stand Table');
  });

  // ---------------------------------------------------------------------------
  // Loaded state — progress bars
  // ---------------------------------------------------------------------------

  it('renders 5 progress bars (2 species type + 3 tree category)', async () => {
    resolveOk(mockTrees);
    const { container } = render(<AnalyticsView />);
    await screen.findByRole('heading', { name: 'Biodiversity Dashboard' });

    // Progress bars are identified by their Tailwind bg color classes and inline width style
    const progressBars = container.querySelectorAll(
      '.bg-green-500, .bg-red-500, .bg-amber-500, .bg-emerald-500, .bg-purple-500'
    );
    expect(progressBars).toHaveLength(5);
  });

  // ---------------------------------------------------------------------------
  // Loaded state — barangay group headers and sub-rows
  // ---------------------------------------------------------------------------

  it('renders barangay group headers with correct names and total carbon', async () => {
    resolveOk(mockTrees);
    render(<AnalyticsView />);
    await screen.findByRole('heading', { name: /Carbon Sequestration/ });

    // San Isidro: trees 1 (20*1.5=30), 2 (15*1.5=22.5), 5 (25*1.5=37.5) → total 90.0
    // Bagumbayan: trees 3 (30*1.5=45), 4 (8*1.5=12) → total 57.0
    expect(screen.getByText(/San Isidro/)).toBeInTheDocument();
    expect(screen.getByText(/Bagumbayan/)).toBeInTheDocument();
    expect(screen.getByText(/90\.0/)).toBeInTheDocument();
    expect(screen.getByText(/57\.0/)).toBeInTheDocument();
  });

  it('renders sub-rows with species, DBH, and carbon values', async () => {
    resolveOk(mockTrees);
    render(<AnalyticsView />);
    await screen.findByRole('heading', { name: /Carbon Sequestration/ });

    // Verify species names appear in sub-rows
    expect(screen.getByText('Narra')).toBeInTheDocument();
    expect(screen.getByText('Mahogany')).toBeInTheDocument();
    expect(screen.getByText('Mango')).toBeInTheDocument();
    expect(screen.getByText('Bougainvillea')).toBeInTheDocument();
    expect(screen.getByText('Kamagong')).toBeInTheDocument();

    // Verify DBH values appear
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();

    // Verify individual carbon values (dbh * 1.5)
    expect(screen.getByText('30.0')).toBeInTheDocument(); // 20 * 1.5
    expect(screen.getByText('22.5')).toBeInTheDocument(); // 15 * 1.5
    expect(screen.getByText('45.0')).toBeInTheDocument(); // 30 * 1.5
    expect(screen.getByText('12.0')).toBeInTheDocument(); // 8 * 1.5
    expect(screen.getByText('37.5')).toBeInTheDocument(); // 25 * 1.5
  });

  // ---------------------------------------------------------------------------
  // Loaded state — Download Shapefile button
  // ---------------------------------------------------------------------------

  it('renders "Download Shapefile" button and logs on click', async () => {
    resolveOk(mockTrees);
    render(<AnalyticsView />);
    const button = await screen.findByRole('button', {
      name: 'Download Shapefile',
    });
    expect(button).toBeInTheDocument();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    fireEvent.click(button);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Shapefile')
    );
    logSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Loaded state — Download DENR Report button
  // ---------------------------------------------------------------------------

  it('renders "Download DENR Report (PDF/Excel)" button and logs on click', async () => {
    resolveOk(mockTrees);
    render(<AnalyticsView />);
    const button = await screen.findByRole('button', {
      name: 'Download DENR Report (PDF/Excel)',
    });
    expect(button).toBeInTheDocument();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    fireEvent.click(button);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('DENR Report')
    );
    logSpy.mockRestore();
  });
});
