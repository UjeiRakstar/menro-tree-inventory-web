# Implementation Plan: Audit Trail & QR Stickers

## Overview

Phase 7 adds two capabilities to the Tree Inventory Web App: (1) a Batch QR Sticker Generator that renders printable credit-card-sized QR stickers using `qrcode.react` and native `window.print()`, and (2) an Audit Log View at `/audit-log` that displays cancelled tree records. The implementation wires existing UI stubs in InventoryView and ActionBoard to their real implementations, adds a 6th sidebar nav item, and registers the new route.

## Tasks

- [x] 1. Install dependency and set up routing infrastructure
  - [x] 1.1 Install `qrcode.react` and register the `/audit-log` route in App.jsx
    - Run `npm install qrcode.react` to add the only new production dependency
    - Create `src/pages/AuditLogView.jsx` as an empty placeholder component (export default function returning a `<section>` with heading)
    - Import `AuditLogView` in `src/App.jsx` and add `<Route path="audit-log" element={<AuditLogView />} />` inside the Shell route
    - _Requirements: 1.1, 1.2, 5.1_

  - [x] 1.2 Add Audit Log entry to Sidebar navigation
    - Import `History` icon from `lucide-react` in `src/components/Sidebar.jsx`
    - Add 6th entry to `NAV_ITEMS` array: `{ to: '/audit-log', label: 'Audit Log', Icon: History }`
    - Verify the sidebar now renders exactly 6 navigation links
    - _Requirements: 5.2, 5.3_

  - [x] 1.3 Wire ActionBoard audit trail button to navigate to `/audit-log`
    - Import `useNavigate` from `react-router-dom` in `src/pages/ActionBoard.jsx`
    - Replace the `handleAuditTrail` console.log stub with `navigate('/audit-log')`
    - Change the `<button>` element to use `useNavigate` or replace with a `<Link>` component
    - _Requirements: 5.4_

- [x] 2. Implement AuditLogView with state machine and data fetching
  - [x] 2.1 Implement AuditLogView component with loading/error/loaded states
    - Implement the full `AuditLogView` component in `src/pages/AuditLogView.jsx`
    - Add state machine with `status` ('loading' | 'error' | 'loaded'), `trees` (array), and `errorMessage` (string)
    - Add `useEffect` on mount that fetches from Supabase: `supabase.from('trees').select('*').eq('task_status', 'Cancelled')`
    - Implement `cancelled` flag pattern to prevent setState after unmount
    - Handle error case: transition to `error` state with error message
    - Handle non-array data: guard with `Array.isArray(data) ? data : []`
    - Render loading indicator while `status === 'loading'`
    - Render error message while `status === 'error'`
    - Render empty-state message "No cancelled records found." when loaded with empty array
    - Apply `p-6` padding consistent with other page components
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4_

  - [x] 2.2 Implement Ghost Log Table in AuditLogView
    - Render a Tailwind-styled data table with columns: Tree ID, Species, Assigned Arborist, Date Captured/Cancelled
    - Render one row per cancelled Tree_Record
    - Display a red Cancelled_Badge (`bg-red-50 text-red-700`, text "Cancelled") on each row
    - Display "—" placeholder when `assigned_to` is null
    - Style table consistent with the Master_Data_Table in InventoryView (same border, shadow, divide patterns)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 3. Checkpoint - Ensure audit log route works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement QR Sticker Sheet in InventoryView
  - [x] 4.1 Replace handlePrintQr stub with `window.print()` and add QR sticker sheet
    - Import `QRCodeSVG` from `qrcode.react` in `src/pages/InventoryView.jsx`
    - Replace the `handlePrintQr` console.log stub body with `window.print()`
    - Add a QR_Sticker_Sheet `<div className="hidden print:block">` at the bottom of the InventoryView component (after the table section)
    - Use CSS Grid layout (`grid grid-cols-[repeat(auto-fill,85mm)]`) to arrange sticker cells
    - Map each tree record to a QR_Sticker cell (~85mm × 54mm)
    - Each sticker contains: LGU_Logo_Placeholder div, Tree_ID_Label ("Tree ID: {tree_id}" or "Tree ID: —" for null), and `<QRCodeSVG value={tree.tree_id ?? ''} size={80} />`
    - Retain existing button text "Print QR Stickers (A4)", placement, and styling
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. Checkpoint - Ensure QR sticker sheet renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Write tests for new and modified components
  - [x] 6.1 Update Sidebar test to assert 6 navigation links
    - In `src/components/Sidebar.test.jsx`, update the assertion to verify exactly 6 nav links are rendered
    - Assert the `/audit-log` link is present with label "Audit Log"
    - _Requirements: 9.1_

  - [x] 6.2 Write AuditLogView unit tests
    - Create `src/pages/AuditLogView.test.jsx`
    - Use the `vi.mock` hoisted spy pattern for Supabase mocking (with `.eq` chain)
    - Test loading state renders loading indicator
    - Test error state renders error message
    - Test loaded state renders Ghost_Log_Table with correct columns and data
    - Test empty state renders "No cancelled records found." message
    - Test that Supabase is called with `.eq('task_status', 'Cancelled')`
    - Test that null `assigned_to` renders "—" placeholder
    - _Requirements: 9.2, 9.3, 9.6_

  - [x] 6.3 Add QR sticker tests to InventoryView test suite
    - In `src/pages/Inventory.test.jsx`, add tests asserting QRCodeSVG components are present in the DOM
    - Mock `qrcode.react` module to render a testable element
    - Test that `window.print()` is called when the print button is clicked
    - Test that button text remains "Print QR Stickers (A4)"
    - _Requirements: 9.4, 9.5_

  - [x] 6.4 Add ActionBoard navigation test
    - In `src/pages/ActionBoard.test.jsx`, add test verifying the audit trail button navigates to `/audit-log`
    - Assert no console.log is called on button click
    - _Requirements: 9.5_

  - [x] 6.5 Add App routing test for `/audit-log`
    - In `src/App.test.jsx`, add test verifying `/audit-log` path renders AuditLogView
    - _Requirements: 9.5_

  - [ ]* 6.6 Write property test: QR sticker count equals tree record count
    - **Property 1: QR sticker count equals tree record count**
    - Generate random-length arrays using `treeRecordArb` from `src/test/arbitraries.js`
    - Render QR sticker sheet and assert sticker count equals array length
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 3.4**

  - [ ]* 6.7 Write property test: QR sticker content correctness
    - **Property 2: QR sticker content correctness**
    - Generate single `treeRecordArb` with nullable `tree_id`
    - Render sticker and assert: LGU logo placeholder present, correct label text ("Tree ID: {id}" or "Tree ID: —"), correct QR value (tree_id or empty string)
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5**

  - [ ]* 6.8 Write property test: Ghost Log table row count with Cancelled badge
    - **Property 3: Ghost Log table row count with Cancelled badge**
    - Generate random-length arrays of `treeRecordArb` with `task_status='Cancelled'`
    - Render Ghost_Log_Table and assert row count equals array length and each row has Cancelled badge
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 8.2, 8.3**

  - [ ]* 6.9 Write property test: Null assigned_to renders placeholder
    - **Property 4: Null assigned_to renders placeholder**
    - Generate `treeRecordArb` with `assigned_to = null`
    - Render Ghost Log row and assert "—" in Assigned Arborist column
    - Minimum 100 iterations with fast-check
    - **Validates: Requirements 8.5**

- [x] 7. Final checkpoint - Ensure all tests pass and baseline is green
  - Ensure all existing 192 tests plus new tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The only new production dependency is `qrcode.react` — no PDF libraries allowed
- All Supabase mocking follows the existing `vi.mock` hoisted spy pattern
- The QR sticker sheet uses `hidden print:block` Tailwind classes for screen/print separation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "4.1"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["6.1", "6.3", "6.4", "6.5"] },
    { "id": 5, "tasks": ["6.2", "6.6", "6.7"] },
    { "id": 6, "tasks": ["6.8", "6.9"] }
  ]
}
```
