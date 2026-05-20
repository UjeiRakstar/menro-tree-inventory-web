# Requirements Document

## Introduction

This is Phase 1 of a multi-phase UI/UX overhaul for the Tree Inventory web application. The goal of this phase is narrow and intentionally low-risk: replace the existing global header branding and navigation with the new MENRO-branded layout, and create a stub page component (`BiodiversityDashboard.jsx`) wired into routing as the destination for the new "Biodiversity Dashboard" navigation entry.

This phase delivers no new analytics, data binding, or styling work beyond what is required to establish the shell. The intent is to land the navigation skeleton stably so that subsequent phases can fill in the dashboard contents without further routing or header churn.

This is a **Cowboy Mode MVP**: no automated tests will be created or updated as part of this phase. Manual smoke verification only.

## Glossary

- **Application**: The Tree Inventory React + Vite single-page application contained in this workspace.
- **Global_Header**: The top-of-viewport React component currently implemented in `src/components/Header.jsx`, rendered inside the `Shell` layout in `src/App.jsx`. This is the only navigation surface visible to authenticated users.
- **Sidebar_Component**: The component at `src/components/Sidebar.jsx`. It is exported but is not rendered by `App.jsx` and is therefore considered dead code for this phase. It is not part of the active navigation surface.
- **Biodiversity_Dashboard**: A new React functional component to be created at `src/pages/BiodiversityDashboard.jsx`. In Phase 1 this is a shell (placeholder) page only.
- **Biodiversity_Hub**: The existing component at `src/pages/BiodiversityHub.jsx`. It hosts the current inventory + analytics views and is mounted at the `/inventory` route. It is out of scope for Phase 1 and continues to exist unchanged.
- **Router**: The `react-router-dom` v6 routing configured in `src/App.jsx`.
- **Nav_Link**: A `react-router-dom` `NavLink` element rendered inside the Global_Header that navigates the Application to a route on click.
- **Logout_Control**: An interactive control rendered inside the Global_Header that signs the current user out via Supabase and navigates the Application to `/login`.
- **Logo_Asset_Directory**: The directory `src/assets/` from which logo image files are imported as ES module assets and processed by Vite at build time. The two logo files in this directory are `Santa Cruz Logo.png` and `MENRO Santa Cruz logo.png`.
- **Cowboy_Mode_MVP**: A scope policy under which no test files are created, modified, or deleted as part of this phase.

## Requirements

### Requirement 1: Header Branding (Logos and Title)

**User Story:** As a MENRO Santa Cruz staff user, I want the application header to display the official Santa Cruz and MENRO logos alongside the system title, so that the application is clearly identified as the MENRO Santa Cruz Tree Inventory System.

#### Acceptance Criteria

1. THE Global_Header SHALL render exactly two image elements on the left side of the header, in left-to-right order: first the Santa Cruz logo, then the MENRO logo, both vertically centered relative to the header's vertical axis.
2. THE Global_Header SHALL load the first logo image by importing the file `src/assets/Santa Cruz Logo.png` as an ES module asset (Vite default-imported into a variable used as the `<img>` `src`).
3. THE Global_Header SHALL load the second logo image by importing the file `src/assets/MENRO Santa Cruz logo.png` as an ES module asset (Vite default-imported into a variable used as the `<img>` `src`).
4. THE Global_Header SHALL render, immediately to the right of the two logos, a single text element containing exactly the string `Tree Inventory System of MENRO Santa Cruz` with no leading, trailing, or collapsed internal whitespace differences.
5. THE Global_Header SHALL apply the Tailwind `font-bold` utility class to the title text element specified in criterion 4, such that the rendered CSS `font-weight` is `700`.
6. THE Global_Header SHALL render the first logo image with HTML `alt` attribute value exactly `Santa Cruz logo` and the second logo image with HTML `alt` attribute value exactly `MENRO Santa Cruz logo`.
7. IF the file `src/assets/Santa Cruz Logo.png` is not present at build time, THEN THE Application SHALL fail the Vite build with a non-zero exit code and an error indicating the missing asset path, and SHALL NOT produce a `dist/` output bundle for that build.
8. IF the file `src/assets/MENRO Santa Cruz logo.png` is not present at build time, THEN THE Application SHALL fail the Vite build with a non-zero exit code and an error indicating the missing asset path, and SHALL NOT produce a `dist/` output bundle for that build.
9. THE Global_Header SHALL render each logo image at an equal rendered height between 32px and 64px inclusive, preserving each image's natural aspect ratio so that neither logo is visually distorted.
10. THE Global_Header SHALL render the two logos and the title text on a single horizontal row with a visible horizontal gap of at least 8px between the two logos and at least 8px between the second logo and the title text, with no line-wrapping at viewport widths of 1024px or greater.

### Requirement 2: Header Navigation Sequence

**User Story:** As a MENRO Santa Cruz staff user, I want the global navigation to present links in a specific, predictable order, so that I can locate each section of the application reliably.

#### Acceptance Criteria

1. THE Global_Header SHALL render exactly five navigation entries in the navigation region, in the following left-to-right order, with no additional entries before, between, or after them: (1) `Biodiversity Dashboard`, (2) `Map`, (3) `Action Board`, (4) `Arborist`, (5) `Logout`.
2. THE Nav_Link with label `Biodiversity Dashboard` SHALL navigate to the route path `/biodiversity-dashboard` and SHALL render that exact label text with no leading or trailing whitespace.
3. THE Nav_Link with label `Map` SHALL navigate to the route path `/map` and SHALL render that exact label text with no leading or trailing whitespace.
4. THE Nav_Link with label `Action Board` SHALL navigate to the route path `/action-board` and SHALL render that exact label text with no leading or trailing whitespace.
5. THE Nav_Link with label `Arborist` SHALL navigate to the route path `/arborists` and SHALL render that exact label text with no leading or trailing whitespace.
6. THE Logout_Control SHALL be rendered as the fifth and final navigation entry, positioned immediately to the right of the `Arborist` Nav_Link, and SHALL be activatable by both pointer click and keyboard Enter or Space key while focused.
7. WHEN the user activates the Logout_Control, THE Application SHALL invoke `supabase.auth.signOut()` and, upon successful resolution, SHALL navigate to the route path `/login` within 2 seconds of activation.
8. IF the invocation of `supabase.auth.signOut()` returns an error or fails to resolve within 5 seconds, THEN THE Application SHALL remain on the current route, SHALL display a visible error indication informing the user that logout failed, and SHALL re-enable the Logout_Control for retry.
9. WHEN the current route path exactly matches, or begins with followed by `/`, the destination route path of a Nav_Link, THE Global_Header SHALL render that single Nav_Link with an active style that differs from inactive Nav_Links in at least one of the following observable attributes: text color, background color, font weight, or underline, while rendering all other Nav_Links in the inactive style.
10. THE Global_Header SHALL NOT render any navigation entries other than the five listed in criterion 1, regardless of the current route or authenticated user state.

### Requirement 3: Biodiversity Dashboard Shell Component

**User Story:** As a developer working on subsequent UI overhaul phases, I want a stable shell component for the new Biodiversity Dashboard, so that later phases can populate it with analytics content without changing routing or header wiring.

#### Acceptance Criteria

1. THE Application SHALL include a new file at the path `src/pages/BiodiversityDashboard.jsx` such that a case-sensitive file existence check at that exact path returns true.
2. THE file `src/pages/BiodiversityDashboard.jsx` SHALL define a React functional component named exactly `BiodiversityDashboard` (matching character-for-character, including capitalization) and SHALL expose it as the module's default export.
3. WHEN the `BiodiversityDashboard` component is rendered in isolation with no props, THE Biodiversity_Dashboard component SHALL produce a DOM tree whose single root element is a `<div>` element with no sibling elements at the root level.
4. THE root `<div>` element of the Biodiversity_Dashboard component SHALL include the Tailwind utility class token `bg-gray-50` within its `className` attribute, verifiable by checking that the rendered root element's class list contains the exact token `bg-gray-50`.
5. THE Biodiversity_Dashboard component SHALL render exactly one `<h1>` element as a direct child of the root `<div>`, where "exactly one" means the count of `<h1>` descendants of the root `<div>` equals 1 and the count of all other element types as direct children of the root `<div>` equals 0.
6. THE `<h1>` element SHALL contain text content equal to the string `Biodiversity Analytics` (case-sensitive, no leading or trailing whitespace, no additional child elements or text nodes).
7. IF any module imported (directly or transitively through the component file's own import statements) by `src/pages/BiodiversityDashboard.jsx` references the Supabase client, performs a `fetch` or `XMLHttpRequest` call, or otherwise initiates network or file I/O during component import or render in Phase 1, THEN THE Application SHALL be considered non-compliant with this requirement, verifiable by static inspection of the file's import statements showing zero imports of `supabaseClient`, `fetch`, `axios`, or any other I/O-performing module.
8. WHEN the `BiodiversityDashboard` component is rendered in isolation with no props, THE Biodiversity_Dashboard component SHALL complete its initial render without throwing any error and without producing any React console error or warning.

### Requirement 4: Routing for Biodiversity Dashboard

**User Story:** As a MENRO Santa Cruz staff user, I want clicking the "Biodiversity Dashboard" navigation entry to take me to the new dashboard shell, so that the new navigation entry is functional from day one of the overhaul.

#### Acceptance Criteria

1. THE Router SHALL register exactly one protected route with path string equal to `biodiversity-dashboard` (lowercase, hyphen-separated, no leading slash, no trailing slash) that renders the Biodiversity_Dashboard component as its element.
2. WHEN an authenticated user navigates to the URL path `/biodiversity-dashboard`, THE Application SHALL render the Biodiversity_Dashboard component as a child of the existing authenticated `Shell` layout, such that the `Shell` layout (including its Sidebar and Header) remains mounted and visible.
3. WHEN an unauthenticated user navigates to the URL path `/biodiversity-dashboard`, THE Application SHALL redirect the browser to the URL path `/login`, SHALL NOT mount the Biodiversity_Dashboard component, and SHALL NOT render any Biodiversity_Dashboard content in the DOM.
4. IF the existing `ProtectedRoute` redirect mechanism does not produce a redirect for an unauthenticated user on `/biodiversity-dashboard`, THEN THE Application SHALL render no Biodiversity_Dashboard content in the DOM and SHALL perform no navigation to any other route.
5. WHEN any user navigates to the URL path `/inventory`, THE Router SHALL continue to resolve the existing route with path `inventory` to the Biodiversity_Hub component, with the path string and target component unchanged from the pre-overhaul configuration.
6. THE Router SHALL preserve each of the existing routes `/map`, `/action-board`, `/arborists`, `/permits`, `/login`, `/signup`, and the catch-all `*` with their path strings and target components byte-identical to the pre-overhaul configuration, and SHALL NOT add, remove, rename, or remap any of these routes.
7. IF a user navigates to any URL path that does not match a registered route (including paths that are case-variant of `/biodiversity-dashboard` such as `/Biodiversity-Dashboard` or `/biodiversitydashboard`), THEN THE Router SHALL resolve the request via the existing catch-all `*` route without rendering the Biodiversity_Dashboard component.

### Requirement 5: Scope Boundaries (Out of Scope for Phase 1)

**User Story:** As a project stakeholder, I want Phase 1 to be tightly scoped, so that the navigation skeleton can land independently of larger dashboard work.

#### Acceptance Criteria

1. THE Phase_1 scope SHALL NOT alter the file contents (any byte-level change) of the Biodiversity_Hub component at `src/pages/BiodiversityHub.jsx`.
2. THE Phase_1 scope SHALL NOT alter the file contents (any byte-level change) of the Sidebar_Component at `src/components/Sidebar.jsx` or the Sidebar re-export at `src/Sidebar.jsx`.
3. THE Phase_1 scope SHALL NOT alter the route paths, route component bindings, or route guards of the `/inventory`, `/action-board`, `/arborists`, `/permits`, `/map`, `/login`, or `/signup` routes, except for changes explicitly required by Requirement 2 or Requirement 4.
4. THE Phase_1 scope SHALL restrict the new Biodiversity_Dashboard component to static placeholder content only, containing zero analytics data values, zero charts, zero tables, and zero Supabase queries.
5. WHERE the Cowboy_Mode_MVP policy applies, THE Phase_1 scope SHALL NOT add, rename, move, modify, or delete any test file in the project.
6. IF an existing test fails as a side effect of Phase 1 changes, THEN THE Phase_1 scope SHALL leave the failing test file byte-for-byte unchanged and SHALL record the failing test name, the test file path, and the observed failure mode in the Phase 1 implementation notes document.

### Requirement 6: Build and Render Stability

**User Story:** As a developer, I want Phase 1 changes to keep the application buildable and runnable, so that the team can continue to develop and deploy without regression.

#### Acceptance Criteria

1. WHEN `npm run build` is executed against the repository after Phase 1 changes are committed, THE Application SHALL complete the build within 120 seconds and exit with status code 0, producing a `dist/` output directory containing at minimum `index.html` and at least one JavaScript bundle.
2. IF `npm run build` exits with a non-zero status code, emits any error categorized by Vite or the Rollup bundler as `error` (not `warning`), or fails to produce the `dist/` output directory, THEN THE Application SHALL be considered failing this requirement and the Phase 1 changes SHALL be rejected.
3. WHEN the Application is loaded by an authenticated user at the application root URL after Phase 1 changes are deployed, THE Global_Header SHALL render to the DOM within 5 seconds of initial page load and SHALL NOT cause any entry of severity `error` to be written to `window.console` and SHALL NOT trigger a React error boundary fallback.
4. WHEN an authenticated user clicks the `Biodiversity Dashboard` Nav_Link, THE Application SHALL navigate to the path `/biodiversity-dashboard` within 2 seconds, render the Biodiversity_Dashboard component to the DOM, and SHALL NOT cause any entry of severity `error` to be written to `window.console` and SHALL NOT trigger a React error boundary fallback during navigation or initial render.
5. WHEN an authenticated user clicks any of the `Map`, `Action Board`, or `Arborist` Nav_Link entries, THE Application SHALL navigate to the corresponding pre-existing route within 2 seconds, render the corresponding pre-existing page component to the DOM, and SHALL NOT cause any entry of severity `error` to be written to `window.console` and SHALL NOT trigger a React error boundary fallback during navigation or initial render.
6. IF clicking any Nav_Link defined in criteria 4 or 5 results in navigation to a route that resolves to the NotFound page, an unhandled promise rejection, or a React error boundary fallback, THEN THE Application SHALL be considered failing this requirement for that specific Nav_Link.
