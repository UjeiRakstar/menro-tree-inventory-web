# Implementation Plan: Mission Control Dashboard — Phase 1 (Project Initialization & App Shell)

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Make sure that each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

Phase 1 builds the Vite + React (JavaScript) toolchain, the shared Tree_Record type module, the Supabase client singleton, five placeholder page components, the Sidebar and Header, and the `App.jsx` layout route that wires them all together via `react-router-dom` v6. No map rendering, no data grid, no workflow logic, no analytics charts, no data fetching.

**Resolution of the `Sidebar.jsx` location ambiguity (Requirement 3.7 vs. design):** The Sidebar implementation lives at `src/components/Sidebar.jsx` (colocated with `Header.jsx` per the design). To satisfy Requirement 3.7's literal "located under `src/`" wording, a one-line re-export file is added at `src/Sidebar.jsx` that does `export { default } from './components/Sidebar.jsx';`. Both paths resolve to the same component.

**Testing stack:** Vitest + React Testing Library (jsdom). Phase 1 uses only example-based tests; the design explicitly rules out property-based testing for this phase, so no PBT sub-tasks appear below.

## Tasks

- [x] 1. Scaffold the Vite + React project and toolchain
  - [x] 1.1 Initialize a Vite project using the React (JavaScript) template and write `package.json`
    - Create `index.html`, `vite.config.js`, `package.json`, and a Vite-generated `src/main.jsx` stub that will be replaced in task 7.2.
    - Declare runtime dependencies in `package.json`: `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`, `lucide-react`, `prop-types`.
    - Declare dev dependencies in `package.json`: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
    - Include the standard Vite scripts (`dev`, `build`, `preview`) plus a `test` script that runs `vitest --run`.
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [x] 1.2 Configure Tailwind CSS and global stylesheet
    - Create `tailwind.config.js` whose `content` globs cover `./index.html` and `./src/**/*.{js,jsx,ts,tsx}`.
    - Create `postcss.config.js` that registers `tailwindcss` and `autoprefixer`.
    - Create `src/index.css` containing exactly the `@tailwind base;`, `@tailwind components;`, and `@tailwind utilities;` directives.
    - _Requirements: 1.4, 1.5_

  - [x] 1.3 Create `.env.example` at the project root
    - Write `.env.example` with two lines, each ending in `=` and no placeholder value: `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=`.
    - _Requirements: 8.3_

  - [x] 1.4 Configure Vitest + React Testing Library for jsdom
    - Add a `test` block to `vite.config.js` (or create `vitest.config.js`) with `environment: 'jsdom'` and a `setupFiles` entry pointing at `src/test/setup.js`.
    - Create `src/test/setup.js` that imports `@testing-library/jest-dom`.
    - _Requirements: 1.3_

- [x] 2. Implement the shared `Tree_Record` type module
  - [x] 2.1 Create `src/types.js` with enums, JSDoc typedef, and PropTypes shape
    - Export frozen enum objects `TASK_STATUS` (`PENDING`, `ACKNOWLEDGED`, `EXECUTED`, `CANCELLED`) and `SPECIES_TYPE` (`ENDEMIC`, `INVASIVE`) with their exact string values from the design.
    - Export `TASK_STATUS_VALUES` and `SPECIES_TYPE_VALUES` as `Object.values(...)` of each enum.
    - Declare a JSDoc `@typedef TreeRecord` covering every field listed in the design's field table, marking `tree_id`, `assigned_to`, and `photo_url` as nullable (`?string`), `latitude`/`longitude` as `number`, `dbh`/`species`/`scientific_name`/`dateCaptured` as `string`, and the five feature booleans plus `has_cutting_permit` as `boolean`. Include a comment on `photo_url` stating it is a Cloudinary URL, not a Supabase Storage URL.
    - Export `TreeRecordPropType` as a `PropTypes.shape({...})` that matches the typedef: required strings for `id`, `dbh`, `species`, `scientific_name`, `dateCaptured`; required numbers for `latitude`, `longitude`; required booleans for `is_leaning`, `has_powerline_conflict`, `is_decayed`, `is_root_problem`, `has_cutting_permit`; `PropTypes.oneOf(TASK_STATUS_VALUES).isRequired` for `task_status`; `PropTypes.oneOf(SPECIES_TYPE_VALUES).isRequired` for `species_type`; nullable (no `.isRequired`) strings for `tree_id`, `assigned_to`, `photo_url`.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 2.2 Write unit tests for `types.js`
    - Assert a fully-populated valid Tree_Record passes `PropTypes.checkPropTypes` with no console error.
    - Assert a record with `tree_id`, `assigned_to`, `photo_url` set to `null` passes with no console error.
    - Assert a record with `task_status: 'Bogus'` emits a console error.
    - Assert a record with `species_type: 'Bogus'` emits a console error.
    - Assert `TASK_STATUS_VALUES` deep-equals `['Pending', 'Acknowledged', 'Executed', 'Cancelled']`.
    - Assert `SPECIES_TYPE_VALUES` deep-equals `['Endemic', 'Invasive']`.
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

- [x] 3. Implement the Supabase client singleton
  - [x] 3.1 Create `src/supabaseClient.js`
    - Read `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY` at module scope.
    - Collect the names of any missing (undefined or empty-string) variables and, if the list is non-empty, emit a single `console.warn` that names each missing variable and references `.env.example`.
    - Do not throw on missing env vars; pass `url ?? ''` and `anonKey ?? ''` to `createClient` so the module always exports a valid client instance.
    - Export the client as a named export `supabase` created by a single `createClient(...)` call so the module is a true singleton.
    - _Requirements: 8.1, 8.2, 8.4_

  - [x] 3.2 Write unit tests for `supabaseClient.js`
    - Using `vi.stubEnv` and `vi.resetModules`, reimport the module with both env vars set and assert `console.warn` is not called and `supabase` is truthy.
    - Reimport with only `VITE_SUPABASE_URL` unset and assert `console.warn` is called once with a message containing the string `VITE_SUPABASE_URL`.
    - Reimport with only `VITE_SUPABASE_ANON_KEY` unset and assert `console.warn` is called once with a message containing the string `VITE_SUPABASE_ANON_KEY`.
    - Reimport with both unset and assert a single `console.warn` call whose message contains both variable names.
    - Import the module twice within one test and assert `supabase` is referentially the same instance (singleton behavior).
    - Read `.env.example` from disk and assert it contains the lines `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` with empty values.
    - _Requirements: 8.1, 8.3, 8.4_

- [x] 4. Checkpoint — shared modules in place
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement the placeholder route components
  - [x] 5.1 Create the four route placeholders and the NotFound placeholder under `src/pages/`
    - Create `src/pages/CommandCenter.jsx` rendering an `<h1>Command Center</h1>` followed by the exact description sentence `The interactive tree map will be implemented in the Command Center phase.` inside a `<section>`.
    - Create `src/pages/InventoryView.jsx` rendering `<h1>Inventory</h1>` and `The filterable tree inventory data grid will be implemented in the Inventory phase.`.
    - Create `src/pages/ActionBoard.jsx` rendering `<h1>Action Board</h1>` and `Task assignment and workflow management will be implemented in the Action Board phase.`.
    - Create `src/pages/AnalyticsView.jsx` rendering `<h1>Analytics</h1>` and `Carbon sequestration charts and reports will be implemented in the Analytics phase.`.
    - Create `src/pages/NotFound.jsx` rendering `<h1>Page Not Found</h1>` and a short recovery sentence instructing the user to use the Sidebar to navigate.
    - Do not add any hooks, data fetching, event handlers, `<input>`, `<button>`, `<table>`, `<canvas>`, or non-Lucide `<svg>` beyond the heading and description.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1, 9.2, 9.3, 9.4, 9.5, 4.6_

  - [x] 5.2 Write unit tests for the placeholder components
    - For each of the four routed placeholders, assert the heading text matches Requirement 6.1–6.4 exactly and the description sentence matches the design's text content contract.
    - For `NotFound`, assert the `Page Not Found` heading and the recovery sentence render.
    - For all five, assert the rendered tree contains no `<input>`, `<button>`, `<table>`, or `<canvas>` element.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 9.5_

- [x] 6. Implement the Sidebar component
  - [x] 6.1 Create `src/components/Sidebar.jsx` with the fixed 4-item navigation
    - Define a module-scoped `NAV_ITEMS` array (exported as a named export for tests) containing, in this exact order, `{ to: '/map', label: 'Command Center', Icon: Map }`, `{ to: '/inventory', label: 'Inventory', Icon: TreePine }`, `{ to: '/action-board', label: 'Action Board', Icon: ClipboardList }`, `{ to: '/analytics', label: 'Analytics', Icon: BarChart3 }`. Import the icon components from `lucide-react`.
    - Render a `<nav>` that maps `NAV_ITEMS` to `<NavLink>` elements from `react-router-dom`, each containing the Lucide icon and a `<span>` with the label.
    - Use `NavLink`'s `className` callback with the `isActive` argument to apply a visually distinct Tailwind class set (e.g., `bg-slate-700 text-white`) when the link matches the active route, and a hover class otherwise.
    - Apply Tailwind classes that keep the Sidebar visible at viewport widths ≥ 768px without JS (e.g., `hidden md:flex md:flex-col w-60 ...`).
    - Default-export the `Sidebar` component.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 2.3_

  - [x] 6.2 Add the `src/Sidebar.jsx` re-export shim
    - Create `src/Sidebar.jsx` containing only the line `export { default } from './components/Sidebar.jsx';` so the component is reachable at the path required by Requirement 3.7 while keeping the implementation colocated with `Header.jsx`.
    - _Requirements: 3.7_

  - [x] 6.3 Write unit tests for the Sidebar
    - Render `<Sidebar />` inside a `<MemoryRouter>` and assert exactly four nav links exist in the order Command Center, Inventory, Action Board, Analytics.
    - Assert each link's `href` matches `/map`, `/inventory`, `/action-board`, `/analytics` respectively.
    - Assert each link contains an icon element and a text label matching the `NAV_ITEMS` contract.
    - For each of the four routes, render `<Sidebar />` inside `<MemoryRouter initialEntries=[route]>` and assert only the matching NavLink carries the active-state class.
    - Import the default export from `src/Sidebar.jsx` and assert it is referentially the same component as the default export from `src/components/Sidebar.jsx`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7_

- [x] 7. Implement the Header component
  - [x] 7.1 Create `src/components/Header.jsx`
    - Default-export a `Header` function component that renders a `<header>` containing the visible text `Mission Control`.
    - Apply Tailwind classes that give the header a fixed height (e.g., `h-14`), horizontal padding, and a bottom border, and render it as a flex container so the title aligns vertically.
    - Do not add any interactive widgets in Phase 1.
    - _Requirements: 5.1, 5.2_

  - [x] 7.2 Write unit tests for the Header
    - Render `<Header />` and assert the text `Mission Control` is visible.
    - _Requirements: 5.1_

- [x] 8. Wire the App Shell layout route and router
  - [x] 8.1 Create `src/App.jsx` with the `Shell` layout and `<Routes>`
    - Import `Routes`, `Route`, `Navigate`, and `Outlet` from `react-router-dom`, plus `Sidebar`, `Header`, and the five page components.
    - Define an internal `Shell` function component that renders a `min-h-screen flex` outer `<div>` containing `<Sidebar />` and a right-hand flex-column (`flex-1 flex flex-col min-w-0`) containing `<Header />` above a `<main className="flex-1 overflow-auto p-6"><Outlet /></main>`.
    - Default-export an `App` function component that renders a single `<Routes>` block with one layout route (`<Route element={<Shell />}>`) whose children are: `<Route index element={<Navigate to="/map" replace />} />`, `<Route path="map" element={<CommandCenter />} />`, `<Route path="inventory" element={<InventoryView />} />`, `<Route path="action-board" element={<ActionBoard />} />`, `<Route path="analytics" element={<AnalyticsView />} />`, and `<Route path="*" element={<NotFound />} />`.
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.2, 5.3_

  - [x] 8.2 Wire the application entry point in `src/main.jsx`
    - Replace the Vite template `main.jsx` with one that imports `StrictMode` from `react`, `createRoot` from `react-dom/client`, `BrowserRouter` from `react-router-dom`, `App` from `./App.jsx`, and `./index.css`.
    - Mount `<StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>` into `document.getElementById('root')`.
    - _Requirements: 1.5, 1.6, 2.2, 4.7_

  - [x] 8.3 Write integration tests for the App Shell and routing
    - For each of `/map`, `/inventory`, `/action-board`, `/analytics`, `/does-not-exist`, render `<App />` inside `<MemoryRouter initialEntries=[path]>` and assert Sidebar, Header, and the expected page heading are all present on the screen.
    - Render `<App />` at `/` and assert the `Command Center` heading renders (root redirect to `/map`).
    - Render `<App />` at `/does-not-exist` and assert the `Page Not Found` heading renders while Sidebar and Header remain present.
    - Render `<App />` at `/map`, capture a reference to the Sidebar DOM node, click the Inventory NavLink, and assert the `Inventory` heading appears and the Sidebar reference is unchanged (no remount, no full reload).
    - Assert the `<main>` element carries an `overflow-auto` class and the `<header>` is a sibling rendered above it.
    - _Requirements: 2.1, 2.2, 2.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.2, 5.3_

- [x] 9. Final checkpoint — Phase 1 shell complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references the specific acceptance criteria it implements for traceability.
- Checkpoints after the shared modules (task 4) and after the wired-up shell (task 9) give natural points to pause and validate with the user.
- Phase 1 uses only example-based tests with Vitest + React Testing Library. The design's PBT-applicability assessment rules out property-based testing for this phase; when later phases introduce pure logic (inventory filtering, analytics aggregation, task-status transitions), those phases should revisit PBT.
- Out-of-scope for Phase 1 per Requirement 9 and the user's explicit scoping: map libraries, data grids, workflow logic, analytics charts, and any data fetching. Do not add them here.

## Workflow Completion

This workflow produces planning artifacts only. Phase 1 implementation does not begin as part of this workflow. To start executing Phase 1, open `tasks.md` and click **Start task** next to the first task item.
