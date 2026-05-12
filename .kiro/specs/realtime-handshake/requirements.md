# Requirements Document

## Introduction

Phase 9 of the Tree Inventory Web App replaces console.log stubs in ActionBoard.jsx, CommandCenter.jsx, and TreePinPopup.jsx with live Supabase mutations, and adds a Supabase Realtime WebSocket subscription in CommandCenter.jsx so the map reflects database changes without a page reload. No new dependencies are introduced — the existing `@supabase/supabase-js` singleton is the sole integration surface. All existing 213 tests must remain green with updated mocks that cover the new Supabase calls.

## Glossary

- **Supabase_Client**: The singleton instance exported from `supabaseClient.js`, created via `createClient` from `@supabase/supabase-js`.
- **ActionBoard**: The React page component at `/action-board` that displays hazard dispatch tickets and a walk-in request form.
- **CommandCenter**: The React page component at `/map` that renders an OpenStreetMap base with color-coded tree pins.
- **TreePinPopup**: The React component rendered inside each map marker popup, showing tree details and (for Red pins) a Dispatch Arborist button.
- **Dispatch_Team_Handler**: The function invoked when the "Dispatch Team" button is clicked on a hazard ticket card in ActionBoard.
- **Issue_Permit_Handler**: The function invoked when the "Issue Permit" button is clicked on a hazard ticket card in ActionBoard.
- **Submit_Walkin_Handler**: The function invoked when the walk-in request form is submitted in ActionBoard.
- **Dispatch_Arborist_Handler**: The function invoked when the "Dispatch Arborist" button is clicked in TreePinPopup on the map.
- **Realtime_Subscription**: A Supabase Realtime channel that listens for postgres_changes on the `trees` table and updates local component state.
- **Tree_Record**: A single row from the Supabase `trees` table.
- **Walkin_Payload**: The object constructed from the walk-in form fields (`client_name`, `contact_info`, `reason`, `latitude`, `longitude`).
- **Mock_Arborist_Name**: The hardcoded string `'Juan Dela Cruz'` used as the `assigned_to` value for V1 dispatch operations.

## Requirements

### Requirement 1: Dispatch Team Mutation

**User Story:** As a MENRO Admin, I want the "Dispatch Team" button to assign an arborist to a hazardous tree in the database, so that the dispatch is persisted and visible to other users.

#### Acceptance Criteria

1. WHEN the Dispatch_Team_Handler is invoked with a Tree_Record, THE ActionBoard SHALL execute `supabase.from('trees').update({ assigned_to: 'Juan Dela Cruz' }).eq('id', tree.id)` against the Supabase_Client.
2. THE Dispatch_Team_Handler SHALL use the Mock_Arborist_Name as the `assigned_to` value.
3. THE Dispatch_Team_Handler SHALL pass the `tree.id` field to the `.eq('id', ...)` filter.

### Requirement 2: Issue Permit Mutation

**User Story:** As a MENRO Admin, I want the "Issue Permit" button to mark a tree's cutting permit as issued in the database, so that the permit status is persisted.

#### Acceptance Criteria

1. WHEN the Issue_Permit_Handler is invoked with a Tree_Record, THE ActionBoard SHALL execute `supabase.from('trees').update({ has_cutting_permit: true }).eq('id', tree.id)` against the Supabase_Client.
2. THE Issue_Permit_Handler SHALL set `has_cutting_permit` to the boolean value `true`.
3. THE Issue_Permit_Handler SHALL pass the `tree.id` field to the `.eq('id', ...)` filter.

### Requirement 3: Submit Walk-in Request Mutation

**User Story:** As a MENRO Admin, I want the walk-in request form submission to insert a record into the database, so that public requests are logged for processing.

#### Acceptance Criteria

1. WHEN the Submit_Walkin_Handler is invoked, THE ActionBoard SHALL execute `supabase.from('walkin_requests').insert(payload)` where `payload` is the Walkin_Payload constructed from the form fields.
2. THE Submit_Walkin_Handler SHALL construct the Walkin_Payload with exactly the keys `client_name`, `contact_info`, `reason`, `latitude`, and `longitude`.
3. WHEN the insert call completes, THE ActionBoard SHALL display the "Request Logged" confirmation message.
4. WHEN the insert call completes, THE ActionBoard SHALL reset the form fields to their initial empty-string values.

### Requirement 4: Dispatch Arborist from Map Popup

**User Story:** As a MENRO Admin, I want the "Dispatch Arborist" button in the map popup to assign an arborist to the tree in the database, so that I can dispatch directly from the map view.

#### Acceptance Criteria

1. THE CommandCenter SHALL define a dispatch handler function that executes `supabase.from('trees').update({ assigned_to: 'Juan Dela Cruz' }).eq('id', tree.id)`.
2. THE CommandCenter SHALL pass the dispatch handler to TreePinPopup as an `onDispatchArborist` prop.
3. WHEN the "Dispatch Arborist" button is clicked, THE TreePinPopup SHALL invoke the `onDispatchArborist` callback with the current Tree_Record.
4. THE TreePinPopup SHALL accept an `onDispatchArborist` prop of type function.

### Requirement 5: Realtime Subscription for Tree Updates

**User Story:** As a MENRO Admin, I want the Command Center map to reflect database changes in real time without a page reload, so that I see the latest tree statuses as other users make updates.

#### Acceptance Criteria

1. WHEN the CommandCenter mounts, THE CommandCenter SHALL subscribe to Supabase Realtime using `supabase.channel('custom-all-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'trees' }, callback).subscribe()`.
2. WHEN a Realtime payload with event type UPDATE arrives, THE CommandCenter SHALL find the matching Tree_Record in local state by `payload.new.id` and replace it with `payload.new`.
3. WHEN a Realtime payload with event type INSERT arrives, THE CommandCenter SHALL append `payload.new` to the local trees state array.
4. WHEN the CommandCenter unmounts, THE CommandCenter SHALL clean up the subscription by calling `supabase.removeChannel(channel)`.
5. THE Realtime_Subscription SHALL listen to all event types (`event: '*'`) on the `public` schema, `trees` table.

### Requirement 6: No New Dependencies

**User Story:** As a developer, I want this feature to use only the existing `@supabase/supabase-js` package, so that the bundle size and dependency surface remain unchanged.

#### Acceptance Criteria

1. THE implementation SHALL use only the Supabase_Client singleton exported from `supabaseClient.js`.
2. THE implementation SHALL add zero new entries to `package.json` dependencies or devDependencies.

### Requirement 7: Test Mock Updates for Supabase Channel

**User Story:** As a developer, I want the test mocks to properly stub `supabase.channel` and its chained methods, so that tests do not crash when components subscribe to Realtime.

#### Acceptance Criteria

1. THE CommandCenter test file SHALL stub `supabase.channel` as a function that returns an object with an `on` method.
2. THE `on` method stub SHALL return an object with a `subscribe` method.
3. THE `subscribe` method stub SHALL return a channel reference.
4. THE test mock SHALL stub `supabase.removeChannel` as a no-op function.
5. WHEN CommandCenter mounts in a test, THE test SHALL assert that `supabase.channel` is called.

### Requirement 8: Test Assertions for ActionBoard Mutations

**User Story:** As a developer, I want tests to verify that the ActionBoard mutation handlers call Supabase with the correct arguments, so that regressions in mutation logic are caught.

#### Acceptance Criteria

1. WHEN the "Dispatch Team" button is clicked in a test, THE ActionBoard test SHALL assert that `supabase.from('trees')` is called and `update` is invoked with `{ assigned_to: 'Juan Dela Cruz' }`.
2. WHEN the "Issue Permit" button is clicked in a test, THE ActionBoard test SHALL assert that `supabase.from('trees')` is called and `update` is invoked with `{ has_cutting_permit: true }`.
3. WHEN the walk-in form is submitted in a test, THE ActionBoard test SHALL assert that `supabase.from('walkin_requests')` is called and `insert` is invoked with the Walkin_Payload.
4. THE update spy in ActionBoard tests SHALL return an object with an `.eq()` method to support chaining.

### Requirement 9: Test Baseline Preservation

**User Story:** As a developer, I want all 213 existing tests to continue passing after these changes, so that no regressions are introduced.

#### Acceptance Criteria

1. WHEN the full test suite is executed, THE test runner SHALL report all 213 previously passing tests as passing.
2. THE test updates SHALL only add new assertions or update mocks without removing or weakening existing test coverage.
