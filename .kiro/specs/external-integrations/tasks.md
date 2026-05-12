# Implementation Plan: External Integrations

## Overview

Phase 8 integrates external data sources into the Command Center map. Three capabilities are added: Cloudinary image rendering with error fallback in TreePinPopup, a PAGASA DRR overlay (Polygon + Signal Badge), and an Urban Heat Island overlay (3 Circles). The OverlayTogglePanel is refactored from internal state to a controlled component so CommandCenter owns toggle state and conditionally renders overlays. All changes use existing dependencies only.

## Tasks

- [x] 1. Refactor OverlayTogglePanel to controlled component
  - [x] 1.1 Convert OverlayTogglePanel from internal state to controlled props
    - Remove the two `useState` calls from OverlayTogglePanel
    - Accept `pagasaPressed`, `uhiPressed`, `onPagasaToggle`, `onUhiToggle` as props
    - Replace internal `toggle` function: each button's `onClick` calls the corresponding callback with the negated current prop value
    - Remove the `console.log` side-effect from OverlayTogglePanel (it moves to CommandCenter's callbacks)
    - Keep the `OverlayButton` sub-component unchanged (it already receives `pressed` and `onClick`)
    - _Requirements: 6.1_

  - [x] 1.2 Update OverlayTogglePanel tests for controlled interface
    - Update all existing tests in `OverlayTogglePanel.test.jsx` to pass the required props (`pagasaPressed`, `uhiPressed`, `onPagasaToggle`, `onUhiToggle`)
    - Refactor Property 7 (toggle parity) to track state externally via mock callbacks and re-renders
    - Refactor Property 8 (toggle logging) — since console.log moves to CommandCenter, either remove this property test or adapt it to verify callback invocation instead
    - Ensure all existing assertions (glassmorphism classes, positioning, independence) still pass with the new controlled interface
    - _Requirements: 6.1, 9.1, 9.3_

- [x] 2. Add Cloudinary image error handling to TreePinPopup
  - [x] 2.1 Implement imgError state and onError handler in TreePinPopup
    - Add `const [imgError, setImgError] = useState(false)` local state
    - Compute `const showImage = tree.photo_url && !imgError`
    - Attach `onError={() => setImgError(true)}` to the `<img>` element
    - Render placeholder when `!showImage` (covers both null photo_url and error cases)
    - Update `<img>` classes from `"w-full h-28 object-cover rounded mb-2"` to `"object-cover w-full h-32 rounded-md mb-2"`
    - Update placeholder classes to `"w-full h-32 rounded-md mb-2 bg-slate-200 flex items-center justify-center text-slate-500 text-xs"`
    - Add `import { useState } from 'react'` at the top of the file
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

  - [ ]* 2.2 Write property test for image error fallback (Property 1)
    - **Property 1: Image error fallback preserves popup integrity**
    - Generator: `treeRecordArb` filtered to trees with non-null `photo_url`
    - Steps: Render TreePinPopup → find `<img>` → fire `error` event via `fireEvent.error(img)` → assert placeholder appears with `data-testid="tree-photo-placeholder"` → assert img is gone → assert tree_id/species/dbh still in text content → assert Dispatch button present iff color is Red
    - **Validates: Requirements 3.2, 3.4, 7.3**

  - [ ]* 2.3 Write example-based tests for Cloudinary image rendering
    - Test: img renders with correct new classes (`object-cover w-full h-32 rounded-md`) when photo_url is non-null
    - Test: After img error event, placeholder appears with `data-testid="tree-photo-placeholder"`
    - Test: Placeholder from error has same dimensions/classes as placeholder from null photo_url (h-32 rounded-md)
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 3. Checkpoint - Verify TreePinPopup and OverlayTogglePanel changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Wire overlay state and rendering in CommandCenter
  - [x] 4.1 Add overlay state and constants to CommandCenter
    - Add `Polygon` and `Circle` to the react-leaflet import
    - Add `PAGASA_POLYGON_COORDS` constant: `[[14.311, 121.371], [14.311, 121.451], [14.251, 121.451], [14.251, 121.371]]`
    - Add `UHI_CIRCLES` constant with 3 entries: `{ id: 'uhi-high', center: [14.285, 121.415], radius: 400, color: '#dc2626' }`, `{ id: 'uhi-moderate', center: [14.278, 121.405], radius: 550, color: '#f97316' }`, `{ id: 'uhi-low', center: [14.275, 121.420], radius: 700, color: '#eab308' }`
    - Add `const [pagasaActive, setPagasaActive] = useState(false)` and `const [uhiActive, setUhiActive] = useState(false)` state
    - Add `handlePagasaToggle` and `handleUhiToggle` callbacks that set state and call `console.log('Overlay toggle', { name, pressed: next })`
    - _Requirements: 4.1, 5.1, 5.2, 5.3, 6.2_

  - [x] 4.2 Pass controlled props to OverlayTogglePanel and render overlays
    - Update `<OverlayTogglePanel />` to pass `pagasaPressed={pagasaActive}`, `uhiPressed={uhiActive}`, `onPagasaToggle={handlePagasaToggle}`, `onUhiToggle={handleUhiToggle}`
    - Inside MapContainer (after markers): conditionally render `<Polygon positions={PAGASA_POLYGON_COORDS} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.2, interactive: false }} />` when `pagasaActive`
    - Inside MapContainer: conditionally render `UHI_CIRCLES.map(c => <Circle key={c.id} center={c.center} radius={c.radius} pathOptions={{ color: c.color, fillColor: c.color, fillOpacity: 0.35 }} />)` when `uhiActive`
    - Outside MapContainer (sibling to OverlayTogglePanel): conditionally render Signal Badge `<div data-testid="signal-badge" className="absolute top-4 left-4 z-[500] bg-red-600 text-white text-sm font-bold px-4 py-2 rounded-lg shadow-lg">⚠️ PAGASA SIGNAL NO. 2 ACTIVE</div>` when `pagasaActive`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 5.1, 5.4, 5.5, 6.2, 6.3, 6.4_

- [x] 5. Update CommandCenter tests for overlay behavior
  - [x] 5.1 Add Polygon and Circle mocks and write overlay tests
    - Add `Polygon` and `Circle` to the existing `vi.mock('react-leaflet', ...)` block with `data-testid="polygon"` and `data-testid="circle"` respectively
    - Polygon mock: render `data-testid="polygon"`, `data-positions`, `data-interactive` attributes
    - Circle mock: render `data-testid="circle"`, `data-center`, `data-radius`, `data-color` attributes
    - Test: Initial render has no polygon, no circle, no signal-badge
    - Test: Click PAGASA toggle → polygon and signal-badge appear
    - Test: Click PAGASA toggle again → polygon and signal-badge disappear
    - Test: Click UHI toggle → exactly 3 circles appear
    - Test: Click UHI toggle again → all circles disappear
    - Test: Both toggles active simultaneously → polygon + badge + 3 circles all present
    - Test: PAGASA polygon has `interactive: false` (via data-interactive attribute)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 5.2 Write property test for controlled toggle callback correctness (Property 2)
    - **Property 2: Controlled toggle callback correctness**
    - Generator: `fc.array(fc.constantFrom('pagasa', 'uhi'), { maxLength: 20 })` for click sequences
    - Steps: Render CommandCenter with mocked Supabase → replay click sequence on toggle buttons → verify each toggle's overlay appears/disappears correctly based on odd/even click count
    - **Validates: Requirements 6.1**

- [x] 6. Final checkpoint - Full test suite green
  - Ensure all tests pass, ask the user if questions arise.
  - Verify total passing test count ≥ 218 (baseline 206 + new tests)
  - Verify zero failures, zero skipped tests

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit/example tests validate specific interactions and static configurations
- The OverlayTogglePanel refactoring (task 1) must complete before CommandCenter wiring (task 4) since CommandCenter depends on the controlled interface
- No new dependencies are allowed (Requirement 1) — only existing react-leaflet components and standard HTML elements

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["5.1", "5.2"] }
  ]
}
```
