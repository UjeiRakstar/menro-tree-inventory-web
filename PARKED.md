# Parked

Work that is deliberately not being done yet, so it does not get lost. Newest
section first within each heading.

## Needs you to run it

- **`supabase/crowdsource_promotion.sql`** — the step that publishes a verified
  community tag to the map. Nothing in the chain works end to end until this is
  applied.
- **`supabase/tree_phenology.sql`** — now a cleanup migration. It drops
  `trees.leaf_status`, `trees.flower_status` and `trees.fruit_status`, which
  nothing writes; the real observations live in `phenology_records`.

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

## Still open from the review

- **Image weight.** Down from ~160 MB to 17 MB of built assets. What is left:
  `NAMRIA_logo.svg` (3.4 MB, a traced bitmap in an SVG wrapper),
  `Mapping Feature SS.png` (2.7 MB) and `forestcover.avif` (2 MB). The seals are
  handled by `tools/make-logo-thumbnails.mjs`; these three need format decisions
  rather than a resize.
- **One tree at 0,0.** A Mahogany with no usable coordinates, invisible on every
  map and uncounted in every area. `supabase/data_checks.sql` finds it.
- **RLS audit before launch.** The anon key can read `trees` (intended) and the
  public form inserts into `pending_trees`. Confirm anon cannot update or delete
  either table.
- **Marker clustering.** 112 pins all sit in Santa Cruz; at province scale they
  overlap into one blob. Worth doing before the inventory covers more LGUs.
- **Barangay names.** Eight rows are written "Brgy. X" beside the same barangay
  written plain, and seven have no barangay at all. The dashboard and the panel
  both strip the prefix, but any grouping by the raw column counts them twice.
