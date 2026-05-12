# Implementation Plan: Realtime Handshake

## Overview

Replace the four `console.log` stubs (three in ActionBoard.jsx, one in TreePinPopup.jsx) with live Supabase mutations, wire a dispatch handler through CommandCenter to TreePinPopup, and add a Supabase Realtime subscription in CommandCenter so the map reflects database changes without a page reload. Update test mocks to support `update().eq()` chaining and `channel().on().subscribe()` chains.

## Tasks

- [x] 1. Update test mocks to support new Supabase call patterns
  - [x] 1.1 Add `eqSpy` to ActionBoard.test.jsx and wire `updateSpy` to return `{ eq: eqSpy }`
    - In the hoisted spy block, add `const eqSpy = vi.fn()`
    - Change `updateSpy` so it returns `{ eq: eqSpy }`
    - Ensure `insertSpy` does not throw (returns a resolved value or no-op)
    - Reset `eqSpy` in `beforeEach`
    - _Requirements: 8.4_

  - [x] 1.2 Add Realtime channel spies to CommandCenter.test.jsx
    - In the hoisted spy block, add `subscribeSpy`, `onSpy`, `channelSpy`, `removeChannelSpy`
    - `channelSpy` returns `{ on: onSpy }`, `onSpy` returns `{ subscribe: subscribeSpy }`
    - Expand the supabase mock object to include `channel: channelSpy` and `removeChannel: removeChannelSpy`
    - Add `eqSpy` and wire `updateSpy` to return `{ eq: eqSpy }` for dispatch handler tests
    - Reset all new spies in `beforeEach`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2. Implement ActionBoard mutation handlers
  - [x] 2.1 Replace `handleDispatchTeam` console.log with Supabase update call
    - Change the function body to: `supabase.from('trees').update({ assigned_to: 'Juan Dela Cruz' }).eq('id', tree.id)`
    - Fire-and-forget — no await, no error handling
    - Remove the `console.log('Dispatch Team', tree.tree_id)` line
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 2.2 Replace `handleIssuePermit` console.log with Supabase update call
    - Change the function body to: `supabase.from('trees').update({ has_cutting_permit: true }).eq('id', tree.id)`
    - Fire-and-forget — no await, no error handling
    - Remove the `console.log('Issue Permit', tree.tree_id)` line
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.3 Replace `handleSubmitWalkin` console.log with Supabase insert call
    - Replace `console.log(payload)` with `supabase.from('walkin_requests').insert(payload)`
    - Keep existing behavior: `setSubmissionConfirmed(true)` and `setForm(INITIAL_FORM_STATE)` remain after the insert
    - The insert is fire-and-forget; confirmation shows immediately (optimistic)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 2.4 Write property test for Dispatch Team mutation (Property 1)
    - **Property 1: Dispatch Team mutation targets the correct tree**
    - For any valid Tree_Record, when Dispatch Team is clicked, `update` receives `{ assigned_to: 'Juan Dela Cruz' }` and `.eq` receives `('id', tree.id)`
    - Use `treeRecordArb` from `src/test/arbitraries.js` with fast-check
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 2.5 Write property test for Issue Permit mutation (Property 2)
    - **Property 2: Issue Permit mutation targets the correct tree**
    - For any valid Tree_Record, when Issue Permit is clicked, `update` receives `{ has_cutting_permit: true }` and `.eq` receives `('id', tree.id)`
    - Use `treeRecordArb` from `src/test/arbitraries.js` with fast-check
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 2.6 Write property test for Walk-in insert payload (Property 3)
    - **Property 3: Walk-in insert payload matches form fields**
    - For any combination of form field values, when the form is submitted, `insert` receives a payload with exactly `client_name`, `contact_info`, `reason`, `latitude`, `longitude` matching the form values
    - Generate arbitrary strings for each form field with fast-check
    - **Validates: Requirements 3.1, 3.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement TreePinPopup dispatch prop and CommandCenter wiring
  - [x] 4.1 Add `onDispatchArborist` prop to TreePinPopup
    - Add `onDispatchArborist` to `TreePinPopup.propTypes` as `PropTypes.func` (not `.isRequired`)
    - Replace the "Dispatch Arborist" button's `onClick` from `console.log(...)` to `onDispatchArborist(tree)`
    - Guard the call: only invoke if `onDispatchArborist` is provided (since prop is optional)
    - _Requirements: 4.3, 4.4_

  - [x] 4.2 Add `handleDispatchArborist` to CommandCenter and pass to TreePinPopup
    - Define `handleDispatchArborist(tree)` that calls `supabase.from('trees').update({ assigned_to: 'Juan Dela Cruz' }).eq('id', tree.id)`
    - Pass `onDispatchArborist={handleDispatchArborist}` to `<TreePinPopup>` in the Marker/Popup render
    - Fire-and-forget — no await, no error handling
    - _Requirements: 4.1, 4.2_

  - [ ]* 4.3 Write property test for Dispatch Arborist from map (Property 4)
    - **Property 4: Dispatch Arborist from map targets the correct tree**
    - For any valid Tree_Record rendered as a Red pin, when "Dispatch Arborist" is clicked, `update` receives `{ assigned_to: 'Juan Dela Cruz' }` and `.eq` receives `('id', tree.id)`
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 5. Implement Realtime subscription in CommandCenter
  - [x] 5.1 Add Realtime subscription useEffect to CommandCenter
    - Add a second `useEffect` (separate from the fetch effect) that on mount calls: `const channel = supabase.channel('custom-all-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'trees' }, handleRealtimePayload).subscribe()`
    - On unmount (cleanup return): `supabase.removeChannel(channel)`
    - _Requirements: 5.1, 5.4, 5.5_

  - [x] 5.2 Implement `handleRealtimePayload` in CommandCenter
    - `payload.eventType === 'UPDATE'`: find tree by `payload.new.id` in state, replace with `payload.new`
    - `payload.eventType === 'INSERT'`: append `payload.new` to trees array
    - Other event types (DELETE): ignored (no-op)
    - Guard against missing `payload.new` with early return
    - _Requirements: 5.2, 5.3_

  - [ ]* 5.3 Write property test for Realtime UPDATE (Property 5)
    - **Property 5: Realtime UPDATE replaces the matching tree in state**
    - For any initial array of Tree_Records and any UPDATE payload whose `payload.new.id` matches a tree in that array, after the callback fires, local state contains `payload.new` in place of the original and all other trees remain unchanged
    - Capture the `on` callback from `onSpy` and invoke it with a generated payload
    - **Validates: Requirements 5.2**

  - [ ]* 5.4 Write property test for Realtime INSERT (Property 6)
    - **Property 6: Realtime INSERT appends the new tree to state**
    - For any initial array of Tree_Records and any INSERT payload, after the callback fires, local state contains all original trees plus `payload.new` appended, and array length increases by exactly one
    - **Validates: Requirements 5.3**

  - [ ]* 5.5 Write example tests for subscription setup and cleanup
    - Assert `channelSpy` is called with `'custom-all-channel'` on mount
    - Assert `onSpy` is called with `'postgres_changes'` and the correct filter object
    - Assert `subscribeSpy` is called
    - Assert `removeChannelSpy` is called on unmount (via `cleanup()` or `unmount()`)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all 213 existing tests still pass alongside the new tests.
  - _Requirements: 9.1, 9.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit/example tests validate specific wiring (subscription setup, cleanup, prop passing)
- All mutations are fire-and-forget in V1 — no await, no error handling
- The `onDispatchArborist` prop is optional (not `.isRequired`) so existing renders don't break
- The Realtime subscription is a separate useEffect from the existing fetch effect
- No new dependencies are introduced — only the existing `@supabase/supabase-js` singleton is used

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "4.1"] },
    { "id": 2, "tasks": ["2.4", "2.5", "2.6", "4.2"] },
    { "id": 3, "tasks": ["4.3", "5.1"] },
    { "id": 4, "tasks": ["5.2"] },
    { "id": 5, "tasks": ["5.3", "5.4", "5.5"] }
  ]
}
```
