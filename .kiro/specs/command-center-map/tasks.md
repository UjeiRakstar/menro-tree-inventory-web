# Implementation Plan: Command Center Map — Phase 2

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Each prompt builds on the previous prompts, and ends with wiring things together. There should be no hanging or orphaned code that isn't integrated into a previous step. Focus ONLY on tasks that involve writing, modifying, or testing code.

Phase 2 replaces the Phase 1 `CommandCenter` placeholder with a real `react-leaflet` interactive map that:
- Fetches every row of the Supabase `trees` table on mount and classifies each row into one of four Pin_Colors using the precedence **Red > Orange > Yellow > Green**.
- Renders a full-outlet OpenStreetMap base layer with color-coded pins, styled popups, a conditional Dispatch Arborist button on Red pins (a `console.log` stub), and two glassmorphism overlay-toggle buttons at the top right.
- Suppresses the App Shell's `p-6` padding on the `/map` route only, via a `useLocation()` check in `Shell`.
- Preserves every Phase 1 test (App shell, Sidebar, Header, supabaseClient, types).

**PBT stack:** `fast-check` + Vitest. Eight correctness properties are implemented as property-based tests with a minimum of 100 runs each, each tagged `Feature: command-center-map, Property N: ...`. A shared `src/test/arbitraries.js` helper hosts the `treeRecordArb` and `treeRecordWithAnyCoordsArb` generators.

**Mocking:** `vi.mock('react-leaflet', ...)` is scoped per-test-file (not global), exports inert JSX stand-ins with `data-testid` hooks, and runs alongside a `vi.mock('../supabaseClient.js', ...)` that lets each test control the Supabase promise. Real `leaflet` stays unmocked.

## Tasks

- [x] 1. Add Phase 2 dependencies and test harness
  - [x] 1.1 Add `react-leaflet`, `leaflet`, and `fast-check` to `package.json`
    - Add `react-leaflet` (current major) and `leaflet` (current major, matching `react-leaflet`'s peer requirement) under `dependencies` in `package.json`.
    - Add `fast-check` (current major — 3.x) under `devDependencies`.
    - Run `npm install` so the lockfile and `node_modules` reflect the new packages.
    - Do not modify any existing dependency versions.
    - _Requirements: 1.1, 1.2, 9.1_

  - [x] 1.2 Create `src/test/arbitraries.js` with fast-check generators for Tree_Record
    - Import `fc` from `fast-check` and `TASK_STATUS_VALUES`, `SPECIES_TYPE_VALUES` from `../types.js`.
    - Export `finiteLatArb` using `fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true })` and `finiteLngArb` using `fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true })`.
    - Export `possiblyNonFiniteCoordArb` as `fc.oneof(finiteLatArb, fc.constant(NaN), fc.constant(Infinity), fc.constant(-Infinity), fc.constant(null), fc.constant(undefined))`.
    - Export `treeRecordArb` as `fc.record({...})` covering every field of `TreeRecordPropType`: required `id` (`fc.uuid()`), `dbh` / `species` / `scientific_name` / `dateCaptured` as strings, `latitude`/`longitude` using the finite coord arbitraries, the four hazard booleans plus `has_cutting_permit` as `fc.boolean()`, `species_type` as `fc.constantFrom(...SPECIES_TYPE_VALUES)`, `task_status` as `fc.constantFrom(...TASK_STATUS_VALUES)`, and the three nullable fields (`tree_id`, `assigned_to`, `photo_url`) wrapped in `fc.option(..., { nil: null })`.
    - Export `treeRecordWithAnyCoordsArb` as a variant of `treeRecordArb` whose `latitude` and `longitude` use `possiblyNonFiniteCoordArb`.
    - _Requirements: 9.1 (PBT harness), 3.2 (Tree_Record shape), 7.x (shape reused by properties)_

- [x] 2. Implement the pure `classifyPinColor` classifier
  - [x] 2.1 Create `src/lib/pinColor.js` with `PIN_COLOR`, `hasHazard`, and `classifyPinColor`
    - Export a frozen `PIN_COLOR` object: `{ RED: 'Red', ORANGE: 'Orange', YELLOW: 'Yellow', GREEN: 'Green' }`.
    - Export `hasHazard(tree)` returning `Boolean(tree.is_leaning || tree.has_powerline_conflict || tree.is_decayed || tree.is_root_problem)`.
    - Export `classifyPinColor(tree)` that returns `'Red'` when `hasHazard(tree) && tree.assigned_to == null`, `'Orange'` when `hasHazard(tree)`, `'Yellow'` when `tree.has_cutting_permit` is truthy, and `'Green'` otherwise. The strict precedence is encoded by the order of the `if` branches.
    - Use `tree.assigned_to == null` (loose equality) so both `null` and `undefined` classify as unassigned.
    - Include a JSDoc header describing the precedence `Red > Orange > Yellow > Green` and matching Requirement 4 verbatim.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.2 **[PBT]** Write Property 1 test — Pin Color Classification Correctness
    - Create `src/lib/pinColor.test.js`.
    - Import `fc` from `fast-check`, `classifyPinColor`, `hasHazard`, `PIN_COLOR` from `./pinColor.js`, and `treeRecordArb` from `../test/arbitraries.js`.
    - Write an `it` block tagged with the leading comment `// Feature: command-center-map, Property 1: Pin Color Classification Correctness`.
    - The property: `fc.assert(fc.property(treeRecordArb, (t) => { const color = classifyPinColor(t); const hazard = hasHazard(t); const unassigned = t.assigned_to == null; if (hazard && unassigned) return color === PIN_COLOR.RED; if (hazard) return color === PIN_COLOR.ORANGE; if (t.has_cutting_permit) return color === PIN_COLOR.YELLOW; return color === PIN_COLOR.GREEN; }), { numRuns: 100 });`
    - Also add an example-based smoke test asserting `classifyPinColor` returns one of the four strings for a hand-built record with every hazard flag true and `assigned_to: null` (expects `'Red'`).
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 3. Implement the Leaflet marker icons
  - [x] 3.1 Create `src/lib/markerIcons.js` with `L.divIcon` instances per Pin_Color
    - Import `L` from `leaflet` and `PIN_COLOR` from `./pinColor.js`.
    - Define and export `HEX_FOR_COLOR` as a frozen map: `Red → '#dc2626'`, `Orange → '#ea580c'`, `Yellow → '#eab308'`, `Green → '#16a34a'`.
    - Define an internal `buildDivIcon(hex, ariaColor)` that returns `L.divIcon({ className: 'tree-pin-icon', html: '<span role="img" aria-label="${ariaColor} pin" style="display:block;width:18px;height:18px;border-radius:9999px;background:${hex};border:2px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.3);"></span>', iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10] })`.
    - Build a module-scoped `ICONS` object keyed by Pin_Color, with each value constructed via `buildDivIcon`.
    - Export `iconForPinColor(color)` that returns `ICONS[color] ?? ICONS[PIN_COLOR.GREEN]`.
    - _Requirements: 5.2, 5.3, 5.5, 10.2_

  - [x] 3.2 Write unit tests for `markerIcons.js`
    - Create `src/lib/markerIcons.test.js`.
    - Assert `iconForPinColor('Red')`, `'Orange'`, `'Yellow'`, `'Green'` all return truthy values whose constructor name is `DivIcon` (or which are `instanceof L.DivIcon`).
    - Assert the four `HEX_FOR_COLOR` entries are pairwise distinct strings (Requirement 5.3).
    - Assert `iconForPinColor('bogus')` falls back to the Green icon without throwing.
    - Assert `iconForPinColor('Red') === iconForPinColor('Red')` (singleton icon instances — ensures markers reuse the same object).
    - _Requirements: 5.2, 5.3, 5.5_

- [x] 4. Implement `TreePinPopup`
  - [x] 4.1 Create `src/components/TreePinPopup.jsx`
    - Default-export a `TreePinPopup({ tree, color })` function component.
    - PropTypes: `TreePinPopup.propTypes = { tree: TreeRecordPropType.isRequired, color: PropTypes.oneOf(['Red','Orange','Yellow','Green']).isRequired }`. Import `TreeRecordPropType` from `../types.js` and `PropTypes` from `prop-types`.
    - Compute `identifier = tree.tree_id ?? 'Unidentified tree'`.
    - Render a Tailwind-styled wrapper `<div className="w-56 text-slate-800">` containing, in order: the photo block, a `<dl>` with `Tree ID`, `Species`, `DBH` entries, and the conditional Dispatch button.
    - Photo block: when `tree.photo_url` is truthy, render `<img src={tree.photo_url} alt={`${tree.species} (${identifier})`} className="w-full h-28 object-cover rounded mb-2" />`. Otherwise render `<div data-testid="tree-photo-placeholder" aria-label="No photo available" className="w-full h-28 rounded mb-2 bg-slate-200 flex items-center justify-center text-slate-500 text-xs">No photo</div>`.
    - `<dl>` entries: each uses `<dt className="inline font-semibold">Label: </dt><dd className="inline">{value}</dd>` so label and value render on the same line; values are `identifier`, `tree.species`, `tree.dbh`.
    - Dispatch button: when `color === 'Red'`, render `<button type="button" onClick={() => console.log('Dispatch Arborist requested', { id: tree.id, tree_id: tree.tree_id })} className="mt-3 w-full rounded bg-red-600 text-white text-sm font-semibold px-3 py-1.5 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400">Dispatch Arborist</button>`. For any other color, render nothing in that slot.
    - Do not issue any Supabase call inside the click handler — the handler is exactly `console.log(...)`.
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5, 10.1_

  - [x] 4.2 **[PBT]** Write Property 4 test — Popup Content Completeness
    - Create `src/components/TreePinPopup.test.jsx`.
    - Import `fc`, `render` from `@testing-library/react`, `within` from `@testing-library/react`, `TreePinPopup`, `treeRecordArb`, and `classifyPinColor` from the appropriate paths.
    - Tag the test with `// Feature: command-center-map, Property 4: Popup Content Completeness`.
    - Property body: for any `tree` from `treeRecordArb`, render `<TreePinPopup tree={tree} color={classifyPinColor(tree)} />`, then assert:
      - the identifier string is present: if `tree.tree_id != null`, `screen.getByText` includes `tree.tree_id`; otherwise `screen.getByText('Unidentified tree')` is present;
      - `tree.species` text is visible;
      - `tree.dbh` text is visible;
      - photo: if `tree.photo_url != null`, an `<img>` with `src === tree.photo_url` exists; otherwise the `tree-photo-placeholder` testid exists.
    - Configure with `{ numRuns: 100 }`. Between iterations, call `cleanup` from `@testing-library/react` (or render inside a fresh wrapper) to avoid DOM leakage.
    - Implementation note: `species`, `dbh`, and `tree_id` are rendered inside `<dd className="inline">` siblings of `<dt>` labels, so use `within(screen.getByRole('definition', { ... }))` or a `getByText(content, { exact: false })` matcher with care — coordinate with the final JSX structure chosen in 4.1.
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 4.3 **[PBT]** Write Property 5 test — Dispatch Button Iff Red
    - In `src/components/TreePinPopup.test.jsx`, add an `it` block tagged `// Feature: command-center-map, Property 5: Dispatch Button Iff Red`.
    - Property: for any `tree` from `treeRecordArb`, render `<TreePinPopup tree={tree} color={classifyPinColor(tree)} />`, and assert `screen.queryByRole('button', { name: /dispatch arborist/i })` is non-null iff `classifyPinColor(tree) === 'Red'`.
    - Configure with `{ numRuns: 100 }` and clean up between iterations.
    - _Requirements: 7.1, 7.2_

  - [x] 4.4 **[PBT]** Write Property 6 test — Dispatch Click Logs Id and Tree_Id
    - In `src/components/TreePinPopup.test.jsx`, add an `it` block tagged `// Feature: command-center-map, Property 6: Dispatch Click Logs Id and Tree_Id`.
    - Define a filtered arbitrary `redTreeArb = treeRecordArb.filter((t) => classifyPinColor(t) === 'Red')` so generated examples are guaranteed to classify Red.
    - Property: for any `tree` from `redTreeArb`, spy on `console.log`, render `<TreePinPopup tree={tree} color="Red" />`, click the Dispatch Arborist button with `fireEvent.click`, and assert the spy was called with a payload containing `{ id: tree.id, tree_id: tree.tree_id }` (the second argument of the latest call deep-equals that object).
    - Restore the console.log spy between iterations.
    - Configure with `{ numRuns: 100 }`.
    - _Requirements: 7.3, 7.5_

  - [x] 4.5 Write example-based smoke tests for `TreePinPopup`
    - Assert that the popup body wrapper carries Tailwind class `w-56` (Requirement 6.8 styling presence).
    - Assert that when `color === 'Red'`, the Dispatch button carries Tailwind classes `bg-red-600` and `text-white` (Requirement 7.4).
    - Assert that the `<img>` alt text contains both the species and the identifier when `photo_url` is non-null (Requirement 6.6).
    - _Requirements: 6.6, 6.8, 7.4, 10.1_

- [x] 5. Implement `OverlayTogglePanel`
  - [x] 5.1 Create `src/components/OverlayTogglePanel.jsx`
    - Default-export `OverlayTogglePanel` with no props. Import `useState` from `react`.
    - Define two `useState<boolean>` calls: `[pagasaPressed, setPagasaPressed]` and `[uhiPressed, setUhiPressed]`, both initialized to `false`.
    - Define a `toggle(name, current, setter)` helper that calls `setter(!current)` and then `console.log('Overlay toggle', { name, pressed: !current })`.
    - Render a container `<div className="absolute top-4 right-4 z-[500] flex flex-col gap-2">` holding two `<OverlayButton>` children.
    - Define an internal `OverlayButton({ label, pressed, onClick })` function component. It renders a `<button type="button" aria-pressed={pressed} onClick={onClick} className={...}>{label}</button>` where the class string combines a glass base (`backdrop-blur-md bg-white/30 border border-white/40 text-slate-900 shadow-lg rounded-lg px-4 py-2 text-sm font-medium transition`) with a conditional pressed treatment (`ring-2 ring-sky-500 bg-sky-500/40 text-white`) when `pressed` is true.
    - The first button's label is `'PAGASA DRR Overlay'`, the second is `'Urban Heat Island Map'`.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 10.1_

  - [x] 5.2 **[PBT]** Write Property 7 test — Overlay Toggle Parity And Independence
    - Create `src/components/OverlayTogglePanel.test.jsx`.
    - Import `fc`, `render`, `screen`, `fireEvent`, `cleanup` from the React Testing Library and the component.
    - Define an arbitrary click-sequence: `fc.array(fc.constantFrom('pagasa', 'uhi'), { maxLength: 20 })`.
    - Tag the test with `// Feature: command-center-map, Property 7: Overlay Toggle Parity And Independence`.
    - Property: for any generated click sequence, render `<OverlayTogglePanel />`, compute `pagasaCount = seq.filter(x => x === 'pagasa').length` and `uhiCount = seq.filter(x => x === 'uhi').length`, fire a click on the correct button for each entry in order, and assert:
      - the button with accessible name `'PAGASA DRR Overlay'` has `aria-pressed` equal to `(pagasaCount % 2 === 1) ? 'true' : 'false'`;
      - the button with accessible name `'Urban Heat Island Map'` has `aria-pressed` equal to `(uhiCount % 2 === 1) ? 'true' : 'false'`.
    - Call `cleanup()` between iterations. Configure `{ numRuns: 100 }`.
    - _Requirements: 8.5, 8.6_

  - [x] 5.3 **[PBT]** Write Property 8 test — Overlay Toggle Logging
    - In `src/components/OverlayTogglePanel.test.jsx`, add an `it` block tagged `// Feature: command-center-map, Property 8: Overlay Toggle Logging`.
    - Property: for any single click generated by `fc.constantFrom('pagasa', 'uhi')`, spy on `console.log`, render the panel, click the chosen button once, and assert: the spy was called exactly once with a first-arg string containing `'Overlay toggle'` and a second-arg object whose `name` equals `'PAGASA DRR Overlay'` (when the click target was 'pagasa') or `'Urban Heat Island Map'` (when 'uhi'), and whose `pressed` equals the button's post-click `aria-pressed` boolean.
    - Restore the console.log spy and call `cleanup()` between iterations. Configure `{ numRuns: 100 }`.
    - _Requirements: 8.7_

  - [x] 5.4 Write example-based smoke tests for `OverlayTogglePanel`
    - Assert exactly two buttons render (`screen.getAllByRole('button')` has length 2) — Requirement 8.1.
    - Assert the first button's accessible name is `'PAGASA DRR Overlay'`, the second's is `'Urban Heat Island Map'` — Requirements 8.2, 8.3.
    - Assert both buttons carry the `backdrop-blur-md`, `bg-white/30`, and `border` classes in their `className` (glassmorphism signature) — Requirement 8.4.
    - Render the panel, click the PAGASA button once, and assert the `ring-2` class appears in its className; click again and assert it is removed — Requirement 8.8.
    - Assert the panel's outer container carries `absolute`, `top-4`, `right-4` classes (top-right positioning) — Requirement 8.1.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.8_

- [x] 6. Implement the Command_Center_Map (`CommandCenter.jsx`)
  - [x] 6.1 Replace `src/pages/CommandCenter.jsx` with the Command_Center_Map
    - Import `useEffect`, `useState` from `react`; `MapContainer`, `TileLayer`, `Marker`, `Popup` from `react-leaflet`; `'leaflet/dist/leaflet.css'` as a side-effect import; `supabase` from `../supabaseClient.js`; `classifyPinColor`, `PIN_COLOR` from `../lib/pinColor.js`; `iconForPinColor` from `../lib/markerIcons.js`; `OverlayTogglePanel` from `../components/OverlayTogglePanel.jsx`; `TreePinPopup` from `../components/TreePinPopup.jsx`.
    - Default-export `CommandCenter` with no props.
    - Declare three `useState` hooks: `trees` (initial `[]`), `loading` (initial `true`), `errorMessage` (initial `null`).
    - Declare a `useEffect(() => { ... }, [])` that sets up a `cancelled` flag, calls `supabase.from('trees').select('*').then(({ data, error }) => { if (cancelled) return; if (error) { setErrorMessage(error.message ?? 'Unknown error'); setTrees([]); } else { setTrees(Array.isArray(data) ? data : []); } setLoading(false); })`, and returns a cleanup function that sets `cancelled = true`.
    - Define `const isFinitePair = (t) => Number.isFinite(t?.latitude) && Number.isFinite(t?.longitude)` and `const visibleTrees = trees.filter(isFinitePair)`.
    - Return a wrapper `<div className="relative h-full w-full">` containing, in order:
      1. A visually-hidden `<h1 className="sr-only">Command Center</h1>` so existing Phase 1 App tests still find the heading.
      2. A `<MapContainer center={[14.2810, 121.4110]} zoom={14} className="h-full w-full">` with one `<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />` and a `.map` over `visibleTrees` emitting `<Marker key={tree.id} position={[tree.latitude, tree.longitude]} icon={iconForPinColor(classifyPinColor(tree))}><Popup><TreePinPopup tree={tree} color={classifyPinColor(tree)} /></Popup></Marker>`.
      3. `{loading && <div data-testid="map-loading" className="absolute inset-0 z-[400] flex items-center justify-center bg-white/60 backdrop-blur-sm">Loading tree data…</div>}`.
      4. `{errorMessage && <div role="alert" data-testid="map-error" className="absolute top-4 left-4 z-[500] max-w-sm rounded bg-red-50 border border-red-300 text-red-800 px-4 py-3 shadow">Failed to load tree data: {errorMessage}</div>}`.
      5. `<OverlayTogglePanel />`.
    - Do NOT call `supabase.from('trees').insert(...)`, `.update(...)`, `.upsert(...)`, or `.delete(...)` anywhere. The only Supabase call is the single `select('*')` in the effect.
    - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.1, 5.2, 5.4, 5.5, 6.1, 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 6.2 Suppress App Shell padding on the `/map` route in `src/App.jsx`
    - Add `useLocation` to the `react-router-dom` imports alongside the existing `Routes`, `Route`, `Navigate`, `Outlet`.
    - Inside `Shell()`, call `const location = useLocation()` and compute `const isMapRoute = location.pathname === '/map'`, then `const mainClassName = isMapRoute ? 'flex-1 overflow-auto' : 'flex-1 overflow-auto p-6'`.
    - Replace the existing `<main className="flex-1 overflow-auto p-6">` with `<main className={mainClassName}>`.
    - Do not change any other line in `App.jsx` — the routes, redirect, and component ordering stay identical.
    - _Requirements: 2.6, 9.4_

- [x] 7. Write the CommandCenter component test file
  - [x] 7.1 Create `src/pages/CommandCenter.test.jsx` with react-leaflet and Supabase mocks
    - At the top of the file, register the react-leaflet mock (Requirement 9.1):
      ```js
      vi.mock('react-leaflet', () => ({
        MapContainer: ({ children, center, zoom, className }) => (
          <div data-testid="map-container"
               data-center={JSON.stringify(center)}
               data-zoom={String(zoom)}
               className={className}>{children}</div>
        ),
        TileLayer: ({ url, attribution }) => (
          <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
        ),
        Marker: ({ position, icon, children }) => (
          <div data-testid="marker"
               data-position={JSON.stringify(position)}
               data-icon-present={icon ? 'yes' : 'no'}>{children}</div>
        ),
        Popup: ({ children }) => <div data-testid="popup">{children}</div>,
      }));
      ```
    - Register the Supabase mock (Requirement 9.3):
      ```js
      const selectSpy = vi.fn();
      const fromSpy = vi.fn(() => ({
        select: selectSpy,
        insert: vi.fn(), update: vi.fn(), upsert: vi.fn(), delete: vi.fn(),
      }));
      vi.mock('../supabaseClient.js', () => ({ supabase: { from: fromSpy } }));
      ```
    - Reset `selectSpy`, `fromSpy`, and the write-method spies in `beforeEach`.
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 7.2 Write example-based tests for base-map rendering and route wiring
    - `it('renders a MapContainer centered on [14.2810, 121.4110] with zoom in [13, 15]'`: resolve `selectSpy` with `{ data: [], error: null }`, render `<CommandCenter />` inside a `MemoryRouter`, read the `map-container` testid, parse `data-center` as JSON and assert deep-equal to `[14.281, 121.411]`, and parse `data-zoom` as `Number` and assert it is `>= 13 && <= 15`.
    - `it('renders an OpenStreetMap TileLayer'`: assert `data-url` on the `tile-layer` testid matches `/tile.openstreetmap.org/`.
    - `it('suppresses p-6 padding on /map but preserves overflow-auto'`: render `<App />` at `/map`; assert the `<main>` element contains `overflow-auto` AND does NOT contain `p-6`.
    - `it('preserves p-6 padding on /inventory'`: render `<App />` at `/inventory`; assert `<main>` contains `p-6` — regression guard for Requirement 2.6.
    - `it('still renders Sidebar and Header on /map'`: render `<App />` at `/map`; assert `role="navigation"` and `role="banner"` are both present.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 7.3 Write example-based tests for Supabase fetch lifecycle
    - `it('calls supabase.from("trees").select("*") exactly once on mount'`: resolve `selectSpy` with `{ data: [], error: null }`, render once, assert `fromSpy` was called with `'trees'` and `selectSpy` was called with `'*'`.
    - `it('shows a loading indicator while the Supabase promise is pending'`: `selectSpy.mockReturnValueOnce(new Promise(() => {}))`, render, assert `screen.getByTestId('map-loading')` is present.
    - `it('renders zero markers and no error banner when Supabase returns an empty array'`: resolve with `{ data: [], error: null }`, render, `await waitFor`, assert `screen.queryByTestId('marker')` is null AND `screen.queryByTestId('map-error')` is null AND `screen.getByTestId('map-container')` is present.
    - `it('renders a visible error banner when Supabase returns an error'`: resolve with `{ data: null, error: { message: 'network down' } }`, render, `await waitFor`, assert `screen.getByTestId('map-error')` is present and its text contains `'network down'`, and `screen.getByTestId('map-container')` is still present.
    - `it('never calls insert, update, upsert, or delete on the trees table'`: run a representative render with the success branch, then assert each write spy on the object returned by `fromSpy` was not called.
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.7, 7.5, 11.3, 11.4_

  - [x] 7.4 **[PBT]** Write Property 2 test — Coordinate Filtering
    - In `src/pages/CommandCenter.test.jsx`, add an `it` block tagged `// Feature: command-center-map, Property 2: Coordinate Filtering`.
    - Property: for any `trees` from `fc.array(treeRecordWithAnyCoordsArb, { maxLength: 15 })`, resolve `selectSpy` with `{ data: trees, error: null }`, render `<CommandCenter />` in a `MemoryRouter`, `await waitFor` markers to appear, and assert:
      - `screen.queryAllByTestId('marker').length === trees.filter((t) => Number.isFinite(t.latitude) && Number.isFinite(t.longitude)).length`.
      - The set of parsed `data-position` values on the rendered markers equals the set of `[latitude, longitude]` pairs from the finite-coord subset (compare as sorted JSON strings to make set-equality deterministic).
    - Call `cleanup()` and reset `selectSpy` between iterations. Configure `{ numRuns: 100 }`.
    - _Requirements: 3.6, 5.1_

  - [x] 7.5 **[PBT]** Write Property 3 test — Marker Icon Matches Classification
    - In `src/pages/CommandCenter.test.jsx`, add an `it` block tagged `// Feature: command-center-map, Property 3: Marker Icon Matches Classification`.
    - Because the mocked `Marker` stores only `data-icon-present` (not the icon object itself), enrich the mock for THIS test: either extend the module mock to stash the `icon` prop on a shared `__markerIcons` array by `position` key, OR additionally import `iconForPinColor` from the source lib and verify the rendered count per color matches the count expected from `treeRecordArb.map(classifyPinColor)`. Prefer the second approach: group input records by `classifyPinColor(t)` and group rendered markers by the icon-color inferable from `classifyPinColor(trees[i])`, then assert the per-color counts match.
    - Preferred concrete shape: for any `trees` from `fc.array(treeRecordArb, { maxLength: 10 })` (finite coords only), resolve Supabase with those trees, render, compute `expectedCounts = { Red: 0, Orange: 0, Yellow: 0, Green: 0 }` by iterating `trees` and incrementing by `classifyPinColor(t)`, then assert each rendered marker carries `data-icon-present="yes"` AND the total rendered marker count equals the total expected count. (The exact icon identity is covered by the `markerIcons.test.js` singleton assertion, so this test focuses on "every classifier-routed marker rendered".)
    - Configure `{ numRuns: 100 }` and clean up between iterations.
    - _Requirements: 5.2, 5.3_

  - [x] 7.6 Write example-based tests for marker/popup wiring
    - `it('pairs every Marker with a Popup descendant'` (Requirement 6.1): resolve with two finite-coord trees, render, assert every `marker` testid contains a `popup` testid child.
    - `it('does not emit a React key warning for unique ids'` (Requirement 5.4): spy on `console.error`, render three rows with unique ids, assert no call's first argument matches `/key/i`.
    - `it('every marker carries a non-default icon'` (Requirement 5.5): resolve with at least one finite-coord tree, render, assert all `marker` testids have `data-icon-present="yes"`.
    - _Requirements: 5.4, 5.5, 6.1_

- [x] 8. Update `src/pages/pages.test.jsx` for the Phase 2 contract change
  - [x] 8.1 Drop the `CommandCenter` block from the placeholder test table
    - Remove the `CommandCenter` object (the first entry) from the `placeholderCases` array in `src/pages/pages.test.jsx`.
    - Remove the unused `import CommandCenter from './CommandCenter.jsx';` line.
    - Keep the `InventoryView`, `ActionBoard`, `AnalyticsView`, and `NotFound` test blocks unchanged.
    - Add a one-line comment above the removal: `// CommandCenter is now a real component covered by CommandCenter.test.jsx.`.
    - _Requirements: 9.4_

- [x] 9. Final checkpoint — Phase 2 map complete
  - Run `npm test` and confirm: all Phase 1 tests still pass; Properties 1–8 each run 100 iterations; every example-based Phase 2 test passes; no `console.error` is emitted from React about keys; `/map` renders edge-to-edge and `/inventory` keeps its padding.
  - Ensure no Supabase writes are dispatched anywhere in the codebase (grep `supabase.from('trees').(insert|update|upsert|delete)` returns nothing outside test mocks).
  - Ask the user if questions arise.
  - _Requirements: 9.4, 9.5, 11.3_

## Notes

- **PBT tasks are marked `[PBT]`.** Tasks 2.2, 4.2, 4.3, 4.4, 5.2, 5.3, 7.4, and 7.5 each implement exactly one design property with `fast-check`, 100 runs, and a leading-comment tag.
- **Mocking scope.** `vi.mock('react-leaflet', ...)` and `vi.mock('../supabaseClient.js', ...)` are declared inside `src/pages/CommandCenter.test.jsx` only. `TreePinPopup.test.jsx` and `OverlayTogglePanel.test.jsx` do not render `react-leaflet` at all, so they do not need the mock. Phase 1 test files are unchanged.
- **Phase 1 regression coverage.** `App.test.jsx` and `pages.test.jsx` (for the three remaining placeholders + NotFound), `Sidebar.test.jsx`, `Header.test.jsx`, `types.test.js`, and `supabaseClient.test.js` continue to run unchanged. Only the `CommandCenter` block in `pages.test.jsx` is removed (task 8.1) — a deliberate contract update per the design, not a regression.
- **Out-of-scope for Phase 2** per Requirement 11 and the user's explicit scoping: real PAGASA DRR data layer, real Urban Heat Island data layer, real dispatch workflow, Supabase writes, any Inventory/Action_Board/Analytics logic. Do not add them here.
- **Task-to-requirement traceability.** Every task lists the specific acceptance criteria it implements under `_Requirements:_`. Task 9 is the regression gate.

## Workflow Completion

This workflow produces planning artifacts only. Phase 2 implementation does not begin as part of this workflow. To start executing Phase 2, open `tasks.md` and click **Start task** next to the first task item.
