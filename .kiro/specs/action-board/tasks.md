# Implementation Plan: Action Board

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

Phase 5 replaces the `src/pages/ActionBoard.jsx` placeholder with a data-driven Dual_Tab_Shell page and adds a dedicated `src/pages/ActionBoard.test.jsx`. No other source file is modified, and no new entries are added to `package.json`. Implementation uses React with JSX (matching the existing Vite + Vitest + React stack) and reuses the Phase 4 classifiers (`classifyHazard`, `HAZARD_STATUS`) as pure filters.

## Tasks

- [x] 1. Set up Action_Board page scaffold
  - [x] 1.1 Replace `src/pages/ActionBoard.jsx` placeholder with the `ActionBoard` default-export skeleton
    - Import React `useState`/`useEffect`, the `supabase` client from `../supabaseClient.js`, and `classifyHazard` + `HAZARD_STATUS` from `../lib/hazardStatus.js`
    - Define the `INITIAL_FORM_STATE` frozen constant with `client_name`, `contact_info`, `reason`, `latitude`, `longitude` all set to `''`
    - Declare Tailwind class constants at the top of the file: `ACTIVE_TAB_CLASS`, `INACTIVE_TAB_CLASS`, `CARD_SHELL_CLASS` (containing `bg-white rounded-lg shadow-sm border border-slate-200`), `PERMIT_ISSUED_BADGE_CLASS` (amber palette matching the Phase 4 Permit_Pill), `ISSUE_PERMIT_BUTTON_CLASS`, `DISPATCH_TEAM_BUTTON_CLASS`, `AUDIT_TRAIL_LINK_CLASS`
    - Declare all six `useState` slots: `status` (`'loading'`), `trees` (`[]`), `errorMessage` (`''`), `activeTab` (`'hazards'`), `form` (`INITIAL_FORM_STATE`), `submissionConfirmed` (`false`)
    - Render a single `<section>` wrapper with no outer `p-6` padding, containing the `<h1>Action Board</h1>` and placeholder slots for the Dual_Tab_Shell, active sub-view, and Audit_Trail_Link that later tasks will fill in
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 2.4, 2.5, 2.6, 12.2, 13.11_

- [x] 2. Implement Supabase fetch lifecycle
  - [x] 2.1 Implement the `Action_Board_Fetch` `useEffect`
    - Inside `src/pages/ActionBoard.jsx`, add a single `useEffect` with an empty dependency array that issues `supabase.from('trees').select('*')` exactly once
    - Use a `cancelled` sentinel in the effect cleanup to guard against `setState` after unmount
    - Wrap the call in `try`/`catch`: on `{ data, error }` with non-null `error`, set `errorMessage` and `status = 'error'`; on thrown exception, do the same with `e?.message ?? 'Unexpected error loading the Action Board.'`
    - On success, store `Array.isArray(data) ? data : []` into `trees` unshaped, set `status = 'loaded'`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_

  - [x] 2.2 Write unit tests for the fetch contract, Loading_State, and Error_State
    - Create `src/pages/ActionBoard.test.jsx` using the hoisted `fromSpy`/`selectSpy`/`insertSpy`/`updateSpy`/`upsertSpy`/`deleteSpy` pattern from `src/pages/CommandCenter.test.jsx` and `src/pages/Inventory.test.jsx`
    - Add `beforeEach`/`afterEach` that spy on `console.log` via `vi.spyOn(console, 'log').mockImplementation(() => {})` and call `mockRestore()` after each test
    - Assert `fromSpy` is called once with `'trees'` and `selectSpy` is called with `'*'` after mount resolves `{ data: [], error: null }`
    - Assert that while `selectSpy` returns a pending promise, a visible loading indicator renders and zero `Dispatch_Ticket_Card` elements render
    - Assert that when `selectSpy` resolves `{ data: null, error: { message: 'network down' } }`, a `role="alert"` banner renders with the message and zero cards render
    - _Requirements: 3.2, 3.5, 3.6, 11.2, 11.3, 11.7, 11.12_

- [x] 3. Implement Dual_Tab_Shell
  - [x] 3.1 Render `Hazard_Tab_Button` and `Walkin_Tab_Button` with conditional sub-view rendering
    - Inside `src/pages/ActionBoard.jsx`, render two `<button type="button">` controls in order — first with visible text exactly `🚨 Hazard Management & Permits`, second with visible text exactly `📋 Public Walk-in Requests`
    - Apply `ACTIVE_TAB_CLASS` when the button matches `activeTab` and `INACTIVE_TAB_CLASS` otherwise, using Tailwind utilities (color, weight, border) to visually distinguish selected vs unselected
    - Wire each button's `onClick` to `setActiveTab('hazards')` / `setActiveTab('walkins')` respectively; do NOT call `navigate`, `history.pushState`, `history.replaceState`, or touch `window.location`, `sessionStorage`, or `localStorage`
    - Conditionally render exactly one of the Hazard_Dispatch_Board or Walkin_Request_Form slots based on `activeTab`; leave the inner contents of each sub-view as minimal placeholders that later tasks will flesh out
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14_

  - [x] 3.2 Write unit tests for tab labels, order, initial active tab, and active-tab visual distinction
    - In `src/pages/ActionBoard.test.jsx`, assert that after mount the two tab buttons exist in the order Hazard-then-Walkin with the exact emoji-prefixed labels
    - Assert that on first mount the Hazard_Dispatch_Board is rendered and the Walkin_Request_Form is not
    - Assert that the active tab's `className` differs from the inactive tab's `className`
    - Add an example-based tab-switching test that clicks `Walkin_Tab_Button` and asserts the form is rendered, then clicks `Hazard_Tab_Button` and asserts the board is rendered again
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.9, 11.5_

  - [x] 3.3 Write property test for tab-switching state and URL invariants
    - **Property 8: Tab-switching state and URL invariants**
    - **Validates: Requirements 4.5, 4.6, 4.7, 4.8, 4.10, 4.13**
    - In `src/pages/ActionBoard.test.jsx`, define a local `tabClickSequenceArb = fc.array(fc.constantFrom('hazards', 'walkins'), { maxLength: 20 })`
    - Use `fc.asyncProperty` with `{ numRuns: 25 }` (heavy re-render). Tag with `// Feature: action-board, Property 8: Tab-switching state and URL invariants`
    - For each sequence: `selectSpy.mockReset()` and resolve once with a fixture `[HAZARD_TREE, SAFE_TREE]`; render the page; fire a click for each element of the sequence on the corresponding tab button; in a `finally` call `cleanup()`
    - Assert (a) the last-activated tab's sub-view is rendered and the other is not, (b) `selectSpy` was called exactly once, (c) `window.location.pathname`/`.search`/`.hash` equal their initial values, (d) any text typed into walk-in fields during a prior `walkins` visit is still present when `walkins` is active again

- [x] 4. Implement Hazard_Dispatch_Board state branches
  - [x] 4.1 Derive `hazardTickets` and render the Loading_State / Error_State / Empty_Hazard_State / Loaded_State branches
    - Inside `src/pages/ActionBoard.jsx`, inside the Hazard_Dispatch_Board sub-view derive `const hazardTickets = trees.filter((t) => classifyHazard(t) === HAZARD_STATUS.HAZARD);` — no inlined Hazard_Flags OR
    - Render four branches based on `status` and `hazardTickets.length`: visible loading indicator when `status === 'loading'`; `role="alert"` error banner rendering `errorMessage` when `status === 'error'`; visible empty-state banner indicating no hazardous trees when `status === 'loaded' && hazardTickets.length === 0`; grid of Dispatch_Ticket_Card placeholders when `status === 'loaded' && hazardTickets.length > 0`
    - Use Tailwind grid utilities such as `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4` for the loaded grid
    - Assign each card a stable React `key={tree.id}`
    - Keep the inner Dispatch_Ticket_Card markup as a minimal shell for now (full card contents are filled in task 5)
    - _Requirements: 3.5, 3.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 4.2 Write unit test for the Empty_Hazard_State and the mocked-fetch filter demonstration
    - In `src/pages/ActionBoard.test.jsx`, define fixture constants `HAZARD_TREE` (at least one `Hazard_Flags` boolean `true`, `has_cutting_permit: false`) and `SAFE_TREE` (all four `Hazard_Flags` booleans `false`, `has_cutting_permit: true`)
    - Resolve `selectSpy` with `[HAZARD_TREE, SAFE_TREE]` and assert exactly one Dispatch_Ticket_Card is rendered and it corresponds to `HAZARD_TREE` (e.g. displays `HAZARD_TREE.tree_id`)
    - Resolve `selectSpy` with `[SAFE_TREE]` only and assert zero Dispatch_Ticket_Card elements render and the empty-state banner is visible
    - _Requirements: 5.7, 11.3, 11.4_

  - [x] 4.3 Write property test for hazard-filter correctness and empty-state consistency
    - **Property 1: Hazard filter correctness and empty-state consistency**
    - **Validates: Requirements 3.3, 3.4, 5.1, 5.4, 5.7**
    - In `src/pages/ActionBoard.test.jsx`, use the existing `treeRecordArb` from `src/test/arbitraries.js` wrapped in `fc.array(treeRecordArb, { maxLength: 10 })`
    - Use `fc.asyncProperty` with `{ numRuns: 100 }`, tagged `// Feature: action-board, Property 1: Hazard filter correctness and empty-state consistency`
    - For each sample: reset `selectSpy`, resolve with the array, render; compute `expected = trees.filter((t) => classifyHazard(t) === HAZARD_STATUS.HAZARD)`; assert the rendered card count equals `expected.length` and the set of rendered `tree_id` values equals the expected set; assert the empty-state banner renders iff `expected.length === 0`; call `cleanup()` in `finally`

  - [x] 4.4 Write property test for React key stability on unique ids
    - **Property 9: Unique Tree_Record `id` values produce no React key-collision warnings**
    - **Validates: Requirements 5.5**
    - In `src/pages/ActionBoard.test.jsx`, use `fc.uniqueArray(treeRecordArb, { selector: (t) => t.id, maxLength: 10 })`
    - Use `fc.asyncProperty` with `{ numRuns: 25 }`, tagged `// Feature: action-board, Property 9: Unique Tree_Record id values produce no React key-collision warnings`
    - Spy on `console.error` with `vi.spyOn(...).mockImplementation(() => {})` and restore it after the test
    - For each sample: render and assert no `console.error` invocation's first argument contains the case-insensitive substring `'key'`; `cleanup()` in `finally`

- [x] 5. Implement Dispatch_Ticket_Card
  - [x] 5.1 Render card layout with `tree_id`, `species`, `dbh`, `assigned_to`
    - Inside `src/pages/ActionBoard.jsx`, flesh out the Dispatch_Ticket_Card sub-component (inline function inside `ActionBoard.jsx` — not exported, not moved to `src/components/`)
    - Apply `CARD_SHELL_CLASS` on the card's outer container
    - Render `tree_id` as a prominent heading-style element (larger font size or heavier weight than the other attributes), showing `—` when `tree_id` is `null`
    - Render labelled attributes for `species` (unchanged string), `dbh` (unchanged string), and `assigned_to` (showing `—` when `null`) using visible `<label>`-style text or `<dt>/<dd>`-style markup
    - Do NOT render `latitude`, `longitude`, `scientific_name`, `species_type`, individual Hazard_Flags, `dateCaptured`, `task_status`, or `photo_url`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.10, 12.3, 12.5_

  - [x] 5.2 Implement permit branching — Issue_Permit_Button vs Permit_Issued_Badge
    - Inside the Dispatch_Ticket_Card body in `src/pages/ActionBoard.jsx`, always render a `Dispatch_Team_Button` `<button type="button">` with visible text exactly `Dispatch Team`
    - When `tree.has_cutting_permit === false`, render an `Issue_Permit_Button` `<button type="button">` with visible text exactly `Issue Permit` and no `Permit_Issued_Badge`
    - When `tree.has_cutting_permit === true`, render a `Permit_Issued_Badge` `<span>` with visible text exactly `Permit Issued` styled with `PERMIT_ISSUED_BADGE_CLASS` (amber palette) and no `Issue_Permit_Button`
    - Use a ternary in JSX for the branching so exactly one of the two elements is rendered
    - Leave the button `onClick` handlers as no-ops for now (task 6 wires them up)
    - _Requirements: 6.6, 6.7, 6.8, 6.9, 12.4_

  - [x] 5.3 Write unit tests for the card shell, tree_id prominence, and permit branding fixtures
    - In `src/pages/ActionBoard.test.jsx`, assert the card's outer `className` contains `bg-white`, `rounded-lg`, `shadow-sm`, and `border-slate-200`
    - Assert that when `has_cutting_permit === true` the `Permit_Issued_Badge` `<span>`'s `className` matches `/bg-amber-/` or `/bg-yellow-/` and the `Issue_Permit_Button` is not in the DOM
    - Assert that when `has_cutting_permit === false` the `Issue_Permit_Button` is rendered with exact text `Issue Permit` and the `Permit_Issued_Badge` is not in the DOM
    - Assert that rendering a fixture with `tree_id: null` and `assigned_to: null` shows `—` for both fields
    - _Requirements: 6.10, 12.3, 6.9, 12.4, 12.5, 11.6_

  - [x] 5.4 Write property test for Dispatch_Ticket_Card preserves Tree_Record field values
    - **Property 2: Dispatch_Ticket_Card preserves Tree_Record field values**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
    - In `src/pages/ActionBoard.test.jsx`, define a local `hazardTreeArb` that takes `treeRecordArb` and forces at least one of `is_leaning`/`has_powerline_conflict`/`is_decayed`/`is_root_problem` to `true`
    - Use `fc.asyncProperty` with `{ numRuns: 100 }`, tagged `// Feature: action-board, Property 2: Dispatch_Ticket_Card preserves Tree_Record field values`
    - For each sample: reset `selectSpy`, resolve with a single-element `[tree]` array, render; assert the card's DOM contains the exact value of `tree_id`, `species`, `dbh`, and `assigned_to` — with `null` values of `tree_id` and `assigned_to` rendered as `—`; `cleanup()` in `finally`

  - [x] 5.5 Write property test for Dispatch_Ticket_Card hides out-of-scope Tree_Record fields
    - **Property 3: Dispatch_Ticket_Card hides out-of-scope Tree_Record fields**
    - **Validates: Requirements 6.5**
    - In `src/pages/ActionBoard.test.jsx`, build an arbitrary that overlays `hazardTreeArb` with distinctive, non-colliding sentinel values for `latitude`, `longitude`, `scientific_name`, `species_type`, `dateCaptured`, `task_status`, and `photo_url`, and unique flag-carrier strings for the four boolean `Hazard_Flags`
    - Use `fc.asyncProperty` with `{ numRuns: 100 }`, tagged `// Feature: action-board, Property 3: Dispatch_Ticket_Card hides out-of-scope Tree_Record fields`
    - Render the card and assert the DOM does not contain any of the sentinel values for the seven out-of-scope fields or the four individual Hazard_Flags markers; `cleanup()` in `finally`

  - [x] 5.6 Write property test for Dispatch_Ticket_Card permit branching
    - **Property 4: Dispatch_Ticket_Card permit branching**
    - **Validates: Requirements 6.6, 6.7, 6.8**
    - In `src/pages/ActionBoard.test.jsx`, use `hazardTreeArb` parameterised over `has_cutting_permit: fc.boolean()`
    - Use `fc.asyncProperty` with `{ numRuns: 100 }`, tagged `// Feature: action-board, Property 4: Dispatch_Ticket_Card permit branching`
    - For each sample: render the card; always assert a `Dispatch_Team_Button` with visible text `Dispatch Team` is present; if `has_cutting_permit === true` assert `Permit Issued` badge is present and no `Issue Permit` button; if `false` assert `Issue Permit` button is present and no `Permit Issued` badge; `cleanup()` in `finally`

- [x] 6. Implement Dispatch_Team_Button and Issue_Permit_Button stubs
  - [x] 6.1 Add `handleDispatchTeam` and `handleIssuePermit` stubs and wire them to the card buttons
    - Inside `src/pages/ActionBoard.jsx`, declare `handleDispatchTeam(tree)` prefixed with a source-level comment identifying it as a Phase 5 stub that a later phase must replace with a real Supabase update on the `trees` table; body calls `console.log('Dispatch Team', tree.tree_id)` exactly once; no `supabase.from`, no `fetch`, no `navigate`
    - Declare `handleIssuePermit(tree)` with the analogous Phase 5 comment; body calls `console.log('Issue Permit', tree.tree_id)` exactly once; no mutations or network requests
    - Wire the Dispatch_Team_Button's `onClick` to `() => handleDispatchTeam(tree)` and the Issue_Permit_Button's `onClick` to `() => handleIssuePermit(tree)`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 6.2 Write unit tests for Dispatch_Team_Button and Issue_Permit_Button click logs (fixture)
    - In `src/pages/ActionBoard.test.jsx`, resolve `selectSpy` with `[HAZARD_TREE]` (`has_cutting_permit: false`); click the Dispatch_Team_Button on the rendered card; assert `console.log` was called exactly once with the two arguments `'Dispatch Team'` and `HAZARD_TREE.tree_id`
    - In a separate test, click the Issue_Permit_Button on the same card; assert `console.log` was called exactly once with `'Issue Permit'` and `HAZARD_TREE.tree_id`
    - Use `fireEvent` from `@testing-library/react`
    - _Requirements: 11.7, 11.8, 11.9, 11.12_

  - [x] 6.3 Write property test for Dispatch_Team_Button logs tuple with tree_id
    - **Property 5: Dispatch_Team_Button logs tuple with tree_id**
    - **Validates: Requirements 7.1**
    - In `src/pages/ActionBoard.test.jsx`, use `hazardTreeArb` (arbitrary including `tree_id: null`)
    - Use `fc.asyncProperty` with `{ numRuns: 100 }`, tagged `// Feature: action-board, Property 5: Dispatch_Team_Button logs tuple with tree_id`
    - For each sample: reset `selectSpy` and the `console.log` spy; resolve with `[tree]`; render; click the card's Dispatch_Team_Button; assert `console.log` was called exactly once with `('Dispatch Team', tree.tree_id)`; `cleanup()` in `finally`

  - [x] 6.4 Write property test for Issue_Permit_Button logs tuple with tree_id
    - **Property 6: Issue_Permit_Button logs tuple with tree_id**
    - **Validates: Requirements 7.2**
    - In `src/pages/ActionBoard.test.jsx`, use `hazardTreeArb` with `has_cutting_permit: fc.constant(false)`
    - Use `fc.asyncProperty` with `{ numRuns: 100 }`, tagged `// Feature: action-board, Property 6: Issue_Permit_Button logs tuple with tree_id`
    - For each sample: reset `selectSpy` and the `console.log` spy; resolve with `[tree]`; render; click the card's Issue_Permit_Button; assert `console.log` was called exactly once with `('Issue Permit', tree.tree_id)`; `cleanup()` in `finally`

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Walkin_Request_Form
  - [x] 8.1 Render the controlled form with five `Walkin_Form_Fields` and `Submit_Request_Button`
    - Inside `src/pages/ActionBoard.jsx`, replace the Walkin_Request_Form placeholder with a single `<form>` element rendered when `activeTab === 'walkins'`
    - Render exactly five controlled fields in order with visible `<label htmlFor>` associations: Client_Name_Or_Org (`<input type="text">`, key `client_name`), Contact_Info (`<input type="text">`, key `contact_info`), Reason_For_Cutting (`<textarea>`, key `reason`), Latitude (`<input type="text">`, key `latitude`), Longitude (`<input type="text">`, key `longitude`)
    - Wire each field to `value={form[key]}` and `onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}`; also reset `submissionConfirmed` to `false` on any field change so a second submit reruns the confirmation
    - Render the `Submit_Request_Button` as `<button type="submit">Submit Official Request</button>`; leave the form's `onSubmit` hooked to a placeholder that task 8.2 fills in
    - Do NOT add `required`, `pattern`, or `type="number"` attributes; do NOT add any third-party form library import
    - Apply Tailwind utilities for layout/typography consistent with the enterprise-dashboard aesthetic
    - _Requirements: 1.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 12.1, 13.5, 13.6_

  - [x] 8.2 Implement `handleSubmitWalkin` stub with `preventDefault`, payload log, `Submission_Confirmation`, and form reset
    - Inside `src/pages/ActionBoard.jsx`, declare `handleSubmitWalkin(event)` prefixed with a source-level comment identifying it as a Phase 5 stub that a later phase must replace with a real Supabase insert into a walk-in requests table
    - Body: call `event.preventDefault()` first; build `const payload = { client_name: form.client_name, contact_info: form.contact_info, reason: form.reason, latitude: form.latitude, longitude: form.longitude };`; call `console.log(payload)` exactly once; `setSubmissionConfirmed(true)`; `setForm(INITIAL_FORM_STATE)`
    - Wire the form's `onSubmit` to `handleSubmitWalkin`
    - Render the `Submission_Confirmation` element with visible text exactly `Request Logged` when `submissionConfirmed === true`, rendered alongside (not replacing) the five fields and the submit button
    - No `supabase.from`, no `fetch`, no `navigate`, no mutations
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 13.2_

  - [x] 8.3 Write unit test for the walk-in form submit-and-clear cycle (fixture)
    - In `src/pages/ActionBoard.test.jsx`, after resolving `selectSpy` with `[]`, click the Walkin_Tab_Button, fill each of the five Walkin_Form_Fields with a fixed non-empty string value via `fireEvent.change`, click the Submit_Request_Button
    - Assert `console.log` was called exactly once with a payload object deep-equal to `{ client_name, contact_info, reason, latitude, longitude }`
    - Assert a `Submission_Confirmation` element with visible text `Request Logged` is rendered alongside the still-rendered form and submit button
    - Assert every one of the five fields displays the empty string after submission
    - _Requirements: 9.4, 9.5, 9.8, 11.10, 11.12_

  - [x] 8.4 Write property test for the walk-in submit-and-clear cycle
    - **Property 10: Walk-in submit-and-clear cycle preserves payload and resets form**
    - **Validates: Requirements 8.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.8**
    - In `src/pages/ActionBoard.test.jsx`, define `walkinPayloadArb = fc.record({ client_name: fc.string(), contact_info: fc.string(), reason: fc.string(), latitude: fc.string(), longitude: fc.string() })`
    - Use `fc.asyncProperty` with `{ numRuns: 100 }`, tagged `// Feature: action-board, Property 10: Walk-in submit-and-clear cycle preserves payload and resets form`
    - For each sample: reset `selectSpy` and the `console.log` spy; resolve with `[]`; render; snapshot `window.location.pathname`/`.search`/`.hash`; click Walkin_Tab_Button; type each string into the corresponding field via `fireEvent.change`; click Submit_Request_Button
    - Assert: exactly one `console.log` invocation whose single argument deep-equals the typed payload; the `Request Logged` confirmation element is visible; every field renders with value `''`; the form fields and submit button are still present; the URL triple matches the snapshot; `cleanup()` in `finally`

- [x] 9. Implement Audit_Trail_Link and cross-cutting invariants
  - [x] 9.1 Render `Audit_Trail_Link` and implement `handleAuditTrail` stub
    - Inside `src/pages/ActionBoard.jsx`, render the Audit_Trail_Link as a single `<button type="button">` below the Active_Tab sub-view so it is visible in both tabs, with visible text exactly `View Ghost Log / Cancelled Tasks (Audit Trail)`
    - Apply `AUDIT_TRAIL_LINK_CLASS` (e.g. `text-slate-500 hover:text-slate-700 underline`) so it is visually distinct from the Dispatch_Team_Button, Issue_Permit_Button, and Submit_Request_Button
    - Declare `handleAuditTrail()` prefixed with a source-level comment identifying it as a Phase 5 stub that a later phase must replace with the real ghost-log viewer filtered to `task_status = 'Cancelled'` rows; body calls `console.log('View Ghost Log / Cancelled Tasks (Audit Trail)')` exactly once; no navigation, no Supabase call, no modal
    - Wire the Audit_Trail_Link's `onClick` to `handleAuditTrail`
    - _Requirements: 2.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 13.3_

  - [x] 9.2 Write unit test for Audit_Trail_Link
    - In `src/pages/ActionBoard.test.jsx`, after resolving `selectSpy` with `[]`, assert the Audit_Trail_Link button exists with exact text `View Ghost Log / Cancelled Tasks (Audit Trail)`
    - Click it; assert `console.log` was called exactly once with a single string argument identifying the audit-trail intent
    - Assert the button is still visible in the DOM when the Walkin tab is active (switch tabs and re-query)
    - _Requirements: 10.1, 10.2, 10.4, 11.11_

  - [x] 9.3 Write property test for no Supabase mutations and no cross-table queries
    - **Property 7: No Supabase mutations and no cross-table queries**
    - **Validates: Requirements 3.7, 3.8, 7.3, 7.4, 9.6, 13.1, 13.2, 13.3**
    - In `src/pages/ActionBoard.test.jsx`, define an arbitrary sequence of user actions: tab switches, Dispatch_Team_Button clicks, Issue_Permit_Button clicks on eligible cards, Submit_Request_Button activations, Audit_Trail_Link activations. For example: `fc.array(fc.constantFrom('tab:hazards', 'tab:walkins', 'dispatch', 'issue', 'submit', 'audit'), { maxLength: 20 })`
    - Use `fc.asyncProperty` with `{ numRuns: 25 }`, tagged `// Feature: action-board, Property 7: No Supabase mutations and no cross-table queries`
    - For each sample: reset all spies; resolve `selectSpy` with `[HAZARD_TREE]`; render; dispatch each action; `cleanup()` in `finally`
    - Assert `insertSpy`, `updateSpy`, `upsertSpy`, and `deleteSpy` were never called; assert every call to `fromSpy` was invoked with the string `'trees'`

  - [x] 9.4 Write unit test for the `/action-board` route registration, page heading, and App_Shell padding inheritance
    - In `src/pages/ActionBoard.test.jsx`, render `<App />` wrapped in `MemoryRouter` at the `/action-board` route (following the Phase 4 `Inventory.test.jsx` / `CommandCenter.test.jsx` pattern)
    - Assert `screen.getByRole('heading', { level: 1, name: 'Action Board' })` is present
    - Assert the App_Shell `<main>` carries `p-6` and the Action_Board_Page's outer element does not apply its own `p-6`
    - _Requirements: 2.3, 2.4, 2.5, 12.2_

- [x] 10. Final checkpoint - Ensure Phase 1-4 baseline and Phase 5 tests pass
  - Ensure all tests pass, ask the user if questions arise. Confirm `npm test` passes every test in the Phase 1-through-4 baseline (140 tests across 17 files) plus every new test added in `src/pages/ActionBoard.test.jsx`, and confirm no new entries were added to `dependencies` or `devDependencies` in `package.json`.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- All implementation lives inside `src/pages/ActionBoard.jsx`; no new files are created in `src/components/` or `src/lib/` and `src/types.js`, `src/supabaseClient.js`, `src/lib/hazardStatus.js`, `src/lib/permitStatus.js`, and `src/App.jsx` are left untouched (Requirement 13.11)
- All tests live in the single new file `src/pages/ActionBoard.test.jsx`; arbitraries specific to the Action_Board live inside the test file rather than in `src/test/arbitraries.js`
- Each task references specific acceptance-criteria clauses from `requirements.md` for traceability
- Checkpoints ensure incremental validation
- Property tests validate the ten universal correctness properties from the design document; unit tests cover fixed UI strings, route wiring, Tailwind tokens, and deterministic state-branch rendering
- Property tests use `fc.asyncProperty` with `numRuns: 100` except heavy re-render properties (Property 7, 8, 9), which use `numRuns: 25` following the `CommandCenter.test.jsx` precedent
- All tests use `fireEvent` from `@testing-library/react` rather than `@testing-library/user-event` because the project does not include `user-event`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "9.4"] },
    { "id": 2, "tasks": ["3.1", "2.2"] },
    { "id": 3, "tasks": ["4.1", "3.2"] },
    { "id": 4, "tasks": ["5.1", "3.3"] },
    { "id": 5, "tasks": ["5.2", "4.2"] },
    { "id": 6, "tasks": ["6.1", "4.3"] },
    { "id": 7, "tasks": ["8.1", "4.4"] },
    { "id": 8, "tasks": ["8.2", "5.4"] },
    { "id": 9, "tasks": ["9.1", "5.5"] },
    { "id": 10, "tasks": ["5.3"] },
    { "id": 11, "tasks": ["5.6"] },
    { "id": 12, "tasks": ["6.2"] },
    { "id": 13, "tasks": ["6.3"] },
    { "id": 14, "tasks": ["6.4"] },
    { "id": 15, "tasks": ["8.3"] },
    { "id": 16, "tasks": ["8.4"] },
    { "id": 17, "tasks": ["9.2"] },
    { "id": 18, "tasks": ["9.3"] }
  ]
}
```
