# Requirements Document

## Introduction

The Analytics & Reports Engine provides the `/analytics` route with data aggregation capabilities for Carbon Sequestration and Biodiversity metrics. It replaces the placeholder `AnalyticsView.jsx` component with a full-featured analytics page that fetches tree records from Supabase, computes biodiversity distributions and carbon sequestration estimates, and renders the results using native Tailwind CSS progress bars and grouped data tables. No third-party charting libraries are introduced; the existing dependency set remains unchanged.

## Glossary

- **Analytics_Page**: The React component rendered at the `/analytics` route that displays biodiversity and carbon sequestration data.
- **Biodiversity_Dashboard**: The top section of the Analytics_Page displaying species type and tree category distributions as horizontal progress bars.
- **Carbon_Sequestration_Panel**: The bottom section of the Analytics_Page displaying per-barangay grouped carbon calculations in a multi-level table.
- **Aggregation_Engine**: A set of pure functions in `src/lib/` responsible for computing biodiversity counts, parsing DBH values, calculating carbon estimates, and grouping records by barangay.
- **Tree_Record**: A single row from the Supabase `trees` table as defined in `src/types.js`.
- **DBH**: Diameter at Breast Height, stored as a string in the Tree_Record and parsed to a float for carbon calculation.
- **Carbon_Formula**: The Phase 6 stub formula: Carbon (kg) = DBH_float × 1.5.
- **Barangay_Group**: A collection of Tree_Records sharing the same `barangay` field value, used for grouping in the carbon table.
- **Progress_Bar**: A native Tailwind CSS horizontal bar rendered via inline `width` style and utility classes (no charting library).
- **Dependency_Invariant**: The constraint that no new entries may be added to `dependencies` or `devDependencies` in `package.json`.
- **State_Machine_Pattern**: The loading/error/loaded state pattern established in Phase 4 (idle → loading → loaded | error).

## Requirements

### Requirement 1: Component Scaffold and State Management

**User Story:** As a developer, I want the AnalyticsView component to follow the established state machine pattern, so that the analytics page has consistent loading, error, and loaded states matching the rest of the application.

#### Acceptance Criteria

1. WHEN the Analytics_Page mounts, THE Analytics_Page SHALL transition from idle state to loading state and initiate a data fetch.
2. WHEN the data fetch completes successfully, THE Analytics_Page SHALL transition to the loaded state and render the Biodiversity_Dashboard and Carbon_Sequestration_Panel.
3. IF the data fetch returns an error, THEN THE Analytics_Page SHALL transition to the error state and display the error message to the user.
4. WHILE in the loading state, THE Analytics_Page SHALL display a loading indicator to the user.
5. THE Analytics_Page SHALL apply `p-6` padding to its root container element.

### Requirement 2: Data Fetching from Supabase

**User Story:** As a user, I want the analytics page to fetch all tree records on mount, so that I can see aggregated data for the entire tree inventory.

#### Acceptance Criteria

1. WHEN the Analytics_Page mounts, THE Analytics_Page SHALL fetch all records from the Supabase `trees` table using `supabase.from('trees').select('*')`.
2. THE Analytics_Page SHALL execute the fetch exactly once on initial mount.
3. WHEN the fetch resolves with data, THE Analytics_Page SHALL pass the complete array of Tree_Records to the Aggregation_Engine functions.

### Requirement 3: Stacked Layout Structure

**User Story:** As a user, I want the analytics page to have clearly separated sections for biodiversity and carbon data, so that I can quickly find the information I need.

#### Acceptance Criteria

1. WHEN in the loaded state, THE Analytics_Page SHALL render a stacked vertical layout with the Biodiversity_Dashboard positioned above the Carbon_Sequestration_Panel.
2. THE Biodiversity_Dashboard SHALL display a visible heading containing the text "Biodiversity Dashboard".
3. THE Carbon_Sequestration_Panel SHALL display a visible heading containing the text "Carbon Sequestration & Stand Table".

### Requirement 4: Biodiversity Aggregation Function

**User Story:** As a developer, I want a pure function that aggregates tree counts by species type and tree category, so that the biodiversity data can be computed deterministically and tested in isolation.

#### Acceptance Criteria

1. THE Aggregation_Engine SHALL export a pure function that accepts an array of Tree_Records and returns the count of trees grouped by `species_type` (Endemic, Invasive).
2. THE Aggregation_Engine SHALL export a pure function that accepts an array of Tree_Records and returns the count of trees grouped by `tree_category` (Fruit, Timber, Ornamental).
3. WHEN the input array is empty, THE Aggregation_Engine SHALL return zero counts for all groups.
4. FOR ALL valid arrays of Tree_Records, THE Aggregation_Engine SHALL produce group counts whose sum equals the length of the input array for each grouping dimension.

### Requirement 5: Biodiversity Progress Bar Rendering

**User Story:** As a user, I want to see biodiversity distributions as horizontal progress bars, so that I can visually compare species type and category proportions at a glance.

#### Acceptance Criteria

1. WHEN the Biodiversity_Dashboard renders, THE Analytics_Page SHALL display one horizontal Progress_Bar for each species_type value (Endemic, Invasive).
2. WHEN the Biodiversity_Dashboard renders, THE Analytics_Page SHALL display one horizontal Progress_Bar for each tree_category value (Fruit, Timber, Ornamental).
3. THE Analytics_Page SHALL render each Progress_Bar using a `div` element with an inline `width` style set to the percentage of total and a Tailwind background color class.
4. THE Analytics_Page SHALL render Progress_Bars without importing any third-party charting library, preserving the Dependency_Invariant.

### Requirement 6: Download Shapefile Stub

**User Story:** As a user, I want a "Download Shapefile" button in the biodiversity section, so that the UI is ready for future shapefile export functionality.

#### Acceptance Criteria

1. THE Biodiversity_Dashboard SHALL render a button with accessible text "Download Shapefile".
2. WHEN the user clicks the "Download Shapefile" button, THE Analytics_Page SHALL call `console.log` with a message indicating the shapefile download action.

### Requirement 7: Carbon Sequestration Calculation Function

**User Story:** As a developer, I want a pure function that parses DBH strings and calculates carbon sequestration per tree, so that the carbon math is deterministic and testable in isolation.

#### Acceptance Criteria

1. THE Aggregation_Engine SHALL export a pure function that accepts a DBH string and returns the parsed float value.
2. WHEN the DBH string contains a valid numeric value, THE Aggregation_Engine SHALL parse it to a floating-point number using `parseFloat`.
3. IF the DBH string cannot be parsed to a valid number, THEN THE Aggregation_Engine SHALL return `0` as the parsed value.
4. THE Aggregation_Engine SHALL export a pure function that accepts a parsed DBH float and returns the carbon sequestration value calculated as `DBH_float × 1.5`.
5. FOR ALL valid DBH float values, THE Aggregation_Engine SHALL produce a carbon value equal to exactly `DBH_float * 1.5` (the Carbon_Formula).

### Requirement 8: Barangay Grouping Function

**User Story:** As a developer, I want a pure function that groups tree records by barangay and computes per-group carbon totals, so that the grouped table data is deterministic and testable.

#### Acceptance Criteria

1. THE Aggregation_Engine SHALL export a pure function that accepts an array of Tree_Records (each augmented with a computed carbon value) and returns the records grouped strictly by the `barangay` field.
2. WHEN grouping records, THE Aggregation_Engine SHALL compute the total carbon sum for each Barangay_Group.
3. WHEN the input array is empty, THE Aggregation_Engine SHALL return an empty grouping result.
4. FOR ALL valid arrays of Tree_Records, THE Aggregation_Engine SHALL produce groups whose combined record count equals the length of the input array.

### Requirement 9: Carbon Sequestration Multi-Level Table

**User Story:** As a user, I want to see carbon sequestration data grouped by barangay in a multi-level table, so that I can compare carbon estimates across geographic areas.

#### Acceptance Criteria

1. WHEN the Carbon_Sequestration_Panel renders, THE Analytics_Page SHALL display one header row per Barangay_Group containing the barangay name and the total carbon sum for that group.
2. THE Analytics_Page SHALL render each Barangay_Group header row with bold or semibold font weight to distinguish it from sub-rows.
3. WHEN the Carbon_Sequestration_Panel renders, THE Analytics_Page SHALL display sub-rows under each Barangay_Group header showing the tree species, DBH value, and individual carbon value for each tree in that group.
4. THE Analytics_Page SHALL repeat the header-row and sub-rows pattern for every Barangay_Group present in the data.

### Requirement 10: Download DENR Report Stub

**User Story:** As a user, I want a "Download DENR Report (PDF/Excel)" button in the carbon section, so that the UI is ready for future report export functionality.

#### Acceptance Criteria

1. THE Carbon_Sequestration_Panel SHALL render a button with accessible text "Download DENR Report (PDF/Excel)".
2. WHEN the user clicks the "Download DENR Report (PDF/Excel)" button, THE Analytics_Page SHALL call `console.log` with a message indicating the DENR report download action.

### Requirement 11: Unit Testing for Aggregation Functions

**User Story:** As a developer, I want comprehensive unit tests for the aggregation functions, so that I can verify the correctness of biodiversity counts, carbon math, and barangay grouping in isolation.

#### Acceptance Criteria

1. THE test suite SHALL include tests that verify the barangay grouping function correctly groups records by the `barangay` field.
2. THE test suite SHALL include tests that verify the carbon calculation function produces values equal to `DBH_float * 1.5` for valid inputs.
3. THE test suite SHALL include tests that verify the DBH parser returns `0` for non-numeric strings.
4. THE test suite SHALL mock the Supabase fetch using the hoisted `vi.mock` pattern with a diverse set of 4-5 Tree_Records across 2 different barangays.
5. THE test suite SHALL verify that the Biodiversity_Dashboard renders the correct number of Progress_Bars.
6. THE test suite SHALL verify that the Carbon_Sequestration_Panel renders the correct barangay groupings.

### Requirement 12: Dependency Invariant Preservation

**User Story:** As a developer, I want to ensure no new dependencies are added, so that the project maintains its minimal dependency footprint and the 166-test baseline remains green.

#### Acceptance Criteria

1. THE Analytics_Page SHALL render all charts and visualizations using only Tailwind CSS utility classes and inline styles.
2. THE Analytics_Page SHALL import only from modules already present in the project's `dependencies` and `devDependencies`.
3. WHEN the test suite runs after implementation, THE test runner SHALL report all 166 existing tests plus the new analytics tests as passing.
