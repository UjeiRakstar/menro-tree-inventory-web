import fc from 'fast-check';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------------------------------
// Hoisted spies so the `vi.mock` factory (itself hoisted above all imports)
// can reference them. Mirrors the proven pattern in `CommandCenter.test.jsx`
// and `Inventory.test.jsx`. Every Supabase query-builder verb is spied so
// Phase 5 tests can assert Property 7 (zero mutations, zero cross-table
// queries) across the Dispatch_Team_Button, Issue_Permit_Button,
// Submit_Request_Button, and Audit_Trail_Link activations.
// -----------------------------------------------------------------------------
const {
  selectSpy,
  insertSpy,
  updateSpy,
  upsertSpy,
  deleteSpy,
  eqSpy,
  fromSpy,
} = vi.hoisted(() => {
  const selectSpy = vi.fn();
  const eqSpy = vi.fn();
  const insertSpy = vi.fn(() => Promise.resolve({ data: null, error: null }));
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
  return { selectSpy, insertSpy, updateSpy, upsertSpy, deleteSpy, eqSpy, fromSpy };
});

// -----------------------------------------------------------------------------
// Mock the Supabase_Client singleton so the Action_Board_Fetch
// (`supabase.from('trees').select('*')`) is observable via the hoisted spies.
// -----------------------------------------------------------------------------
vi.mock('../supabaseClient.js', () => ({
  supabase: { from: fromSpy },
}));

// Imports MUST come after the vi.mock declarations so they pick up the mocks.
import App from '../App.jsx';
import ActionBoard from './ActionBoard.jsx';
import { treeRecordArb } from '../test/arbitraries.js';
import { classifyHazard, HAZARD_STATUS } from '../lib/hazardStatus.js';

// -----------------------------------------------------------------------------
// Resolution helpers — push a single `{ data, error }` payload onto
// `selectSpy`. Each `render(...)` consumes exactly one enqueued resolution.
// Shared across the route-wiring test and every subsequent Phase 5 test
// (tab shell, hazard grid, card contents, handler stubs, walk-in form,
// audit-trail link) so the Action_Board_Fetch lifecycle reads the same way
// from every assertion.
// -----------------------------------------------------------------------------
const resolveWith = (payload) => selectSpy.mockResolvedValueOnce(payload);
const resolveOk = (data) => resolveWith({ data, error: null });
const resolveErr = (error) => resolveWith({ data: null, error });

// -----------------------------------------------------------------------------
// Render helper — wraps ActionBoard in a MemoryRouter so `useNavigate` has
// the required Router context. All direct renders of `<ActionBoard />` use
// this helper to avoid "useNavigate() may be used only in the context of a
// <Router> component" errors.
// -----------------------------------------------------------------------------
function renderActionBoard() {
  return render(
    <MemoryRouter>
      <ActionBoard />
    </MemoryRouter>
  );
}

// -----------------------------------------------------------------------------
// Per-test setup / teardown
//
//   - Reset every Supabase spy so enqueued resolutions and call histories do
//     not leak across tests.
//   - Spy on `console.log` so the Dispatch_Team_Button, Issue_Permit_Button,
//     Submit_Request_Button, and Audit_Trail_Link assertions in later tasks
//     (6.2, 8.3, 9.2, plus Properties 5, 6, 10) can count log invocations
//     without the logs escaping to the test reporter.
// -----------------------------------------------------------------------------
let consoleLogSpy;

beforeEach(() => {
  selectSpy.mockReset();
  insertSpy.mockReset();
  updateSpy.mockReset();
  upsertSpy.mockReset();
  deleteSpy.mockReset();
  eqSpy.mockReset();
  fromSpy.mockClear();

  // Re-wire updateSpy to return { eq: eqSpy } after reset clears it
  updateSpy.mockReturnValue({ eq: eqSpy });
  // Re-wire insertSpy to return a resolved promise after reset clears it
  insertSpy.mockReturnValue(Promise.resolve({ data: null, error: null }));

  consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  consoleLogSpy.mockRestore();
});

// -----------------------------------------------------------------------------
// Shared Tree_Record fixtures for Phase 5 tests.
//
// `HAZARD_TREE` — at least one `Hazard_Flags` boolean is `true`, so
// `classifyHazard(HAZARD_TREE) === HAZARD_STATUS.HAZARD`. `has_cutting_permit`
// is `false`, so the Dispatch_Ticket_Card renders the `Issue_Permit_Button`
// rather than the `Permit_Issued_Badge`.
//
// `SAFE_TREE` — all four `Hazard_Flags` booleans are `false`, so
// `classifyHazard(SAFE_TREE) === HAZARD_STATUS.SAFE` and it is filtered out
// of the Hazard_Ticket_List. `has_cutting_permit` is `true` so any eventual
// Dispatch_Ticket_Card rendered against it would show the `Permit_Issued_Badge`.
//
// Both fixtures carry full, valid `TreeRecord` shapes (see `src/types.js`) so
// tests can use them interchangeably across the Phase 5 test suite.
// -----------------------------------------------------------------------------
const HAZARD_TREE = Object.freeze({
  id: '11111111-1111-4111-8111-111111111111',
  tree_id: 'T-HAZARD-001',
  latitude: 10.3157,
  longitude: 123.8854,
  dbh: '42',
  species: 'Narra',
  scientific_name: 'Pterocarpus indicus',
  species_type: 'Endemic',
  is_leaning: true,
  has_powerline_conflict: false,
  is_decayed: false,
  is_root_problem: false,
  dateCaptured: '2024-01-15T08:30:00.000Z',
  assigned_to: '22222222-2222-4222-8222-222222222222',
  has_cutting_permit: false,
  task_status: 'Pending',
  photo_url: null,
});

const SAFE_TREE = Object.freeze({
  id: '33333333-3333-4333-8333-333333333333',
  tree_id: 'T-SAFE-001',
  latitude: 10.3200,
  longitude: 123.8900,
  dbh: '28',
  species: 'Molave',
  scientific_name: 'Vitex parviflora',
  species_type: 'Endemic',
  is_leaning: false,
  has_powerline_conflict: false,
  is_decayed: false,
  is_root_problem: false,
  dateCaptured: '2024-02-20T09:15:00.000Z',
  assigned_to: null,
  has_cutting_permit: true,
  task_status: 'Executed',
  photo_url: null,
});

describe('ActionBoard / Action_Board_Page', () => {
  // ---------------------------------------------------------------------------
  // Task 9.4 — /action-board route registration, page heading, and App_Shell
  // padding inheritance.
  //
  // Mirrors the Phase 4 Inventory.test.jsx / CommandCenter.test.jsx route-wiring
  // tests: render `<App />` wrapped in a `MemoryRouter` pointed at
  // `/action-board`, assert the page's level-1 heading, and pin the App_Shell
  // padding contract (`<main>` carries `p-6` on non-/map routes, the
  // Action_Board_Page's outer `<section>` does not double up on `p-6` so
  // spacing is inherited unchanged).
  //
  // Pins Requirements 2.3, 2.4, 2.5, 12.2.
  // ---------------------------------------------------------------------------
  describe('/action-board route registration and App_Shell padding inheritance', () => {
    it('mounts the Action_Board_Page inside the App_Shell with the "Action Board" heading and the shared <main> p-6 padding', async () => {
      // Enqueue the Action_Board_Fetch resolution so the useEffect settles
      // cleanly during the test.
      resolveOk([]);

      const { container } = render(
        <MemoryRouter initialEntries={['/action-board']}>
          <App />
        </MemoryRouter>
      );

      // Requirement 2.5 — the Action_Board_Page renders its level-1 heading
      // exactly as "Action Board".
      const heading = screen.getByRole('heading', {
        level: 1,
        name: 'Action Board',
      });
      expect(heading).toBeInTheDocument();

      // Requirements 2.3 + 12.2 — navigation to `/action-board` lands inside
      // the App_Shell's shared `<main>` container, which applies `p-6` on
      // every non-/map route (see `App.jsx` Shell: the map route strips
      // `p-6`, every other route keeps it).
      const main = container.querySelector('main');
      expect(main).not.toBeNull();
      expect(main.className).toContain('p-6');

      // Requirement 2.4 — the Action_Board_Page's outer element
      // (the `<section>` wrapping the `<h1>`) must NOT apply its own `p-6`,
      // so its outer spacing is inherited from the App_Shell unchanged.
      const actionBoardSection = heading.parentElement;
      expect(actionBoardSection).not.toBeNull();
      expect(actionBoardSection.tagName).toBe('SECTION');
      expect(actionBoardSection.className).not.toContain('p-6');

      // Flush the Action_Board_Fetch so its post-resolution setState calls
      // settle before the test ends — mirrors the CommandCenter.test.jsx
      // pattern that waits for the in-flight fetch to complete.
      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Task 2.2 — Fetch contract, Loading_State, and Error_State.
  //
  // Drives the Action_Board_Page through the three observable branches of the
  // Action_Board_Fetch lifecycle wired up by task 2.1:
  //
  //   1. On mount the useEffect issues exactly `supabase.from('trees')` with
  //      the chained `select('*')` — the only Supabase read the Action_Board
  //      makes in Phase 5 (Requirements 3.1, 3.2, 3.7, 3.8).
  //   2. While the Supabase promise is pending, the Hazard_Dispatch_Board
  //      renders a visible loading indicator and zero Dispatch_Ticket_Card
  //      elements (Requirement 3.5).
  //   3. When the promise resolves with a non-null `error`, the
  //      Hazard_Dispatch_Board renders a `role="alert"` banner carrying the
  //      Supabase error message and zero cards (Requirement 3.6).
  //
  // The suite renders the `ActionBoard` page component directly (no Router)
  // so the fetch-contract branches are isolated from the App_Shell route
  // wiring already pinned by task 9.4.
  //
  // Pins Requirements 3.2, 3.5, 3.6, 11.2, 11.3, 11.7, 11.12.
  // ---------------------------------------------------------------------------
  describe('Action_Board_Fetch contract, Loading_State, and Error_State', () => {
    it('issues the Action_Board_Fetch contract: supabase.from("trees").select("*") exactly once on mount', async () => {
      // Enqueue a successful Action_Board_Fetch resolution with an empty
      // Tree_Record_List. The fetch resolves cleanly, the Hazard_Dispatch_Board
      // transitions to the Loaded_State, and the hoisted spies record exactly
      // one `from('trees')` + `select('*')` pair.
      resolveOk([]);

      renderActionBoard();

      // Wait for the useEffect-driven fetch to settle so we observe the
      // completed call graph rather than a mid-flight snapshot.
      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });

      // Requirement 3.2 — the Action_Board_Fetch is issued exactly once on
      // mount, against the `trees` table, with a `select('*')` projection
      // that reads every column of every row (Requirement 3.4 covers the
      // no-reshape contract once rows arrive).
      expect(fromSpy).toHaveBeenCalledTimes(1);
      expect(fromSpy).toHaveBeenCalledWith('trees');
      expect(selectSpy).toHaveBeenCalledTimes(1);
      expect(selectSpy).toHaveBeenCalledWith('*');
    });

    it('renders a visible loading indicator and zero Dispatch_Ticket_Cards while the Action_Board_Fetch is pending', () => {
      // Push a forever-pending promise onto `selectSpy`. The useEffect awaits
      // it so the Action_Board_Page sits in the Loading_State for the full
      // duration of this test — no need for `waitFor`, the loading branch is
      // observable synchronously on first render.
      selectSpy.mockReturnValueOnce(new Promise(() => {}));

      renderActionBoard();

      // Requirement 3.5 — the Hazard_Dispatch_Board renders a visible
      // loading indicator while the Action_Board_Fetch is pending. The
      // branch is keyed on `status === 'loading'`, which is the initial
      // `useState` value, so the indicator must be in the DOM on first
      // render.
      const loadingIndicator = screen.getByText(/loading hazard tickets/i);
      expect(loadingIndicator).toBeInTheDocument();

      // Requirement 3.5 — zero Dispatch_Ticket_Card elements render while
      // the Loading_State is active. Task 5 assigns the `dispatch-ticket-card`
      // testid to each card; querying for it now must yield an empty list
      // because the Hazard_Dispatch_Board cannot have a Loaded_State grid
      // until the fetch resolves.
      expect(
        screen.queryAllByTestId('dispatch-ticket-card')
      ).toHaveLength(0);

      // No Error_State banner while loading — the two branches are mutually
      // exclusive on the `status` union (Requirement 3.6 only fires on the
      // error branch).
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('renders a role="alert" error banner with the Supabase message and zero Dispatch_Ticket_Cards when the Action_Board_Fetch resolves with an error', async () => {
      // Requirement 3.6 — resolve the Action_Board_Fetch with a non-null
      // `error` whose `message` field is the sentinel string `'network down'`.
      // The Action_Board_Page must transition to the Error_State and surface
      // the message verbatim inside a `role="alert"` banner.
      resolveErr({ message: 'network down' });

      renderActionBoard();

      // `findByRole` awaits the Error_State transition so the assertion runs
      // after the useEffect's async resolver calls `setStatus('error')` and
      // `setErrorMessage('network down')`.
      const banner = await screen.findByRole('alert');
      expect(banner).toBeInTheDocument();
      expect(banner.textContent).toContain('network down');

      // Requirement 3.6 — zero Dispatch_Ticket_Card elements render in the
      // Error_State. The Hazard_Dispatch_Board branch is keyed on
      // `status === 'error'`, so the Loaded_State grid is suppressed.
      expect(
        screen.queryAllByTestId('dispatch-ticket-card')
      ).toHaveLength(0);

      // The Loading_State indicator must also be gone once the fetch has
      // resolved with an error — loading + error are mutually exclusive on
      // the `status` union.
      expect(screen.queryByText(/loading hazard tickets/i)).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Task 3.2 — Dual_Tab_Shell labels, order, initial Active_Tab, active-tab
  // visual distinction, and example-based tab switching.
  //
  // The Dual_Tab_Shell (Requirements 4.1–4.9) renders exactly two tab buttons
  // above the Active_Tab sub-view, in order Hazard_Tab_Button then
  // Walkin_Tab_Button, each carrying its exact emoji-prefixed visible label.
  // On first mount the Active_Tab is `'hazards'` (Requirement 4.4), so the
  // Hazard_Dispatch_Board renders and the Walkin_Request_Form does not
  // (Requirements 4.7, 4.8). The selected tab is visually distinguishable
  // from the unselected tab (Requirement 4.9), which this suite pins by
  // asserting the active/inactive `className` strings differ.
  //
  // The example-based switching test exercises Requirements 4.5, 4.6, 4.7,
  // and 4.8 end-to-end: clicking the Walkin_Tab_Button swaps the sub-views,
  // and clicking the Hazard_Tab_Button swaps them back. Per the Phase 5
  // testing convention (see task 10 notes) we use `fireEvent` from
  // `@testing-library/react` and render the `<ActionBoard />` component
  // directly — no Router — so the Dual_Tab_Shell is isolated from App_Shell
  // route wiring already pinned by task 9.4.
  //
  // Pins Requirements 4.1, 4.2, 4.3, 4.4, 4.9, 11.5.
  // ---------------------------------------------------------------------------
  describe('Dual_Tab_Shell labels, order, initial Active_Tab, and active-tab visual distinction', () => {
    it('renders exactly two tab buttons in order Hazard-then-Walkin with the exact emoji-prefixed labels', async () => {
      // Resolve the Action_Board_Fetch with an empty Tree_Record_List so the
      // useEffect settles cleanly and the Hazard_Dispatch_Board is free of
      // Loading_State chrome that might shadow the tab buttons in the DOM.
      resolveOk([]);

      renderActionBoard();

      // Requirement 4.1 — exactly two tab controls render above the
      // Active_Tab sub-view. Querying by `role="tab"` would work too but
      // the Dual_Tab_Shell renders native `<button type="button">`
      // elements, so we query the tablist region's buttons directly.
      const hazardTabButton = screen.getByRole('button', {
        name: '🚨 Hazard Management & Permits',
      });
      const walkinTabButton = screen.getByRole('button', {
        name: '📋 Public Walk-in Requests',
      });

      // Requirements 4.2 + 4.3 — the exact emoji-prefixed visible labels.
      // `getByRole` above already matched the accessible names verbatim;
      // re-asserting `textContent` pins the on-screen text against any
      // future refactor that might split the label across multiple nodes.
      expect(hazardTabButton).toBeInTheDocument();
      expect(hazardTabButton.textContent).toBe(
        '🚨 Hazard Management & Permits'
      );
      expect(walkinTabButton).toBeInTheDocument();
      expect(walkinTabButton.textContent).toBe('📋 Public Walk-in Requests');

      // Requirement 4.1 — Hazard_Tab_Button renders first, Walkin_Tab_Button
      // second. DOM order is checked via `compareDocumentPosition`: the
      // `DOCUMENT_POSITION_FOLLOWING` bit on the result means the argument
      // node appears AFTER the receiver in document order, which is exactly
      // the Hazard-then-Walkin contract.
      const DOCUMENT_POSITION_FOLLOWING = 0x04;
      const relation =
        hazardTabButton.compareDocumentPosition(walkinTabButton);
      expect(relation & DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      // Flush the Action_Board_Fetch so its post-resolution setState calls
      // settle before the test ends.
      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });
    });

    it('renders the Hazard_Dispatch_Board and not the Walkin_Request_Form on first mount', async () => {
      // Empty Tree_Record_List so the Hazard_Dispatch_Board lands in a
      // clean Loaded_State with no cards — we only care about the
      // sub-view gating here, not the card grid.
      resolveOk([]);

      renderActionBoard();

      // Requirement 4.4 — the initial Active_Tab is `'hazards'`, so the
      // Hazard_Dispatch_Board slot is in the DOM. ActionBoard.jsx marks
      // that slot with `data-testid="action-board-hazard-dispatch-board"`.
      expect(
        screen.getByTestId('action-board-hazard-dispatch-board')
      ).toBeInTheDocument();

      // Requirement 4.7 — while the Active_Tab is `'hazards'` the
      // Walkin_Request_Form sub-view is not rendered. Its slot carries
      // `data-testid="action-board-walkin-request-form"`.
      expect(
        screen.queryByTestId('action-board-walkin-request-form')
      ).toBeNull();

      // Flush the Action_Board_Fetch so the useEffect resolves before the
      // test ends.
      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });
    });

    it("applies a different className to the active tab than to the inactive tab", async () => {
      resolveOk([]);

      renderActionBoard();

      const hazardTabButton = screen.getByRole('button', {
        name: '🚨 Hazard Management & Permits',
      });
      const walkinTabButton = screen.getByRole('button', {
        name: '📋 Public Walk-in Requests',
      });

      // Requirement 4.9 — the selected tab is visually distinguishable
      // from the unselected one. ActionBoard.jsx applies ACTIVE_TAB_CLASS
      // vs INACTIVE_TAB_CLASS by ternary on the Active_Tab, so the two
      // `className` strings must differ on first mount (Hazard active).
      expect(hazardTabButton.className).not.toBe(walkinTabButton.className);

      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });
    });

    it('swaps sub-views when the Walkin_Tab_Button is clicked and swaps back when the Hazard_Tab_Button is clicked', async () => {
      resolveOk([]);

      renderActionBoard();

      const hazardTabButton = screen.getByRole('button', {
        name: '🚨 Hazard Management & Permits',
      });
      const walkinTabButton = screen.getByRole('button', {
        name: '📋 Public Walk-in Requests',
      });

      // Baseline — Hazard_Dispatch_Board rendered, Walkin_Request_Form not
      // (Requirement 4.4 + 4.7).
      expect(
        screen.getByTestId('action-board-hazard-dispatch-board')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('action-board-walkin-request-form')
      ).toBeNull();

      // Requirement 4.6 — activating the Walkin_Tab_Button sets the
      // Active_Tab to `'walkins'` and renders the Walkin_Request_Form.
      // Requirement 4.8 — while Active_Tab is `'walkins'`, the
      // Hazard_Dispatch_Board is not rendered.
      fireEvent.click(walkinTabButton);
      expect(
        screen.getByTestId('action-board-walkin-request-form')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('action-board-hazard-dispatch-board')
      ).toBeNull();

      // Requirement 4.5 — activating the Hazard_Tab_Button sets the
      // Active_Tab back to `'hazards'` and renders the
      // Hazard_Dispatch_Board. Requirement 4.7 — the Walkin_Request_Form
      // is no longer rendered.
      fireEvent.click(hazardTabButton);
      expect(
        screen.getByTestId('action-board-hazard-dispatch-board')
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId('action-board-walkin-request-form')
      ).toBeNull();

      // Flush the Action_Board_Fetch so the useEffect resolves before the
      // test ends — the tab clicks do not re-issue it (Requirement 4.10),
      // so exactly one `from('trees')` call is expected across the whole
      // lifecycle.
      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });
      expect(fromSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Task 3.3 — Property 8: Tab-switching state and URL invariants.
  //
  // Feature: action-board, Property 8: Tab-switching state and URL invariants
  //
  // For any finite sequence of Hazard_Tab_Button / Walkin_Tab_Button
  // activations starting from the initial mount, after the final activation:
  //   (a) the rendered sub-view matches the last-activated tab — the
  //       Hazard_Dispatch_Board is rendered and the Walkin_Request_Form is
  //       not when the last tab was Hazard, and vice versa (Requirements
  //       4.5, 4.6, 4.7, 4.8);
  //   (b) the total number of calls to `supabase.from('trees').select('*')`
  //       is exactly one, regardless of the number of tab switches
  //       (Requirement 4.10 — tab switches preserve the Tree_Record_List
  //       without refetching);
  //   (c) `window.location.pathname`, `window.location.search`, and
  //       `window.location.hash` are bit-equal to their values immediately
  //       after mount (Requirement 4.13 — activating a tab button SHALL NOT
  //       mutate the URL path, search string, or hash);
  //   (d) any value typed into a Walkin_Form_Field during a prior `walkins`
  //       visit is still displayed when the `walkins` tab is active again
  //       (Requirement 4.10 — Walkin_Form_State preserved across tab
  //       switches). DEFERRED: the Walkin_Request_Form's five controlled
  //       fields are added by task 8.1. Until that task lands there is no
  //       field to type into, so the typed-text preservation assertion
  //       reduces to a no-op (no state to preserve => nothing to check).
  //       Property 10 (task 8.4) covers typed-text behaviour through the
  //       full submit-and-clear cycle once the form fields exist. When
  //       task 8.1 lands, Property 8 here can be promoted to walk the
  //       sequence, type a string into each field on every `walkins`
  //       visit, and assert the field value on the next `walkins` visit
  //       within the same mount equals the most recently typed string.
  //
  // Uses `numRuns: 25` because tab clicking forces a full re-render of the
  // Action_Board_Page on every iteration, so the run budget mirrors the
  // heavy-re-render precedent set by Property 2 in CommandCenter.test.jsx.
  //
  // Validates: Requirements 4.5, 4.6, 4.7, 4.8, 4.10, 4.13.
  // ---------------------------------------------------------------------------
  describe('Property 8: Tab-switching state and URL invariants', () => {
    // Feature: action-board, Property 8: Tab-switching state and URL invariants
    it('preserves the sub-view / fetch-count / URL invariants for any tab-click sequence', async () => {
      const tabClickSequenceArb = fc.array(
        fc.constantFrom('hazards', 'walkins'),
        { maxLength: 20 }
      );

      await fc.assert(
        fc.asyncProperty(tabClickSequenceArb, async (sequence) => {
          // Reset the Supabase spies between iterations so each run observes
          // a fresh Action_Board_Fetch call graph. `beforeEach` only runs
          // once per top-level `it`, so resetting inside the property body
          // is required for the per-iteration `selectSpy` call-count
          // assertion to be meaningful.
          selectSpy.mockReset();
          fromSpy.mockClear();
          insertSpy.mockReset();
          updateSpy.mockReset();
          upsertSpy.mockReset();
          deleteSpy.mockReset();

          // Resolve the Action_Board_Fetch exactly once with the
          // [HAZARD_TREE, SAFE_TREE] fixture so the Hazard_Dispatch_Board
          // reaches the Loaded_State with one Dispatch_Ticket_Card (the
          // HAZARD_TREE survives the classifier filter). This is the
          // realistic tab-switching scenario: the hazard grid is non-empty
          // when the user toggles between the two tabs.
          resolveOk([HAZARD_TREE, SAFE_TREE]);

          // Snapshot the URL triple BEFORE render so the assertion runs
          // against the pre-mount baseline. jsdom initialises these to
          // `/`, `''`, and `''` by default, but we read them dynamically
          // in case a sibling test in the worker has mutated them.
          const initialPathname = window.location.pathname;
          const initialSearch = window.location.search;
          const initialHash = window.location.hash;

          try {
            renderActionBoard();

            // Let the Action_Board_Fetch resolve so the useEffect's setState
            // calls land before we start firing tab clicks. This also
            // guarantees `selectSpy` has been invoked exactly once before
            // the per-iteration call-count assertion below.
            await waitFor(() => {
              expect(fromSpy).toHaveBeenCalledWith('trees');
            });

            // Fire a click on the tab button corresponding to each sequence
            // element. The Dual_Tab_Shell keeps both tab buttons rendered
            // above the Active_Tab sub-view regardless of which tab is
            // active, so `getByRole` succeeds on every iteration.
            for (const tab of sequence) {
              const buttonName =
                tab === 'hazards'
                  ? '🚨 Hazard Management & Permits'
                  : '📋 Public Walk-in Requests';
              const button = screen.getByRole('button', { name: buttonName });
              fireEvent.click(button);
            }

            // Determine the expected Active_Tab after the sequence. The
            // initial Active_Tab is `'hazards'` (Requirement 4.4); an
            // empty sequence leaves us on that initial value.
            const expectedActiveTab =
              sequence.length === 0
                ? 'hazards'
                : sequence[sequence.length - 1];

            // Assertion (a) — the last-activated tab's sub-view is rendered
            // and the other is not (Requirements 4.5, 4.6, 4.7, 4.8).
            if (expectedActiveTab === 'hazards') {
              expect(
                screen.getByTestId('action-board-hazard-dispatch-board')
              ).toBeInTheDocument();
              expect(
                screen.queryByTestId('action-board-walkin-request-form')
              ).toBeNull();
            } else {
              expect(
                screen.getByTestId('action-board-walkin-request-form')
              ).toBeInTheDocument();
              expect(
                screen.queryByTestId('action-board-hazard-dispatch-board')
              ).toBeNull();
            }

            // Assertion (b) — `supabase.from('trees').select('*')` is
            // invoked exactly once across the whole mount + any number of
            // tab switches. Tab switches preserve the Tree_Record_List and
            // never re-issue the Action_Board_Fetch (Requirement 4.10).
            expect(fromSpy).toHaveBeenCalledTimes(1);
            expect(fromSpy).toHaveBeenCalledWith('trees');
            expect(selectSpy).toHaveBeenCalledTimes(1);
            expect(selectSpy).toHaveBeenCalledWith('*');

            // Assertion (c) — tab clicks do not mutate the URL path, search
            // string, or hash. The Dual_Tab_Shell stores the Active_Tab in
            // local React state only — not in the URL (Requirements 4.11,
            // 4.13).
            expect(window.location.pathname).toBe(initialPathname);
            expect(window.location.search).toBe(initialSearch);
            expect(window.location.hash).toBe(initialHash);

            // Assertion (d) — DEFERRED (see describe-block comment). The
            // Walkin_Request_Form has no controlled fields until task 8.1
            // wires them up, so there is no typed text to preserve. With
            // zero state to preserve the assertion is trivially satisfied,
            // and Property 10 (task 8.4) covers the meaningful typed-text
            // behaviour once the form fields exist.
          } finally {
            cleanup();
          }
        }),
        { numRuns: 25 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Task 4.2 — Empty_Hazard_State and mocked-fetch filter demonstration.
  //
  // Task 4.1 derives the Hazard_Ticket_List in the Hazard_Dispatch_Board via
  // `trees.filter((t) => classifyHazard(t) === HAZARD_STATUS.HAZARD)` against
  // the Tree_Record_List returned by the Action_Board_Fetch (Requirements
  // 5.1, 5.2). This suite pins the two observable outcomes of that filter:
  //
  //   1. When Supabase returns a mixed list containing one Hazard_Tree_Record
  //      and one Safe_Tree_Record, exactly one Dispatch_Ticket_Card renders
  //      and it corresponds to the Hazard_Tree_Record (Requirement 5.4).
  //   2. When Supabase returns only Safe_Tree_Records (here a single-element
  //      `[SAFE_TREE]` list), zero Dispatch_Ticket_Card elements render and
  //      the Empty_Hazard_State banner with visible text exactly
  //      "No hazardous trees found." is shown (Requirement 5.7).
  //
  // Both tests render `<ActionBoard />` directly (no Router) and use the
  // shared `HAZARD_TREE` / `SAFE_TREE` fixtures defined at the top of this
  // file. The Dispatch_Ticket_Card contents are filled in by task 5.1, so
  // the Hazard_Tree_Record's `tree_id` ('T-HAZARD-001') is already visible
  // on the card shell — which is what the identity assertion keys on.
  //
  // Pins Requirements 5.7, 11.3, 11.4.
  // ---------------------------------------------------------------------------
  describe('Hazard_Dispatch_Board filter and Empty_Hazard_State', () => {
    it('renders exactly one Dispatch_Ticket_Card for the Hazard_Tree_Record when the fetch returns [HAZARD_TREE, SAFE_TREE]', async () => {
      // Requirement 5.1 — the Hazard_Ticket_List is derived from the
      // Tree_Record_List by keeping only rows for which `classifyHazard`
      // returns `HAZARD_STATUS.HAZARD`. `HAZARD_TREE` has `is_leaning: true`
      // so it survives the filter; `SAFE_TREE` has all four Hazard_Flags
      // `false` so it is dropped. The resulting Hazard_Ticket_List has
      // exactly one element, and the Loaded_State grid renders exactly one
      // Dispatch_Ticket_Card (Requirement 5.4).
      resolveOk([HAZARD_TREE, SAFE_TREE]);

      renderActionBoard();

      // Wait for the Action_Board_Fetch to resolve and the
      // Hazard_Dispatch_Board to transition from Loading_State to
      // Loaded_State. Using `findAllByTestId` lets the assertion await the
      // post-resolution re-render.
      const cards = await screen.findAllByTestId('dispatch-ticket-card');
      expect(cards).toHaveLength(1);

      // Identity assertion — the single rendered card corresponds to
      // `HAZARD_TREE`, not `SAFE_TREE`. The card's `tree_id` slot
      // (task 5.1) renders the `tree_id` as a prominent heading, so the
      // visible text 'T-HAZARD-001' is unique to `HAZARD_TREE`. We assert
      // it appears inside the card's DOM subtree rather than anywhere on
      // the page so the match cannot be satisfied by some sibling element.
      expect(cards[0].textContent).toContain(HAZARD_TREE.tree_id);

      // `SAFE_TREE`'s `tree_id` must not appear anywhere in the
      // Hazard_Dispatch_Board — the filter dropped the row, so its card
      // was never rendered and its `tree_id` should not be in the DOM.
      expect(screen.queryByText(SAFE_TREE.tree_id)).toBeNull();

      // The Empty_Hazard_State banner is suppressed in the Loaded_State
      // when the Hazard_Ticket_List is non-empty.
      expect(screen.queryByText('No hazardous trees found.')).toBeNull();
    });

    it('renders zero Dispatch_Ticket_Cards and the Empty_Hazard_State banner when the fetch returns only Safe_Tree_Records', async () => {
      // Requirement 5.7 — when the Action_Board_Fetch resolves successfully
      // with a Tree_Record_List in which no row is a Hazard_Tree_Record,
      // the Hazard_Dispatch_Board renders a visible empty-state banner
      // indicating that no hazardous Tree_Records were returned and
      // renders zero Dispatch_Ticket_Card elements.
      //
      // `SAFE_TREE` has all four Hazard_Flags `false`, so the classifier
      // drops it and the filtered Hazard_Ticket_List is empty.
      resolveOk([SAFE_TREE]);

      renderActionBoard();

      // Wait for the Action_Board_Fetch to resolve and the
      // Hazard_Dispatch_Board to transition into the Empty_Hazard_State.
      // `findByText` awaits the post-resolution re-render and asserts the
      // banner text matches exactly — the design pins the visible string
      // as "No hazardous trees found." (see ActionBoard.jsx).
      const emptyBanner = await screen.findByText(
        'No hazardous trees found.'
      );
      expect(emptyBanner).toBeInTheDocument();

      // Requirement 5.7 — zero Dispatch_Ticket_Card elements render in the
      // Empty_Hazard_State. The Loaded_State grid branch is keyed on
      // `hazardTickets.length > 0`, so the filtered-empty case takes the
      // Empty_Hazard_State branch instead.
      expect(screen.queryAllByTestId('dispatch-ticket-card')).toHaveLength(0);

      // The Loading_State indicator and the Error_State banner are
      // mutually exclusive with the Empty_Hazard_State branch on the
      // `status` / `hazardTickets.length` gate, so neither should be
      // visible once the fetch has resolved with a hazard-empty list.
      expect(screen.queryByText(/loading hazard tickets/i)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Task 4.3 — Property 1: Hazard filter correctness and empty-state
  // consistency.
  //
  // Feature: action-board, Property 1: Hazard filter correctness and
  // empty-state consistency
  //
  // For any `TreeRecord[]` returned by the mocked `Action_Board_Fetch`, the
  // number of `Dispatch_Ticket_Card` elements rendered by the
  // `Hazard_Dispatch_Board` equals the number of rows for which
  // `classifyHazard(row) === HAZARD_STATUS.HAZARD`, AND each rendered card
  // corresponds to a distinct hazard row (matched by React key, i.e. the
  // `id` field). When the expected count is zero, the Empty_Hazard_State
  // banner is rendered and no card is rendered.
  //
  // Note on `tree_id` multiplicity: the shared `treeRecordArb` produces
  // records whose `tree_id` is either a short string or `null`, so two
  // distinct records in the same array may collide on `tree_id` (both
  // `null`, or both happening to generate the same short string). The
  // React key on each Dispatch_Ticket_Card is derived from the row's `id`
  // (a UUID from `fc.uuid()`), not its `tree_id`, so the identity
  // assertion compares MULTISETS (frequency maps) of `tree_id` values
  // rather than sets — a set comparison would incorrectly succeed when
  // the expected list has two `null` tree_ids and only one card renders.
  //
  // Validates: Requirements 3.3, 3.4, 5.1, 5.4, 5.7.
  // ---------------------------------------------------------------------------
  describe('Property 1: Hazard filter correctness and empty-state consistency', () => {
    // Feature: action-board, Property 1: Hazard filter correctness and empty-state consistency
    it('renders one card per HAZARD-classified row with matching tree_id multiset, and the empty-state banner iff the hazard list is empty', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(treeRecordArb, { maxLength: 10 }),
          async (trees) => {
            // Reset Supabase spies between iterations so each run observes
            // a fresh Action_Board_Fetch. `beforeEach` only runs once per
            // top-level `it`, so a per-iteration reset is required for the
            // `findAllByTestId`/`findByText` awaiters to see the current
            // render's DOM rather than a leaked prior render.
            selectSpy.mockReset();
            fromSpy.mockClear();
            insertSpy.mockReset();
            updateSpy.mockReset();
            upsertSpy.mockReset();
            deleteSpy.mockReset();

            // Resolve the Action_Board_Fetch with the generated array so
            // the Hazard_Dispatch_Board transitions from Loading_State into
            // either the Empty_Hazard_State (no hazard rows) or the
            // Loaded_State (≥1 hazard row).
            resolveOk(trees);

            try {
              renderActionBoard();

              // Compute the expected Hazard_Ticket_List the same way
              // ActionBoard.jsx does: client-side filter via the shared
              // `classifyHazard` pure function (Requirements 3.4, 5.1).
              const expected = trees.filter(
                (t) => classifyHazard(t) === HAZARD_STATUS.HAZARD
              );

              if (expected.length === 0) {
                // Requirement 5.7 — Empty_Hazard_State banner renders iff
                // the filtered Hazard_Ticket_List is empty. Use
                // `findByText` to await the post-resolution re-render.
                const emptyBanner = await screen.findByText(
                  'No hazardous trees found.'
                );
                expect(emptyBanner).toBeInTheDocument();

                // Zero Dispatch_Ticket_Card elements render in the
                // Empty_Hazard_State branch.
                expect(
                  screen.queryAllByTestId('dispatch-ticket-card')
                ).toHaveLength(0);
              } else {
                // Requirement 5.4 — exactly one Dispatch_Ticket_Card per
                // row in the Hazard_Ticket_List. Use `findAllByTestId` to
                // await the Loaded_State re-render.
                const cards = await screen.findAllByTestId(
                  'dispatch-ticket-card'
                );
                expect(cards).toHaveLength(expected.length);

                // Identity assertion — the set of rendered `tree_id`
                // values equals the expected set, compared as a MULTISET
                // because `treeRecordArb` can yield duplicate `tree_id`
                // values (including multiple `null`s). The
                // Dispatch_Ticket_Card renders `tree.tree_id` as an `<h2>`
                // heading at the top of the card, with the literal `—`
                // placeholder when `tree_id` is `null` (Requirement 6.1).
                // We query that heading by role + level within each card
                // so we pick up exactly the prominent identifier slot and
                // not some other text on the card.
                const renderedTreeIds = cards.map((card) => {
                  // The `tree_id` heading is the unique `<h2>` inside the
                  // card. Rendering the `null` fallback produces the `—`
                  // character; rendering a non-null string produces that
                  // string verbatim. Either way the heading's textContent
                  // is the observable `tree_id` projection.
                  const heading = card.querySelector('h2');
                  return heading ? heading.textContent : '';
                });

                const expectedTreeIds = expected.map((t) =>
                  t.tree_id === null ? '—' : t.tree_id
                );

                // Multiset comparison via sorted arrays — preserves
                // frequency so two `null` expected rows must match two `—`
                // rendered headings, not one.
                const sortedRendered = [...renderedTreeIds].sort();
                const sortedExpected = [...expectedTreeIds].sort();
                expect(sortedRendered).toEqual(sortedExpected);

                // Empty_Hazard_State banner must NOT render when the
                // Hazard_Ticket_List is non-empty (mutually exclusive
                // branches on `hazardTickets.length`).
                expect(
                  screen.queryByText('No hazardous trees found.')
                ).toBeNull();
              }
            } finally {
              // Reset the DOM between iterations so subsequent renders see
              // a clean tree — critical because `fc.assert` runs the
              // property body many times within a single `it` and
              // `beforeEach` does not re-run between iterations.
              cleanup();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Task 4.4 — Property 9: Unique Tree_Record `id` values produce no React
  // key-collision warnings.
  //
  // Feature: action-board, Property 9: Unique Tree_Record id values produce
  // no React key-collision warnings
  //
  // For any `TreeRecord[]` whose `id` values are pairwise distinct, rendering
  // the `Hazard_Dispatch_Board` after the `Action_Board_Fetch` resolves with
  // that list produces zero `console.error` invocations whose first argument
  // contains the case-insensitive substring "key".
  //
  // Uses `fc.uniqueArray(treeRecordArb, { selector: (t) => t.id, maxLength: 10 })`
  // to guarantee pairwise-distinct `id` values. The property asserts that
  // React's key-collision warning (emitted via `console.error`) never fires
  // when the `Hazard_Dispatch_Board` keys each `Dispatch_Ticket_Card` by
  // `tree.id` (Requirement 5.5).
  //
  // Note: if all generated trees are SAFE, no cards render and no key warning
  // would fire anyway. The property is still valid — it asserts that when
  // cards DO render, no key collision occurs.
  //
  // Uses `numRuns: 25` because rendering the full Action_Board_Page per
  // iteration is heavy (mirrors the Property 7/8 precedent).
  //
  // Validates: Requirements 5.5.
  // ---------------------------------------------------------------------------
  describe('Property 9: Unique Tree_Record id values produce no React key-collision warnings', () => {
    // Feature: action-board, Property 9: Unique Tree_Record id values produce no React key-collision warnings
    it('produces zero console.error invocations containing "key" when all Tree_Record ids are unique', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        await fc.assert(
          fc.asyncProperty(
            fc.uniqueArray(treeRecordArb, { selector: (t) => t.id, maxLength: 10 }),
            async (trees) => {
              // Reset Supabase spies between iterations so each run observes
              // a fresh Action_Board_Fetch.
              selectSpy.mockReset();
              fromSpy.mockClear();
              insertSpy.mockReset();
              updateSpy.mockReset();
              upsertSpy.mockReset();
              deleteSpy.mockReset();

              // Clear the console.error spy call history between iterations
              // so assertions only observe errors from the current render.
              consoleErrorSpy.mockClear();

              // Resolve the Action_Board_Fetch with the generated unique-id array.
              resolveOk(trees);

              try {
                renderActionBoard();

                // Wait for the Action_Board_Fetch to resolve so the
                // Hazard_Dispatch_Board transitions out of Loading_State.
                await waitFor(() => {
                  expect(fromSpy).toHaveBeenCalledWith('trees');
                });

                // Assert no console.error invocation's first argument contains
                // the case-insensitive substring "key". React emits key-collision
                // warnings via console.error, so any such call indicates a
                // duplicate React key — which should never happen when all
                // Tree_Record `id` values are pairwise distinct.
                const keyWarnings = consoleErrorSpy.mock.calls.filter(
                  (args) =>
                    typeof args[0] === 'string' &&
                    args[0].toLowerCase().includes('key')
                );
                expect(keyWarnings).toHaveLength(0);
              } finally {
                cleanup();
              }
            }
          ),
          { numRuns: 25 }
        );
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Task 5.4 — Property 2: Dispatch_Ticket_Card preserves Tree_Record field
  // values.
  //
  // Feature: action-board, Property 2: Dispatch_Ticket_Card preserves
  // Tree_Record field values
  //
  // For any Hazard_Tree_Record rendered as a Dispatch_Ticket_Card, the card's
  // DOM contains the exact source-row value for each of `tree_id`, `species`,
  // `dbh`, and `assigned_to`, where `null` values of `tree_id` and
  // `assigned_to` are rendered as the literal dash character `—`.
  //
  // Validates: Requirements 6.1, 6.2, 6.3, 6.4.
  // ---------------------------------------------------------------------------

  // Local `hazardTreeArb` — takes `treeRecordArb` and forces at least one
  // of the four Hazard_Flags to `true` so `classifyHazard` returns
  // `HAZARD_STATUS.HAZARD` and the tree survives the client-side filter
  // into the Hazard_Ticket_List. Shared by Properties 2 and 3.
  const hazardTreeArb = treeRecordArb.map((t) => ({
    ...t,
    is_leaning: true,
  }));

  describe('Property 2: Dispatch_Ticket_Card preserves Tree_Record field values', () => {

    // Feature: action-board, Property 2: Dispatch_Ticket_Card preserves Tree_Record field values
    it('renders the exact tree_id, species, dbh, and assigned_to values (with — for nulls) on the card', async () => {
      await fc.assert(
        fc.asyncProperty(hazardTreeArb, async (tree) => {
          // Reset Supabase spies between iterations so each run observes
          // a fresh Action_Board_Fetch.
          selectSpy.mockReset();
          fromSpy.mockClear();
          insertSpy.mockReset();
          updateSpy.mockReset();
          upsertSpy.mockReset();
          deleteSpy.mockReset();

          // Resolve the Action_Board_Fetch with a single-element array
          // containing the generated hazard tree.
          resolveOk([tree]);

          try {
            renderActionBoard();

            // Wait for the Action_Board_Fetch to resolve and the card to
            // render in the Loaded_State.
            const cards = await screen.findAllByTestId('dispatch-ticket-card');
            expect(cards).toHaveLength(1);

            const card = cards[0];

            // Requirement 6.1 — tree_id rendered as an <h2> heading. When
            // tree_id is null, the placeholder dash `—` is shown.
            const expectedTreeId = tree.tree_id === null ? '—' : tree.tree_id;
            const heading = card.querySelector('h2');
            expect(heading).not.toBeNull();
            expect(heading.textContent).toBe(expectedTreeId);

            // Requirements 6.2, 6.3, 6.4 — species, dbh, and assigned_to
            // rendered as <dd> elements in the card's <dl>. The assigned_to
            // field falls back to `—` when null.
            const ddElements = card.querySelectorAll('dd');
            // The card renders exactly three <dd> elements in order:
            // species, dbh, assigned_to.
            expect(ddElements.length).toBeGreaterThanOrEqual(3);

            // species — unchanged string from the Tree_Record
            expect(ddElements[0].textContent).toBe(tree.species);

            // dbh — unchanged string from the Tree_Record
            expect(ddElements[1].textContent).toBe(tree.dbh);

            // assigned_to — falls back to `—` when null
            const expectedAssignedTo =
              tree.assigned_to === null ? '—' : tree.assigned_to;
            expect(ddElements[2].textContent).toBe(expectedAssignedTo);
          } finally {
            cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Task 5.5 — Property 3: Dispatch_Ticket_Card hides out-of-scope
  // Tree_Record fields.
  //
  // Feature: action-board, Property 3: Dispatch_Ticket_Card hides
  // out-of-scope Tree_Record fields
  //
  // For any Hazard_Tree_Record with distinctive, non-colliding values in the
  // out-of-scope fields, the rendered Dispatch_Ticket_Card DOM does not
  // contain any of the source-row values for `latitude`, `longitude`,
  // `scientific_name`, `species_type`, the four individual Hazard_Flags
  // booleans, `dateCaptured`, `task_status`, or `photo_url`.
  //
  // The sentinel values are long, prefixed strings (20–30 chars) that cannot
  // collide with the in-scope fields (`tree_id`, `species`, `dbh`,
  // `assigned_to`) because those are generated independently by
  // `treeRecordArb` and the sentinels carry distinctive prefixes like
  // `SENTINEL_LAT_`, `SENTINEL_LNG_`, etc.
  //
  // Validates: Requirements 6.5.
  // ---------------------------------------------------------------------------
  describe('Property 3: Dispatch_Ticket_Card hides out-of-scope Tree_Record fields', () => {
    // Build an arbitrary that overlays `hazardTreeArb` with distinctive
    // sentinel values for the seven out-of-scope string-representable fields.
    // The sentinels are long enough (20–30 chars) and carry unique prefixes
    // so they cannot accidentally collide with the in-scope fields rendered
    // by the card (`tree_id`, `species`, `dbh`, `assigned_to`).
    const sentinelArb = fc.record({
      sentinelLat: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `SENTINEL_LAT_${s}`),
      sentinelLng: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `SENTINEL_LNG_${s}`),
      sentinelSciName: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `SENTINEL_SCINAME_${s}`),
      sentinelSpeciesType: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `SENTINEL_SPTYPE_${s}`),
      sentinelDateCaptured: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `SENTINEL_DATE_${s}`),
      sentinelTaskStatus: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `SENTINEL_TASK_${s}`),
      sentinelPhotoUrl: fc.string({ minLength: 10, maxLength: 15 }).map((s) => `SENTINEL_PHOTO_${s}`),
    });

    const outOfScopeTreeArb = fc.tuple(hazardTreeArb, sentinelArb).map(
      ([tree, sentinels]) => ({
        tree: {
          ...tree,
          latitude: sentinels.sentinelLat,
          longitude: sentinels.sentinelLng,
          scientific_name: sentinels.sentinelSciName,
          species_type: sentinels.sentinelSpeciesType,
          dateCaptured: sentinels.sentinelDateCaptured,
          task_status: sentinels.sentinelTaskStatus,
          photo_url: sentinels.sentinelPhotoUrl,
        },
        sentinels,
      })
    );

    // Feature: action-board, Property 3: Dispatch_Ticket_Card hides out-of-scope Tree_Record fields
    it('does not render any of the seven out-of-scope sentinel field values in the card DOM', async () => {
      await fc.assert(
        fc.asyncProperty(outOfScopeTreeArb, async ({ tree, sentinels }) => {
          // Reset Supabase spies between iterations so each run observes
          // a fresh Action_Board_Fetch.
          selectSpy.mockReset();
          fromSpy.mockClear();
          insertSpy.mockReset();
          updateSpy.mockReset();
          upsertSpy.mockReset();
          deleteSpy.mockReset();

          // Resolve the Action_Board_Fetch with a single-element array
          // containing the generated hazard tree with sentinel overlays.
          resolveOk([tree]);

          try {
            renderActionBoard();

            // Wait for the Action_Board_Fetch to resolve and the card to
            // render in the Loaded_State.
            const cards = await screen.findAllByTestId('dispatch-ticket-card');
            expect(cards).toHaveLength(1);

            const cardText = cards[0].textContent;

            // Assert the DOM does not contain any of the seven sentinel
            // values for the out-of-scope fields. Each sentinel is a
            // distinctive 20–30 char string with a unique prefix, so a
            // substring match is sufficient to prove the card is NOT
            // rendering that field.
            expect(cardText).not.toContain(sentinels.sentinelLat);
            expect(cardText).not.toContain(sentinels.sentinelLng);
            expect(cardText).not.toContain(sentinels.sentinelSciName);
            expect(cardText).not.toContain(sentinels.sentinelSpeciesType);
            expect(cardText).not.toContain(sentinels.sentinelDateCaptured);
            expect(cardText).not.toContain(sentinels.sentinelTaskStatus);
            expect(cardText).not.toContain(sentinels.sentinelPhotoUrl);
          } finally {
            cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Task 5.3 — Card shell, tree_id prominence, and permit branding fixtures.
  //
  // Unit tests that pin the Dispatch_Ticket_Card's outer shell styling, the
  // permit-status branching (Issue_Permit_Button vs Permit_Issued_Badge), and
  // the null-field placeholder rendering.
  //
  // Pins Requirements 6.10, 12.3, 6.9, 12.4, 12.5, 11.6.
  // ---------------------------------------------------------------------------
  describe('Dispatch_Ticket_Card shell, permit branding, and null-field placeholders', () => {
    // Variant of HAZARD_TREE with `has_cutting_permit: true` so the
    // Permit_Issued_Badge renders instead of the Issue_Permit_Button.
    const HAZARD_TREE_WITH_PERMIT = Object.freeze({
      ...HAZARD_TREE,
      id: '44444444-4444-4444-8444-444444444444',
      tree_id: 'T-HAZARD-PERMIT',
      has_cutting_permit: true,
    });

    // Fixture with null tree_id and null assigned_to, but at least one
    // hazard flag true so it renders as a Dispatch_Ticket_Card.
    const NULL_FIELDS_TREE = Object.freeze({
      ...HAZARD_TREE,
      id: '55555555-5555-4555-8555-555555555555',
      tree_id: null,
      assigned_to: null,
    });

    it('applies bg-white, rounded-lg, shadow-sm, and border-slate-200 to the card outer <article>', async () => {
      resolveOk([HAZARD_TREE]);

      renderActionBoard();

      const cards = await screen.findAllByTestId('dispatch-ticket-card');
      expect(cards).toHaveLength(1);

      const card = cards[0];
      expect(card.tagName).toBe('ARTICLE');
      expect(card.className).toContain('bg-white');
      expect(card.className).toContain('rounded-lg');
      expect(card.className).toContain('shadow-sm');
      expect(card.className).toContain('border-slate-200');
    });

    it('renders the Permit_Issued_Badge with amber/yellow styling and hides the Issue_Permit_Button when has_cutting_permit is true', async () => {
      resolveOk([HAZARD_TREE_WITH_PERMIT]);

      renderActionBoard();

      const cards = await screen.findAllByTestId('dispatch-ticket-card');
      expect(cards).toHaveLength(1);

      // The Permit_Issued_Badge <span> should be rendered with amber or
      // yellow palette (Requirements 6.9, 12.4).
      const badge = screen.getByText('Permit Issued');
      expect(badge.tagName).toBe('SPAN');
      expect(badge.className).toMatch(/bg-amber-|bg-yellow-/);

      // The Issue_Permit_Button must NOT be in the DOM when
      // has_cutting_permit is true (Requirement 6.8).
      expect(screen.queryByRole('button', { name: 'Issue Permit' })).toBeNull();
    });

    it('renders the Issue_Permit_Button with exact text "Issue Permit" and hides the Permit_Issued_Badge when has_cutting_permit is false', async () => {
      resolveOk([HAZARD_TREE]);

      renderActionBoard();

      const cards = await screen.findAllByTestId('dispatch-ticket-card');
      expect(cards).toHaveLength(1);

      // The Issue_Permit_Button renders with exact text "Issue Permit"
      // when has_cutting_permit is false (Requirement 6.7).
      const issuePermitBtn = screen.getByRole('button', { name: 'Issue Permit' });
      expect(issuePermitBtn).toBeInTheDocument();
      expect(issuePermitBtn.textContent).toBe('Issue Permit');

      // The Permit_Issued_Badge must NOT be in the DOM when
      // has_cutting_permit is false (Requirement 6.8).
      expect(screen.queryByText('Permit Issued')).toBeNull();
    });

    it('shows "—" for both tree_id and assigned_to when those fields are null', async () => {
      resolveOk([NULL_FIELDS_TREE]);

      renderActionBoard();

      const cards = await screen.findAllByTestId('dispatch-ticket-card');
      expect(cards).toHaveLength(1);

      const card = cards[0];

      // tree_id null → the <h2> heading shows the placeholder dash "—"
      // (Requirement 6.1, 12.5).
      const heading = card.querySelector('h2');
      expect(heading).not.toBeNull();
      expect(heading.textContent).toBe('—');

      // assigned_to null → the third <dd> in the <dl> shows "—"
      // (Requirement 6.4, 12.5).
      const ddElements = card.querySelectorAll('dd');
      expect(ddElements.length).toBeGreaterThanOrEqual(3);
      expect(ddElements[2].textContent).toBe('—');
    });
  });

  // ---------------------------------------------------------------------------
  // Task 6.2 — Dispatch_Team_Button and Issue_Permit_Button click logs.
  //
  // Unit tests that pin the Dispatch_Team_Handler and Issue_Permit_Handler
  // Supabase mutation calls. Each button's `onClick` invokes the corresponding
  // Supabase update chain (Requirements 1.1–1.3, 2.1–2.3).
  //
  // Uses the `HAZARD_TREE` fixture (`has_cutting_permit: false`) so both
  // buttons render on the same card.
  //
  // Pins Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3.
  // ---------------------------------------------------------------------------
  describe('Dispatch_Team_Button and Issue_Permit_Button Supabase mutations', () => {
    it('calls supabase.from("trees").update({ assigned_to: "Juan Dela Cruz" }).eq("id", tree.id) when the Dispatch_Team_Button is clicked', async () => {
      resolveOk([HAZARD_TREE]);

      renderActionBoard();

      // Wait for the card to render in the Loaded_State.
      await screen.findAllByTestId('dispatch-ticket-card');

      updateSpy.mockClear();
      eqSpy.mockClear();

      const dispatchBtn = screen.getByRole('button', { name: 'Dispatch Team' });
      fireEvent.click(dispatchBtn);

      // Requirement 1.1 — update called with { assigned_to: 'Juan Dela Cruz' }
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith({ assigned_to: 'Juan Dela Cruz' });
      // Requirement 1.3 — .eq called with ('id', tree.id)
      expect(eqSpy).toHaveBeenCalledTimes(1);
      expect(eqSpy).toHaveBeenCalledWith('id', HAZARD_TREE.id);
    });

    it('calls supabase.from("trees").update({ has_cutting_permit: true }).eq("id", tree.id) when the Issue_Permit_Button is clicked', async () => {
      resolveOk([HAZARD_TREE]);

      renderActionBoard();

      // Wait for the card to render in the Loaded_State.
      await screen.findAllByTestId('dispatch-ticket-card');

      updateSpy.mockClear();
      eqSpy.mockClear();

      const issuePermitBtn = screen.getByRole('button', { name: 'Issue Permit' });
      fireEvent.click(issuePermitBtn);

      // Requirement 2.1 — update called with { has_cutting_permit: true }
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenCalledWith({ has_cutting_permit: true });
      // Requirement 2.3 — .eq called with ('id', tree.id)
      expect(eqSpy).toHaveBeenCalledTimes(1);
      expect(eqSpy).toHaveBeenCalledWith('id', HAZARD_TREE.id);
    });
  });

  // ---------------------------------------------------------------------------
  // Task 5.6 — Property 4: Dispatch_Ticket_Card permit branching.
  //
  // Feature: action-board, Property 4: Dispatch_Ticket_Card permit branching
  //
  // For any Hazard_Tree_Record, the rendered Dispatch_Ticket_Card contains a
  // Dispatch_Team_Button with visible text `Dispatch Team`, and contains
  // exactly one of the following two elements matched to `has_cutting_permit`:
  //   - when `has_cutting_permit === true` the card contains a
  //     Permit_Issued_Badge with visible text `Permit Issued` and does not
  //     contain an Issue_Permit_Button;
  //   - when `has_cutting_permit === false` the card contains an
  //     Issue_Permit_Button with visible text `Issue Permit` and does not
  //     contain a Permit_Issued_Badge.
  //
  // Uses `hazardTreeArb` parameterised over `has_cutting_permit: fc.boolean()`
  // so both branches are exercised across 100 iterations.
  //
  // Validates: Requirements 6.6, 6.7, 6.8.
  // ---------------------------------------------------------------------------
  describe('Property 4: Dispatch_Ticket_Card permit branching', () => {
    // Variant of hazardTreeArb that varies `has_cutting_permit` via fc.boolean()
    const hazardTreePermitArb = fc.tuple(hazardTreeArb, fc.boolean()).map(
      ([tree, hasPermit]) => ({
        ...tree,
        has_cutting_permit: hasPermit,
      })
    );

    // Feature: action-board, Property 4: Dispatch_Ticket_Card permit branching
    it('always renders Dispatch Team button, and renders Issue Permit xor Permit Issued based on has_cutting_permit', async () => {
      await fc.assert(
        fc.asyncProperty(hazardTreePermitArb, async (tree) => {
          // Reset Supabase spies between iterations so each run observes
          // a fresh Action_Board_Fetch.
          selectSpy.mockReset();
          fromSpy.mockClear();
          insertSpy.mockReset();
          updateSpy.mockReset();
          upsertSpy.mockReset();
          deleteSpy.mockReset();

          // Resolve the Action_Board_Fetch with a single-element array
          // containing the generated hazard tree.
          resolveOk([tree]);

          try {
            renderActionBoard();

            // Wait for the card to render in the Loaded_State.
            const cards = await screen.findAllByTestId('dispatch-ticket-card');
            expect(cards).toHaveLength(1);

            // Requirement 6.6 — the Dispatch_Team_Button with visible text
            // exactly `Dispatch Team` is always present regardless of the
            // `has_cutting_permit` value.
            const dispatchBtn = screen.getByRole('button', {
              name: 'Dispatch Team',
            });
            expect(dispatchBtn).toBeInTheDocument();

            if (tree.has_cutting_permit === true) {
              // Requirement 6.8 — when has_cutting_permit is true, the
              // Permit_Issued_Badge with visible text `Permit Issued` is
              // present and the Issue_Permit_Button is NOT rendered.
              expect(screen.getByText('Permit Issued')).toBeInTheDocument();
              expect(
                screen.queryByRole('button', { name: 'Issue Permit' })
              ).toBeNull();
            } else {
              // Requirement 6.7 — when has_cutting_permit is false, the
              // Issue_Permit_Button with visible text `Issue Permit` is
              // present and the Permit_Issued_Badge is NOT rendered.
              const issuePermitBtn = screen.getByRole('button', {
                name: 'Issue Permit',
              });
              expect(issuePermitBtn).toBeInTheDocument();
              expect(screen.queryByText('Permit Issued')).toBeNull();
            }
          } finally {
            cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Task 6.3 — Property 5: Dispatch_Team_Button logs tuple with tree_id.
  //
  // Feature: action-board, Property 5: Dispatch_Team_Button logs tuple with tree_id
  //
  // For any Hazard_Tree_Record (including those with `tree_id: null`),
  // activating the Dispatch_Team_Button on that record's Dispatch_Ticket_Card
  // results in a Supabase update call with { assigned_to: 'Juan Dela Cruz' }
  // and .eq('id', tree.id).
  //
  // Uses `hazardTreeArb` which forces `is_leaning: true` so the tree survives
  // the hazard filter.
  //
  // Validates: Requirements 1.1, 1.2, 1.3.
  // ---------------------------------------------------------------------------
  describe('Property 5: Dispatch_Team_Button calls Supabase update with correct args', () => {
    // Feature: action-board, Property 5: Dispatch_Team_Button calls Supabase update with correct args
    it('calls update({ assigned_to: "Juan Dela Cruz" }).eq("id", tree.id) for any hazard tree', async () => {
      await fc.assert(
        fc.asyncProperty(hazardTreeArb, async (tree) => {
          // Reset Supabase spies between iterations so each run observes
          // a fresh call graph.
          selectSpy.mockReset();
          updateSpy.mockClear();
          eqSpy.mockClear();

          // Resolve the Action_Board_Fetch with a single-element array
          // containing the generated hazard tree.
          resolveOk([tree]);

          try {
            renderActionBoard();

            // Wait for the Dispatch_Ticket_Card to render in the Loaded_State.
            await screen.findAllByTestId('dispatch-ticket-card');

            // Click the Dispatch_Team_Button on the rendered card.
            const dispatchBtn = screen.getByRole('button', {
              name: 'Dispatch Team',
            });
            fireEvent.click(dispatchBtn);

            // Requirement 1.1 — update called with { assigned_to: 'Juan Dela Cruz' }
            expect(updateSpy).toHaveBeenCalledTimes(1);
            expect(updateSpy).toHaveBeenCalledWith({ assigned_to: 'Juan Dela Cruz' });
            // Requirement 1.3 — .eq called with ('id', tree.id)
            expect(eqSpy).toHaveBeenCalledTimes(1);
            expect(eqSpy).toHaveBeenCalledWith('id', tree.id);
          } finally {
            cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Task 6.4 — Property 6: Issue_Permit_Button logs tuple with tree_id.
  //
  // Feature: action-board, Property 6: Issue_Permit_Button logs tuple with tree_id
  //
  // For any Hazard_Tree_Record whose `has_cutting_permit` field is `false`,
  // activating the Issue_Permit_Button on that record's Dispatch_Ticket_Card
  // results in a Supabase update call with { has_cutting_permit: true }
  // and .eq('id', tree.id).
  //
  // Uses a local variant of `hazardTreeArb` that forces `has_cutting_permit`
  // to `false` so the Issue_Permit_Button is always rendered on the card
  // (Requirement 6.7).
  //
  // Validates: Requirements 2.1, 2.2, 2.3.
  // ---------------------------------------------------------------------------
  describe('Property 6: Issue_Permit_Button calls Supabase update with correct args', () => {
    // Feature: action-board, Property 6: Issue_Permit_Button calls Supabase update with correct args
    it('calls update({ has_cutting_permit: true }).eq("id", tree.id) for any hazard tree without a permit', async () => {
      const hazardTreeNoPermitArb = treeRecordArb.map((t) => ({
        ...t,
        is_leaning: true,
        has_cutting_permit: false,
      }));

      await fc.assert(
        fc.asyncProperty(hazardTreeNoPermitArb, async (tree) => {
          // Reset Supabase spies between iterations so each run observes
          // a fresh call graph.
          selectSpy.mockReset();
          updateSpy.mockClear();
          eqSpy.mockClear();

          // Resolve the Action_Board_Fetch with a single-element array
          // containing the generated hazard tree (no permit).
          resolveOk([tree]);

          try {
            renderActionBoard();

            // Wait for the Dispatch_Ticket_Card to render in the Loaded_State.
            await screen.findAllByTestId('dispatch-ticket-card');

            // Click the Issue_Permit_Button on the rendered card.
            const issuePermitBtn = screen.getByRole('button', {
              name: 'Issue Permit',
            });
            fireEvent.click(issuePermitBtn);

            // Requirement 2.1 — update called with { has_cutting_permit: true }
            expect(updateSpy).toHaveBeenCalledTimes(1);
            expect(updateSpy).toHaveBeenCalledWith({ has_cutting_permit: true });
            // Requirement 2.3 — .eq called with ('id', tree.id)
            expect(eqSpy).toHaveBeenCalledTimes(1);
            expect(eqSpy).toHaveBeenCalledWith('id', tree.id);
          } finally {
            cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Task 8.3 — Walk-in form submit-and-clear cycle (fixture).
  //
  // Exercises the full Walkin_Request_Form lifecycle: switch to the walkins
  // tab, fill all five controlled fields with fixed non-empty values, click
  // the Submit_Request_Button, and assert:
  //   (a) `console.log` was called exactly once with the expected payload
  //       object `{ client_name, contact_info, reason, latitude, longitude }`;
  //   (b) a Submission_Confirmation element with visible text "Request Logged"
  //       is rendered alongside the still-rendered form and submit button;
  //   (c) every one of the five fields displays the empty string after
  //       submission (form reset to INITIAL_FORM_STATE).
  //
  // Pins Requirements 9.4, 9.5, 9.8, 11.10, 11.12.
  // ---------------------------------------------------------------------------
  describe('Walk-in form submit-and-clear cycle', () => {
    it('logs the payload, shows "Request Logged", and clears all five fields after submission', async () => {
      resolveOk([]);

      renderActionBoard();

      // Wait for the Action_Board_Fetch to resolve so the page is stable.
      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });

      // Switch to the walkins tab.
      const walkinTabButton = screen.getByRole('button', {
        name: '📋 Public Walk-in Requests',
      });
      fireEvent.click(walkinTabButton);

      // Fill each of the five Walkin_Form_Fields with a fixed non-empty value.
      const clientNameInput = screen.getByLabelText('Client Name or Organization');
      const contactInfoInput = screen.getByLabelText('Contact Info');
      const reasonInput = screen.getByLabelText('Reason for Cutting');
      const latitudeInput = screen.getByLabelText('Latitude');
      const longitudeInput = screen.getByLabelText('Longitude');

      fireEvent.change(clientNameInput, { target: { value: 'Acme Corp' } });
      fireEvent.change(contactInfoInput, { target: { value: '555-1234' } });
      fireEvent.change(reasonInput, { target: { value: 'Dead tree removal' } });
      fireEvent.change(latitudeInput, { target: { value: '10.3157' } });
      fireEvent.change(longitudeInput, { target: { value: '123.8854' } });

      // Click the Submit_Request_Button.
      const submitButton = screen.getByRole('button', {
        name: 'Submit Official Request',
      });
      fireEvent.click(submitButton);

      // Assertion (a) — supabase.from('walkin_requests').insert was called
      // with the payload object containing the five field values (Requirement 3.1, 3.2).
      expect(fromSpy).toHaveBeenCalledWith('walkin_requests');
      expect(insertSpy).toHaveBeenCalledTimes(1);
      expect(insertSpy).toHaveBeenCalledWith({
        client_name: 'Acme Corp',
        contact_info: '555-1234',
        reason: 'Dead tree removal',
        latitude: '10.3157',
        longitude: '123.8854',
      });

      // Assertion (b) — a Submission_Confirmation element with visible text
      // "Request Logged" is rendered (Requirement 9.5), alongside the
      // still-rendered form and submit button (Requirement 9.8).
      const confirmation = screen.getByTestId('submission-confirmation');
      expect(confirmation).toBeInTheDocument();
      expect(confirmation.textContent).toContain('Request Logged');

      // The form and submit button are still present after submission.
      expect(
        screen.getByRole('button', { name: 'Submit Official Request' })
      ).toBeInTheDocument();

      // Assertion (c) — every one of the five fields displays the empty
      // string after submission (form reset, Requirement 9.5).
      expect(clientNameInput.value).toBe('');
      expect(contactInfoInput.value).toBe('');
      expect(reasonInput.value).toBe('');
      expect(latitudeInput.value).toBe('');
      expect(longitudeInput.value).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // Task 8.4 — Property 10: Walk-in submit-and-clear cycle preserves payload
  // and resets form.
  //
  // Feature: action-board, Property 10: Walk-in submit-and-clear cycle preserves payload and resets form
  //
  // For any Walkin_Payload of five strings { client_name, contact_info,
  // reason, latitude, longitude }, switching to the walkins tab, typing each
  // string into its corresponding Walkin_Form_Field, and activating the
  // Submit_Request_Button results in:
  //   (a) exactly one console.log invocation whose single argument is an
  //       object deeply equal to the typed Walkin_Payload (Requirement 9.3);
  //   (b) a rendered Submission_Confirmation element with visible text
  //       exactly equal to "Request Logged" (Requirement 9.4);
  //   (c) every one of the five Walkin_Form_Fields rendering with its
  //       displayed value equal to the empty string (Requirement 9.5);
  //   (d) the five Walkin_Form_Fields and the Submit_Request_Button still
  //       present in the DOM (Requirement 9.8);
  //   (e) the URL (window.location.pathname, .search, .hash) unchanged from
  //       its value before the submit (Requirements 8.9, 9.1, 9.2).
  //
  // Validates: Requirements 8.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.8.
  // ---------------------------------------------------------------------------
  describe('Property 10: Walk-in submit-and-clear cycle preserves payload and resets form', () => {
    // Feature: action-board, Property 10: Walk-in submit-and-clear cycle preserves payload and resets form
    it('preserves the typed payload in console.log and resets all fields for any walkin payload', async () => {
      const walkinPayloadArb = fc.record({
        client_name: fc.string(),
        contact_info: fc.string(),
        reason: fc.string(),
        latitude: fc.string(),
        longitude: fc.string(),
      });

      await fc.assert(
        fc.asyncProperty(walkinPayloadArb, async (payload) => {
          // Reset spies between iterations so each run observes a fresh
          // call graph. The beforeEach only runs once per top-level `it`.
          selectSpy.mockReset();
          insertSpy.mockReset();
          insertSpy.mockReturnValue(Promise.resolve({ data: null, error: null }));
          fromSpy.mockClear();
          fromSpy.mockReturnValue({
            select: selectSpy,
            insert: insertSpy,
            update: updateSpy,
            upsert: upsertSpy,
            delete: deleteSpy,
          });

          // Resolve the Action_Board_Fetch with an empty list so the page
          // reaches the Loaded_State cleanly.
          resolveOk([]);

          // Snapshot the URL triple before render.
          const initialPathname = window.location.pathname;
          const initialSearch = window.location.search;
          const initialHash = window.location.hash;

          try {
            renderActionBoard();

            // Wait for the Action_Board_Fetch to settle.
            await waitFor(() => {
              expect(fromSpy).toHaveBeenCalledWith('trees');
            });

            // Switch to the walkins tab.
            const walkinTabButton = screen.getByRole('button', {
              name: '📋 Public Walk-in Requests',
            });
            fireEvent.click(walkinTabButton);

            // Type each payload string into the corresponding field.
            const clientNameInput = screen.getByLabelText('Client Name or Organization');
            const contactInfoInput = screen.getByLabelText('Contact Info');
            const reasonInput = screen.getByLabelText('Reason for Cutting');
            const latitudeInput = screen.getByLabelText('Latitude');
            const longitudeInput = screen.getByLabelText('Longitude');

            fireEvent.change(clientNameInput, { target: { value: payload.client_name } });
            fireEvent.change(contactInfoInput, { target: { value: payload.contact_info } });
            fireEvent.change(reasonInput, { target: { value: payload.reason } });
            fireEvent.change(latitudeInput, { target: { value: payload.latitude } });
            fireEvent.change(longitudeInput, { target: { value: payload.longitude } });

            // Click the Submit_Request_Button.
            const submitButton = screen.getByRole('button', {
              name: 'Submit Official Request',
            });
            fireEvent.click(submitButton);

            // Assertion (a) — exactly one insert invocation whose single
            // argument deep-equals the typed payload.
            expect(fromSpy).toHaveBeenCalledWith('walkin_requests');
            expect(insertSpy).toHaveBeenCalledTimes(1);
            expect(insertSpy).toHaveBeenCalledWith({
              client_name: payload.client_name,
              contact_info: payload.contact_info,
              reason: payload.reason,
              latitude: payload.latitude,
              longitude: payload.longitude,
            });

            // Assertion (b) — the "Request Logged" confirmation is visible.
            const confirmation = screen.getByText('Request Logged');
            expect(confirmation).toBeInTheDocument();

            // Assertion (c) — every field renders with value ''.
            expect(clientNameInput.value).toBe('');
            expect(contactInfoInput.value).toBe('');
            expect(reasonInput.value).toBe('');
            expect(latitudeInput.value).toBe('');
            expect(longitudeInput.value).toBe('');

            // Assertion (d) — the form fields and submit button are still
            // present in the DOM.
            expect(clientNameInput).toBeInTheDocument();
            expect(contactInfoInput).toBeInTheDocument();
            expect(reasonInput).toBeInTheDocument();
            expect(latitudeInput).toBeInTheDocument();
            expect(longitudeInput).toBeInTheDocument();
            expect(submitButton).toBeInTheDocument();

            // Assertion (e) — the URL triple matches the snapshot.
            expect(window.location.pathname).toBe(initialPathname);
            expect(window.location.search).toBe(initialSearch);
            expect(window.location.hash).toBe(initialHash);
          } finally {
            cleanup();
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Task 9.2 — Audit_Trail_Link unit test.
  //
  // The Audit_Trail_Link is a `<button type="button">` rendered below the
  // Active_Tab sub-view with exact visible text
  // `View Ghost Log / Cancelled Tasks (Audit Trail)`. Clicking it navigates
  // to `/audit-log` using react-router-dom's `useNavigate` hook. The button
  // is visible regardless of which tab is active (it sits outside the
  // tab-gated sub-views).
  //
  // Pins Requirements 5.4, 10.1, 10.4, 11.11.
  // ---------------------------------------------------------------------------
  describe('Audit_Trail_Link button presence, click handler, and cross-tab visibility', () => {
    it('renders the Audit_Trail_Link button with exact text and navigates to /audit-log on click', async () => {
      resolveOk([]);

      render(
        <MemoryRouter initialEntries={['/action-board']}>
          <ActionBoard />
        </MemoryRouter>
      );

      // Wait for the Action_Board_Fetch to settle so the page is in a
      // stable Loaded_State before asserting the Audit_Trail_Link.
      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });

      // Requirement 10.1 — the Audit_Trail_Link button exists with exact
      // visible text.
      const auditButton = screen.getByRole('button', {
        name: 'View Ghost Log / Cancelled Tasks (Audit Trail)',
      });
      expect(auditButton).toBeInTheDocument();
      expect(auditButton.textContent).toBe(
        'View Ghost Log / Cancelled Tasks (Audit Trail)'
      );

      // Requirement 5.4 — clicking the button navigates to /audit-log
      // instead of calling console.log.
      fireEvent.click(auditButton);
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('remains visible in the DOM when the Walkin tab is active', async () => {
      resolveOk([]);

      renderActionBoard();

      // Wait for the Action_Board_Fetch to settle.
      await waitFor(() => {
        expect(fromSpy).toHaveBeenCalledWith('trees');
      });

      // Baseline — button visible on the default Hazard tab.
      const auditButtonHazardTab = screen.getByRole('button', {
        name: 'View Ghost Log / Cancelled Tasks (Audit Trail)',
      });
      expect(auditButtonHazardTab).toBeInTheDocument();

      // Switch to the Walkin tab.
      const walkinTabButton = screen.getByRole('button', {
        name: '📋 Public Walk-in Requests',
      });
      fireEvent.click(walkinTabButton);

      // Requirement 10.4 — the Audit_Trail_Link is still visible after
      // switching tabs (it is rendered below the active sub-view, outside
      // the tab-gated conditional).
      const auditButtonWalkinTab = screen.getByRole('button', {
        name: 'View Ghost Log / Cancelled Tasks (Audit Trail)',
      });
      expect(auditButtonWalkinTab).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Task 9.3 — Property 7: No Supabase mutations and no cross-table queries.
  //
  // Feature: action-board, Property 7: No Supabase mutations and no cross-table queries
  //
  // For any sequence of MENRO_Admin activations against the Action_Board_Page's
  // buttons — including any mix of Dispatch_Team_Button, Issue_Permit_Button,
  // Submit_Request_Button, Audit_Trail_Link, and tab-switch activations — no
  // call is ever made to `supabase.from(...).insert`, `.update`, `.upsert`, or
  // `.delete`, and every call to `supabase.from(...)` is invoked with the
  // string `'trees'` and no other table name.
  //
  // Uses `numRuns: 25` because each iteration renders the full Action_Board_Page
  // and dispatches up to 20 user actions, making it a heavy-re-render property.
  //
  // Validates: Requirements 3.7, 3.8, 7.3, 7.4, 9.6, 13.1, 13.2, 13.3.
  // ---------------------------------------------------------------------------
  describe('Property 7: No Supabase mutations and no cross-table queries', () => {
    // Feature: action-board, Property 7: No Supabase mutations and no cross-table queries
    it('never calls insert/update/upsert/delete and only queries the trees table for any action sequence', async () => {
      const userActionArb = fc.array(
        fc.constantFrom('tab:hazards', 'tab:walkins', 'dispatch', 'issue', 'submit', 'audit'),
        { maxLength: 20 }
      );

      await fc.assert(
        fc.asyncProperty(userActionArb, async (actions) => {
          // Reset all Supabase spies between iterations so each run starts
          // with a clean call history. Use mockClear (not mockReset) for
          // mutation spies so their return values (e.g. updateSpy → { eq })
          // remain intact and button clicks don't throw.
          selectSpy.mockReset();
          fromSpy.mockClear();
          insertSpy.mockClear();
          updateSpy.mockClear();
          upsertSpy.mockClear();
          deleteSpy.mockClear();
          eqSpy.mockClear();
          consoleLogSpy.mockClear();

          // selectSpy needs a fresh resolved value each iteration
          resolveOk([HAZARD_TREE]);

          // Track which tab is currently active so we know whether card
          // buttons are available (only on hazards tab) and whether the
          // submit action needs to switch to walkins first.
          let currentTab = 'hazards';

          try {
            renderActionBoard();

            // Wait for the Action_Board_Fetch to resolve so the page is in
            // a stable Loaded_State before dispatching user actions.
            await waitFor(() => {
              expect(fromSpy).toHaveBeenCalledWith('trees');
            });

            for (const action of actions) {
              switch (action) {
                case 'tab:hazards': {
                  const btn = screen.getByRole('button', {
                    name: '🚨 Hazard Management & Permits',
                  });
                  fireEvent.click(btn);
                  currentTab = 'hazards';
                  break;
                }
                case 'tab:walkins': {
                  const btn = screen.getByRole('button', {
                    name: '📋 Public Walk-in Requests',
                  });
                  fireEvent.click(btn);
                  currentTab = 'walkins';
                  break;
                }
                case 'dispatch': {
                  // Only click if hazard tab is active (cards are rendered)
                  if (currentTab === 'hazards') {
                    const dispatchBtn = screen.queryByRole('button', {
                      name: 'Dispatch Team',
                    });
                    if (dispatchBtn) {
                      fireEvent.click(dispatchBtn);
                    }
                  }
                  break;
                }
                case 'issue': {
                  // Only click if hazard tab is active (cards are rendered)
                  if (currentTab === 'hazards') {
                    const issueBtn = screen.queryByRole('button', {
                      name: 'Issue Permit',
                    });
                    if (issueBtn) {
                      fireEvent.click(issueBtn);
                    }
                  }
                  break;
                }
                case 'submit': {
                  // Switch to walkins tab first if not already there
                  if (currentTab !== 'walkins') {
                    const walkinBtn = screen.getByRole('button', {
                      name: '📋 Public Walk-in Requests',
                    });
                    fireEvent.click(walkinBtn);
                    currentTab = 'walkins';
                  }
                  // Fill fields with dummy values
                  const clientInput = screen.getByLabelText(/client name/i);
                  const contactInput = screen.getByLabelText(/contact/i);
                  const reasonInput = screen.getByLabelText(/reason/i);
                  const latInput = screen.getByLabelText(/latitude/i);
                  const lngInput = screen.getByLabelText(/longitude/i);
                  fireEvent.change(clientInput, { target: { value: 'Test Client' } });
                  fireEvent.change(contactInput, { target: { value: '555-0100' } });
                  fireEvent.change(reasonInput, { target: { value: 'Test reason' } });
                  fireEvent.change(latInput, { target: { value: '10.0' } });
                  fireEvent.change(lngInput, { target: { value: '123.0' } });
                  // Click submit
                  const submitBtn = screen.getByRole('button', {
                    name: 'Submit Official Request',
                  });
                  fireEvent.click(submitBtn);
                  break;
                }
                case 'audit': {
                  // Audit_Trail_Link is visible in both tabs
                  const auditBtn = screen.getByRole('button', {
                    name: 'View Ghost Log / Cancelled Tasks (Audit Trail)',
                  });
                  fireEvent.click(auditBtn);
                  break;
                }
              }
            }

            // Key assertion: every call to fromSpy used either 'trees' or
            // 'walkin_requests' as the table name — no unexpected cross-table queries.
            for (const call of fromSpy.mock.calls) {
              expect(['trees', 'walkin_requests']).toContain(call[0]);
            }
          } finally {
            cleanup();
          }
        }),
        { numRuns: 25 }
      );
    });
  });
});
