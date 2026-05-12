# Requirements Document

## Introduction

Phase 8 of the Tree Inventory Web App integrates external data sources into the existing Command Center map and tree popup components. This includes rendering Cloudinary-hosted tree photos with graceful error handling, a mock PAGASA Disaster Risk Reduction overlay (typhoon cone of probability), and a mock Urban Heat Island map layer. All integrations use existing dependencies only — standard HTML `<img>` tags for Cloudinary and built-in `react-leaflet` components (`Polygon`, `Circle`) for map overlays.

## Glossary

- **Tree_Record**: A row from the Supabase `trees` table containing tree attributes including `photo_url`, coordinates, species, and hazard flags.
- **TreePinPopup**: The React component (`TreePinPopup.jsx`) that renders the popup body inside a Leaflet Marker for a single tree pin.
- **CommandCenter**: The React page component (`CommandCenter.jsx`) that renders the full-outlet map at the `/map` route.
- **OverlayTogglePanel**: The React component (`OverlayTogglePanel.jsx`) containing two toggle buttons for PAGASA DRR and Urban Heat Island overlays.
- **Cloudinary_Image**: An `<img>` HTML element whose `src` attribute points to a Cloudinary-hosted photo URL from a Tree_Record's `photo_url` field.
- **PAGASA_DRR_Overlay**: A mock typhoon cone of probability rendered as a semi-transparent red `Polygon` from react-leaflet, representing a disaster risk reduction data layer.
- **UHI_Overlay**: A mock Urban Heat Island map rendered as multiple `Circle` components from react-leaflet with varying radii and heat-intensity colors.
- **Signal_Badge**: A floating UI badge displayed on the map indicating an active PAGASA weather signal.

## Requirements

### Requirement 1: Dependency Constraint

**User Story:** As a project maintainer, I want the external integrations to use only existing dependencies, so that the bundle size and dependency tree remain unchanged.

#### Acceptance Criteria

1. THE CommandCenter SHALL render PAGASA_DRR_Overlay and UHI_Overlay using only `Polygon` and `Circle` components imported from the existing `react-leaflet` package, in addition to the already-used `MapContainer`, `TileLayer`, `Marker`, and `Popup` components.
2. THE TreePinPopup SHALL render Cloudinary_Image using a standard HTML `<img>` element without importing any additional image library.
3. WHEN the feature branch is compared to the `main` branch, THE package.json SHALL contain zero new entries and zero removed entries in both `dependencies` and `devDependencies` sections.
4. WHEN the feature branch is compared to the `main` branch, THE package-lock.json SHALL contain no new top-level package additions.

### Requirement 2: Cloudinary Image Rendering

**User Story:** As a field officer, I want to see the actual tree photo in the map popup, so that I can visually identify the tree without visiting the site.

#### Acceptance Criteria

1. WHEN a Tree_Record has a non-null `photo_url`, THE TreePinPopup SHALL render an `<img>` element with `src` set to the `photo_url` value.
2. WHEN a Tree_Record has a non-null `photo_url`, THE TreePinPopup SHALL apply the classes `object-cover w-full h-32 rounded-md` to the `<img>` element.
3. WHEN a Tree_Record has a null `photo_url`, THE TreePinPopup SHALL render a grey placeholder element with `data-testid="tree-photo-placeholder"`.

### Requirement 3: Cloudinary Image Error Handling

**User Story:** As a field officer, I want a graceful fallback when a Cloudinary link is broken, so that the popup remains usable even if the image fails to load.

#### Acceptance Criteria

1. THE TreePinPopup SHALL attach an `onError` handler to the Cloudinary_Image `<img>` element so that image load failures are intercepted before rendering a broken-image icon.
2. WHEN the `<img>` element fires an `error` event (broken Cloudinary link), THE TreePinPopup SHALL replace the image with the grey placeholder element identified by `data-testid="tree-photo-placeholder"`, displaying the text "No photo" and the accessible label "No photo available".
3. WHILE the grey placeholder is displayed due to an image error, THE TreePinPopup SHALL render the placeholder with identical dimensions (full width, 128px height), background color, border radius, and text styling as the placeholder shown when `photo_url` is null.
4. WHEN the `<img>` element fires an `error` event, THE TreePinPopup SHALL continue to display the tree identifier, species, dbh, and (if applicable) the Dispatch Arborist button without modification.

### Requirement 4: PAGASA DRR Overlay Toggle Wiring

**User Story:** As a disaster response coordinator, I want the PAGASA DRR Overlay toggle to control a visible map layer, so that I can visualize typhoon risk zones over the tree inventory.

#### Acceptance Criteria

1. WHEN the "PAGASA DRR Overlay" toggle in OverlayTogglePanel is pressed, THE CommandCenter SHALL render a `Polygon` component from react-leaflet on the map.
2. THE PAGASA_DRR_Overlay Polygon SHALL use a red fill color with an opacity between 0.15 and 0.35, and its coordinate bounds SHALL span a rectangular area that covers the visible map viewport at the default zoom level.
3. WHEN the "PAGASA DRR Overlay" toggle is not pressed, THE CommandCenter SHALL not render the PAGASA_DRR_Overlay Polygon.
4. WHEN the "PAGASA DRR Overlay" toggle is pressed, THE CommandCenter SHALL render a Signal_Badge element containing the text "⚠️ PAGASA SIGNAL NO. 2 ACTIVE" positioned as a fixed overlay within the map container, visible without scrolling.
5. WHEN the "PAGASA DRR Overlay" toggle is not pressed, THE CommandCenter SHALL not render the Signal_Badge.
6. WHEN the "PAGASA DRR Overlay" toggle pressed state changes in OverlayTogglePanel, THE CommandCenter SHALL add or remove the Polygon and Signal_Badge within the same render cycle without requiring a page reload.
7. WHEN the PAGASA_DRR_Overlay Polygon is rendered, THE Polygon SHALL not obstruct interaction with existing tree Marker components on the map (markers remain clickable).

### Requirement 5: Urban Heat Island Map Toggle Wiring

**User Story:** As an urban planner, I want the Urban Heat Island Map toggle to display heat zones on the map, so that I can correlate tree canopy coverage with thermal hotspots.

#### Acceptance Criteria

1. WHEN the "Urban Heat Island Map" toggle in OverlayTogglePanel is pressed, THE CommandCenter SHALL render exactly 3 `Circle` components from react-leaflet on the map, each representing a distinct heat intensity level.
2. THE UHI_Overlay Circles SHALL each use a radius between 300 and 800 meters and a fill color corresponding to one of 3 heat intensity levels: high heat (red-spectrum color), moderate heat (orange-spectrum color), and low heat (yellow-spectrum color).
3. THE UHI_Overlay Circles SHALL be positioned at hardcoded latitude/longitude coordinates within the municipality map bounds (centered near 14.281, 121.411).
4. WHEN the "Urban Heat Island Map" toggle in OverlayTogglePanel is pressed, THE OverlayTogglePanel SHALL communicate the active state to the CommandCenter so that the parent component controls circle rendering.
5. IF the "Urban Heat Island Map" toggle is not pressed, THEN THE CommandCenter SHALL not render any UHI_Overlay Circle components on the map.

### Requirement 6: Overlay State Lifting

**User Story:** As a developer, I want the overlay toggle state to be accessible in CommandCenter, so that the map can conditionally render overlay components based on toggle state.

#### Acceptance Criteria

1. THE OverlayTogglePanel SHALL accept a callback prop for each toggle (PAGASA DRR and UHI) that is invoked with the new boolean state value when the corresponding toggle is activated or deactivated.
2. THE CommandCenter SHALL hold the PAGASA DRR and UHI toggle states, both initialized to false, and pass the current state values and corresponding callback props to OverlayTogglePanel.
3. WHEN a toggle state changes to true in CommandCenter, THE CommandCenter SHALL mount the overlay component mapped to that toggle (PAGASA DRR toggle maps to the PAGASA DRR overlay component; UHI toggle maps to the Urban Heat Island overlay component).
4. WHEN a toggle state changes to false in CommandCenter, THE CommandCenter SHALL unmount the overlay component mapped to that toggle.

### Requirement 7: TreePinPopup Test Coverage

**User Story:** As a developer, I want tests to verify the Cloudinary image rendering and error fallback, so that regressions are caught automatically.

#### Acceptance Criteria

1. WHEN a Tree_Record with a non-null `photo_url` is passed to TreePinPopup, THE TreePinPopup test suite SHALL assert that an `<img>` element is rendered with its `src` attribute equal to the provided `photo_url` value.
2. WHEN a Tree_Record with a null `photo_url` is passed to TreePinPopup, THE TreePinPopup test suite SHALL assert that the grey placeholder (identified by `data-testid="tree-photo-placeholder"`) is rendered and no `<img>` element is present in the component output.
3. WHEN a Tree_Record with a non-null `photo_url` is passed to TreePinPopup and the rendered `<img>` element fires an `error` event, THE TreePinPopup test suite SHALL assert that the `<img>` element is removed from the DOM and the grey placeholder (identified by `data-testid="tree-photo-placeholder"`) is rendered in its place.

### Requirement 8: CommandCenter Overlay Test Coverage

**User Story:** As a developer, I want tests to verify that toggling overlay buttons mounts and unmounts the correct map components, so that overlay behavior is regression-proof.

#### Acceptance Criteria

1. THE CommandCenter test suite SHALL add mock implementations for `Polygon` and `Circle` to the existing react-leaflet mock, where each mock renders a DOM element with `data-testid="polygon"` and `data-testid="circle"` respectively.
2. WHEN the test renders CommandCenter without any user interaction, THE CommandCenter test suite SHALL assert that no elements with `data-testid="polygon"` or `data-testid="circle"` are present in the document.
3. WHEN the test clicks the "PAGASA DRR Overlay" button once, THE CommandCenter test suite SHALL assert that at least 1 element with `data-testid="polygon"` is present in the document.
4. WHEN the test clicks the "Urban Heat Island Map" button once, THE CommandCenter test suite SHALL assert that at least 1 element with `data-testid="circle"` is present in the document.
5. WHEN the test clicks the "PAGASA DRR Overlay" button a second time to deactivate it, THE CommandCenter test suite SHALL assert that zero elements with `data-testid="polygon"` are present in the document.
6. WHEN the test clicks the "Urban Heat Island Map" button a second time to deactivate it, THE CommandCenter test suite SHALL assert that zero elements with `data-testid="circle"` are present in the document.

### Requirement 9: Test Baseline Preservation

**User Story:** As a developer, I want the full test suite to remain green after this feature, so that no existing functionality is broken.

#### Acceptance Criteria

1. WHEN the test command `vitest --run` is executed, THE test runner SHALL report zero failures and zero errors across all existing and new test files.
2. WHEN the test command `vitest --run` is executed, THE test runner SHALL report a total passing test count equal to or greater than 206.
3. THE implementation SHALL NOT modify, remove, or weaken any existing test assertion that currently passes, and SHALL NOT add `.skip`, `.todo`, or conditional logic to bypass existing test cases.
4. WHEN the test command `vitest --run` is executed, THE test runner SHALL report zero skipped or pending tests that were not already skipped prior to the feature implementation.
