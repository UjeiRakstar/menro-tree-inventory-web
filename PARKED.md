# Parked

Work that is deliberately not being done yet, so it does not get lost.

Last read through: 10 October 2026.

## Needs you — and only you

- **The field app on a device.** Step 8 of `supabase/RUNBOOK.md`. This is the
  one that matters: until it runs, the app in your hands is still the old
  build, still naming barangays from OpenStreetMap, and new bad rows keep
  arriving. The changes are written and `dart analyze` is clean, but they have
  never run on a phone, and they sit **uncommitted** in
  `C:\dev\projects\tree_inventory` alongside other in-flight work.
  - What to watch: the sync path in `inventory_screen.dart` that calls
    `promote_pending_tree` after a tree uploads. That is what finally puts a
    resident's tag on the public map, and it has never been exercised.
  - `flutter test` could not run here — no CMake for native assets.
- **One tree at 0,0.** A Mahogany with no usable coordinates. Invisible on
  every map, uncounted in every area, and the only tree the barangay backfill
  could not place. It needs someone to stand next to it, not a query.
- **`supabase/drop_trees_backup.sql`.** Look at section 1, then uncomment the
  drop. Nothing in either repo reads that table.

## Waiting on another system

- **The mapping feature.** Forest / Tree Cover Area and Mean Annual Increment
  of Above Ground Biomass read "Not available yet" on the BioDashboard because
  there is no source for them. When the mapping work lands, set
  `available: true` on those two entries in `src/lib/dashboardMetrics.js` and
  feed the figures in.
- **The emissions feed.** Total Carbon Emission, same treatment — it comes from
  outside this system (Greenhouse Gases Quantification Sheet, CCC).
- **Downloads.** The data request form collects who is asking and what for, and
  then says the downloads are not ready. The exports themselves — tables,
  spreadsheets, maps, images — are still to be built.
- **Species write-ups.** Every species on the map whose Description tab says
  nothing has been published yet. Mango has one; the rest do not. Query 5 of
  `supabase/data_checks.sql` is the PGENRO to-do list.

## Still open here

- **Odd columns in public.trees.** The table has 43 columns and a few look
  like accidents: one named `trees` that nothing reads, `heightClass`
  beside `height_class` for one fact, `photo_url` beside `imageUrl` for one
  photograph, and `is_tagged` which nothing in either repo touches. Query 8
  of `supabase/data_checks.sql` counts the non-null values in each: empty
  everywhere is safe to drop, anything else is somebody’s data.

- **Phone-width screenshots.** The About page, the BioDashboard and the map's
  area panel have only ever been seen on a desktop. The area panel is the one
  to check: six figures and a barangay list is more than one tree's details,
  and on a phone that panel is the whole screen.
- **The JavaScript bundle, 2.5 MB.** The largest single thing in the build now,
  larger than every image put together. It is one chunk because nothing is
  split by route, so a visitor who only wants the map also downloads the admin
  console. Worth doing if the first paint ever feels slow.
- **The carbon estimate.** Still a DBH proxy at 2.5 kg CO₂ per cm, labelled as
  an estimate everywhere it appears. A species-specific allometric equation
  would make it a real figure rather than a stand-in.

## Done

- ~~Image weight.~~ 160 MB → 6.7 MB of built assets.
  `tools/make-logo-thumbnails.mjs` and `tools/optimise-images.mjs` regenerate
  them; no image in the build is over half a megabyte.
- ~~Marker clustering.~~ Pins within about 64 screen pixels group into a bubble
  with a count, which comes apart as the map zooms in.
- ~~Barangay names.~~ 111 of 112 trees linked to a real PSA barangay, the field
  app no longer asks OpenStreetMap, and `public.barangays` is the list to check
  against. The web app only downloads the boundary index if some tree still
  lacks a code — which, as things stand, means never.
- ~~RLS audit.~~ `public.trees` had row level security off, so the anon key
  that ships in the website could change and delete the inventory. Closed,
  along with `arborists`, the backup table, and three storage policies that let
  anyone delete the photos.
- ~~Phenology for the public.~~ Every policy on `phenology_records` was
  authenticated-only while the public map reads it, so the leaf, flower and
  fruit state was blank for every visitor. Fixed in the same pass.
