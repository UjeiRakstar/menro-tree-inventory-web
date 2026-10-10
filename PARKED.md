# Parked

Work that is deliberately not being done yet, so it does not get lost. Newest
section first within each heading.

## Needs you to run it

In this order. All four are idempotent — running one twice changes nothing the
second time.

1. **`supabase/crowdsource_promotion.sql`** — the step that publishes a verified
   community tag to the map. Nothing in the chain works end to end until this is
   applied. It now checks the columns it depends on before creating anything and
   says plainly what is missing, including "run species_profiles.sql first".
2. **`supabase/tree_phenology.sql`** — a cleanup migration. It drops
   `trees.leaf_status`, `trees.flower_status` and `trees.fruit_status`, which
   nothing writes; the real observations live in `phenology_records`.
3. **`supabase/data_fixes.sql`** — one name per barangay, one spelling for the
   fruit trees. Reports what it did at the end. Not in it: the tree at 0,0,
   because coordinates cannot be invented, only re-surveyed.
4. **`supabase/rls_audit.sql`** — read-only. It reports what the public key can
   reach; the policies that match what the public side actually needs are at the
   bottom, commented out. **Do this before launch.** Paste the output back and
   the gaps can be read together.

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
