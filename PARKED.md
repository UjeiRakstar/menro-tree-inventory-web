# Parked

Work that is deliberately not being done yet, so it does not get lost. Newest
section first within each heading.

## Needs you to run it

See **supabase/RUNBOOK.md** — the files in order, with what to look for in
each result. All of them are safe to run twice.

The short version: species_profiles, crowdsource_promotion, tree_phenology,
then barangays, barangay_link, the backfill tool, and rls_audit last.

The field app changes go with them — step 8 of the runbook — and have never
run on a device.

## Waiting on another system

- **The mapping feature.** Forest / tree cover area and MAI AGB are shown on the
  BioDashboard as "Not available yet" because there is no source for them. When
  the mapping work lands, set `available: true` on those two entries in
  `src/lib/dashboardMetrics.js` and feed the figures in.
- **The emissions feed.** Total carbon emission, same treatment — it comes from
  outside this system (Greenhouse Gases Quantification Sheet, CCC).
- **Downloads.** The data request form collects who is asking and what for, and
  then says downloads are not ready. The exports themselves — tables,
  spreadsheets, maps, images — are still to be built.

## Mobile app — `C:\dev\projects\tree_inventory`

Changes are written and `dart analyze` is clean, but **uncommitted and never run
on a device**, alongside other in-flight work in that repo.

- A new `CrowdsourceService`, a Community tab in Dispatch Tasks, and
  `pendingTreeId` threaded through the capture flow.
- The part to watch: the sync path in `inventory_screen.dart` that calls
  `promote_pending_tree` after a tree uploads. That is what finally puts a
  resident's tag on the public map.
- `flutter test` could not run in the environment it was written in (no CMake
  for native assets).

## Still open

- **One tree at 0,0.** A Mahogany with no usable coordinates, invisible on every
  map and uncounted in every area. `supabase/data_checks.sql` finds it; it needs
  a field visit, not a query.
- **The JavaScript bundle, 2.5 MB.** Now the largest single thing in the build,
  larger than every image put together. It is one chunk because nothing is split
  by route: a visitor who only wants the map still downloads the whole admin
  console. Worth a look if the first paint ever feels slow.
- **Phone-width screenshots.** The About page, the new dashboard and the map's
  area panel have only ever been seen on a desktop here. The panel is the one to
  check: six figures and a barangay list is more than one tree's details.

## Done since this list was written

- ~~Image weight.~~ 160 MB → 6.7 MB of built assets, across
  `tools/make-logo-thumbnails.mjs` and `tools/optimise-images.mjs`. No image in
  the build is over half a megabyte.
- ~~Marker clustering.~~ Pins within about 64 screen pixels group into a bubble
  with a count, which comes apart as the map zooms in.
- ~~Barangay names.~~ Fixed by `supabase/data_fixes.sql`, once it is run.
