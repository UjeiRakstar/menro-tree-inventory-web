# Requirements Document

## Introduction

The Mission Control Dashboard is a web application that serves as the central dispatcher and data viewer for the Tree Inventory & Carbon Sequestration System. It is the counterpart to an offline-first mobile app used by field arborists that pushes tree records into a shared Supabase `trees` table.

This specification covers **Phase 1: Project Initialization & App Shell** only. The goal of Phase 1 is to stand up the project toolchain (Vite + React + Tailwind CSS + React Router + Supabase client + Lucide icons), deliver a persistent left-hand sidebar navigation with four routes, a top header, empty placeholder route components, and shared type definitions that mirror the strict Supabase `trees` schema used by the mobile app.

Later feature phases (interactive map, inventory data grid, action board workflows, analytics reports) are explicitly out of scope. Those routes MUST render as empty, clearly-labeled placeholders so subsequent phases can fill them in without refactoring the shell.

## Glossary

- **Mission_Control_Dashboard**: The web application being specified, built with React and Vite.
- **App_Shell**: The persistent layout composed of the Sidebar, the Header, and a main content outlet that hosts the currently active route.
- **Sidebar**: The persistent left-hand navigation component that lists the four primary routes.
- **Header**: The top bar that appears above the main content outlet on every route.
- **Router**: The client-side routing layer provided by `react-router-dom`.
- **Route**: A client-side URL path handled by the Router. The four primary routes are `/map`, `/inventory`, `/action-board`, and `/analytics`.
- **Command_Center**: The placeholder component rendered at `/map`.
- **Inventory_View**: The placeholder component rendered at `/inventory`.
- **Action_Board**: The placeholder component rendered at `/action-board`.
- **Analytics_View**: The placeholder component rendered at `/analytics`.
- **Tree_Record**: A single row in the Supabase `trees` table, conforming to the strict schema defined by the mobile app.
- **Tree_Schema_Module**: The shared JavaScript module (`types.js` or equivalent) that defines the Tree_Record shape as PropTypes and/or JSDoc typedefs.
- **Supabase_Client**: The singleton `@supabase/supabase-js` client instance used by the Mission_Control_Dashboard.
- **Task_Status**: An enumerated string field on a Tree_Record whose allowed values are exactly `Pending`, `Acknowledged`, `Executed`, and `Cancelled`.
- **Species_Type**: An enumerated string field on a Tree_Record whose allowed values are exactly `Endemic` and `Invasive`.

## Requirements

### Requirement 1: Project Scaffolding and Toolchain

**User Story:** As a developer, I want a Vite-based React project with Tailwind CSS, React Router, Supabase client, and Lucide icons pre-configured, so that I can build features without spending time on setup.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL be scaffolded as a Vite project using the React template.
2. THE Mission_Control_Dashboard SHALL declare `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`, and `lucide-react` as runtime dependencies in `package.json`.
3. THE Mission_Control_Dashboard SHALL declare `tailwindcss`, `postcss`, and `autoprefixer` as development dependencies in `package.json`.
4. THE Mission_Control_Dashboard SHALL include a Tailwind configuration file whose `content` globs cover `index.html` and all files under `src/` with extensions `.js`, `.jsx`, `.ts`, and `.tsx`.
5. THE Mission_Control_Dashboard SHALL include a global CSS file that contains the `@tailwind base`, `@tailwind components`, and `@tailwind utilities` directives and that is imported by the application entry point.
6. WHEN a developer runs `npm install` followed by `npm run dev` in a clean checkout, THE Mission_Control_Dashboard SHALL start the Vite development server and serve the App_Shell without build errors.

### Requirement 2: App Shell Layout

**User Story:** As an arborist dispatcher, I want every page of the dashboard to share the same left sidebar and top header, so that navigation and context are always visible.

#### Acceptance Criteria

1. THE App_Shell SHALL render the Sidebar on the left, the Header across the top of the remaining area, and the active Route content in a main content outlet below the Header.
2. THE App_Shell SHALL render the Sidebar and the Header on every Route defined in Requirement 4.
3. WHILE the viewport width is at least 768 pixels, THE Sidebar SHALL remain visible without requiring user interaction to open it.
4. THE App_Shell SHALL constrain the main content outlet so that Sidebar and Header do not overlap the Route content.
5. THE App_Shell SHALL be implemented in a file named `App.jsx` located under `src/`.

### Requirement 3: Sidebar Navigation

**User Story:** As a user of the dashboard, I want a persistent sidebar that lists the four primary sections with icons and labels, so that I can jump between sections in one click.

#### Acceptance Criteria

1. THE Sidebar SHALL render exactly four navigation items, in this order: Command Center, Inventory, Action Board, Analytics.
2. THE Sidebar SHALL link the Command Center item to `/map`, the Inventory item to `/inventory`, the Action Board item to `/action-board`, and the Analytics item to `/analytics`.
3. THE Sidebar SHALL render a Lucide icon next to each navigation item.
4. THE Sidebar SHALL render a human-readable text label next to each navigation item.
5. WHEN a navigation item is activated, THE Router SHALL change the browser URL to the corresponding Route path without triggering a full page reload.
6. WHILE a Route is active, THE Sidebar SHALL visually distinguish the navigation item whose path matches the active Route from the other navigation items.
7. THE Sidebar SHALL be implemented in a file named `Sidebar.jsx` located under `src/`.

### Requirement 4: Routing Configuration

**User Story:** As a user, I want each section of the dashboard to have a stable URL, so that I can bookmark and share links to specific views.

#### Acceptance Criteria

1. THE Router SHALL register the Route `/map` to render the Command_Center component.
2. THE Router SHALL register the Route `/inventory` to render the Inventory_View component.
3. THE Router SHALL register the Route `/action-board` to render the Action_Board component.
4. THE Router SHALL register the Route `/analytics` to render the Analytics_View component.
5. WHEN a user navigates to the root path `/`, THE Router SHALL redirect to `/map`.
6. IF a user navigates to a path that is not registered with the Router, THEN THE Router SHALL render a Not Found placeholder component inside the App_Shell.
7. THE Router SHALL render every Route inside the App_Shell so that the Sidebar and Header remain visible across navigation.

### Requirement 5: Top Header

**User Story:** As a user, I want a consistent top header above every view, so that branding and future global controls have a stable location.

#### Acceptance Criteria

1. THE Header SHALL render the application title `Mission Control` as visible text.
2. THE Header SHALL render above the main content outlet on every Route.
3. THE Header SHALL remain visible while the user scrolls the main content outlet.

### Requirement 6: Placeholder Route Components

**User Story:** As a developer picking up a later phase, I want each route to render a clearly-labeled empty placeholder, so that I can identify which file to extend without confusion.

#### Acceptance Criteria

1. THE Command_Center component SHALL render a visible heading containing the text `Command Center`.
2. THE Inventory_View component SHALL render a visible heading containing the text `Inventory`.
3. THE Action_Board component SHALL render a visible heading containing the text `Action Board`.
4. THE Analytics_View component SHALL render a visible heading containing the text `Analytics`.
5. THE Command_Center, Inventory_View, Action_Board, and Analytics_View components SHALL each be defined in their own file under `src/pages/` or `src/routes/`.
6. THE Command_Center, Inventory_View, Action_Board, and Analytics_View components SHALL render no data-fetching logic and no interactive widgets beyond the placeholder heading and a short description line.

### Requirement 7: Tree Record Type Definitions

**User Story:** As a developer integrating with Supabase, I want a single shared definition of the `trees` table shape, so that every component that handles tree data uses the same field names and types.

#### Acceptance Criteria

1. THE Tree_Schema_Module SHALL be defined in a file named `types.js` located under `src/`.
2. THE Tree_Schema_Module SHALL export a definition of the Tree_Record shape that includes every one of these fields: `id`, `tree_id`, `latitude`, `longitude`, `dbh`, `species`, `scientific_name`, `species_type`, `is_leaning`, `has_powerline_conflict`, `is_decayed`, `is_root_problem`, `dateCaptured`, `assigned_to`, `has_cutting_permit`, `task_status`, `photo_url`.
3. THE Tree_Schema_Module SHALL declare `id` and `dbh` as strings, `species`, `scientific_name`, and `species_type` as strings, `latitude` and `longitude` as numbers, `is_leaning`, `has_powerline_conflict`, `is_decayed`, `is_root_problem`, and `has_cutting_permit` as booleans, `dateCaptured` as a string in ISO-8601 timestamp format, and `task_status` as a string.
4. THE Tree_Schema_Module SHALL declare `tree_id`, `assigned_to`, and `photo_url` as nullable string fields.
5. THE Tree_Schema_Module SHALL document that the allowed values of Task_Status are exactly `Pending`, `Acknowledged`, `Executed`, and `Cancelled`.
6. THE Tree_Schema_Module SHALL document that the allowed values of Species_Type are exactly `Endemic` and `Invasive`.
7. THE Tree_Schema_Module SHALL document that the `photo_url` field contains a Cloudinary URL rather than a Supabase storage URL.
8. WHERE the project uses JavaScript without TypeScript, THE Tree_Schema_Module SHALL express the Tree_Record shape using PropTypes and a JSDoc `@typedef` so that both runtime validators and editor tooling can consume the definition.

### Requirement 8: Supabase Client Configuration

**User Story:** As a developer, I want a ready-to-use Supabase client that reads its credentials from environment variables, so that later phases can query the `trees` table without reconfiguring the client.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL expose the Supabase_Client as a singleton exported from a file named `supabaseClient.js` located under `src/`.
2. THE Supabase_Client SHALL be constructed using the values of the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables.
3. THE Mission_Control_Dashboard SHALL include a `.env.example` file at the project root that lists `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with empty placeholder values.
4. IF either `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing when the Supabase_Client module is imported, THEN THE Supabase_Client SHALL log a descriptive warning to the browser console that names the missing variable.

### Requirement 9: Out-of-Scope Phases Marked as Placeholders

**User Story:** As a product owner, I want Phase 1 to deliver only the shell without partial feature work, so that later phases can be planned and reviewed independently.

#### Acceptance Criteria

1. THE Mission_Control_Dashboard SHALL NOT include any map rendering library integration in Phase 1.
2. THE Mission_Control_Dashboard SHALL NOT include any data grid, table, or inventory query logic in Phase 1.
3. THE Mission_Control_Dashboard SHALL NOT include any task assignment, workflow, or Action_Board business logic in Phase 1.
4. THE Mission_Control_Dashboard SHALL NOT include any analytics chart or reporting logic in Phase 1.
5. WHERE a future phase will extend a placeholder Route, THE corresponding placeholder component SHALL render a short description sentence that names the future phase so reviewers can trace scope boundaries.
