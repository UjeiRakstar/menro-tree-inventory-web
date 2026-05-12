# Implementation Plan: Field Team Roster

## Overview

Phase 3 ships the MENRO_Admin's Field_Team_Roster portal at `/arborists` — a single new page (`src/pages/ManageArborists.jsx`) containing an Account_Creation_Form and a Roster_Table, plus a five-item sidebar and one new route registration. Every backend-adjacent behaviour is deliberately stubbed to `console.log`: the form submit handler, the table's data source (a module-local `MOCK_ARBORIST_LIST`), and the per-row Reset Password / Revoke Access buttons. The stub posture is driven by the design's Decision #1 — `supabase.auth.signUp` would sign the current admin out — and a later phase will replace the stubs with a server-side admin-creation path.

This plan converts the design into incremental, file-sized steps that build on each other: Sidebar update → Sidebar test update → page scaffold → form wiring → mock list + table → row actions → route registration → component tests → final checkpoint. No new runtime or dev dependencies are added (Requirement 1.1). The implementation language is JavaScript with JSX, matching the existing codebase; the testing stack is the already-installed Vitest + React Testing Library + jsdom trio.

Key design decisions shaping the tasks:
- Mock_Arborist_List stays module-local inside `ManageArborists.jsx` (Design Decision #1; Requirement 7.4)
- Arborist_Record shape stays page-local via JSDoc `@typedef`; no edit to `src/types.js` (Design Decision #2; Requirement 7.4)
- Controlled inputs via `useState` per field, not uncontrolled refs (Design Decision #3)
- Source-level stub comment above `handleSubmit` uses the exact text from Design Decision #4 (Requirement 6.5)
- `NAV_ITEMS` extended by insertion at index 3, not appending (Design Decision #6; Requirement 3.4)
- `src/App.test.jsx` stays unchanged — it has no link-count assertion to update (Requirement 10.3, vacuously satisfied)
- Tests use `fireEvent.change`, not `user-event` (Design Decision #10)

## Tasks

- [x] 1. Extend Sidebar `NAV_ITEMS` with the Field Team entry
  - Add `Users` to the existing `lucide-react` import in `src/components/Sidebar.jsx`
  - Insert `{ to: '/arborists', label: 'Field Team', Icon: Users }` at index 3 of the `NAV_ITEMS` array, between the Action Board and Analytics entries
  - Leave the `Sidebar` function body untouched — rendering is data-driven so the fifth `NavLink` inherits the existing active/inactive styling automatically
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 1.2_

- [x] 2. Update Sidebar tests for the new five-item nav
  - [x] 2.1 Grow `EXPECTED_ITEMS` and fix length assertions in `src/components/Sidebar.test.jsx`
    - Insert `{ to: '/arborists', label: 'Field Team' }` at index 3 of the module-scope `EXPECTED_ITEMS` array
    - Update every `NAV_ITEMS.toHaveLength(4)` assertion to `toHaveLength(5)`
    - Update every `getAllByRole('link')` length assertion from `4` to `5`
    - The existing active-state `describe.each(EXPECTED_ITEMS)` loop and icon+label loop automatically pick up the new fifth route
    - _Requirements: 10.1, 10.2, 3.3_
  - [x] 2.2 Add the ordering-contract assertion from Requirement 10.4
    - Add a dedicated test asserting `NAV_ITEMS[3]` has `to === '/arborists'` and `label === 'Field Team'`
    - Assert `NAV_ITEMS[4].to === '/analytics'` so the Field-Team-before-Analytics order is pinned
    - _Requirements: 10.4, 3.4_

- [x] 3. Scaffold the Manage Arborists page component
  - Create `src/pages/ManageArborists.jsx` with a default-exported `ManageArborists` function component taking no props
  - Import `useState` from `react` (no Supabase import — enforced by Requirements 1.3, 6.3, 7.5)
  - Add the page-local JSDoc `@typedef {Object} ArboristRecord` with the five fields (`id`, `full_name`, `email`, `contact_number`, `status` as `'Active' | 'Offline'`)
  - Render a top-level `<section>` wrapper containing the `<h1>Field Team</h1>` heading and a short descriptive paragraph, followed by two sibling `<section>` blocks (placeholders for the form card and the table)
  - Do NOT add an Arborist_Record export to `src/types.js`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.1, 7.4, 1.3, 11.1_

- [x] 4. Build the Account Creation Form markup with controlled inputs
  - Inside the first child `<section>` (card-styled: `bg-white rounded-lg shadow-sm border border-slate-200 p-6`), render an `<h2>Create Arborist Account</h2>` heading and a `<form>` with a responsive grid layout
  - Declare four `useState` hooks for `fullName`, `email`, `contactNumber`, `temporaryPassword`, each initialised to the empty string
  - Render four `<label>` groups wrapping each label text plus a controlled `<input>`:
    - Full Name — `type="text"`
    - Email Address — `type="email"`
    - Contact Number — `type="text"`
    - Temporary Password — `type="password"`
  - Use native label-wraps-control association so each input is retrievable by accessible name via `getByLabelText`
  - Render a submit button with exact visible text `Create Arborist Account`
  - Apply Tailwind classes consistent with the enterprise aesthetic established in Phase 2
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 11.1_

- [x] 5. Wire the `handleSubmit` stub and input clearing
  - Add the multi-line source-level stub comment directly above the `handleSubmit` function using the exact text from Design Decision #4 (names both the `supabase.auth.signUp` sign-out root cause and the server-side admin-creation replacement direction)
  - Implement `handleSubmit(event)` to call `event.preventDefault()`, build an `Account_Creation_Payload` object with snake_case keys (`full_name`, `email`, `contact_number`, `temporary_password`) from the four state variables, call `console.log(payload)` exactly once, then clear all four inputs back to `''` via `setState`
  - Bind `handleSubmit` to the form's `onSubmit` prop
  - Do NOT import or invoke `supabaseClient.js` or any Supabase method
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 1.3, 12.1_

- [x] 6. Define the Mock Arborist List and render the Roster Table
  - Add a module-local `const MOCK_ARBORIST_LIST` array (not exported) with the three concrete records from the design's Data Models section:
    - `arb-001` Maria Santos `maria.santos@menro.local` `+63 917 555 0142` Active
    - `arb-002` Juan Dela Cruz `juan.delacruz@menro.local` `+63 917 555 0188` Offline
    - `arb-003` Liza Reyes `liza.reyes@menro.local` `+63 917 555 0203` Active
  - Inside the second child `<section>` (styled `bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden`), render a `<table>` with a `<thead>` containing exactly five `<th>` elements in order: `Name`, `Email`, `Contact Number`, `Status`, `Actions`
  - Render the `<tbody>` by mapping `MOCK_ARBORIST_LIST` to one `<tr key={arborist.id}>` per record with five `<td>` cells populating `full_name`, `email`, `contact_number`, `status`, and a placeholder Actions cell
  - Wrap the `status` string in a coloured-pill `<span>` (emerald tint for Active, slate tint for Offline) while preserving the exact literal strings `Active` and `Offline` in the DOM
  - Apply Tailwind classes for `divide-y`, header background, padding, and typography consistent with the Phase 2 aesthetic
  - _Requirements: 7.2, 7.3, 7.5, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 11.1_

- [x] 7. Add per-row Reset Password and Revoke Access buttons with stub handlers
  - Implement `handleResetPassword(arboristId)` as a one-line function that calls `console.log('Reset password requested for arborist', arboristId)` — include a short inline comment noting it is a Phase 3 stub
  - Implement `handleRevokeAccess(arboristId)` symmetrically with `console.log('Revoke access requested for arborist', arboristId)`
  - Inside each row's Actions `<td>`, render two `<button type="button">` elements side by side:
    - Reset Password — neutral/outline styling (`border border-slate-300 bg-white ... text-slate-700`)
    - Revoke Access — red/destructive styling (`bg-red-600 ... text-white`)
  - Bind each button's `onClick` to the respective stub handler with the row's `arborist.id` captured in a closure
  - The two buttons MUST carry visibly different `className` strings so they are distinguishable at a glance
  - Do NOT implement any real password-reset or access-revocation workflow and do NOT invoke Supabase for either action
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 12.3, 12.4_

- [x] 8. Register the `/arborists` route in App.jsx
  - Import `ManageArborists` from `./pages/ManageArborists.jsx` in `src/App.jsx`
  - Inside the existing `<Route element={<Shell />}>` block, add `<Route path="arborists" element={<ManageArborists />} />` between the `action-board` and `analytics` routes so the source order matches the sidebar order
  - Do NOT modify the `Shell` component or the `isMapRoute` padding predicate — the new route should inherit the shared `p-6` padding from the default branch
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 11.2, 12.5, 12.6_

- [x] 9. Checkpoint — verify the page renders end-to-end
  - Run `npm test -- --run` and confirm all existing tests still pass, that the updated Sidebar tests pass, and that the new page component at least mounts without runtime errors when imported
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create component tests for the Manage Arborists page
  - [x] 10.1 Set up the test file with the `console.log` spy lifecycle
    - Create `src/pages/ManageArborists.test.jsx`
    - Import `render`, `screen`, `fireEvent` from `@testing-library/react`, `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `vi` from `vitest`, `MemoryRouter` from `react-router-dom`, `App` from `../App.jsx`, and `ManageArborists` from `./ManageArborists.jsx`
    - Add a top-level `describe('ManageArborists', ...)` block with module-scope `let logSpy`, a `beforeEach` that sets `logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})`, and an `afterEach` that calls `logSpy.mockRestore()`
    - _Requirements: 10.7_
  - [x] 10.2 Test 1 — routing round-trip for `/arborists`
    - Render `<App />` inside `<MemoryRouter initialEntries={['/arborists']}>`
    - Assert the `Field Team` level-1 heading is present, `getByRole('navigation')` (Sidebar) and `getByRole('banner')` (Header) are both present
    - Assert the rendered `<main>` element's `className` contains `p-6`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 10.5, 11.2, 1.2_
  - [x] 10.3 Test 2 — page heading and section ordering
    - Render `<ManageArborists />` directly
    - Assert a level-1 heading named `Field Team` is present
    - Assert a level-2 heading `Create Arborist Account` appears before the `<table>` in DOM order (use `compareDocumentPosition` or index comparison across `getAllByRole`)
    - _Requirements: 4.2, 4.3, 4.4_
  - [x] 10.4 Test 3 — Account Creation Form inputs are present, labeled, and typed correctly
    - Use `getByLabelText('Full Name')`, `getByLabelText('Email Address')`, `getByLabelText('Contact Number')`, `getByLabelText('Temporary Password')`
    - Assert each returned node is an `<input>`; assert the email input's `type === 'email'` and the password input's `type === 'password'`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7_
  - [x] 10.5 Test 4 — submit button has the exact label
    - Assert `getByRole('button', { name: 'Create Arborist Account' })` is present
    - _Requirements: 5.5_
  - [x] 10.6 Test 5 — inputs are controlled and update on change
    - Fire `change` events with distinct values into each input; assert each input's `.value` reflects the new value after each change
    - _Requirements: 6.2, 6.4_
  - [x] 10.7 Test 6 — submit logs the payload once and clears all four inputs
    - Populate each input via `fireEvent.change`, click the submit button
    - Assert `logSpy` was called exactly once with an object deep-equal to `{ full_name, email, contact_number, temporary_password }` built from the typed values
    - Assert each input's `.value === ''` after submission
    - _Requirements: 6.1, 6.2, 6.4_
  - [x] 10.8 Test 7 — Manage Arborists does not import Supabase
    - Add `vi.mock('../supabaseClient.js', () => { throw new Error('Supabase must not be imported by ManageArborists'); })` at the top of the test file (hoisted by Vitest)
    - The subsequent import of `ManageArborists` will fail loudly if the page module imports `supabaseClient.js`
    - _Requirements: 1.3, 6.3, 7.5, 9.6, 12.1, 12.2_
  - [x] 10.9 Test 8 — Roster Table renders five column headers in exact order
    - Assert `getAllByRole('columnheader').map(th => th.textContent)` equals `['Name', 'Email', 'Contact Number', 'Status', 'Actions']`
    - _Requirements: 8.1_
  - [x] 10.10 Test 9 — one body row per Mock_Arborist_List entry with populated cells
    - Assert `screen.getAllByRole('row')` has length 4 (header + three body rows)
    - For each of the three mock records, assert `full_name`, `email`, `contact_number`, and `status` strings are present in the document
    - Assert at least one row renders the string `Active` and at least one renders `Offline`
    - _Requirements: 7.2, 7.3, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [x] 10.11 Test 10 — Roster Table rows use stable keys (no React key warnings)
    - Spy on `console.error` via `vi.spyOn(console, 'error')` within the test
    - Render `<ManageArborists />`; assert `console.error` was not called with any argument containing the string `'key'`
    - Restore the `console.error` spy at the end of the test
    - _Requirements: 8.7_
  - [x] 10.12 Test 11 — Reset Password button presence and click behaviour
    - Assert `getAllByRole('button', { name: 'Reset Password' })` has length 3 (one per row)
    - Click the first Reset Password button; assert `logSpy` was called exactly once and the call arguments include the string `'arb-001'`
    - _Requirements: 9.1, 9.2, 9.4_
  - [x] 10.13 Test 12 — Revoke Access button presence and click behaviour
    - Assert `getAllByRole('button', { name: 'Revoke Access' })` has length 3
    - Click the second Revoke Access button; assert `logSpy` was called exactly once and the call arguments include the string `'arb-002'`
    - _Requirements: 9.1, 9.3, 9.5_
  - [x] 10.14 Test 13 — Reset and Revoke buttons are visually distinguishable
    - Render `<ManageArborists />`; grab the first Reset Password and first Revoke Access button
    - Assert their `className` attributes are not equal (robust to class-string tweaks)
    - _Requirements: 9.7_

- [x] 11. Final checkpoint — full test suite passes with the Phase 1+2 baseline preserved
  - Run `npm test -- --run` and confirm every test passes, including:
    - The 89-test Phase 1 + Phase 2 baseline across the 11 pre-existing test files (unchanged in substance)
    - The updated `src/components/Sidebar.test.jsx` asserting 5 nav links and the NAV_ITEMS[3]/[4] ordering contract
    - The new `src/pages/ManageArborists.test.jsx` covering all 13 executable tests from section 10
  - Confirm `src/App.test.jsx` passes without modification
  - Confirm no new entries were added to `package.json` `dependencies` or `devDependencies`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- **No property-based tests in Phase 3.** The design's PBT applicability assessment concludes PBT is not appropriate here: the submit handler, table rendering, and row action handlers are all pure functions over compile-time-constant or single-record inputs with no universal "for all" property that example-based tests with 2–3 representative inputs would miss. A later phase that replaces the stubs with real Supabase-backed logic — status derivation from activity timestamps in particular — should revisit PBT applicability.
- **No new dependencies invariant.** Requirement 1.1 prohibits any addition to `dependencies` or `devDependencies` in `package.json`. The `Users` icon comes from the already-installed `lucide-react`; tests use the already-installed Vitest + React Testing Library + jsdom stack with `fireEvent` (not `user-event`, which is not installed).
- **Hard preservation contract for Phase 1+2 tests.** The 89 tests across 11 pre-existing files must continue to pass. The Phase 3 file delta is intentionally small: two changed production files (`src/components/Sidebar.jsx` and `src/App.jsx`), one new production file (`src/pages/ManageArborists.jsx`), one changed test file (`src/components/Sidebar.test.jsx`), one new test file (`src/pages/ManageArborists.test.jsx`), and zero changes to `src/App.test.jsx` (verified to carry no link-count assertion). No other file should be touched.
- Sub-tasks marked with `*` would be optional and skippable for MVP; this plan has no optional tasks because the test coverage is itself the deliverable for Requirement 10.6 and cannot be deferred.
- Each task references specific acceptance criteria from `requirements.md` under `_Requirements: X.Y_` for traceability.
- Checkpoints at tasks 9 and 11 ensure incremental validation; the final checkpoint specifically guards the 89-test baseline preservation contract.

## Workflow Completion

This workflow produces the Phase 3 design and planning artifacts. Implementation is a separate step — open `.kiro/specs/field-team-roster/tasks.md` and click "Start task" next to each task item to begin executing them in order.
