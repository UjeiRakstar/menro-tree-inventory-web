# Requirements Document

## Introduction

Phase 4 of the Mission_Control_Dashboard delivers the Central_Inventory: the MENRO_Admin's master database view of every Tree_Record captured by the offline-first mobile arborist app. Phase 4 replaces the placeholder component at `src/pages/InventoryView.jsx` with a data-driven Inventory_Page that reads the entire `trees` table from Supabase on mount, renders each row in a dense Tailwind-styled Master_Data_Table, and exposes two toolbar actions: a native browser CSV_Export and a stubbed Batch_QR_Print_Button that will be wired to a real QR generator in Phase 5.

The Master_Data_Table surfaces derived status for each row through two small classifiers the dashboard now owns: a Hazard_Classifier that collapses four independent boolean flags on a Tree_Record into a single red "Hazard" pill or green "Safe" pill, and a Permit_Classifier that collapses the `has_cutting_permit` flag into a yellow "Approved" pill or the plain text "None". Every other detail the Inventory_Page displays comes directly from Tree_Record fields — Phase 4 adds no computed joins, no pagination, no filtering, and no sorting beyond whatever default order Supabase returns.

The CSV_Export is the only non-trivial piece of logic introduced in Phase 4 and is intentionally implemented with native browser primitives (a `Blob`, an in-memory object URL, and a programmatically-clicked hidden `<a>` element). This preserves Phase 4's hard dependency invariant: the feature SHALL NOT add any new entry to `dependencies` or `devDependencies` in `package.json`, and in particular SHALL NOT install any Excel, CSV, spreadsheet, or QR-code library. The Batch_QR_Print_Button is deferred to Phase 5 for exactly this reason and ships in Phase 4 as a console-logging stub.

Phase 4 MUST preserve every test that passed at the end of Phase 3 — a hard preservation contract covering 104 tests across 13 files — and SHALL add a dedicated `src/pages/Inventory.test.jsx` that drives the Inventory_Page against a mocked Supabase_Client returning 2 to 3 dummy Tree_Record objects.

## Glossary

- **Mission_Control_Dashboard**: The web application established in Phase 1.
- **App_Shell**: The persistent Sidebar + Header + main content outlet layout delivered by Phase 1. Non-map routes render inside a `<main>` container styled with the shared `p-6` padding.
- **MENRO_Admin**: The authenticated dashboard user who views and exports the Central_Inventory. Phase 4 does not implement any runtime check that the current user is a MENRO_Admin; it presents the Inventory_Page to whoever is viewing the dashboard.
- **Central_Inventory**: The Phase 4 feature as a whole — the `/inventory` route, its page component, the Master_Data_Table, the CSV_Export, and the Batch_QR_Print_Button stub.
- **Inventory_Page**: The React page component that implements the Central_Inventory, living at `src/pages/InventoryView.jsx` and rendered by the Router at the `/inventory` Route.
- **Route**: A client-side URL path handled by `react-router-dom`. Phase 4 reuses the already-registered `/inventory` Route without modifying `src/App.jsx`.
- **Supabase_Client**: The singleton `@supabase/supabase-js` instance exported by `src/supabaseClient.js`.
- **Tree_Record**: A single row in the Supabase `trees` table as described by the `TreeRecord` JSDoc typedef and the `TreeRecordPropType` PropTypes contract exported from `src/types.js`. Phase 4 SHALL NOT modify `src/types.js`.
- **Tree_Record_List**: The array of Tree_Record objects currently held in the Inventory_Page's component state after a successful fetch, or the empty array before the first successful fetch completes.
- **Inventory_Fetch**: The single Supabase query the Inventory_Page issues on mount: `supabase.from('trees').select('*')`, reading every column of every row.
- **Loading_State**: The Inventory_Page state between mount and the resolution of the Inventory_Fetch, during which the Tree_Record_List is not yet available.
- **Error_State**: The Inventory_Page state after the Inventory_Fetch resolves with a non-null `error` from Supabase or rejects with a thrown exception.
- **Empty_State**: The Inventory_Page state after the Inventory_Fetch resolves successfully with an empty array of Tree_Record objects.
- **Loaded_State**: The Inventory_Page state after the Inventory_Fetch resolves successfully with one or more Tree_Record objects.
- **Master_Data_Table**: The Tailwind-styled HTML `<table>` rendered by the Inventory_Page in the Loaded_State that lists one body row per Tree_Record in the Tree_Record_List.
- **Inventory_Toolbar**: The horizontal control strip rendered above the Master_Data_Table whose right-aligned cluster holds the CSV_Export_Button and the Batch_QR_Print_Button.
- **CSV_Export_Button**: The button in the Inventory_Toolbar whose visible text is exactly `Download CSV`.
- **CSV_Export**: The complete client-only download action triggered by the CSV_Export_Button, consisting of building a CSV string from the current Tree_Record_List, wrapping it in a `Blob`, creating an object URL, and triggering a native browser download through a programmatically-clicked hidden `<a>` element.
- **CSV_String**: The single string value built from the current Tree_Record_List that the CSV_Export writes into its `Blob`. Its first line is a header row; each subsequent line is one CSV-encoded Tree_Record.
- **Batch_QR_Print_Button**: The button in the Inventory_Toolbar whose visible text is exactly `Print QR Stickers (A4)`. In Phase 4 it only invokes a stub handler.
- **Hazard_Flags**: The four Tree_Record boolean fields `is_leaning`, `has_powerline_conflict`, `is_decayed`, and `is_root_problem`.
- **Hazard_Classifier**: The pure function that maps a Tree_Record to the string `'Hazard'` when any Hazard_Flag is `true` and to the string `'Safe'` when all four Hazard_Flags are `false`.
- **Hazard_Pill**: The inline pill element rendered in the Hazard Status cell, styled red when the Hazard_Classifier returns `'Hazard'` and green when it returns `'Safe'`.
- **Permit_Classifier**: The pure function that maps a Tree_Record to the string `'Approved'` when `has_cutting_permit` is `true` and to the string `'None'` when `has_cutting_permit` is `false`.
- **Permit_Pill**: The inline pill element rendered in the Permit Status cell, styled yellow when the Permit_Classifier returns `'Approved'`. When the Permit_Classifier returns `'None'` the Permit Status cell renders the plain text `None` without a pill.
- **Phase_4_Test_Suite**: The Vitest test files exercising the Central_Inventory plus the Phase 1, Phase 2, and Phase 3 tests that must continue to pass.
- **Phase_1_through_3_Baseline**: The set of 104 tests across 13 files that passed at the end of Phase 3 and must continue to pass after Phase 4.

## Requirements

### Requirement 1: No New Runtime Dependencies

**User Story:** As a developer, I want Phase 4 to ship without adding new packages, so that the CSV export and the Phase 5 QR feature cannot smuggle in heavy third-party libraries by the back door.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL NOT add any new entry to `dependencies` or `devDependencies` in `package.json` for Phase 4.
2. THE Central_Inventory SHALL NOT import any Excel, CSV, spreadsheet, or QR-code third-party library.
3. THE CSV_Export SHALL be implemented using only native browser primitives — specifically a `Blob`, `URL.createObjectURL`, a dynamically-created `<a>` element, and `URL.revokeObjectURL` — and SHALL NOT depend on any module outside the already-installed dependency set.
4. THE Batch_QR_Print_Button SHALL NOT import, reference, or invoke any QR-code generation library in Phase 4.

### Requirement 2: Inventory Route and Page Scaffold

**User Story:** As a MENRO_Admin, I want the existing `/inventory` route to land on a real inventory page, so that the placeholder copy is replaced with the master database view.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL continue to register the Route with path `inventory` inside the App_Shell's routing tree in `src/App.jsx` without modifying that registration for Phase 4.
2. THE Mission_Control_Dashboard SHALL provide the Inventory_Page component at `src/pages/InventoryView.jsx` with a default export.
3. WHEN a user navigates to the `/inventory` Route, THE Mission_Control_Dashboard SHALL render the Inventory_Page as the main content outlet of the App_Shell.
4. THE Inventory_Page SHALL render inside the App_Shell's shared `<main>` container and SHALL NOT apply its own outer `p-6` padding, so that its outer spacing is inherited unchanged from the shared `p-6` padding the App_Shell already applies to non-map routes.
5. THE Inventory_Page SHALL render a top-level heading at heading level 1 whose text names the page as the `Inventory` view so that the existing App-level routing test continues to pass.

### Requirement 3: Supabase Data Fetching Contract

**User Story:** As a MENRO_Admin, I want the Inventory_Page to load the entire tree database from Supabase on mount, so that the Master_Data_Table reflects the current state of the `trees` table without any manual refresh step.

#### Acceptance Criteria

1. THE Inventory_Page SHALL import the Supabase_Client singleton from `src/supabaseClient.js`.
2. WHEN the Inventory_Page mounts, THE Inventory_Page SHALL issue the Inventory_Fetch exactly once by calling `supabase.from('trees').select('*')`.
3. WHEN the Inventory_Fetch resolves successfully, THE Inventory_Page SHALL store the returned rows as the Tree_Record_List in component state.
4. THE Inventory_Page SHALL treat each row returned by the Inventory_Fetch as a Tree_Record adhering to the `TreeRecord` typedef exported from `src/types.js` and SHALL NOT reshape, rename, or drop fields before storing rows in the Tree_Record_List.
5. WHILE the Inventory_Page is in the Loading_State, THE Inventory_Page SHALL render a visible loading indicator and SHALL NOT render the Master_Data_Table.
6. IF the Inventory_Fetch resolves with a non-null `error` value from Supabase or rejects with a thrown exception, THEN THE Inventory_Page SHALL transition into the Error_State, render a visible error message, and SHALL NOT render the Master_Data_Table.
7. WHILE the Inventory_Page is in the Empty_State, THE Inventory_Page SHALL render a visible empty-state message indicating that no Tree_Record rows were returned and SHALL NOT render the Master_Data_Table body rows.
8. THE Inventory_Page SHALL NOT issue any Supabase mutation (insert, update, upsert, or delete) against the `trees` table in Phase 4.

### Requirement 4: Master Data Table Layout and Columns

**User Story:** As a MENRO_Admin, I want a dense Tailwind-styled table that surfaces the most load-bearing Tree_Record fields at a glance, so that I can scan the inventory without drilling into individual records.

#### Acceptance Criteria

1. THE Master_Data_Table SHALL render a table header row with exactly six column headers labeled, in order, `Tree ID`, `Species`, `DBH (cm)`, `Hazard Status`, `Permit Status`, and `Assigned To`.
2. WHILE the Inventory_Page is in the Loaded_State, THE Master_Data_Table SHALL render exactly one body row per Tree_Record in the Tree_Record_List.
3. THE Master_Data_Table SHALL display the `tree_id` field of each Tree_Record in its row's Tree ID cell, rendering a visible placeholder dash character when `tree_id` is `null`.
4. THE Master_Data_Table SHALL display the `species` field of each Tree_Record in its row's Species cell.
5. THE Master_Data_Table SHALL display the `dbh` field of each Tree_Record in its row's DBH (cm) cell, rendering the string value unchanged from the Tree_Record.
6. THE Master_Data_Table SHALL render the Hazard_Pill in each row's Hazard Status cell, driven by the Hazard_Classifier applied to that row's Tree_Record.
7. THE Master_Data_Table SHALL render the Permit_Pill or the plain text `None` in each row's Permit Status cell, driven by the Permit_Classifier applied to that row's Tree_Record.
8. THE Master_Data_Table SHALL display the `assigned_to` field of each Tree_Record in its row's Assigned To cell, rendering a visible placeholder dash character when `assigned_to` is `null`.
9. THE Master_Data_Table SHALL assign each body row a stable React key derived from the Tree_Record's `id` field so that React can reconcile rows without key-collision warnings.
10. THE Master_Data_Table SHALL be styled with Tailwind utility classes for layout, spacing, color, border, and row separation consistent with the enterprise-dashboard aesthetic established in Phase 3 by the Field_Team roster table.

### Requirement 5: Hazard Status Classifier and Pill Rendering

**User Story:** As a MENRO_Admin, I want a single at-a-glance hazard indicator per row, so that I can spot dangerous trees in the inventory without mentally ORing four separate boolean columns.

#### Acceptance Criteria

1. THE Hazard_Classifier SHALL return `'Hazard'` WHEN at least one of the Hazard_Flags `is_leaning`, `has_powerline_conflict`, `is_decayed`, or `is_root_problem` is `true` on the Tree_Record.
2. THE Hazard_Classifier SHALL return `'Safe'` WHEN all four Hazard_Flags on the Tree_Record are `false`.
3. THE Hazard_Classifier SHALL be a pure function of its Tree_Record input and SHALL NOT read from component state, side-effecting APIs, or the Tree_Record_List order.
4. WHEN the Hazard_Classifier returns `'Hazard'` for a row's Tree_Record, THE Master_Data_Table SHALL render a Hazard_Pill in that row's Hazard Status cell whose visible text is exactly `Hazard` and whose Tailwind styling uses the red palette to distinguish it from the Safe pill.
5. WHEN the Hazard_Classifier returns `'Safe'` for a row's Tree_Record, THE Master_Data_Table SHALL render a Hazard_Pill in that row's Hazard Status cell whose visible text is exactly `Safe` and whose Tailwind styling uses the green or emerald palette to distinguish it from the Hazard pill.
6. THE Hazard_Classifier SHALL be exported from a Phase 4 module under `src/lib/` so that it can be unit-tested in isolation and reused by later phases.

### Requirement 6: Permit Status Classifier and Pill Rendering

**User Story:** As a MENRO_Admin, I want a single at-a-glance permit indicator per row, so that I can distinguish permitted cuttings from records that still need permit action.

#### Acceptance Criteria

1. THE Permit_Classifier SHALL return `'Approved'` WHEN the `has_cutting_permit` field of the Tree_Record is `true`.
2. THE Permit_Classifier SHALL return `'None'` WHEN the `has_cutting_permit` field of the Tree_Record is `false`.
3. THE Permit_Classifier SHALL be a pure function of its Tree_Record input and SHALL NOT read from component state, side-effecting APIs, or the Tree_Record_List order.
4. WHEN the Permit_Classifier returns `'Approved'` for a row's Tree_Record, THE Master_Data_Table SHALL render a Permit_Pill in that row's Permit Status cell whose visible text is exactly `Approved` and whose Tailwind styling uses the yellow or amber palette.
5. WHEN the Permit_Classifier returns `'None'` for a row's Tree_Record, THE Master_Data_Table SHALL render the plain text `None` in that row's Permit Status cell without a pill background.
6. THE Permit_Classifier SHALL be exported from a Phase 4 module under `src/lib/` so that it can be unit-tested in isolation and reused by later phases.

### Requirement 7: Native CSV Export

**User Story:** As a MENRO_Admin, I want a one-click CSV download of the currently loaded inventory, so that I can hand a spreadsheet to auditors, permit officers, or the MENRO director without pulling out of the dashboard.

#### Acceptance Criteria

1. THE Inventory_Toolbar SHALL render the CSV_Export_Button with visible text exactly equal to `Download CSV` right-aligned above the Master_Data_Table.
2. WHEN the MENRO_Admin activates the CSV_Export_Button, THE Inventory_Page SHALL build the CSV_String from the current Tree_Record_List, wrap it in a `Blob` whose MIME type is `text/csv`, create an object URL via `URL.createObjectURL`, set that URL as the `href` of a dynamically-created `<a>` element whose `download` attribute holds a `.csv` filename, append the element to the document, programmatically invoke `click` on it, remove it from the document, and release the object URL via `URL.revokeObjectURL`.
3. THE CSV_String SHALL begin with a single header row whose comma-separated field names in order are `tree_id`, `species`, `dbh`, `hazard_status`, `permit_status`, and `assigned_to`.
4. THE CSV_String SHALL include one data row per Tree_Record in the Tree_Record_List after the header row, in the same order the Tree_Record_List appears in state.
5. THE CSV_String's data rows SHALL emit the `tree_id`, `species`, `dbh`, and `assigned_to` fields directly from the Tree_Record, the Hazard_Classifier output in the `hazard_status` column, and the Permit_Classifier output in the `permit_status` column.
6. THE CSV_String SHALL encode any field value containing a comma, a double-quote character, a carriage return, or a line feed by wrapping the value in double quotes and doubling every embedded double-quote character, in accordance with RFC 4180 quoting rules.
7. THE CSV_String SHALL emit a `null` Tree_Record field (such as a null `tree_id` or null `assigned_to`) as an empty CSV field rather than the literal string `null`.
8. WHILE the Inventory_Page is in the Loading_State, the Error_State, or the Empty_State, THE CSV_Export_Button MAY still render but its activation SHALL NOT trigger a file download when the Tree_Record_List is empty. The CSV_Export_Button MAY be disabled or render a no-op in these states at the designer's discretion.
9. THE CSV_Export SHALL NOT issue any network request and SHALL NOT modify any Supabase_Client state.
10. THE Inventory_Page SHALL expose the CSV_String builder as a pure function so that its CSV-encoding behavior can be unit-tested without rendering the component or triggering a real browser download.

### Requirement 8: Batch QR Generator Stub

**User Story:** As a MENRO_Admin, I want a visible entry point for batch QR sticker printing on the Inventory_Page, so that Phase 5 can wire the real A4 print layout in without adding a new button or moving existing toolbar elements.

#### Acceptance Criteria

1. THE Inventory_Toolbar SHALL render the Batch_QR_Print_Button with visible text exactly equal to `Print QR Stickers (A4)` immediately adjacent to the CSV_Export_Button in the right-aligned toolbar cluster.
2. WHEN the MENRO_Admin activates the Batch_QR_Print_Button, THE Inventory_Page SHALL invoke `console.log` exactly once with a single string argument of the form `Initiating A4 QR Print Layout for X trees`, where `X` is the exact current length of the Tree_Record_List.
3. THE Batch_QR_Print_Button SHALL NOT trigger any file download, navigation, Supabase call, or DOM print dialog in Phase 4.
4. THE Inventory_Page SHALL carry an explicit source-level comment identifying the Batch_QR_Print_Button handler as a Phase 4 stub that Phase 5 must replace with the real batch QR A4 print layout.
5. THE Batch_QR_Print_Button SHALL be styled with Tailwind utility classes consistent with the enterprise-dashboard aesthetic established in Phase 3 and SHALL be visually distinguishable from the CSV_Export_Button so a MENRO_Admin can identify the correct action at a glance.

### Requirement 9: Test Preservation and New Test Coverage

**User Story:** As a developer, I want every test that passed at the end of Phase 3 to keep passing and Phase 4's new UI and classifiers to be covered, so that replacing the Inventory placeholder never regresses the App_Shell, the Command_Center_Map, the Field_Team_Roster, or any prior phase.

#### Acceptance Criteria

1. WHEN `npm test` is run after Phase 4 is complete, THE Mission_Control_Dashboard SHALL pass every test in the Phase_1_through_3_Baseline.
2. THE Phase_4_Test_Suite SHALL include a dedicated test file at `src/pages/Inventory.test.jsx` that drives the Inventory_Page against a mocked Supabase_Client.
3. THE Phase_4_Test_Suite SHALL mock the Supabase_Client so that `supabase.from('trees').select('*')` resolves to an object shaped as `{ data, error }` where `data` is a hardcoded array of between 2 and 3 dummy Tree_Record objects that collectively exercise both Hazard_Classifier outputs and both Permit_Classifier outputs.
4. THE Phase_4_Test_Suite SHALL assert that the Master_Data_Table renders its six column headers `Tree ID`, `Species`, `DBH (cm)`, `Hazard Status`, `Permit Status`, and `Assigned To` in that order after the mocked Inventory_Fetch resolves.
5. THE Phase_4_Test_Suite SHALL assert that one body row is rendered per dummy Tree_Record with its Tree ID, Species, DBH, and Assigned To cells populated from the Tree_Record.
6. THE Phase_4_Test_Suite SHALL assert that a row whose Tree_Record has at least one Hazard_Flag set to `true` displays a Hazard_Pill with visible text `Hazard`, and that a row whose Tree_Record has all four Hazard_Flags `false` displays a Hazard_Pill with visible text `Safe`.
7. THE Phase_4_Test_Suite SHALL assert that a row whose Tree_Record has `has_cutting_permit` equal to `true` displays a Permit_Pill with visible text `Approved`, and that a row whose Tree_Record has `has_cutting_permit` equal to `false` displays the text `None`.
8. THE Phase_4_Test_Suite SHALL assert that the CSV_Export_Button with visible text `Download CSV` and the Batch_QR_Print_Button with visible text `Print QR Stickers (A4)` are present in the document after the mocked Inventory_Fetch resolves.
9. THE Phase_4_Test_Suite SHALL include a unit test for the Hazard_Classifier covering at least one representative Tree_Record per Hazard_Flag set to `true` in isolation, one Tree_Record with all four Hazard_Flags `true`, and one Tree_Record with all four Hazard_Flags `false`.
10. THE Phase_4_Test_Suite SHALL include a unit test for the Permit_Classifier covering both `has_cutting_permit: true` and `has_cutting_permit: false`.
11. THE Phase_4_Test_Suite SHALL include a unit test for the CSV_String builder that asserts the header row, asserts one data row per Tree_Record in order, asserts the Hazard_Classifier and Permit_Classifier outputs appear in the `hazard_status` and `permit_status` columns, asserts RFC 4180 quoting of fields containing commas or double quotes, and asserts that `null` `tree_id` and `assigned_to` values serialize as empty CSV fields.
12. THE Phase_4_Test_Suite SHALL spy on `console.log` using Vitest and SHALL restore the spy after each test that uses it so that test ordering does not leak log assertions between tests.
13. THE Phase_4_Test_Suite SHALL exercise the Batch_QR_Print_Button by activating it after the mocked Inventory_Fetch resolves and asserting `console.log` was called with a message matching the expected `Initiating A4 QR Print Layout for X trees` shape where `X` equals the length of the dummy Tree_Record_List.
14. THE Phase_4_Test_Suite SHALL use `fireEvent` from `@testing-library/react` rather than `@testing-library/user-event`, because the Mission_Control_Dashboard's test stack does not include `user-event`.

### Requirement 10: Visual Quality

**User Story:** As a stakeholder demoing the dashboard, I want the Central_Inventory surface to match the premium enterprise aesthetic set by Phase 3, so that the new page does not feel like a regression in polish.

#### Acceptance Criteria

1. THE Inventory_Page SHALL apply Tailwind utility classes for layout, spacing, typography, color, shadow, and border so that the page heading, Inventory_Toolbar, Master_Data_Table, CSV_Export_Button, Batch_QR_Print_Button, Hazard_Pill, and Permit_Pill share a coherent enterprise-dashboard aesthetic with the Phase 3 Field_Team roster table.
2. THE Inventory_Page SHALL render its content within the App_Shell's shared `p-6` padding so its outer spacing matches the Command_Center, Field_Team, Action_Board, and Analytics routes.
3. THE Master_Data_Table SHALL use a dense row rhythm — sized down from ample padding to moderate padding — so that more Tree_Record rows are visible per viewport than in the Phase 3 Field_Team roster table.

### Requirement 11: Out-of-Scope for Phase 4

**User Story:** As a product owner, I want Phase 4 to deliver only the Central_Inventory table, the native CSV export, and the QR stub without leaking partial work from later phases, so that later phases stay reviewable in isolation.

#### Acceptance Criteria

1. THE Central_Inventory SHALL NOT implement any real QR-code generation, A4 sheet print layout, or print-dialog invocation in Phase 4.
2. THE Central_Inventory SHALL NOT implement pagination, server-side paging, virtual scrolling, or infinite scroll on the Master_Data_Table in Phase 4.
3. THE Central_Inventory SHALL NOT implement column filtering, free-text search, or faceted filtering on the Master_Data_Table in Phase 4.
4. THE Central_Inventory SHALL NOT implement column sorting controls on the Master_Data_Table in Phase 4; the table displays Tree_Record rows in whatever order the Inventory_Fetch returns them.
5. THE Central_Inventory SHALL NOT implement row selection, multi-select, or bulk-action controls on the Master_Data_Table in Phase 4.
6. THE Central_Inventory SHALL NOT implement row-level edit, delete, or detail-drawer controls on the Master_Data_Table in Phase 4.
7. THE Central_Inventory SHALL NOT implement Excel, XLSX, PDF, or JSON export in Phase 4; the only export format Phase 4 ships is the native CSV_Export.
8. THE Central_Inventory SHALL NOT issue any Supabase mutation against the `trees` table, any arborists table, or any other table in Phase 4.
9. THE Central_Inventory SHALL NOT implement any role-based access control check or admin-authentication guard on the `/inventory` Route in Phase 4.
10. THE Central_Inventory SHALL NOT modify Command_Center_Map, Field_Team_Roster, Action_Board, or Analytics logic in Phase 4.
