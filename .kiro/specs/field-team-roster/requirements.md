# Requirements Document

## Introduction

Phase 3 of the Mission Control Dashboard adds the Field_Team_Roster: a MENRO_Admin portal for managing the field arborist personnel who operate the offline-first mobile app. Phase 3 delivers one new authenticated-admin page at `/arborists` containing an Account_Creation_Form for onboarding new arborists and a Roster_Table listing existing arborists with per-row Reset_Password and Revoke_Access actions.

Phase 3 is intentionally a UI-and-plumbing phase. Every backend interaction that Phase 3 would otherwise perform is deliberately stubbed: the Account_Creation_Form's submit handler, the Roster_Table's data source, and both row-level action buttons all short-circuit to `console.log` rather than calling Supabase. The driving constraint is that the only straightforward client-side account-creation call available today (`supabase.auth.signUp`) would sign the currently authenticated MENRO_Admin out of the dashboard, which is unacceptable for a multi-arborist onboarding workflow. A later phase will replace these stubs with a server-side admin creation path, real roster fetch, real password-reset trigger, and real access-revocation workflow.

Phase 3 extends the App_Shell's navigation from four items to five by inserting a Field Team entry between Action Board and Analytics, adds one new route, and MUST preserve every test that passed at the end of Phase 1 and Phase 2 — a hard preservation contract covering 89 tests across 11 files. Phase 3 introduces no new runtime dependencies; the `Users` icon is imported from the already-installed `lucide-react` package.

## Glossary

- **Mission_Control_Dashboard**: The web application established in Phase 1.
- **App_Shell**: The persistent Sidebar + Header + main content outlet layout delivered by Phase 1.
- **MENRO_Admin**: The authenticated dashboard user who manages field arborist accounts. Phase 3 does not implement any runtime check that the current user is a MENRO_Admin; it presents the portal to whoever is viewing the dashboard.
- **Field_Team_Roster**: The Phase 3 feature as a whole — the `/arborists` route, its page component, the Account_Creation_Form, and the Roster_Table.
- **Manage_Arborists_Page**: The React page component that implements the Field_Team_Roster, living at `src/pages/ManageArborists.jsx` and rendered by the Router at the `/arborists` Route.
- **Route**: A client-side URL path handled by `react-router-dom`. Phase 3 adds exactly one Route: `/arborists`.
- **Sidebar**: The persistent left-hand navigation component defined in `src/components/Sidebar.jsx` whose link set is driven by the exported `NAV_ITEMS` array.
- **NAV_ITEMS**: The exported array in `src/components/Sidebar.jsx` that the Sidebar maps over to render navigation links. Each entry has the shape `{ to, label, Icon }`.
- **Field_Team_Nav_Entry**: The `NAV_ITEMS` entry introduced in Phase 3 with `to: '/arborists'`, `label: 'Field Team'`, and `Icon: Users`.
- **Arborist_Record**: A plain JavaScript object representing one field arborist, with fields `id` (string), `full_name` (string), `email` (string), `contact_number` (string), and `status` (string whose allowed values are exactly `Active` and `Offline`).
- **Mock_Arborist_List**: A hardcoded JavaScript array of between 2 and 3 Arborist_Record objects defined locally inside the Manage_Arborists_Page for use as the Phase 3 Roster_Table data source.
- **Account_Creation_Form**: The card-styled form rendered at the top of the Manage_Arborists_Page for onboarding a new arborist.
- **Account_Creation_Payload**: The plain JavaScript object assembled from Account_Creation_Form inputs at submit time, containing `full_name`, `email`, `contact_number`, and `temporary_password`.
- **Roster_Table**: The Tailwind-styled data table rendered below the Account_Creation_Form that lists each Arborist_Record in the Mock_Arborist_List as a row.
- **Reset_Password_Button**: A per-row action button in the Roster_Table's Actions column that, in Phase 3, only invokes a stub handler.
- **Revoke_Access_Button**: A per-row action button in the Roster_Table's Actions column that, in Phase 3, only invokes a stub handler.
- **Supabase_Client**: The singleton `@supabase/supabase-js` instance exported by `src/supabaseClient.js`. Phase 3 does not call it.
- **Phase_3_Test_Suite**: The Vitest test files exercising the Field_Team_Roster plus the Phase 1 and Phase 2 tests that must continue to pass.
- **Phase_1_and_2_Baseline**: The set of 89 tests across 11 files that passed at the end of Phase 2 and must continue to pass after Phase 3.

## Requirements

### Requirement 1: No New Runtime Dependencies

**User Story:** As a developer, I want Phase 3 to ship without adding new packages, so that the dependency surface stays tight and the existing build remains untouched.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL NOT add any new entry to `dependencies` or `devDependencies` in `package.json` for Phase 3.
2. THE Manage_Arborists_Page SHALL import the `Users` icon from the already-installed `lucide-react` package.
3. THE Field_Team_Roster SHALL NOT import or invoke the Supabase_Client in Phase 3.

### Requirement 2: New Arborists Route

**User Story:** As a MENRO_Admin, I want a dedicated `/arborists` URL, so that I can navigate directly to the field team portal.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL register a Route with path `arborists` inside the App_Shell's routing tree in `src/App.jsx`.
2. WHEN a user navigates to the `/arborists` Route, THE Mission_Control_Dashboard SHALL render the Manage_Arborists_Page as the main content outlet of the App_Shell.
3. THE Manage_Arborists_Page SHALL render inside the App_Shell's shared `<main>` container without suppressing the shared `p-6` padding applied to non-map routes.
4. THE `/arborists` Route SHALL preserve the Sidebar and the Header so that both remain visible alongside and above the Manage_Arborists_Page.

### Requirement 3: Sidebar Navigation Entry

**User Story:** As a MENRO_Admin, I want a Field Team link in the persistent sidebar, so that I can reach the roster from any page in the dashboard.

#### Acceptance Criteria

1. THE Sidebar module at `src/components/Sidebar.jsx` SHALL import the `Users` icon from `lucide-react`.
2. THE exported `NAV_ITEMS` array SHALL contain the Field_Team_Nav_Entry with `to` equal to `'/arborists'`, `label` equal to `'Field Team'`, and `Icon` equal to the imported `Users` component.
3. THE exported `NAV_ITEMS` array SHALL contain exactly five entries after Phase 3.
4. THE exported `NAV_ITEMS` array SHALL order its entries as Command Center, Inventory, Action Board, Field Team, Analytics, in that exact sequence.
5. THE Sidebar SHALL render the Field_Team_Nav_Entry as a `NavLink` using the same active-vs-inactive styling treatment already applied to the other four navigation links.

### Requirement 4: Manage Arborists Page Scaffold

**User Story:** As a MENRO_Admin, I want the `/arborists` route to land on a dedicated page component, so that the roster UI is isolated from unrelated route logic.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL provide a page component file at `src/pages/ManageArborists.jsx` that default-exports the Manage_Arborists_Page.
2. THE Manage_Arborists_Page SHALL render a top-level heading that names the feature as the Field Team roster so MENRO_Admins can identify the page at a glance.
3. THE Manage_Arborists_Page SHALL render the Account_Creation_Form above the Roster_Table within its own section of the page.
4. THE Manage_Arborists_Page SHALL render the Roster_Table below the Account_Creation_Form within its own section of the page.

### Requirement 5: Account Creation Form Inputs

**User Story:** As a MENRO_Admin, I want a card-based form at the top of the roster page with the four fields needed to create an arborist account, so that I can onboard new field staff without leaving the dashboard.

#### Acceptance Criteria

1. THE Account_Creation_Form SHALL render a labeled text input for the arborist's Full Name.
2. THE Account_Creation_Form SHALL render a labeled input of input type `email` for the arborist's Email Address.
3. THE Account_Creation_Form SHALL render a labeled input for the arborist's Contact Number.
4. THE Account_Creation_Form SHALL render a labeled input of input type `password` for the arborist's Temporary Password.
5. THE Account_Creation_Form SHALL render a submit button whose visible text is exactly `Create Arborist Account`.
6. THE Account_Creation_Form SHALL render its four inputs and submit button inside a card-style container styled with Tailwind utility classes consistent with the enterprise-dashboard aesthetic established in Phase 2.
7. THE Account_Creation_Form SHALL associate each input with its visible label using a mechanism that allows each input to be retrieved by accessible name during testing.

### Requirement 6: Account Creation Stub Submission Behavior

**User Story:** As a developer, I want the Account_Creation_Form to short-circuit at the client for Phase 3, so that submitting the form never signs the current MENRO_Admin out of the dashboard.

#### Acceptance Criteria

1. WHEN the MENRO_Admin submits the Account_Creation_Form, THE Manage_Arborists_Page SHALL call `preventDefault` on the native submit event so that no full-page reload occurs.
2. WHEN the MENRO_Admin submits the Account_Creation_Form, THE Manage_Arborists_Page SHALL invoke `console.log` exactly once with the Account_Creation_Payload assembled from the form's four inputs.
3. THE Manage_Arborists_Page SHALL NOT call `supabase.auth.signUp`, `supabase.auth.admin.createUser`, or any other Supabase_Client method in Phase 3.
4. AFTER the Account_Creation_Form's submit handler completes, THE Manage_Arborists_Page SHALL clear the Full Name, Email Address, Contact Number, and Temporary Password inputs back to empty strings.
5. THE Manage_Arborists_Page SHALL carry an explicit source-level comment identifying the submit handler as a Phase 3 stub that a later phase must replace with a server-side admin account creation call that does not sign the current MENRO_Admin out.

### Requirement 7: Arborist Record Shape and Mock Data Source

**User Story:** As a developer, I want a clearly shaped list of mock arborists that Phase 3 can render, so that the Roster_Table has a deterministic data source and a later phase can swap it for a live Supabase query without restructuring the table.

#### Acceptance Criteria

1. THE Manage_Arborists_Page SHALL define an Arborist_Record as a plain JavaScript object with string fields `id`, `full_name`, `email`, and `contact_number`, and a `status` field whose value is exactly `'Active'` or exactly `'Offline'`.
2. THE Manage_Arborists_Page SHALL define a Mock_Arborist_List as a hardcoded JavaScript array containing between 2 and 3 Arborist_Record objects with distinct `id` values.
3. THE Mock_Arborist_List SHALL include at least one Arborist_Record whose `status` is `'Active'` and at least one Arborist_Record whose `status` is `'Offline'` so that both status renderings are exercised by the Roster_Table.
4. THE Manage_Arborists_Page SHALL keep the Arborist_Record shape and the Mock_Arborist_List local to the page module and SHALL NOT add an Arborist_Record type export to `src/types.js` in Phase 3.
5. THE Manage_Arborists_Page SHALL NOT issue any Supabase read, write, update, or delete against any arborist-related table in Phase 3.

### Requirement 8: Roster Table Layout and Columns

**User Story:** As a MENRO_Admin, I want a Tailwind-styled table listing the active field team, so that I can see every arborist's contact details and status at a glance.

#### Acceptance Criteria

1. THE Roster_Table SHALL render a table header row with exactly five column headers labeled, in order, `Name`, `Email`, `Contact Number`, `Status`, and `Actions`.
2. THE Roster_Table SHALL render one body row per Arborist_Record in the Mock_Arborist_List.
3. THE Roster_Table SHALL display the `full_name` field of each Arborist_Record in its row's Name cell.
4. THE Roster_Table SHALL display the `email` field of each Arborist_Record in its row's Email cell.
5. THE Roster_Table SHALL display the `contact_number` field of each Arborist_Record in its row's Contact Number cell.
6. THE Roster_Table SHALL display the `status` field of each Arborist_Record in its row's Status cell, rendering the exact string `Active` or `Offline`.
7. THE Roster_Table SHALL assign each body row a stable React key derived from the Arborist_Record's `id` field so that React can reconcile rows without key-collision warnings.
8. THE Roster_Table SHALL be styled with Tailwind utility classes for layout, spacing, color, border, and row separation consistent with the enterprise-dashboard aesthetic established in Phase 2.

### Requirement 9: Row-Level Action Buttons

**User Story:** As a MENRO_Admin, I want Reset Password and Revoke Access controls on every roster row, so that Phase 3 ships the UI entry points that a later phase will wire into real workflows.

#### Acceptance Criteria

1. THE Roster_Table SHALL render a Reset_Password_Button and a Revoke_Access_Button inside the Actions cell of every body row.
2. THE Reset_Password_Button SHALL display visible text naming the Reset Password action.
3. THE Revoke_Access_Button SHALL display visible text naming the Revoke Access action.
4. WHEN the MENRO_Admin activates a Reset_Password_Button, THE Manage_Arborists_Page SHALL invoke `console.log` exactly once with a message that includes the `id` field of that row's Arborist_Record.
5. WHEN the MENRO_Admin activates a Revoke_Access_Button, THE Manage_Arborists_Page SHALL invoke `console.log` exactly once with a message that includes the `id` field of that row's Arborist_Record.
6. THE Manage_Arborists_Page SHALL NOT implement any real password-reset workflow, any real access-revocation workflow, or any Supabase call for either action in Phase 3.
7. THE Reset_Password_Button and Revoke_Access_Button SHALL be styled with Tailwind utility classes consistent with the enterprise-dashboard aesthetic established in Phase 2 and SHALL be visually distinguishable from each other so a MENRO_Admin can identify the correct action at a glance.

### Requirement 10: Test Preservation and New Test Coverage

**User Story:** As a developer, I want every test that passed at the end of Phase 2 to keep passing and Phase 3's new UI to be covered, so that replacing four navigation items with five and adding the Field_Team_Roster never regresses the App_Shell, the Command_Center_Map, or any prior phase.

#### Acceptance Criteria

1. WHEN `npm test` is run after Phase 3 is complete, THE Mission_Control_Dashboard SHALL pass every test in the Phase_1_and_2_Baseline.
2. THE Phase_3_Test_Suite SHALL update `src/components/Sidebar.test.jsx` so that every assertion that previously counted exactly four navigation links or four `NAV_ITEMS` entries instead asserts exactly five.
3. THE Phase_3_Test_Suite SHALL update any App routing test that previously counted navigation links so that it asserts exactly five navigation links after Phase 3.
4. THE Phase_3_Test_Suite SHALL include an assertion that the fourth entry of `NAV_ITEMS` points to `/arborists` with label `Field Team` and that the fifth entry points to `/analytics`, covering the ordering contract in Requirement 3.4.
5. THE Phase_3_Test_Suite SHALL include a test that navigating the Router to `/arborists` renders the Manage_Arborists_Page.
6. THE Phase_3_Test_Suite SHALL include component tests for the Manage_Arborists_Page that cover each of the following: the presence of labeled inputs for Full Name, Email Address, Contact Number, and Temporary Password; the presence of a submit button labeled `Create Arborist Account`; submission of the Account_Creation_Form invoking `console.log` with the Account_Creation_Payload and clearing all four inputs; the presence of the Roster_Table with its five column headers; a body row rendered for each Arborist_Record in the Mock_Arborist_List with its Name, Email, Contact Number, and Status cells populated; and the presence of a Reset_Password_Button and a Revoke_Access_Button in every body row whose activation invokes `console.log` with the row's Arborist_Record `id`.
7. THE Phase_3_Test_Suite SHALL spy on `console.log` using Vitest and SHALL restore the spy after each test that uses it so that test ordering does not leak log assertions between tests.

### Requirement 11: Visual Quality

**User Story:** As a stakeholder demoing the dashboard, I want the Field_Team_Roster surface to match the premium enterprise aesthetic set by Phase 1 and Phase 2, so that the new page does not feel like a regression in polish.

#### Acceptance Criteria

1. THE Manage_Arborists_Page SHALL apply Tailwind utility classes for layout, spacing, typography, color, shadow, and border so that the page heading, Account_Creation_Form card, Roster_Table, Reset_Password_Button, and Revoke_Access_Button share a coherent enterprise-dashboard aesthetic.
2. THE Manage_Arborists_Page SHALL render its content within the App_Shell's shared `p-6` padding so its outer spacing matches the Inventory, Action Board, and Analytics routes.

### Requirement 12: Out-of-Scope for Phase 3

**User Story:** As a product owner, I want Phase 3 to deliver only the Field_Team_Roster UI and stubs without leaking partial work from later phases, so that later phases stay reviewable in isolation.

#### Acceptance Criteria

1. THE Field_Team_Roster SHALL NOT perform a real Supabase Auth account creation for new arborists in Phase 3.
2. THE Field_Team_Roster SHALL NOT issue a real Supabase query against any arborists table in Phase 3.
3. THE Field_Team_Roster SHALL NOT implement a real password-reset workflow in Phase 3.
4. THE Field_Team_Roster SHALL NOT implement a real access-revocation or account-deletion workflow in Phase 3.
5. THE Field_Team_Roster SHALL NOT implement any role-based access control check or admin-authentication guard on the `/arborists` Route in Phase 3.
6. THE Field_Team_Roster SHALL NOT modify Inventory, Action_Board, Analytics, or Command_Center_Map logic in Phase 3 beyond the single-line `NAV_ITEMS` insertion and the single-line route registration.
