# Implementation Plan: Central Inventory (Phase 4)

## Overview

Replace the `src/pages/InventoryView.jsx` placeholder with a data-driven Inventory_Page that fetches every row of the Supabase `trees` table on mount, classifies each row through two new pure `src/lib/` modules, renders them in a six-column Master_Data_Table, and exposes two right-aligned toolbar actions: a native-browser CSV_Export and a `console.log`ging Batch_QR_Print_Button stub.

Implementation order follows the dependency graph: the two classifiers and the CSV builder are written and unit-tested in isolation first (no React, no DOM, no Supabase), then the page itself is wired on top of them, then the component test drives the assembled page against a mocked Supabase_Client. Checkpoints gate progress so the Phase 1+2+3 baseline never drops out from under us.

## Tasks

- [x] 1. Implement the Hazard_Classifier under `src/lib/`
  - [x] 1.1 Implement `classifyHazard` and the `HAZARD_STATUS` constant in `src/lib/hazardStatus.js`
    - Create a new file following the `src/lib/pinColor.js` / `src/lib/markerIcons.js` pattern (pure function, JSDoc, default-free named exports).
    - Export a frozen `HAZARD_STATUS` object with `HAZARD: 'Hazard'` and `SAFE: 'Safe'`.
    - Export `classifyHazard(tree)` as a pure function returning `HAZARD_STATUS.HAZARD` when any of `is_leaning`, `has_powerline_conflict`, `is_decayed`, or `is_root_problem` is `true`, and `HAZARD_STATUS.SAFE` otherwise.
    - Annotate the parameter with `@param {import('../types.js').TreeRecord} tree` so editors surface the existing typedef; do not modify `src/types.js`.
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

  - [x] 1.2 Write example-based unit tests for `classifyHazard` in `src/lib/hazardStatus.test.js`
    - Cover: one representative Tree_Record per Hazard_Flag set to `true` in isolation (four cases), one Tree_Record with all four Hazard_Flags `true`, and one Tree_Record with all four Hazard_Flags `false`.
    - Assert returned values against `HAZARD_STATUS.HAZARD` / `HAZARD_STATUS.SAFE` (not the bare string literals) so a future rename of the constant surfaces as a single failure.
    - _Requirements: 9.9, 5.1, 5.2_

  - [x] 1.3 Write a property-based test for Property 1 (`classifyHazard` is a pure boolean OR)
    - **Property 1: classifyHazard is a pure boolean OR of the four Hazard_Flags**
    - **Validates: Requirements 5.1, 5.2**
    - Import `treeRecordArb` from `src/test/arbitraries.js` unchanged.
    - Use `fc.assert(fc.property(treeRecordArb, ...), { numRuns: 100 })` with the tag comment `// Feature: central-inventory, Property 1: classifyHazard is a pure boolean OR of the four Hazard_Flags` above the test.
    - Assert `classifyHazard(t)` equals `'Hazard'` when any of the four flags is `true`, `'Safe'` otherwise.

- [x] 2. Implement the Permit_Classifier under `src/lib/`
  - [x] 2.1 Implement `classifyPermit` and the `PERMIT_STATUS` constant in `src/lib/permitStatus.js`
    - Export a frozen `PERMIT_STATUS` object with `APPROVED: 'Approved'` and `NONE: 'None'`.
    - Export `classifyPermit(tree)` as a pure function returning `PERMIT_STATUS.APPROVED` when `tree.has_cutting_permit` is `true`, `PERMIT_STATUS.NONE` otherwise.
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x] 2.2 Write example-based unit tests for `classifyPermit` in `src/lib/permitStatus.test.js`
    - Cover both input values: `has_cutting_permit: true` → `'Approved'`, `has_cutting_permit: false` → `'None'`.
    - _Requirements: 9.10, 6.1, 6.2_

- [x] 3. Implement the CSV builder under `src/lib/`
  - [x] 3.1 Implement `quoteCsvField`, `CSV_HEADER`, and `buildTreeInventoryCsv` in `src/lib/treeCsv.js`
    - Export `CSV_HEADER` as the array `['tree_id', 'species', 'dbh', 'hazard_status', 'permit_status', 'assigned_to']`.
    - Export `quoteCsvField(value)` implementing RFC 4180 quoting: `null`/`undefined` → empty string; values containing `,`, `"`, `\r`, or `\n` → wrap in `"..."` with embedded `"` doubled to `""`; other values → `String(value)` unchanged.
    - Export `buildTreeInventoryCsv(records)` as a pure function that emits the header row followed by one data row per record (in input order), joining rows with `\r\n` and terminating with a trailing `\r\n`. Data rows use `classifyHazard` for the `hazard_status` column and `classifyPermit` for the `permit_status` column; import both from the sibling `hazardStatus.js` and `permitStatus.js` modules.
    - Keep the module free of DOM and `Blob` references — the DOM-side download work lives inline in `InventoryView.jsx` per the design.
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 7.10_

  - [x] 3.2 Write example-based unit tests for the CSV builder in `src/lib/treeCsv.test.js`
    - Assert the header row is exactly `tree_id,species,dbh,hazard_status,permit_status,assigned_to`.
    - Assert one data row per Tree_Record in input order given a hand-crafted 2–3 record fixture covering both Hazard_Classifier outputs and both Permit_Classifier outputs.
    - Assert the `hazard_status` and `permit_status` columns carry the classifier outputs (not the underlying booleans).
    - Assert RFC 4180 quoting for each trigger character: comma, double quote (doubled inside the quoted form), carriage return, line feed.
    - Assert `null` `tree_id` and `null` `assigned_to` serialize to empty CSV fields (not the literal string `null`).
    - Assert row separator is `\r\n` and that a trailing `\r\n` follows the final data row.
    - _Requirements: 9.11, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 4. Checkpoint — lib modules green
  - Run `npm test` and confirm the three new lib test files pass alongside every Phase 1+2+3 test. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 9.1_

- [x] 5. Replace the Inventory_Page placeholder with the data-driven implementation
  - [x] 5.1 Rewrite `src/pages/InventoryView.jsx` with the fetch-on-mount state machine
    - Keep the file path and the default export intact so `src/App.jsx` routing and `App.test.jsx` remain untouched.
    - Import the Supabase_Client singleton from `../supabaseClient.js`.
    - Introduce three `useState` slots: `status: 'loading' | 'error' | 'loaded'` (initial `'loading'`), `trees: TreeRecord[]` (initial `[]`), `errorMessage: string` (initial `''`).
    - In a `useEffect(..., [])` issue `supabase.from('trees').select('*')` exactly once; on `{ data, error: null }` transition to `loaded`; on non-null `error` or thrown exception transition to `error` with `errorMessage` populated.
    - Render branches: `loading` → visible loading indicator (no table); `error` → visible error banner (no table); `loaded && trees.length === 0` → visible empty-state message (no table body rows); `loaded && trees.length > 0` → Master_Data_Table.
    - Render a level-1 `<h1>Inventory</h1>` so the existing App-level routing test keeps passing; do not apply an outer `p-6` wrapper (it is inherited from the App_Shell `<main>`).
    - Issue zero mutations against Supabase.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 5.2 Build the Master_Data_Table body
    - Render a `<table>` with a `<thead>` row holding exactly six `<th>` columns in order: `Tree ID`, `Species`, `DBH (cm)`, `Hazard Status`, `Permit Status`, `Assigned To`.
    - Render exactly one `<tbody>` row per Tree_Record in the Tree_Record_List with `key={tree.id}`.
    - Per-row cell projections: `tree_id` (dash placeholder when `null`); `species`; `dbh`; Hazard_Pill driven by `classifyHazard` (red palette for `Hazard`, emerald/green for `Safe`); Permit_Pill driven by `classifyPermit` (amber/yellow palette for `Approved`, plain text `None` with no pill for the `None` branch); `assigned_to` (dash placeholder when `null`).
    - Style with Tailwind utilities consistent with the Phase 3 Field_Team roster table aesthetic, using a denser body-row rhythm (`px-4 py-2`) so more rows fit per viewport.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 5.4, 5.5, 6.4, 6.5, 10.1, 10.2, 10.3_

  - [x] 5.3 Build the Inventory_Toolbar with the native CSV_Export handler
    - Render the Inventory_Toolbar above the table as a right-aligned flex cluster so it is visible across every render branch (per Requirement 7.8 the button may render in Loading/Error/Empty states as long as it no-ops).
    - Render the CSV_Export_Button with visible text exactly `Download CSV`, disabled when `trees.length === 0`.
    - Implement an inline `handleExportCsv` handler that: guards on `trees.length === 0` and returns early; calls `buildTreeInventoryCsv(trees)`; wraps the string in `new Blob([csv], { type: 'text/csv' })`; creates an object URL via `URL.createObjectURL`; constructs a dynamic `<a>` with `href = url` and `download = 'tree-inventory.csv'`; appends it to `document.body`, calls `.click()`, removes it, and releases the URL with `URL.revokeObjectURL`.
    - Issue zero network requests and zero Supabase mutations from the handler.
    - _Requirements: 7.1, 7.2, 7.8, 7.9_

  - [x] 5.4 Add the Batch_QR_Print_Button stub
    - Render the Batch_QR_Print_Button inside the Inventory_Toolbar, immediately adjacent to the CSV_Export_Button, with visible text exactly `Print QR Stickers (A4)` and Tailwind styling that is visibly distinct from the CSV_Export_Button's `className`.
    - Implement an inline `handlePrintQr` handler that calls `console.log` exactly once with the single-string argument `` `Initiating A4 QR Print Layout for ${trees.length} trees` ``; no file download, no navigation, no Supabase call, no print dialog.
    - Precede the handler with an explicit source comment tagging it as a Phase 4 stub that Phase 5 must replace with the real batch QR A4 print layout.
    - Do not import, reference, or invoke any QR-code library.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 1.4_

- [x] 6. Add the Inventory_Page component test suite
  - [x] 6.1 Scaffold `src/pages/Inventory.test.jsx` with the Supabase mock and browser-primitive stubs
    - Mock `../supabaseClient.js` using the `vi.hoisted` pattern proven in `src/pages/CommandCenter.test.jsx`: hoisted spies for `selectSpy`, `insertSpy`, `updateSpy`, `upsertSpy`, `deleteSpy`, and a `fromSpy` that returns the chainable object. Reset all spies in `beforeEach`.
    - Provide resolution helpers `resolveOk(data)` and `resolveErr(error)` that push onto `selectSpy` via `mockResolvedValueOnce`.
    - Import `fireEvent`, `render`, and `screen` from `@testing-library/react`; do not import `@testing-library/user-event` (not installed).
    - Define a `MOCK_TREES` fixture of 2–3 dummy Tree_Records whose fields collectively exercise both Hazard_Classifier outputs, both Permit_Classifier outputs, and at least one `null` `tree_id` and `null` `assigned_to`. Include one record whose `species` contains a comma so the CSV RFC 4180 path is exercised through the rendered row.
    - Stub `global.URL.createObjectURL` and `global.URL.revokeObjectURL` via `vi.fn()` in `beforeEach` and delete them in `afterEach` (jsdom does not implement either).
    - Spy on `console.log` in `beforeEach` and restore in `afterEach` so log assertions never leak across tests.
    - _Requirements: 9.2, 9.3, 9.14_

  - [x] 6.2 Test the Master_Data_Table structure after a successful Inventory_Fetch
    - After `resolveOk(MOCK_TREES)`, assert `fromSpy` was called with `'trees'` and `selectSpy` was called with `'*'` (Inventory_Fetch contract).
    - Assert the six column headers render in order: `Tree ID`, `Species`, `DBH (cm)`, `Hazard Status`, `Permit Status`, `Assigned To`.
    - Assert one body row renders per Tree_Record with the `tree_id`, `species`, `dbh`, and `assigned_to` cells populated from the fixture (using a dash placeholder for `null` projections).
    - _Requirements: 9.4, 9.5_

  - [x] 6.3 Test Hazard_Pill and Permit_Pill rendering across the fixture
    - Assert the row whose fixture record has at least one Hazard_Flag `true` renders a pill with visible text exactly `Hazard`.
    - Assert the row whose fixture record has all four Hazard_Flags `false` renders a pill with visible text exactly `Safe`.
    - Assert the row with `has_cutting_permit: true` renders a pill with visible text exactly `Approved`.
    - Assert the row with `has_cutting_permit: false` renders the plain text `None` (no pill background).
    - _Requirements: 9.6, 9.7_

  - [x] 6.4 Test the CSV_Export_Button wiring
    - Assert the `Download CSV` button is in the document after `resolveOk(MOCK_TREES)`.
    - `vi.spyOn(HTMLAnchorElement.prototype, 'click')` before the activation, `fireEvent.click` the button, then assert: `URL.createObjectURL` was called once with a `Blob` whose `type` is `'text/csv'`; the anchor prototype click spy fired exactly once; `URL.revokeObjectURL` was called once. Restore the anchor spy after the test.
    - Additionally, assert that activating the button when the Tree_Record_List is empty (`resolveOk([])`) does not call `URL.createObjectURL`, pinning Requirement 7.8's no-op contract.
    - _Requirements: 9.8, 7.2, 7.8_

  - [x] 6.5 Test the Batch_QR_Print_Button console.log stub
    - Assert the `Print QR Stickers (A4)` button is in the document after `resolveOk(MOCK_TREES)`.
    - `fireEvent.click` the button and assert `console.log` was called exactly once with a single string argument matching `` `Initiating A4 QR Print Layout for ${MOCK_TREES.length} trees` ``.
    - Assert no file download, no Supabase call, and no navigation occurred (no further `fromSpy` invocations beyond the initial fetch, no `URL.createObjectURL` call).
    - _Requirements: 9.8, 9.12, 9.13, 8.2, 8.3_

- [x] 7. Final checkpoint — full suite + preservation contract
  - Run `npm test` and confirm the whole test run is green: every Phase 1+2+3 test across the 13 pre-existing files (the 104-test baseline) plus every new test file added in Phase 4 (`src/lib/hazardStatus.test.js`, `src/lib/permitStatus.test.js`, `src/lib/treeCsv.test.js`, `src/pages/Inventory.test.jsx`).
  - Inspect `package.json` to confirm `dependencies` and `devDependencies` are unchanged from the Phase 3 snapshot — no new CSV, spreadsheet, Excel, or QR-code package appears.
  - `grep` the Phase 4 source tree for imports from any spreadsheet, Excel, CSV, or QR package to confirm Requirements 1.2 and 1.4 hold.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 9.1, 1.1, 1.2, 1.3, 1.4_

## Notes

- **Hard preservation contract.** Phase 4 must not regress the 104 Phase 1+2+3 tests across 13 files. The implementation touches only `src/pages/InventoryView.jsx` (content replacement with the default export and `<h1>Inventory</h1>` heading preserved) and adds new sibling files under `src/lib/` and `src/pages/`. `src/App.jsx`, `src/types.js`, `src/supabaseClient.js`, and every Phase 1/2/3 component or test file stay untouched. Every checkpoint and the final task rerun `npm test` to pin this.

- **Dependency invariant.** No new package in `dependencies` or `devDependencies`. CSV export uses only `Blob`, `URL.createObjectURL`, a dynamic `<a>`, and `URL.revokeObjectURL`. The Batch_QR_Print_Button imports zero QR-code libraries and only calls `console.log` in Phase 4 — real QR generation is deferred to Phase 5 precisely to keep this invariant intact.

- **PBT applicability.** Only `classifyHazard` has an input space (the 16-tuple of four Hazard_Flags) and a spec (boolean OR) that rewards property-based coverage. Its property test reuses the existing `treeRecordArb` from `src/test/arbitraries.js` with no arbitrary changes and runs at 100 iterations per the project PBT doctrine. `classifyPermit` is a single-boolean projection (two inputs, two outputs — example tests are exhaustive), and `buildTreeInventoryCsv`'s RFC 4180 contract is better pinned by hand-written trigger-character examples than by a round-trip property that would require a CSV parser the dependency invariant forbids. The hazard property sub-task (1.3) is therefore the only test sub-task marked optional with `*`; every other test sub-task is directly demanded by Requirement 9 and is non-optional.

- **Tasks marked with `*` are optional** and can be skipped for a faster MVP without violating any Requirement 9 acceptance criterion.

- **Workflow completion.** This is the final planning artifact. Task execution happens in a separate phase — open `tasks.md` and click "Start task" on task 1 to begin implementation.
