# Requirements Document

## Introduction

Phase 7 of the Tree Inventory Web App adds two capabilities: (1) a Batch QR Sticker Generator that renders printable credit-card-sized QR stickers for every tree record using native browser printing, and (2) a Ghost Log / Audit Trail view that surfaces cancelled tree tasks in a dedicated route. The feature also wires existing UI stubs (the "Print QR Stickers (A4)" button in InventoryView and the "View Ghost Log" button in ActionBoard) to their real implementations.

## Glossary

- **QR_Sticker_Sheet**: A print-only CSS Grid layout rendered at the bottom of InventoryView that contains one QR_Sticker per Tree_Record. Invisible on screen (Tailwind `hidden print:block`), visible only when the browser print dialog is active.
- **QR_Sticker**: A single credit-card-sized cell in the QR_Sticker_Sheet containing an LGU_Logo_Placeholder, a Tree_ID_Label, and a QR_Code.
- **QR_Code**: A QR code rendered by the `qrcode.react` library whose encoded value is the tree's `tree_id` field.
- **LGU_Logo_Placeholder**: A placeholder `<div>` element reserved for the Local Government Unit logo within each QR_Sticker.
- **Tree_ID_Label**: A text element displaying "Tree ID: [tree_id]" within each QR_Sticker.
- **Batch_QR_Print_Button**: The existing "Print QR Stickers (A4)" button in InventoryView that triggers the browser print dialog.
- **Audit_Log_View**: The new page component at route `/audit-log` that displays a table of cancelled tree records.
- **Ghost_Log_Table**: A Tailwind-styled data table within Audit_Log_View displaying cancelled Tree_Records with columns for Tree ID, Species, Assigned Arborist, and Date Captured/Cancelled.
- **Cancelled_Badge**: A red badge rendered on each row of the Ghost_Log_Table indicating the record's cancelled status.
- **Audit_Trail_Link**: The existing "View Ghost Log / Cancelled Tasks (Audit Trail)" button in ActionBoard that navigates to the `/audit-log` route.
- **Sidebar_Navigation**: The application's primary navigation component rendering NavLink entries for all routes.
- **Tree_Record**: A single row from the Supabase `trees` table as defined in `src/types.js`.
- **InventoryView**: The existing page component at route `/inventory` that displays the master tree data table.
- **ActionBoard**: The existing page component at route `/action-board` that manages hazard dispatch and walk-in requests.

## Requirements

### Requirement 1: Dependency Constraint

**User Story:** As a project maintainer, I want to limit new dependencies to only `qrcode.react`, so that the bundle size stays controlled and no PDF-generation libraries are introduced.

#### Acceptance Criteria

1. THE Build_System SHALL include `qrcode.react` as the only new production dependency added in this phase.
2. THE Build_System SHALL not include any PDF-generation library (such as jsPDF, pdfmake, react-pdf, or pdf-lib) as a dependency.

### Requirement 2: Batch QR Print Button Activation

**User Story:** As a MENRO Admin, I want the "Print QR Stickers (A4)" button to open the browser print dialog, so that I can print QR stickers for all inventoried trees.

#### Acceptance Criteria

1. WHEN the Batch_QR_Print_Button is clicked, THE InventoryView SHALL invoke `window.print()` to open the native browser print dialog.
2. THE InventoryView SHALL not use any PDF-generation library to produce the printable output.
3. THE Batch_QR_Print_Button SHALL retain its existing visible text "Print QR Stickers (A4)", placement, and Tailwind styling.

### Requirement 3: QR Sticker Sheet Print-Only Layout

**User Story:** As a MENRO Admin, I want a print-only sticker layout that is invisible on screen but renders when printing, so that the on-screen UI remains uncluttered while I can still print stickers.

#### Acceptance Criteria

1. THE InventoryView SHALL render a QR_Sticker_Sheet at the bottom of the component.
2. THE QR_Sticker_Sheet SHALL use Tailwind utility classes `hidden` and `print:block` so that the layout is invisible during normal screen display and visible only during printing.
3. THE QR_Sticker_Sheet SHALL use a CSS Grid layout to arrange QR_Sticker cells.
4. WHEN the Tree_Record list is loaded, THE QR_Sticker_Sheet SHALL contain exactly one QR_Sticker for each Tree_Record in the list.

### Requirement 4: QR Sticker Content

**User Story:** As a MENRO Admin, I want each QR sticker to contain the LGU logo placeholder, the tree ID text, and a scannable QR code, so that printed stickers are identifiable and machine-readable.

#### Acceptance Criteria

1. THE QR_Sticker SHALL be approximately credit-card sized (roughly 85mm × 54mm or equivalent CSS dimensions).
2. THE QR_Sticker SHALL contain an LGU_Logo_Placeholder div element.
3. THE QR_Sticker SHALL contain a Tree_ID_Label displaying the text "Tree ID: [tree_id]" where `[tree_id]` is the value of the Tree_Record's `tree_id` field.
4. THE QR_Sticker SHALL contain a QR_Code component from `qrcode.react` with its `value` prop set to the Tree_Record's `tree_id` field.
5. IF a Tree_Record has a null `tree_id` field, THEN THE QR_Sticker SHALL render the Tree_ID_Label as "Tree ID: —" and set the QR_Code value to an empty string.

### Requirement 5: Audit Log Route and Navigation

**User Story:** As a MENRO Admin, I want a dedicated Audit Log page accessible from the sidebar, so that I can review cancelled tree tasks in one place.

#### Acceptance Criteria

1. THE App SHALL register a new route at path `/audit-log` that renders the Audit_Log_View component.
2. THE Sidebar_Navigation SHALL include a navigation entry for the `/audit-log` route with a History or ClipboardList icon from lucide-react.
3. THE Sidebar_Navigation SHALL render exactly six navigation links after this addition.
4. THE Audit_Trail_Link in ActionBoard SHALL navigate to the `/audit-log` route using react-router-dom's `Link` component or `useNavigate` hook instead of the current `console.log` stub.

### Requirement 6: Audit Log View State Machine

**User Story:** As a MENRO Admin, I want the Audit Log page to follow the same loading/error/loaded pattern as other pages, so that the experience is consistent across the application.

#### Acceptance Criteria

1. THE Audit_Log_View SHALL maintain a state machine with three states: `loading`, `error`, and `loaded`.
2. WHILE the state is `loading`, THE Audit_Log_View SHALL display a loading indicator.
3. WHILE the state is `error`, THE Audit_Log_View SHALL display an error message describing the failure.
4. WHILE the state is `loaded`, THE Audit_Log_View SHALL display the Ghost_Log_Table or an empty-state message.
5. THE Audit_Log_View SHALL apply `p-6` padding consistent with other page components.

### Requirement 7: Audit Log Data Fetching

**User Story:** As a MENRO Admin, I want the Audit Log to show only cancelled tree tasks, so that I can focus on the audit trail without noise from active records.

#### Acceptance Criteria

1. WHEN the Audit_Log_View mounts, THE Audit_Log_View SHALL fetch Tree_Records from Supabase where `task_status` equals `'Cancelled'`.
2. THE Audit_Log_View SHALL issue exactly one Supabase query on mount with zero mutations (no insert, update, upsert, or delete).
3. IF the Supabase query returns an error, THEN THE Audit_Log_View SHALL transition to the `error` state and display the error message.
4. IF the Supabase query returns an empty array, THEN THE Audit_Log_View SHALL transition to the `loaded` state and display an empty-state message.

### Requirement 8: Ghost Log Table Display

**User Story:** As a MENRO Admin, I want cancelled tree records displayed in a structured table with key fields and a visual cancelled indicator, so that I can quickly audit which tasks were cancelled.

#### Acceptance Criteria

1. THE Ghost_Log_Table SHALL display columns for: Tree ID, Species, Assigned Arborist, and Date Captured/Cancelled.
2. THE Ghost_Log_Table SHALL render one row per cancelled Tree_Record returned by the Supabase query.
3. THE Ghost_Log_Table SHALL display a Cancelled_Badge (red background, "Cancelled" text) on each row.
4. THE Ghost_Log_Table SHALL use Tailwind CSS styling consistent with the existing Master_Data_Table in InventoryView.
5. IF a Tree_Record has a null `assigned_to` field, THEN THE Ghost_Log_Table SHALL display the placeholder character "—" in the Assigned Arborist column.

### Requirement 9: Test Coverage

**User Story:** As a developer, I want comprehensive test coverage for the new and modified components, so that the existing 192-test baseline remains green and new functionality is verified.

#### Acceptance Criteria

1. THE Sidebar test suite SHALL assert that the Sidebar_Navigation renders exactly six navigation links.
2. THE AuditLogView test suite SHALL verify that the component fetches cancelled Tree_Records and renders them in the Ghost_Log_Table.
3. THE AuditLogView test suite SHALL verify the loading, error, and loaded states render correctly.
4. THE InventoryView test suite SHALL assert that QR_Code components from `qrcode.react` are present in the DOM (even if hidden by print-only classes).
5. THE existing 192-test baseline SHALL remain passing after all changes are applied.
6. THE test suites SHALL follow the existing project patterns including the `vi.mock` hoisted spy pattern for Supabase mocking.
