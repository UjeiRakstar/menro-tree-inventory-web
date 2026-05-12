# Requirements Document

## Introduction

Phase 2 of the Mission Control Dashboard replaces the `/map` route's Phase 1 placeholder with the Command_Center_Map: a production-ready interactive Leaflet map that renders every Tree_Record from the Supabase `trees` table as a color-coded marker, with click-through popups showing each tree's key attributes and, for unassigned hazards, a Dispatch Arborist action. Phase 2 also adds two floating, glassmorphism overlay-toggle buttons on the top right of the map as UI-only placeholders for future PAGASA DRR and Urban Heat Island layers.

Phase 2 is an Admin-only view: the web application displays all field activity from all arborists, unfiltered. Phase 2 does NOT implement the real Dispatch workflow, real overlay data layers, or any write-back to Supabase — those are reserved for later phases.

Phase 2 MUST preserve every test that passed at the end of Phase 1. Because `react-leaflet` and `leaflet` touch browser APIs that Vitest's jsdom environment does not provide, Phase 2 MUST also introduce a `vi.mock('react-leaflet', ...)` replacement so the Command_Center_Map can be rendered under test without loading real Leaflet.

## Glossary

- **Mission_Control_Dashboard**: The web application introduced in Phase 1.
- **App_Shell**: The persistent Sidebar + Header + main content outlet layout delivered by Phase 1.
- **Command_Center_Map**: The Phase 2 interactive map component rendered at the `/map` Route, replacing the Phase 1 `CommandCenter` placeholder.
- **Map_Container**: The `react-leaflet` `MapContainer` instance that hosts the Tile_Layer and Tree_Pins.
- **Tile_Layer**: The OpenStreetMap raster tile layer rendered as the base map.
- **Map_Center**: The geographic coordinate the Map_Container centers on at initial render — latitude `14.2810`, longitude `121.4110` (Santa Cruz, Laguna, Philippines).
- **Tree_Record**: A single row in the Supabase `trees` table, conforming to the `TreeRecordPropType` shape defined in `src/types.js`.
- **Supabase_Client**: The singleton `@supabase/supabase-js` instance exported by `src/supabaseClient.js`.
- **Tree_Pin**: A colored marker rendered on the Map_Container for a single Tree_Record at its `(latitude, longitude)`.
- **Pin_Popup**: A styled popup attached to a Tree_Pin that displays tree attributes when the pin is activated.
- **Pin_Color**: The classification of a Tree_Pin's visible color. Allowed values are exactly `Red`, `Orange`, `Yellow`, and `Green`.
- **Hazard_Flags**: The four boolean fields on a Tree_Record that signal physical risk — `is_leaning`, `has_powerline_conflict`, `is_decayed`, `is_root_problem`.
- **Hazard_Detected**: True when at least one Hazard_Flag on a Tree_Record is `true`; false otherwise.
- **Dispatch_Arborist_Button**: A button rendered inside a Pin_Popup only for pins whose classified Pin_Color is `Red`.
- **Overlay_Toggle**: A floating button rendered on top of the Map_Container that toggles its own pressed state on click. Phase 2 renders exactly two: `PAGASA_DRR_Toggle` and `Urban_Heat_Island_Toggle`.
- **Phase_2_Test_Suite**: The Vitest test files that cover the Command_Center_Map plus the Phase 1 tests that must continue to pass.

## Requirements

### Requirement 1: Map Library Dependencies

**User Story:** As a developer, I want `react-leaflet` and `leaflet` installed as runtime dependencies, so that the Command_Center_Map can render a real interactive map.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL declare `react-leaflet` as a runtime dependency in `package.json`.
2. THE Mission_Control_Dashboard SHALL declare `leaflet` as a runtime dependency in `package.json`.
3. THE Command_Center_Map SHALL import Leaflet's default stylesheet `leaflet/dist/leaflet.css` so that map tiles and marker anchors render correctly in production.

### Requirement 2: Base Map Rendering

**User Story:** As an arborist dispatcher, I want the `/map` route to show a full-size interactive map centered on our service area, so that I can see the whole field of operations at a glance.

#### Acceptance Criteria

1. WHEN a user navigates to the `/map` Route, THE Command_Center_Map SHALL render a Map_Container that fills the entire main content outlet of the App_Shell edge-to-edge.
2. THE Map_Container SHALL initialize its center at latitude `14.2810` and longitude `121.4110`.
3. THE Map_Container SHALL initialize with a zoom level between `13` and `15` inclusive so that a municipality-scale area of Santa Cruz, Laguna, Philippines is visible at first render.
4. THE Command_Center_Map SHALL render an OpenStreetMap Tile_Layer as the base layer of the Map_Container.
5. THE Command_Center_Map SHALL preserve the App_Shell so that the Sidebar and the Header remain visible alongside and above the Map_Container.
6. THE Command_Center_Map SHALL suppress any inherited padding from the App_Shell's shared `<main>` container on the `/map` Route so the Map_Container extends to the edges of the main content outlet.

### Requirement 3: Tree Data Fetching

**User Story:** As an arborist dispatcher, I want the map to display every tree recorded by field arborists, so that I have a live picture of all field activity.

#### Acceptance Criteria

1. WHEN the Command_Center_Map mounts, THE Command_Center_Map SHALL issue a read query against the Supabase `trees` table using the Supabase_Client singleton.
2. THE Command_Center_Map SHALL treat each row returned by the Supabase query as a Tree_Record conforming to the `TreeRecordPropType` shape defined in `src/types.js`.
3. WHILE the Supabase query is in flight, THE Command_Center_Map SHALL render a loading indicator overlaid on the Map_Container.
4. WHEN the Supabase query succeeds with zero rows, THE Command_Center_Map SHALL render the Map_Container with no Tree_Pins and no error message.
5. IF the Supabase query fails, THEN THE Command_Center_Map SHALL render a visible error message that names the failure and SHALL continue to render the Map_Container without Tree_Pins.
6. IF a returned row has a non-finite `latitude` or a non-finite `longitude`, THEN THE Command_Center_Map SHALL skip rendering a Tree_Pin for that row.
7. THE Command_Center_Map SHALL NOT issue any Supabase write, update, or delete against the `trees` table in Phase 2.

### Requirement 4: Tree Pin Color Classification

**User Story:** As an arborist dispatcher, I want each tree's pin color to communicate its operational status at a glance, so that I can spot unassigned hazards without reading every popup.

> **Precedence decision flagged for review.** The original rules describe Yellow (`has_cutting_permit`) as independent from the hazard-based Red/Orange/Green categories, so a tree may satisfy both a hazard rule and the cutting-permit rule simultaneously. This requirement resolves the ambiguity by applying **Red > Orange > Yellow > Green** precedence, so an unassigned hazard always renders as Red regardless of cutting-permit status, a dispatched hazard always renders as Orange, and Yellow only appears for trees with no hazards. If the intended precedence is different (for example, Yellow overriding because a cutting permit dominates dispatch priority), this requirement should be revised before implementation.

#### Acceptance Criteria

1. THE Command_Center_Map SHALL classify each Tree_Record into exactly one Pin_Color using the precedence `Red` first, then `Orange`, then `Yellow`, then `Green`.
2. WHEN a Tree_Record's Hazard_Detected is `true` AND `assigned_to` is `null`, THE Command_Center_Map SHALL classify that Tree_Record as Pin_Color `Red`.
3. WHEN a Tree_Record's Hazard_Detected is `true` AND `assigned_to` is NOT `null`, THE Command_Center_Map SHALL classify that Tree_Record as Pin_Color `Orange`.
4. WHEN a Tree_Record's Hazard_Detected is `false` AND `has_cutting_permit` is `true`, THE Command_Center_Map SHALL classify that Tree_Record as Pin_Color `Yellow`.
5. WHEN a Tree_Record's Hazard_Detected is `false` AND `has_cutting_permit` is `false`, THE Command_Center_Map SHALL classify that Tree_Record as Pin_Color `Green`.

### Requirement 5: Tree Pin Rendering

**User Story:** As an arborist dispatcher, I want pins that clearly stand out in their assigned color, so that I can distinguish tree states at the map's initial zoom level.

#### Acceptance Criteria

1. THE Command_Center_Map SHALL render one Tree_Pin per Tree_Record whose `latitude` and `longitude` are finite numbers, anchored at that Tree_Record's `(latitude, longitude)`.
2. THE Command_Center_Map SHALL render each Tree_Pin as a custom colored marker whose visible color matches the Tree_Record's classified Pin_Color.
3. THE Command_Center_Map SHALL use a visually distinct hue for each of the four Pin_Color values so that all four are distinguishable at the default zoom level defined in Requirement 2.3.
4. THE Command_Center_Map SHALL assign each Tree_Pin a stable React key derived from the Tree_Record's `id` field so that React can reconcile the pin set without key-collision warnings when the dataset changes.
5. THE Command_Center_Map SHALL NOT use Leaflet's default blue teardrop marker for Tree_Pins.

### Requirement 6: Pin Popup Content

**User Story:** As an arborist dispatcher, I want to click any pin and see the tree's key attributes in a styled popup, so that I can evaluate the tree without leaving the map.

#### Acceptance Criteria

1. WHEN a user activates a Tree_Pin, THE Command_Center_Map SHALL open a Pin_Popup anchored to that Tree_Pin.
2. THE Pin_Popup SHALL display the Tree_Record's `tree_id` value labeled as the tree identifier.
3. WHEN a Tree_Record's `tree_id` is `null`, THE Pin_Popup SHALL display a visible fallback label in place of the missing identifier.
4. THE Pin_Popup SHALL display the Tree_Record's `species` value labeled as the species.
5. THE Pin_Popup SHALL display the Tree_Record's `dbh` value labeled as the diameter at breast height.
6. WHEN a Tree_Record's `photo_url` is non-null, THE Pin_Popup SHALL render an `<img>` whose `src` is that Cloudinary URL and whose `alt` text names the tree's species or identifier.
7. WHEN a Tree_Record's `photo_url` is `null`, THE Pin_Popup SHALL render a graceful image placeholder element that reserves the same visual slot as a real image.
8. THE Pin_Popup SHALL be styled with Tailwind utility classes so its visual treatment matches the enterprise-dashboard aesthetic defined in Requirement 10.

### Requirement 7: Dispatch Arborist Action

**User Story:** As an arborist dispatcher, I want a Dispatch Arborist button inside every unassigned-hazard popup, so that a later phase can wire the real dispatch workflow into an already-present entry point.

#### Acceptance Criteria

1. WHERE a Tree_Pin's Pin_Color is `Red`, THE Pin_Popup SHALL render a Dispatch_Arborist_Button.
2. WHERE a Tree_Pin's Pin_Color is `Orange`, `Yellow`, or `Green`, THE Pin_Popup SHALL NOT render a Dispatch_Arborist_Button.
3. WHEN a user activates the Dispatch_Arborist_Button, THE Command_Center_Map SHALL invoke `console.log` with a message that names the Tree_Record's `id` and `tree_id` as a Phase 2 placeholder for the real dispatch workflow.
4. THE Dispatch_Arborist_Button SHALL be styled with Tailwind utility classes so its visual treatment matches the enterprise-dashboard aesthetic defined in Requirement 10.
5. THE Command_Center_Map SHALL NOT implement any real dispatch workflow, Supabase write, or arborist-assignment logic in Phase 2.

### Requirement 8: Overlay Toggle Buttons

**User Story:** As an arborist dispatcher, I want a visible place to switch future PAGASA DRR and Urban Heat Island overlays on and off, so that Phase 2 ships with the UI surface these later layers will plug into.

#### Acceptance Criteria

1. THE Command_Center_Map SHALL render exactly two Overlay_Toggle buttons floating on top of the Map_Container at its top-right corner.
2. THE first Overlay_Toggle SHALL display the label `PAGASA DRR Overlay`.
3. THE second Overlay_Toggle SHALL display the label `Urban Heat Island Map`.
4. THE Overlay_Toggle buttons SHALL be styled with a glassmorphism visual treatment consisting of a semi-transparent background, a blurred backdrop, and a light border.
5. THE Overlay_Toggle buttons SHALL each maintain an independent pressed-or-unpressed state across the current browser session.
6. WHEN a user activates an Overlay_Toggle, THE Command_Center_Map SHALL toggle that Overlay_Toggle's pressed state.
7. WHEN a user activates an Overlay_Toggle, THE Command_Center_Map SHALL invoke `console.log` with a message that names the activated Overlay_Toggle and its new pressed state.
8. WHILE an Overlay_Toggle is in the pressed state, THE Overlay_Toggle SHALL display a visual treatment distinct from its unpressed state.
9. THE Command_Center_Map SHALL NOT render any real PAGASA DRR data layer or Urban Heat Island data layer in Phase 2.

### Requirement 9: Test Suite Preservation and react-leaflet Mock

**User Story:** As a developer, I want every test that passed at the end of Phase 1 to keep passing after Phase 2, and I want the Command_Center_Map to be fully testable under jsdom, so that replacing the placeholder never regresses the App Shell, types, or Supabase singleton.

#### Acceptance Criteria

1. THE Phase_2_Test_Suite SHALL register a Vitest `vi.mock('react-leaflet', ...)` replacement that exports inert JSX stand-ins for every `react-leaflet` symbol imported by the Command_Center_Map component, including at minimum `MapContainer`, `TileLayer`, `Marker`, and `Popup`.
2. THE Phase_2_Test_Suite SHALL prevent the real `leaflet` module and the `leaflet/dist/leaflet.css` stylesheet import from executing any browser-only API access during test runs.
3. THE Phase_2_Test_Suite SHALL use a Vitest mock of the Supabase_Client so no real network call is issued during testing.
4. WHEN `npm test` is run after Phase 2 is complete, THE Mission_Control_Dashboard SHALL pass every test that passed at the end of Phase 1.
5. THE Phase_2_Test_Suite SHALL include Command_Center_Map tests that cover each of the following: the base-map initial render, each of the four Pin_Color classifications against the precedence rule in Requirement 4, the presence of the Dispatch_Arborist_Button on Red pins and its absence on Orange, Yellow, and Green pins, Pin_Popup field display for a Tree_Record with a non-null `photo_url` and for a Tree_Record with a null `photo_url`, Overlay_Toggle pressed-state toggling with a `console.log` spy asserting the logged payload, and Supabase fetch-failure handling from Requirement 3.5.

### Requirement 10: Visual Quality

**User Story:** As a stakeholder demoing the dashboard, I want the Command_Center_Map surface to feel like a premium enterprise product, so that the dashboard's first interactive module sets the visual bar for every later phase.

#### Acceptance Criteria

1. THE Command_Center_Map SHALL apply Tailwind utility classes for layout, spacing, color, shadow, and border so that the Pin_Popup, Dispatch_Arborist_Button, Overlay_Toggle buttons, loading indicator, and error message share a coherent enterprise-dashboard aesthetic.
2. THE Command_Center_Map SHALL apply non-default Leaflet marker styling so that the four Pin_Color values are visually differentiated and on-brand.

### Requirement 11: Out-of-Scope for Phase 2

**User Story:** As a product owner, I want Phase 2 to deliver only the map module without leaking partial work from later phases, so that later phases stay reviewable in isolation.

#### Acceptance Criteria

1. THE Command_Center_Map SHALL NOT implement any real PAGASA DRR Overlay data layer.
2. THE Command_Center_Map SHALL NOT implement any real Urban Heat Island Map data layer.
3. THE Command_Center_Map SHALL NOT issue any Supabase write, update, or delete against the `trees` table.
4. THE Command_Center_Map SHALL NOT implement a real dispatch workflow beyond the `console.log` placeholder defined in Requirement 7.
5. THE Command_Center_Map SHALL NOT include Inventory, Action_Board, or Analytics logic in Phase 2.
