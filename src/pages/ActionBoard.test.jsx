import fc from 'fast-check';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import ActionBoard from './ActionBoard.jsx';
import { classifyHazard, HAZARD_STATUS } from '../lib/hazardStatus.js';
import { treeRecordArb } from '../test/arbitraries.js';

/**
 * The Action Board is where MENRO works the hazard queue: every tree the hazard
 * classifier flags becomes a card with a dispatch and a permit action, beside
 * the walk-in request form and the permit log.
 */

const HAZARD_TREE = {
  id: 'tree-hazard',
  tree_id: 'T-001',
  species: 'Narra',
  barangay: 'Poblacion',
  dbh: '42 cm',
  latitude: 14.281,
  longitude: 121.411,
  is_leaning: true,
  has_powerline_conflict: false,
  is_decayed: false,
  is_root_problem: false,
  assigned_to: null,
  has_cutting_permit: false,
  photo_url: null,
};

const SAFE_TREE = {
  id: 'tree-safe',
  tree_id: 'T-002',
  species: 'Acacia',
  barangay: 'Bubukal',
  dbh: '30 cm',
  latitude: 14.282,
  longitude: 121.412,
  is_leaning: false,
  has_powerline_conflict: false,
  is_decayed: false,
  is_root_problem: false,
  assigned_to: null,
  has_cutting_permit: false,
  photo_url: null,
};

const loadTrees = (rows) => supabaseMock.setResponse('trees:select', { data: rows, error: null });

function renderBoard() {
  return render(
    <MemoryRouter>
      <ActionBoard />
    </MemoryRouter>
  );
}

/** Every hazard card on screen. */
const cards = () => screen.queryAllByRole('article');

beforeEach(() => {
  supabaseMock.reset();
  navigateSpy.mockReset();
  loadTrees([HAZARD_TREE, SAFE_TREE]);
});

afterEach(cleanup);

describe('ActionBoard', () => {
  it('reads the trees table once and shows the hazard queue', async () => {
    renderBoard();

    expect(screen.getByText('Loading hazard tickets…')).toBeInTheDocument();
    await waitFor(() => expect(cards()).toHaveLength(1));

    const reads = supabaseMock.calls.filter((c) => c.table === 'trees' && c.op === 'select');
    expect(reads).toHaveLength(1);
  });

  it('cards only the trees the hazard classifier flags', async () => {
    renderBoard();

    await waitFor(() => expect(cards()).toHaveLength(1));
    const card = cards()[0];
    expect(within(card).getByText('Narra')).toBeInTheDocument();
    expect(within(card).getByText('Leaning')).toBeInTheDocument();
    // The safe tree is not a ticket.
    expect(screen.queryByText('Acacia')).not.toBeInTheDocument();
  });

  it('says so when nothing is hazardous, rather than showing an empty board', async () => {
    loadTrees([SAFE_TREE]);
    renderBoard();

    expect(await screen.findByText('No hazardous trees found.')).toBeInTheDocument();
    expect(cards()).toHaveLength(0);
  });

  it('surfaces a failed read instead of looking like an empty queue', async () => {
    supabaseMock.setResponse('trees:select', { data: null, error: { message: 'connection refused' } });
    renderBoard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('connection refused');
    expect(screen.queryByText('No hazardous trees found.')).not.toBeInTheDocument();
  });

  it('shows who a ticket is assigned to, or a dash', async () => {
    loadTrees([HAZARD_TREE, { ...HAZARD_TREE, id: 'tree-assigned', assigned_to: 'arb@menro.gov.ph' }]);
    renderBoard();

    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.getByText('arb@menro.gov.ph')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    // An assigned ticket offers re-assignment, not a fresh dispatch.
    expect(screen.getByRole('button', { name: 'Re-Assign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dispatch' })).toBeInTheDocument();
  });

  it('opens the dispatch modal from a ticket', async () => {
    renderBoard();
    await waitFor(() => expect(cards()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Dispatch' }));

    expect(await screen.findByText('Dispatch Field Worker')).toBeInTheDocument();
  });

  it('offers a permit until one is issued, then shows the badge instead', async () => {
    loadTrees([HAZARD_TREE, { ...HAZARD_TREE, id: 'tree-permitted', has_cutting_permit: true }]);
    renderBoard();

    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(screen.getByRole('button', { name: 'Issue Permit' })).toBeInTheDocument();
    expect(screen.getByText('Permit Issued')).toBeInTheDocument();
  });

  it('opens the permit modal from a ticket', async () => {
    renderBoard();
    await waitFor(() => expect(cards()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Issue Permit' }));

    expect(await screen.findByText('Issue Cutting Permit')).toBeInTheDocument();
  });

  it('sends the map the tree it was asked to show', async () => {
    renderBoard();
    await waitFor(() => expect(cards()).toHaveLength(1));

    fireEvent.click(screen.getAllByRole('button', { name: /View on Map/ })[0]);

    expect(navigateSpy).toHaveBeenCalledWith(
      `/map?lat=${HAZARD_TREE.latitude}&lng=${HAZARD_TREE.longitude}&tree=${HAZARD_TREE.id}`
    );
  });

  // ---------------------------------------------------------------------------
  // The tabs
  // ---------------------------------------------------------------------------

  it('opens on the hazard queue, and swaps sub-views without re-reading the trees', async () => {
    renderBoard();
    await waitFor(() => expect(cards()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: /Public Walk-in Requests/ }));
    await waitFor(() => expect(cards()).toHaveLength(0));

    fireEvent.click(screen.getByRole('button', { name: /Permit Logs/ }));
    await waitFor(() => expect(screen.queryByText('Narra')).not.toBeInTheDocument());

    // Count after the other tabs have had their own reads — the walk-in form
    // loads trees of its own to pick from — so this measures the board, not them.
    const readsBeforeReturn = supabaseMock.calls.filter(
      (c) => c.table === 'trees' && c.op === 'select',
    ).length;

    fireEvent.click(screen.getByRole('button', { name: /Hazard Management/ }));
    await waitFor(() => expect(cards()).toHaveLength(1));

    // Coming back to the queue is a view switch, not a reload.
    expect(supabaseMock.calls.filter((c) => c.table === 'trees' && c.op === 'select')).toHaveLength(
      readsBeforeReturn,
    );
  });

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  it('cards exactly the hazard-classified rows, whatever the fetch returns', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(treeRecordArb, { maxLength: 8 }).map((rows) => rows.map((t, i) => ({ ...t, id: `row-${i}` }))),
        async (trees) => {
          supabaseMock.reset();
          loadTrees(trees);
          renderBoard();

          const expected = trees.filter((t) => classifyHazard(t) === HAZARD_STATUS.HAZARD);
          try {
            await waitFor(() => expect(cards()).toHaveLength(expected.length));
            if (expected.length === 0) {
              expect(screen.getByText('No hazardous trees found.')).toBeInTheDocument();
            }
            return true;
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 15 }
    );
  });

  it('writes nothing to Supabase just by being looked at', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('walkins', 'permits', 'hazards'), { maxLength: 5 }),
        async (tabs) => {
          supabaseMock.reset();
          loadTrees([HAZARD_TREE, SAFE_TREE]);
          renderBoard();
          await waitFor(() => expect(cards()).toHaveLength(1));

          const labels = {
            walkins: /Public Walk-in Requests/,
            permits: /Permit Logs/,
            hazards: /Hazard Management/,
          };
          for (const tab of tabs) {
            fireEvent.click(screen.getByRole('button', { name: labels[tab] }));
          }

          try {
            // Reading is fine; changing a record needs someone to ask for it.
            expect(supabaseMock.calls.every((c) => c.op === 'select')).toBe(true);
            return true;
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 10 }
    );
  });

  it('keys cards by tree id, so React never warns about collisions', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadTrees([HAZARD_TREE, { ...HAZARD_TREE, id: 'tree-hazard-2', tree_id: 'T-003' }]);
    renderBoard();

    await waitFor(() => expect(cards()).toHaveLength(2));
    const keyWarnings = errorSpy.mock.calls.filter((args) => String(args[0]).includes('key'));
    expect(keyWarnings).toEqual([]);
    errorSpy.mockRestore();
  });
});
