# Implementation Plan: UI Overhaul Phase 1 — Navbar + Dashboard Shell

## Overview

Phase 1 lands the new MENRO-branded global header and a stub `BiodiversityDashboard` page wired into the existing protected `Shell` route tree. The diff is intentionally narrow: rewrite `src/components/Header.jsx` in place, add `src/pages/BiodiversityDashboard.jsx`, and add a single additive route line plus its import to `src/App.jsx`.

This is a Cowboy Mode MVP. Per Requirement 5.5 and the design's Testing Strategy, no test files are added, renamed, moved, modified, or deleted. Verification is limited to a clean `npm run build` and a scope-diff check that a coding agent can perform without running the app. The five correctness properties documented in the design are recorded for design fidelity and seeded for later phases — none are converted to automated tests in Phase 1.

Implementation language: JavaScript / JSX (matches the existing repo: React 18 + Vite + Tailwind + `react-router-dom` v6 + `@supabase/supabase-js`).

## Tasks

- [x] 1. Create the Biodiversity Dashboard shell component
  - [x] 1.1 Create `src/pages/BiodiversityDashboard.jsx`
    - Define a React functional component named exactly `BiodiversityDashboard` and expose it as the default export
    - Render a single root `<div>` whose `className` includes the token `bg-gray-50` (additional utility classes such as `p-6` are allowed)
    - Render exactly one `<h1>` as the only direct child of the root `<div>`, with text content equal to `Biodiversity Analytics` (case-sensitive, no leading/trailing whitespace, no other child nodes inside the `<h1>`)
    - Add zero imports of `supabaseClient`, `fetch`, `axios`, or any other I/O-performing module; component must be pure JSX
    - Initial render must complete without throwing and without emitting any React console error or warning
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 5.4_

- [x] 2. Rewrite the global Header with MENRO branding and navigation
  - [x] 2.1 Replace `src/components/Header.jsx` layout, branding, and NavLink rendering
    - Keep the public API: default export, no props
    - Default-import the two logo assets: `santaCruzLogo` from `../assets/Santa Cruz Logo.png` and `menroLogo` from `../assets/MENRO Santa Cruz logo.png`
    - Render two `<img>` elements on the left, in left-to-right order Santa Cruz then MENRO, vertically centered, each at an equal rendered height between 32px and 64px (e.g. Tailwind `h-10`) with `w-auto` to preserve aspect ratio
    - Set `alt="Santa Cruz logo"` on the first image and `alt="MENRO Santa Cruz logo"` on the second image (exact strings)
    - Render a single text element immediately to the right of the logos containing exactly `Tree Inventory System of MENRO Santa Cruz`, with the Tailwind `font-bold` utility applied so computed `font-weight` is `700`
    - Use a flex row with `whitespace-nowrap` on the title and a horizontal gap of at least 8px between the two logos and at least 8px between the second logo and the title (e.g. `gap-3`); no line wrapping at viewport widths >= 1024px
    - Define a module-internal `NAV_ITEMS` constant containing exactly these four entries in this order, each with the absolute path shown:
      - `{ to: '/biodiversity-dashboard', label: 'Biodiversity Dashboard' }`
      - `{ to: '/map',                    label: 'Map' }`
      - `{ to: '/action-board',           label: 'Action Board' }`
      - `{ to: '/arborists',              label: 'Arborist' }`
    - Render NAV_ITEMS as `react-router-dom` `NavLink` elements inside a `<nav>`, in order, with no extra entries before, between, or after them, and with each label rendered as exact text (no leading/trailing whitespace)
    - Use `NavLink`'s `isActive` prop with `end` omitted or `false` to apply an active style that differs from the inactive style in at least one of: text color, background color, font weight, or underline
    - Append the Logout control as the fifth and final navigation entry, immediately to the right of the `Arborist` NavLink (see task 2.2)
    - Do not render any navigation entries other than these five, regardless of route or auth state
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 1.10, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9, 2.10_

  - [x] 2.2 Implement the Logout control and `handleLogout` flow in `src/components/Header.jsx`
    - Render the Logout control as a native `<button type="button">` so it is activatable by both pointer click and keyboard Enter/Space; give it `aria-label="Logout"` and the visible text `Logout`
    - Track two transient UI flags via `useState`: `busy` (disables the button while a logout is in flight) and `logoutError` (drives the error surface)
    - On activation: set `logoutError=false` and `busy=true`, then `Promise.race` `supabase.auth.signOut()` against a 5-second timeout that rejects with `Error('logout-timeout')`
    - On success (resolved value with no `error` field): call `useNavigate()`'s `navigate('/login')` so the redirect lands within 2 seconds of activation in the happy path
    - On failure — thrown exception, rejected promise, resolved `{ error }` object, or 5-second timeout — do not call `navigate`, set `logoutError=true`, and re-enable the button by setting `busy=false` in a `finally` block
    - When `logoutError` is true, render a visible `role="alert"` element below the header row with the message `Logout failed. Please try again.` so assistive tech announces the failure
    - _Requirements: 2.6, 2.7, 2.8_

- [x] 3. Checkpoint — Header rewrite and dashboard stub in place
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Wire `BiodiversityDashboard` into the protected route tree
  - [x] 4.1 Add the dashboard route to `src/App.jsx`
    - Add the import `import BiodiversityDashboard from './pages/BiodiversityDashboard.jsx';` alongside the other page imports
    - Inside the existing `<Route element={<ProtectedRoute session={session} />}>` block, register exactly one new route: `<Route path="biodiversity-dashboard" element={<BiodiversityDashboard />} />` (path is lowercase, hyphen-separated, no leading or trailing slash)
    - Place the new route line before the catch-all `<Route path="*" element={<NotFound />} />` so router specificity resolves the dashboard before falling through
    - Leave every other route line byte-identical: `index` redirect to `/map`, `map`, `inventory`, `action-board`, `arborists`, `permits`, `*`, plus the public `/login` and `/signup` routes — no path string changes, no element-component swaps, no guard changes
    - Do not modify `ProtectedRoute`, `Shell`, or any other wrapper; the new route inherits the existing redirect-to-`/login` semantics for unauthenticated users automatically
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.3_

- [x] 5. Verify Cowboy Mode scope boundaries and build stability
  - [x] 5.1 Confirm out-of-scope files are byte-identical and no test files are touched
    - Run `git diff --name-only` against the pre-Phase-1 baseline and confirm the only changed paths are `src/components/Header.jsx`, `src/App.jsx`, and the new `src/pages/BiodiversityDashboard.jsx`
    - Confirm `src/pages/BiodiversityHub.jsx`, `src/components/Sidebar.jsx`, and `src/Sidebar.jsx` are byte-identical to baseline
    - Confirm no path matching the globs `**/*.test.js`, `**/*.test.jsx`, or `src/test/**` appears in the diff (no test file added, renamed, moved, modified, or deleted)
    - _Requirements: 5.1, 5.2, 5.3, 5.5_
  - [x] 5.2 Run `npm run build` and confirm a clean Vite production build
    - Command must exit with status code 0 within 120 seconds
    - The `dist/` output directory must contain `index.html` and at least one JavaScript bundle
    - No Vite/Rollup output entries categorized as `error` (warnings are tolerated)
    - If either logo asset is missing, the unresolved-import build failure is the expected and required behavior — do not bypass it
    - _Requirements: 1.7, 1.8, 6.1, 6.2_

- [x] 6. Final checkpoint — Build passes and scope is clean
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- **Cowboy Mode**: No test sub-tasks are included. Per Requirement 5.5 and the design's Testing Strategy, Phase 1 adds, modifies, renames, moves, and deletes zero test files. The five correctness properties in the design are recorded for design fidelity and as seeds for later phases; their Phase 1 verification is manual, not automated, and is therefore out of scope for tasks a coding agent executes.
- **Manual verification not represented as tasks**: The design's manual smoke checklist (rendering the authenticated app, clicking through nav links, fault-injecting `supabase.auth.signOut`, etc.) is intentionally not converted to tasks because the workflow forbids "running the application to test end-to-end flows" as a coding-agent task. Run that checklist manually before merging.
- **Each task references its specific sub-requirements** (granular acceptance criteria, not just user stories) so traceability is preserved without coupling implementation to test files.
- **Ordering rationale**: Task 1.1 and task 2.1 touch different files and can run first in parallel. Task 2.2 layers the logout behavior on top of 2.1's Header skeleton (same file, sequential). Task 4.1 depends on the dashboard component existing because of its import. Task 5 verifies the cumulative result.
- **Runtime dependencies are already installed** in `package.json`: `react`, `react-router-dom`, `@supabase/supabase-js`, Tailwind utilities, and the two logo assets in `src/assets/`. No new packages are added.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["2.2"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["5.1", "5.2"] }
  ]
}
```
