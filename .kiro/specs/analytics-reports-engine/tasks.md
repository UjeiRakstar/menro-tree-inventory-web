# Implementation Plan: Analytics & Reports Engine

## Overview

This plan implements the Analytics & Reports Engine feature by first building the pure aggregation functions in `src/lib/analyticsEngine.js`, then replacing the placeholder `AnalyticsView.jsx` with a full data-driven analytics page. The approach validates core logic early through property tests, then wires the UI components together with Supabase data fetching.

## Tasks

- [x] 1. Create aggregation engine with pure functions
  - [x] 1.1 Create `src/lib/analyticsEngine.js` with all exported pure functions
    - Implement `countBySpeciesType(trees)` — counts Endemic vs Invasive
    - Implement `countByTreeCategory(trees)` — counts Fruit, Timber, Ornamental, Other
    - Implement `parseDbh(dbhString)` — parses DBH string to float, returns 0 for invalid
    - Implement `computeCarbon(dbhFloat)` — returns `dbhFloat * 1.5`
    - Implement `groupByBarangay(trees)` — groups records by barangay, computes per-group carbon totals
    - Implement `computePercentage(count, total)` — returns percentage, 0 when total is 0
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 1.2 Write property test: Species type count partition (Property 1)
    - **Property 1: Species type count partition**
    - Verify sum of Endemic + Invasive counts equals input array length
    - Verify each count matches the number of records with that species_type
    - **Validates: Requirements 4.1, 4.3, 4.4**

  - [ ]* 1.3 Write property test: Tree category count partition (Property 2)
    - **Property 2: Tree category count partition**
    - Verify sum of all category counts equals input array length
    - Verify unrecognized/missing tree_category values counted under 'Other'
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [ ]* 1.4 Write property test: DBH parsing correctness (Property 3)
    - **Property 3: DBH parsing correctness**
    - Verify parseDbh returns parseFloat(s) when result is finite, 0 otherwise
    - **Validates: Requirements 7.1, 7.2, 7.3**

  - [ ]* 1.5 Write property test: Carbon formula correctness (Property 4)
    - **Property 4: Carbon formula correctness**
    - Verify computeCarbon(d) returns exactly d * 1.5 for any non-negative finite float
    - **Validates: Requirements 7.4, 7.5**

  - [ ]* 1.6 Write property test: Barangay grouping partition (Property 5)
    - **Property 5: Barangay grouping partition**
    - Verify every record appears in exactly one group
    - Verify sum of group record counts equals input array length
    - Verify records with null/undefined barangay grouped under 'Unknown'
    - **Validates: Requirements 8.1, 8.3, 8.4**

  - [ ]* 1.7 Write property test: Barangay group carbon sum (Property 6)
    - **Property 6: Barangay group carbon sum**
    - Verify each group's totalCarbon equals sum of computeCarbon(parseDbh(record.dbh)) for all records in that group
    - **Validates: Requirements 8.2**

- [x] 2. Checkpoint - Verify aggregation engine
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Extend test arbitraries for analytics
  - [x] 3.1 Add analytics-specific arbitraries to `src/test/arbitraries.js`
    - Add `treeRecordWithCategoryArb` — includes optional `tree_category` field
    - Add `treeRecordWithBarangayArb` — includes optional `barangay` field
    - Add `treeRecordFullArb` — combines both additional fields
    - Add `numericDbhStringArb` — generates valid numeric DBH strings
    - Add `nonNumericDbhStringArb` — generates non-parseable strings
    - _Requirements: 4.1, 4.2, 7.1, 8.1_

- [x] 4. Implement AnalyticsView page component
  - [x] 4.1 Replace placeholder `src/pages/AnalyticsView.jsx` with state machine and Supabase fetch
    - Implement `idle → loading → loaded | error` state machine
    - Fetch all records from Supabase `trees` table on mount using `supabase.from('trees').select('*')`
    - Include cancellation guard for unmount during fetch
    - Apply `p-6` padding to root container
    - Render loading indicator with `role="status"` when loading
    - Render error alert with `role="alert"` and error message when error
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3_

  - [x] 4.2 Implement Biodiversity Dashboard section
    - Render "Biodiversity Dashboard" heading
    - Call `countBySpeciesType` and `countByTreeCategory` with fetched trees
    - Render horizontal progress bars for Endemic and Invasive counts
    - Render horizontal progress bars for Fruit, Timber, and Ornamental counts
    - Use inline `width` style with percentage and Tailwind `bg-*` classes
    - Render "Download Shapefile" button that logs to console on click
    - _Requirements: 3.1, 3.2, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2_

  - [x] 4.3 Implement Carbon Sequestration Panel section
    - Render "Carbon Sequestration & Stand Table" heading
    - Call `parseDbh`, `computeCarbon`, and `groupByBarangay` with fetched trees
    - Render multi-level table with header row per barangay group (bold/semibold, showing barangay name + total carbon)
    - Render sub-rows under each group header showing species, DBH, and individual carbon value
    - Render "Download DENR Report (PDF/Excel)" button that logs to console on click
    - _Requirements: 3.1, 3.3, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2_

- [x] 5. Checkpoint - Verify page renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Write component tests for AnalyticsView
  - [x] 6.1 Create `src/pages/AnalyticsView.test.jsx` with component render tests
    - Mock Supabase using hoisted `vi.mock` pattern with 4-5 diverse Tree_Records across 2 barangays
    - Test loading state renders loading indicator
    - Test error state renders error alert with message
    - Test loaded state renders Biodiversity Dashboard heading and Carbon Sequestration heading
    - Verify correct number of progress bars rendered
    - Verify barangay group headers and sub-rows rendered correctly
    - Verify "Download Shapefile" button presence and click handler
    - Verify "Download DENR Report (PDF/Excel)" button presence and click handler
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All visualizations use Tailwind CSS only — no new dependencies allowed (Dependency_Invariant)
- The `fast-check` library is already in devDependencies and used in existing tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "1.7"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["6.1"] }
  ]
}
```
