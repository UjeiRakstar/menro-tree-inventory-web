# Requirements Document

## Introduction

Phase 5 of the Mission_Control_Dashboard delivers the Action_Board: the operational heart of the system where the MENRO_Admin triages hazardous trees, issues cutting permits, and logs walk-in requests from citizens. Phase 5 replaces the placeholder component at `src/pages/ActionBoard.jsx` with a data-driven page that is organised as a Dual_Tab_Shell with exactly two sub-views — the Hazard_Dispatch_Board and the Walkin_Request_Form — and is anchored by an Audit_Trail_Link at the bottom of the page.

The Hazard_Dispatch_Board reuses the Phase 4 classifiers directly: on mount the Action_Board issues an Action_Board_Fetch against the Supabase `trees` table, applies the existing `classifyHazard` pure function from `src/lib/hazardStatus.js` as a client-side filter, and renders only Tree_Record rows whose Hazard_Status is `HAZARD_STATUS.HAZARD` as a grid of Dispatch_Ticket_Cards. Each Dispatch_Ticket_Card surfaces the Tree_Record's `tree_id`, `species`, `dbh`, and `assigned_to` fields and carries two action buttons — the Dispatch_Team_Button and the Issue_Permit_Button — plus a Permit_Issued_Badge when the Tree_Record's `has_cutting_permit` field is `true`. Both action buttons are explicit Phase 5 stubs: they invoke `console.log` with their action name and the Tree_Record's `tree_id` and SHALL NOT issue any Supabase mutation in Phase 5.

The Walkin_Request_Form is a controlled React form that lets the MENRO_Admin log a citizen's walk-in cutting request with five fields — Client_Name_Or_Org, Contact_Info, Reason_For_Cutting, Latitude, and Longitude. Submitting the form is likewise a Phase 5 stub: it calls `preventDefault`, logs the collected payload through `console.log`, renders a Submission_Confirmation message, and clears the form fields back to their initial empty state. The real Supabase insert against a future walk-in requests table is explicitly deferred.

The Audit_Trail_Link at the bottom of the Action_Board, labelled `View Ghost Log / Cancelled Tasks (Audit Trail)`, is a distinct Phase 5 stub whose activation only invokes `console.log`. A real ghost-log viewer for `task_status = 'Cancelled'` Tree_Record rows is deferred to a later phase.

Phase 5 MUST preserve every test that passed at the end of Phase 4 — a hard preservation contract covering 140 tests across 17 files — and SHALL add a dedicated `src/pages/ActionBoard.test.jsx` that drives the Action_Board against a mocked Supabase_Client returning one Hazard_Tree_Record and one Safe_Tree_Record, exercising the hazard filter, the tab switching, and the form submit-and-clear cycle. Phase 5 MUST also preserve the hard dependency invariant carried forward from Phase 4: the feature SHALL NOT add any new entry to `dependencies` or `devDependencies` in `package.json`.

## Glossary

- **Mission_Control_Dashboard**: The web application established in Phase 1.
- **App_Shell**: The persistent Sidebar + Header + main content outlet layout delivered by Phase 1. Non-map routes render inside a `<main>` container styled with the shared `p-6` padding.
- **MENRO_Admin**: The authenticated dashboard user who triages hazards, issues permits, and logs walk-in requests on the Action_Board. Phase 5 does not implement any runtime check that the current user is a MENRO_Admin; it presents the Action_Board to whoever is viewing the dashboard.
- **Action_Board**: The Phase 5 feature as a whole — the `/action-board` route, its page component, the Dual_Tab_Shell, the Hazard_Dispatch_Board, the Walkin_Request_Form, and the Audit_Trail_Link.
- **Action_Board_Page**: The React page component that implements the Action_Board, living at `src/pages/ActionBoard.jsx` and rendered by the Router at the `/action-board` Route. The original user brief referred to this file as `ActionBoardView.jsx`; the canonical on-disk path remains `src/pages/ActionBoard.jsx` as already registered in `src/App.jsx`.
- **Route**: A client-side URL path handled by `react-router-dom`. Phase 5 reuses the already-registered `/action-board` Route without modifying `src/App.jsx`.
- **Supabase_Client**: The singleton `@supabase/supabase-js` instance exported by `src/supabaseClient.js`.
- **Tree_Record**: A single row in the Supabase `trees` table as described by the `TreeRecord` JSDoc typedef and the `TreeRecordPropType` PropTypes contract exported from `src/types.js`. Phase 5 SHALL NOT modify `src/types.js`.
- **Hazard_Tree_Record**: A Tree_Record for which the Hazard_Classifier returns `HAZARD_STATUS.HAZARD`.
- **Safe_Tree_Record**: A Tree_Record for which the Hazard_Classifier returns `HAZARD_STATUS.SAFE`.
- **Hazard_Classifier**: The pure function `classifyHazard` exported from `src/lib/hazardStatus.js` by Phase 4. Phase 5 reuses this function directly and SHALL NOT reimplement its logic inline.
- **HAZARD_STATUS**: The frozen `{ HAZARD, SAFE }` enum object exported from `src/lib/hazardStatus.js` by Phase 4.
- **Permit_Classifier**: The pure function `classifyPermit` exported from `src/lib/permitStatus.js` by Phase 4. Phase 5 reuses this function where permit-status branding is needed and SHALL NOT reimplement its logic inline.
- **PERMIT_STATUS**: The frozen `{ APPROVED, NONE }` enum object exported from `src/lib/permitStatus.js` by Phase 4.
- **Tree_Record_List**: The array of Tree_Record objects currently held in the Action_Board_Page's component state after a successful Action_Board_Fetch, or the empty array before the first successful fetch completes.
- **Hazard_Ticket_List**: The subset of the Tree_Record_List produced by keeping only those Tree_Record rows for which the Hazard_Classifier returns `HAZARD_STATUS.HAZARD`. The Hazard_Ticket_List preserves the relative order of the Tree_Record_List.
- **Action_Board_Fetch**: The single Supabase query the Action_Board_Page issues on mount: `supabase.from('trees').select('*')`, reading every column of every row.
- **Loading_State**: The Action_Board_Page state between mount and the resolution of the Action_Board_Fetch, during which the Tree_Record_List is not yet available.
- **Error_State**: The Action_Board_Page state after the Action_Board_Fetch resolves with a non-null `error` value from Supabase or rejects with a thrown exception.
- **Empty_Hazard_State**: The Hazard_Dispatch_Board state after the Action_Board_Fetch resolves successfully with a Tree_Record_List in which no row is a Hazard_Tree_Record, so the Hazard_Ticket_List is empty.
- **Loaded_State**: The Hazard_Dispatch_Board state after the Action_Board_Fetch resolves successfully with at least one Hazard_Tree_Record in the Tree_Record_List.
- **Dual_Tab_Shell**: The top-level two-tab navigation region of the Action_Board_Page consisting of the Hazard_Tab_Button, the Walkin_Tab_Button, and the Active_Tab local state that selects which sub-view renders.
- **Hazard_Tab_Button**: The tab control whose visible text is exactly `🚨 Hazard Management & Permits`. Activating it selects the Hazard_Dispatch_Board as the Active_Tab.
- **Walkin_Tab_Button**: The tab control whose visible text is exactly `📋 Public Walk-in Requests`. Activating it selects the Walkin_Request_Form as the Active_Tab.
- **Active_Tab**: The Action_Board_Page's local state value identifying which sub-view is currently rendered. It takes exactly one of two values: `hazards` (selecting the Hazard_Dispatch_Board) or `walkins` (selecting the Walkin_Request_Form). The initial Active_Tab value is `hazards`.
- **Hazard_Dispatch_Board**: The Hazard_Management sub-view rendered when the Active_Tab is `hazards`. It is a grid of Dispatch_Ticket_Card elements, one per Tree_Record in the Hazard_Ticket_List.
- **Dispatch_Ticket_Card**: A single card in the Hazard_Dispatch_Board grid representing one Hazard_Tree_Record. It displays the `tree_id`, `species`, `dbh`, and `assigned_to` fields of its Tree_Record and carries the Dispatch_Team_Button, either the Issue_Permit_Button or the Permit_Issued_Badge, and no other action controls.
- **Dispatch_Team_Button**: The button on each Dispatch_Ticket_Card whose visible text is exactly `Dispatch Team`. In Phase 5 it only invokes a stub handler.
- **Issue_Permit_Button**: The button on each Dispatch_Ticket_Card whose visible text is exactly `Issue Permit`. It renders only when the Tree_Record's `has_cutting_permit` field is `false`. In Phase 5 it only invokes a stub handler.
- **Permit_Issued_Badge**: The inline badge element rendered on a Dispatch_Ticket_Card whose Tree_Record has `has_cutting_permit` equal to `true`. Its visible text is exactly `Permit Issued` and its Tailwind styling uses the yellow or amber palette consistent with the Phase 4 Permit_Pill.
- **Walkin_Request_Form**: The Public_Walkin_Requests sub-view rendered when the Active_Tab is `walkins`. It is a controlled HTML `<form>` containing the five Walkin_Form_Fields, the Submit_Request_Button, and the Submission_Confirmation slot.
- **Walkin_Form_Fields**: The five labelled input controls in the Walkin_Request_Form — Client_Name_Or_Org, Contact_Info, Reason_For_Cutting, Latitude, and Longitude.
- **Client_Name_Or_Org**: The Walkin_Form_Field that captures the citizen's name or the name of the organisation making the request. It is a single-line text input whose value is held in the Walkin_Form_State.
- **Contact_Info**: The Walkin_Form_Field that captures a phone number or email at which the citizen can be reached. It is a single-line text input whose value is held in the Walkin_Form_State.
- **Reason_For_Cutting**: The Walkin_Form_Field that captures the citizen's stated reason for requesting that a tree be cut. It is a multi-line text input whose value is held in the Walkin_Form_State.
- **Latitude**: The Walkin_Form_Field that captures the decimal-degrees latitude of the subject tree. It is a text input whose value is held in the Walkin_Form_State as an unparsed string.
- **Longitude**: The Walkin_Form_Field that captures the decimal-degrees longitude of the subject tree. It is a text input whose value is held in the Walkin_Form_State as an unparsed string.
- **Walkin_Form_State**: The single React state object backing the controlled Walkin_Request_Form. Its initial value sets every Walkin_Form_Field to the empty string `''`.
- **Walkin_Payload**: The plain-object snapshot of the Walkin_Form_State at the moment the Submit_Request_Button is activated. Its keys are exactly `client_name`, `contact_info`, `reason`, `latitude`, and `longitude`, each mapping to the corresponding Walkin_Form_Field value as a string.
- **Submit_Request_Button**: The `<button type="submit">` in the Walkin_Request_Form whose visible text is exactly `Submit Official Request`.
- **Submission_Confirmation**: The transient visible message the Walkin_Request_Form renders after a successful stub submission. Its visible text is exactly `Request Logged`.
- **Audit_Trail_Link**: The distinct control rendered at the bottom of the Action_Board_Page, below both tabs' content, whose visible text is exactly `View Ghost Log / Cancelled Tasks (Audit Trail)`. In Phase 5 it only invokes a stub handler.
- **Phase_5_Test_Suite**: The Vitest test files exercising the Action_Board plus the Phase 1, Phase 2, Phase 3, and Phase 4 tests that must continue to pass.
- **Phase_1_through_4_Baseline**: The set of 140 tests across 17 files that passed at the end of Phase 4 and must continue to pass after Phase 5.

## Requirements

### Requirement 1: No New Runtime Dependencies

**User Story:** As a developer, I want Phase 5 to ship without adding new packages, so that the Action_Board cannot smuggle in tab, form, or toast libraries by the back door and can be reviewed against the same hard dependency invariant as Phase 4.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL NOT add any new entry to `dependencies` or `devDependencies` in `package.json` for Phase 5.
2. THE Action_Board SHALL NOT import any tab component library, form library, toast library, modal library, or date-picker library third-party package.
3. THE Dual_Tab_Shell SHALL be implemented using only native React state, a local union value, and conditional rendering, and SHALL NOT depend on any module outside the already-installed dependency set.
4. THE Walkin_Request_Form SHALL be implemented as a native controlled React `<form>` using `useState` and standard HTML `<input>`, `<textarea>`, `<label>`, and `<button>` elements, and SHALL NOT depend on any form-state management library.

### Requirement 2: Action Board Route and Page Scaffold

**User Story:** As a MENRO_Admin, I want the existing `/action-board` route to land on a real Action_Board page, so that the placeholder copy is replaced with the dual-tab operational surface.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL continue to register the Route with path `action-board` inside the App_Shell's routing tree in `src/App.jsx` without modifying that registration for Phase 5.
2. THE Mission_Control_Dashboard SHALL provide the Action_Board_Page component at `src/pages/ActionBoard.jsx` with a default export.
3. WHEN a user navigates to the `/action-board` Route, THE Mission_Control_Dashboard SHALL render the Action_Board_Page as the main content outlet of the App_Shell.
4. THE Action_Board_Page SHALL render inside the App_Shell's shared `<main>` container whose `p-6` padding is applied by the App_Shell, and SHALL NOT apply its own outer `p-6` padding so that its outer spacing is inherited unchanged.
5. THE Action_Board_Page SHALL render a top-level heading at heading level 1 whose text names the page as the `Action Board` view so that the existing App-level routing test continues to pass.
6. THE Action_Board_Page SHALL render the Dual_Tab_Shell above the currently-active sub-view and SHALL render the Audit_Trail_Link below the currently-active sub-view, regardless of which tab is active.

### Requirement 3: Supabase Data Fetching Contract

**User Story:** As a MENRO_Admin, I want the Action_Board_Page to load the entire tree database from Supabase on mount, so that the Hazard_Dispatch_Board reflects the current state of the `trees` table without any manual refresh step.

#### Acceptance Criteria

1. THE Action_Board_Page SHALL import the Supabase_Client singleton from `src/supabaseClient.js`.
2. WHEN the Action_Board_Page mounts, THE Action_Board_Page SHALL issue the Action_Board_Fetch exactly once by calling `supabase.from('trees').select('*')`.
3. WHEN the Action_Board_Fetch resolves successfully, THE Action_Board_Page SHALL store the returned rows as the Tree_Record_List in component state.
4. THE Action_Board_Page SHALL treat each row returned by the Action_Board_Fetch as a Tree_Record adhering to the `TreeRecord` typedef exported from `src/types.js` and SHALL NOT reshape, rename, or drop fields before storing rows in the Tree_Record_List.
5. WHILE the Action_Board_Page is in the Loading_State, THE Hazard_Dispatch_Board SHALL render a visible loading indicator and SHALL NOT render any Dispatch_Ticket_Card.
6. IF the Action_Board_Fetch resolves with a non-null `error` value from Supabase or rejects with a thrown exception, THEN THE Hazard_Dispatch_Board SHALL transition into the Error_State, render a visible error message, and SHALL NOT render any Dispatch_Ticket_Card.
7. THE Action_Board_Page SHALL NOT issue any Supabase mutation (insert, update, upsert, or delete) against the `trees` table in Phase 5.
8. THE Action_Board_Page SHALL NOT issue any Supabase query against any table other than `trees` in Phase 5.

### Requirement 4: Dual Tab Shell Navigation

**User Story:** As a MENRO_Admin, I want a clear two-tab navigation at the top of the Action_Board, so that I can switch between hazard dispatch work and walk-in request logging without leaving the page.

#### Acceptance Criteria

1. THE Dual_Tab_Shell SHALL render exactly two tab controls above the Active_Tab sub-view, in order: the Hazard_Tab_Button first, then the Walkin_Tab_Button.
2. THE Hazard_Tab_Button SHALL render with visible text exactly equal to `🚨 Hazard Management & Permits`.
3. THE Walkin_Tab_Button SHALL render with visible text exactly equal to `📋 Public Walk-in Requests`.
4. THE Action_Board_Page SHALL hold the Active_Tab as local React state initialised to the value `hazards` so that the Hazard_Dispatch_Board is the sub-view rendered on first mount.
5. WHEN the MENRO_Admin activates the Hazard_Tab_Button, THE Action_Board_Page SHALL set the Active_Tab to `hazards` and SHALL render the Hazard_Dispatch_Board as the Active_Tab sub-view.
6. WHEN the MENRO_Admin activates the Walkin_Tab_Button, THE Action_Board_Page SHALL set the Active_Tab to `walkins` and SHALL render the Walkin_Request_Form as the Active_Tab sub-view.
7. WHILE the Active_Tab is `hazards`, THE Action_Board_Page SHALL render the Hazard_Dispatch_Board and SHALL NOT render the Walkin_Request_Form.
8. WHILE the Active_Tab is `walkins`, THE Action_Board_Page SHALL render the Walkin_Request_Form and SHALL NOT render the Hazard_Dispatch_Board.
9. THE Hazard_Tab_Button and the Walkin_Tab_Button SHALL be visually distinguishable from one another when selected versus unselected, using Tailwind utility classes for color, weight, or border consistent with the enterprise-dashboard aesthetic established in earlier phases.
10. THE Action_Board_Page SHALL preserve the Tree_Record_List and the Walkin_Form_State across Active_Tab switches within a single mount of the Action_Board_Page, so that switching tabs does not refetch Supabase and does not clear an in-progress walk-in form.
11. THE Action_Board_Page SHALL implement the Active_Tab as a single `useState` slot declared inside the Action_Board_Page component and SHALL NOT hoist the Active_Tab into a React context, a Redux store, a Zustand store, a custom hook shared with any other component, the URL path, the URL search string, the URL hash, `window.history` state, `sessionStorage`, or `localStorage`, so that the Dual_Tab_Shell is fully isolated from the rest of the Mission_Control_Dashboard in Phase 5.
12. THE Action_Board_Page SHALL NOT read the Active_Tab value from `useSearchParams`, `useLocation`, `useParams`, `useMatch`, `useNavigationType`, or any other `react-router-dom` hook, so that the Dual_Tab_Shell does not depend on the Router for its selection state.
13. WHEN the MENRO_Admin activates the Hazard_Tab_Button or the Walkin_Tab_Button, THE Action_Board_Page SHALL NOT call `navigate`, `history.pushState`, `history.replaceState`, or modify `window.location`, so that the URL path, search string, and hash remain exactly what the Router rendered when the `/action-board` Route was entered.
14. WHEN the MENRO_Admin navigates away from the `/action-board` Route and back to it within the same Mission_Control_Dashboard session, THE Action_Board_Page MAY re-initialise the Active_Tab to `hazards` on remount, because the Phase 5 V1 Release Candidate does not implement tab state persistence across remounts.

### Requirement 5: Hazard Dispatch Board Filtering and Grid Layout

**User Story:** As a MENRO_Admin, I want the Hazard_Dispatch_Board to show only Tree_Record rows that are actually hazardous, so that my dispatch attention is not diluted by safe inventory rows.

#### Acceptance Criteria

1. THE Hazard_Dispatch_Board SHALL derive the Hazard_Ticket_List from the Tree_Record_List by keeping only those Tree_Record rows for which the Hazard_Classifier returns `HAZARD_STATUS.HAZARD`.
2. THE Hazard_Dispatch_Board SHALL perform the Hazard_Ticket_List filter on the client using the Hazard_Classifier imported from `src/lib/hazardStatus.js` and SHALL NOT reimplement or inline the Hazard_Flags boolean OR.
3. THE Hazard_Dispatch_Board SHALL NOT push the hazard filter down to Supabase as a `.filter`, `.eq`, or `.or` query in Phase 5; the Action_Board_Fetch continues to select every row of the `trees` table.
4. WHILE the Hazard_Dispatch_Board is in the Loaded_State, THE Hazard_Dispatch_Board SHALL render exactly one Dispatch_Ticket_Card per Tree_Record in the Hazard_Ticket_List.
5. THE Hazard_Dispatch_Board SHALL assign each Dispatch_Ticket_Card a stable React key derived from the Tree_Record's `id` field so that React can reconcile cards without key-collision warnings.
6. THE Hazard_Dispatch_Board SHALL arrange the Dispatch_Ticket_Card elements as a responsive grid using Tailwind utility classes consistent with the enterprise-dashboard aesthetic established in earlier phases.
7. WHILE the Hazard_Dispatch_Board is in the Empty_Hazard_State, THE Hazard_Dispatch_Board SHALL render a visible empty-state message indicating that no hazardous Tree_Record rows were returned and SHALL NOT render any Dispatch_Ticket_Card.

### Requirement 6: Dispatch Ticket Card Contents

**User Story:** As a MENRO_Admin, I want each Dispatch_Ticket_Card to show just enough of the Tree_Record to triage it at a glance, so that I can decide whether to dispatch a team or issue a permit without drilling into the full inventory.

#### Acceptance Criteria

1. THE Dispatch_Ticket_Card SHALL display the `tree_id` field of its Tree_Record as a visually prominent card identifier, rendering a visible placeholder dash character when `tree_id` is `null`.
2. THE Dispatch_Ticket_Card SHALL display the `species` field of its Tree_Record as a labelled card attribute.
3. THE Dispatch_Ticket_Card SHALL display the `dbh` field of its Tree_Record as a labelled card attribute, rendering the string value unchanged from the Tree_Record.
4. THE Dispatch_Ticket_Card SHALL display the `assigned_to` field of its Tree_Record as a labelled card attribute, rendering a visible placeholder dash character when `assigned_to` is `null`.
5. THE Dispatch_Ticket_Card SHALL NOT display the `latitude`, `longitude`, `scientific_name`, `species_type`, individual Hazard_Flags, `dateCaptured`, `task_status`, or `photo_url` fields of its Tree_Record in Phase 5.
6. THE Dispatch_Ticket_Card SHALL render the Dispatch_Team_Button with visible text exactly equal to `Dispatch Team`, regardless of the Tree_Record's `has_cutting_permit` value.
7. WHEN its Tree_Record's `has_cutting_permit` field is `false`, THE Dispatch_Ticket_Card SHALL render the Issue_Permit_Button with visible text exactly equal to `Issue Permit` and SHALL NOT render the Permit_Issued_Badge.
8. WHEN its Tree_Record's `has_cutting_permit` field is `true`, THE Dispatch_Ticket_Card SHALL render the Permit_Issued_Badge with visible text exactly equal to `Permit Issued` and SHALL NOT render the Issue_Permit_Button.
9. THE Permit_Issued_Badge SHALL be styled with Tailwind utility classes using the yellow or amber palette consistent with the Phase 4 Permit_Pill.
10. THE Dispatch_Ticket_Card SHALL be styled with Tailwind utility classes for layout, spacing, color, border, and shadow consistent with the enterprise-dashboard aesthetic — specifically the `bg-white rounded-lg shadow-sm border border-slate-200` card shell established in earlier phases.

### Requirement 7: Dispatch and Permit Action Stubs

**User Story:** As a MENRO_Admin, I want the Dispatch_Team_Button and the Issue_Permit_Button to visibly acknowledge my click with identifiable log output, so that Phase 5 wires up the UI while a later phase wires up the real Supabase mutations.

#### Acceptance Criteria

1. WHEN the MENRO_Admin activates the Dispatch_Team_Button on a Dispatch_Ticket_Card, THE Action_Board_Page SHALL invoke `console.log` exactly once with two arguments: the string `'Dispatch Team'` and the Tree_Record's `tree_id` field.
2. WHEN the MENRO_Admin activates the Issue_Permit_Button on a Dispatch_Ticket_Card, THE Action_Board_Page SHALL invoke `console.log` exactly once with two arguments: the string `'Issue Permit'` and the Tree_Record's `tree_id` field.
3. THE Dispatch_Team_Button SHALL NOT trigger any Supabase mutation, navigation, or network request in Phase 5.
4. THE Issue_Permit_Button SHALL NOT trigger any Supabase mutation, navigation, or network request in Phase 5.
5. THE Action_Board_Page SHALL carry explicit source-level comments identifying the Dispatch_Team_Button handler and the Issue_Permit_Button handler as Phase 5 stubs that a later phase must replace with real Supabase updates to the `trees` table.

### Requirement 8: Walk-in Request Form Structure

**User Story:** As a MENRO_Admin, I want a clean controlled form in the Walk-in Requests tab with the five fields I collect at the front desk, so that I can log a citizen's complaint in the Action_Board without switching applications.

#### Acceptance Criteria

1. THE Walkin_Request_Form SHALL render as a single HTML `<form>` element when the Active_Tab is `walkins`.
2. THE Walkin_Request_Form SHALL render exactly five Walkin_Form_Fields, each with a visible `<label>` associated to its input control, in the order: Client_Name_Or_Org, Contact_Info, Reason_For_Cutting, Latitude, Longitude.
3. THE Client_Name_Or_Org field SHALL be rendered as a single-line text `<input>` whose value is bound to the `client_name` key of the Walkin_Form_State.
4. THE Contact_Info field SHALL be rendered as a single-line text `<input>` whose value is bound to the `contact_info` key of the Walkin_Form_State.
5. THE Reason_For_Cutting field SHALL be rendered as a multi-line `<textarea>` whose value is bound to the `reason` key of the Walkin_Form_State.
6. THE Latitude field SHALL be rendered as a text `<input>` whose value is bound to the `latitude` key of the Walkin_Form_State.
7. THE Longitude field SHALL be rendered as a text `<input>` whose value is bound to the `longitude` key of the Walkin_Form_State.
8. THE Walkin_Request_Form SHALL initialise the Walkin_Form_State with every field set to the empty string `''` so that all five Walkin_Form_Fields mount as controlled inputs with defined values.
9. WHEN the MENRO_Admin types into any Walkin_Form_Field, THE Walkin_Request_Form SHALL update the corresponding key of the Walkin_Form_State to the input's current value on every change event.
10. THE Walkin_Request_Form SHALL render the Submit_Request_Button with `type="submit"` and visible text exactly equal to `Submit Official Request`.
11. THE Walkin_Request_Form SHALL be styled with Tailwind utility classes for layout, spacing, typography, and color consistent with the enterprise-dashboard aesthetic established in earlier phases.

### Requirement 9: Walk-in Request Submit Stub and Clear

**User Story:** As a MENRO_Admin, I want submitting the walk-in form to give me a visible success acknowledgement and then clear the fields, so that I can immediately log the next walk-in without manually resetting five inputs.

#### Acceptance Criteria

1. WHEN the MENRO_Admin activates the Submit_Request_Button, THE Walkin_Request_Form SHALL invoke `event.preventDefault()` on the form's submit event before performing any other action.
2. WHEN the MENRO_Admin activates the Submit_Request_Button, THE Walkin_Request_Form SHALL construct the Walkin_Payload as a plain object with exactly the keys `client_name`, `contact_info`, `reason`, `latitude`, and `longitude`, each taking its value directly from the corresponding key of the current Walkin_Form_State.
3. WHEN the MENRO_Admin activates the Submit_Request_Button, THE Walkin_Request_Form SHALL invoke `console.log` exactly once with the Walkin_Payload as its single argument.
4. WHEN the MENRO_Admin activates the Submit_Request_Button, THE Walkin_Request_Form SHALL render the Submission_Confirmation with visible text exactly equal to `Request Logged`.
5. WHEN the MENRO_Admin activates the Submit_Request_Button, THE Walkin_Request_Form SHALL reset the Walkin_Form_State back to its initial shape — every key set to the empty string `''` — so that all five Walkin_Form_Fields display as empty after the submission completes.
6. THE Walkin_Request_Form SHALL NOT issue any Supabase insert, update, upsert, or delete, and SHALL NOT issue any network request, when the Submit_Request_Button is activated in Phase 5.
7. THE Walkin_Request_Form SHALL carry an explicit source-level comment identifying the Submit_Request_Button handler as a Phase 5 stub that a later phase must replace with a real Supabase insert into a walk-in requests table.
8. WHILE the Submission_Confirmation is visible, THE Walkin_Request_Form SHALL continue to render all five Walkin_Form_Fields as empty controlled inputs and SHALL continue to render the Submit_Request_Button.

### Requirement 10: Audit Trail Link Stub

**User Story:** As a MENRO_Admin, I want a visible entry point for the ghost log of cancelled tasks on the Action_Board, so that a later phase can wire the real audit-trail viewer in without adding a new control or moving existing tabs.

#### Acceptance Criteria

1. THE Action_Board_Page SHALL render the Audit_Trail_Link at the bottom of the page, below the Active_Tab sub-view, so that it is visible when either tab is active.
2. THE Audit_Trail_Link SHALL render as a single activatable control — either an HTML `<button>` or a styled link — whose visible text is exactly `View Ghost Log / Cancelled Tasks (Audit Trail)`.
3. THE Audit_Trail_Link SHALL be visually distinct from the Dispatch_Team_Button, the Issue_Permit_Button, and the Submit_Request_Button, using Tailwind utility classes for color, weight, or border consistent with the enterprise-dashboard aesthetic established in earlier phases.
4. WHEN the MENRO_Admin activates the Audit_Trail_Link, THE Action_Board_Page SHALL invoke `console.log` exactly once with a single string argument that clearly identifies the intent, for example `'View Ghost Log / Cancelled Tasks (Audit Trail)'`.
5. THE Audit_Trail_Link SHALL NOT trigger any navigation, Supabase call, or modal in Phase 5.
6. THE Action_Board_Page SHALL carry an explicit source-level comment identifying the Audit_Trail_Link handler as a Phase 5 stub that a later phase must replace with the real ghost-log viewer filtered to `task_status = 'Cancelled'` Tree_Record rows.

### Requirement 11: Test Preservation and New Test Coverage

**User Story:** As a developer, I want every test that passed at the end of Phase 4 to keep passing and Phase 5's new UI to be covered, so that replacing the Action_Board placeholder never regresses the App_Shell, the Command_Center_Map, the Field_Team_Roster, or the Central_Inventory.

#### Acceptance Criteria

1. WHEN `npm test` is run after Phase 5 is complete, THE Mission_Control_Dashboard SHALL pass every test in the Phase_1_through_4_Baseline.
2. THE Phase_5_Test_Suite SHALL include a dedicated test file at `src/pages/ActionBoard.test.jsx` that drives the Action_Board_Page against a mocked Supabase_Client.
3. THE Phase_5_Test_Suite SHALL mock the Supabase_Client using the `vi.hoisted` + `vi.mock` pattern established by `src/pages/CommandCenter.test.jsx` and `src/pages/Inventory.test.jsx` so that `supabase.from('trees').select('*')` resolves to an object shaped as `{ data, error }` where `data` is a hardcoded array containing exactly one Hazard_Tree_Record and exactly one Safe_Tree_Record.
4. THE Phase_5_Test_Suite SHALL assert that after the mocked Action_Board_Fetch resolves, the Hazard_Dispatch_Board renders exactly one Dispatch_Ticket_Card and that the card corresponds to the Hazard_Tree_Record, confirming that the Safe_Tree_Record is filtered out client-side.
5. THE Phase_5_Test_Suite SHALL assert that activating the Walkin_Tab_Button switches the Active_Tab to `walkins` so that the Walkin_Request_Form is rendered and the Hazard_Dispatch_Board is not rendered, and that activating the Hazard_Tab_Button switches the Active_Tab back to `hazards` so that the Hazard_Dispatch_Board is rendered and the Walkin_Request_Form is not rendered.
6. THE Phase_5_Test_Suite SHALL assert that a Dispatch_Ticket_Card whose Tree_Record has `has_cutting_permit` equal to `true` displays the Permit_Issued_Badge and does not display the Issue_Permit_Button, and that a Dispatch_Ticket_Card whose Tree_Record has `has_cutting_permit` equal to `false` displays the Issue_Permit_Button and does not display the Permit_Issued_Badge.
7. THE Phase_5_Test_Suite SHALL spy on `console.log` using Vitest and SHALL restore the spy after each test that uses it so that test ordering does not leak log assertions between tests.
8. THE Phase_5_Test_Suite SHALL exercise the Dispatch_Team_Button by activating it on a rendered Dispatch_Ticket_Card and asserting `console.log` was called with the string `'Dispatch Team'` and the Hazard_Tree_Record's `tree_id`.
9. THE Phase_5_Test_Suite SHALL exercise the Issue_Permit_Button by rendering a Dispatch_Ticket_Card for a Hazard_Tree_Record whose `has_cutting_permit` field is `false`, activating the Issue_Permit_Button, and asserting `console.log` was called with the string `'Issue Permit'` and that Tree_Record's `tree_id`.
10. THE Phase_5_Test_Suite SHALL exercise the Walkin_Request_Form submit-and-clear cycle by switching to the `walkins` tab, filling every Walkin_Form_Field with a non-empty string value, activating the Submit_Request_Button, asserting `console.log` was called once with a Walkin_Payload whose five keys match the values that were typed, asserting the Submission_Confirmation with text `Request Logged` is rendered, and asserting every Walkin_Form_Field renders as the empty string after submission.
11. THE Phase_5_Test_Suite SHALL exercise the Audit_Trail_Link by activating it after the mocked Action_Board_Fetch resolves and asserting `console.log` was called once.
12. THE Phase_5_Test_Suite SHALL use `fireEvent` from `@testing-library/react` rather than `@testing-library/user-event`, because the Mission_Control_Dashboard's test stack does not include `user-event`.
13. THE Phase_5_Test_Suite SHALL NOT add any new entry to `dependencies` or `devDependencies` in `package.json`.

### Requirement 12: Visual Quality

**User Story:** As a stakeholder demoing the dashboard, I want the Action_Board surface to match the premium enterprise aesthetic set by earlier phases, so that the new page does not feel like a regression in polish.

#### Acceptance Criteria

1. THE Action_Board_Page SHALL apply Tailwind utility classes for layout, spacing, typography, color, shadow, and border so that the page heading, Dual_Tab_Shell, Hazard_Dispatch_Board, Dispatch_Ticket_Card, Dispatch_Team_Button, Issue_Permit_Button, Permit_Issued_Badge, Walkin_Request_Form, Submit_Request_Button, Submission_Confirmation, and Audit_Trail_Link share a coherent enterprise-dashboard aesthetic with the Phase 4 Central_Inventory page.
2. THE Action_Board_Page SHALL render its content within the App_Shell's shared `p-6` padding so its outer spacing matches the Command_Center, Inventory, Field_Team, and Analytics routes.
3. THE Dispatch_Ticket_Card SHALL use the `bg-white rounded-lg shadow-sm border border-slate-200` card shell established in earlier phases for its outer container.
4. THE Permit_Issued_Badge SHALL use the yellow or amber palette established in Phase 4 for the Permit_Pill so that the Action_Board and the Central_Inventory agree on permit-status colour.
5. THE Dispatch_Ticket_Card's `tree_id` field value SHALL be rendered with a larger font size or heavier font weight than the card's other labelled attributes so that the Tree_Record identifier is the most prominent element on the card.

### Requirement 13: Out-of-Scope for Phase 5

**User Story:** As a product owner, I want Phase 5 to deliver only the Action_Board dual-tab UI, the four click stubs, and the audit-trail entry-point stub without leaking partial work from later phases, so that later phases stay reviewable in isolation.

#### Acceptance Criteria

1. THE Action_Board SHALL NOT implement any real Supabase update, insert, upsert, or delete against the `trees` table when the Dispatch_Team_Button or the Issue_Permit_Button is activated in Phase 5; both buttons remain `console.log` stubs.
2. THE Action_Board SHALL NOT implement any real Supabase insert into a walk-in requests table, any other table, or any external API when the Submit_Request_Button is activated in Phase 5; the submit handler remains a `console.log` stub that clears the Walkin_Form_State.
3. THE Action_Board SHALL NOT implement a real ghost-log viewer, a modal, a drawer, a new route, or a Supabase query filtered to `task_status = 'Cancelled'` when the Audit_Trail_Link is activated in Phase 5; the Audit_Trail_Link remains a `console.log` stub.
4. THE Action_Board SHALL NOT implement assignment selection, arborist lookup, team-picker UI, permit-number generation, permit-PDF rendering, or any QR-code generation in Phase 5.
5. THE Action_Board SHALL NOT implement client-side or server-side validation beyond the browser's native form handling in Phase 5; empty or malformed Walkin_Form_Fields still reach the Walkin_Payload as empty strings and are still logged by the submit stub.
6. THE Action_Board SHALL NOT implement map-picking of Latitude and Longitude, browser geolocation lookup, or address-to-coordinates geocoding in Phase 5; the Latitude and Longitude fields are plain text inputs.
7. THE Action_Board SHALL NOT implement toast notifications, modal dialogs, or auto-dismiss timers for the Submission_Confirmation in Phase 5; rendering the text `Request Logged` alongside the cleared form is sufficient.
8. THE Action_Board SHALL NOT implement pagination, infinite scroll, search, or filtering controls on the Hazard_Dispatch_Board in Phase 5; the grid renders the entire Hazard_Ticket_List in whatever order the Action_Board_Fetch returns.
9. THE Action_Board SHALL NOT implement any role-based access control check or admin-authentication guard on the `/action-board` Route in Phase 5.
10. THE Action_Board SHALL NOT modify the Command_Center_Map, the Central_Inventory, the Field_Team_Roster, or the Analytics logic in Phase 5.
11. THE Action_Board SHALL NOT modify `src/lib/hazardStatus.js`, `src/lib/permitStatus.js`, `src/types.js`, `src/supabaseClient.js`, or `src/App.jsx` in Phase 5.
12. THE Action_Board SHALL NOT implement URL-based tab deep linking, search-parameter-backed tab selection, hash-based tab selection, or router-driven tab navigation in Phase 5; the Dual_Tab_Shell is driven entirely by a local `useState` slot inside the Action_Board_Page.
