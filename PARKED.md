# Parked

Work that is deliberately not being done yet, so it does not get lost.

Last read through: 15 October 2026, against the repo, the live database
(read-only, with the site's public key) and CAPSTONE_SPECS.md.

## Before the account ticket touches anything

- **The field app's work is committed, on a branch.** `0733b03` on
  `feat/field-app-boundaries-and-community-tags` in
  `C:\dev\projects\tree_inventory`, as it stood — 59 files, nothing rewritten.
  `main` is still `10eee37`. Merge the branch into `main` once the app has run
  on a device; until then a build from `main` is the old app.
- **Did the crowdsourced path run?** You ran `flutter run` and saved a mock
  tree with no errors (October). What that does not show is the path a
  *resident's* tag takes: the sync in `inventory_screen.dart` that calls
  `promote_pending_tree` and puts the tag on the public map. Tag one from the
  public map on a phone, sync it in the app, and see whether it appears.

## Needs you — and only you

- **The tree at 0,0.** You decided to delete it. `supabase/delete_unplaceable_tree.sql`
  (id `663077f0-9961-48a8-95fe-9e3304f61e01`). Not yet run.
- **`supabase/drop_trees_backup.sql`.** Look at section 1, then uncomment the
  drop. Nothing in either repo reads that table.
- **Two decisions left hanging.** Neither was answered, so both stand as built
  until you say otherwise:
  - Carbon stored and carbon sequestered stayed in the BioDashboard headline
    when timber volume and MAI moved to the Forestry tab. You had listed carbon
    with the technical figures.
  - The Forestry tab sits last. MENRO may want it first among the tabs.

## Mine to fix — found in this sweep

- **A trainee in the field app is not told.** The training wall works in the
  app (tested), but the app shows no "training" banner the way the website
  does.
- **Two hover tooltips in the tree panel can still clip.** The ⓘ there now
  uses the shared, portalled `InfoHint`. The trait-badge and phenology
  tooltips in `TreeDetailPanel.jsx` are not ⓘ buttons and still use the old
  absolutely-positioned `Tooltip`, so near the bottom of the panel's scroll
  they can be cut off. A portalled hover-tip for any trigger would close it.
- **Nothing is linted.** ESLint 10 is installed and there is no
  `eslint.config.*`, so `npx eslint` refuses to run and nothing checks the
  code. The `eslint-disable` comments in `PublicMap.jsx` and `SitePanel.jsx`
  are currently decorative.
- **No `.gitattributes`.** Every commit warns that LF will become CRLF. Harmless
  today; a repo that changes line endings under people is how a one-line diff
  becomes a whole-file one.
- **Old development tools.** `npm audit` flags Vite, Vitest, React Router,
  Tailwind's file watcher and others (none of them shipped to a visitor except
  React Router). Updating them is its own piece of work: Vite and Vitest are a
  major version behind, and React Router's fix needs a test pass of every link.
- **A 365 kB chunk named `treeTraits`.** Larger than the whole of Leaflet, for
  a module that imports seven small icons. Something is being pulled in that
  should not be. Not investigated.

## The logged-in side — what is left after phases 1 and 2

Phases 1 (accounts) and 2 (the office map) are written and tested; see
ACCOUNTS_AND_MAPPING.md. The database files run **in this order**, each once:

1. `supabase/accounts.sql`
2. `supabase/lgu_fence.sql` — then **sync one tree from the field app**
3. `supabase/municipal_halls.sql`
4. `supabase/tag_routing.sql` — then **open the field app's task list** and
   check a dispatched tag still shows
5. `supabase/training_sandbox.sql` — the wall between training and real data
6. `supabase/training_seed.sql` — the dummy Siniloan data (run again any time
   to reset it; `node tools/make-training-seed.mjs` regenerates it)

7. `supabase/species_rise.sql` — the RISE fields on species profiles (any
   time; nothing else depends on it)
8. `supabase/permit_archive.sql` — PGENRO archiving a permit log (any time
   after step 1)
9. `supabase/map_areas.sql` — saving drawn areas, proposals, and the public
   'area-documents' bucket (after step 1; after step 5 if training is in use)
10. `supabase/closing_gaps.sql` — publishing a tag checks whose it is, and
    area documents are filed by office so old ones can be removed (last)
11. `supabase/live_updates.sql` — areas and PGENRO's proposals update on screen
    without a refresh (after step 9)
12. `supabase/map_layers.sql` — PGENRO's map layers and climate figures, and each
    area's facts from them (after step 9)
13. `supabase/species_site_needs.sql` — each species' site needs in figures, for
    suggesting trees for a planting site (after step 7)
14. `supabase/planting_requests.sql` — planting sites are PGENRO's; a MENRO /
    CENRO's goes to PGENRO as a request (after steps 5, 9 and 12). Safe to run
    map_areas.sql again after it: requests stay off the public map.
15. `supabase/office_settings.sql` — Settings: office profiles and logos,
    barangay figures, the field team's last sign-in, and each office's own AI
    key in Vault (after steps 1, 2, 5 and 10). Then, in Edge Functions: deploy
    `identify-tree` and `ai-key-test` (new), and redeploy `rise-extract`.
    Once `identify-tree` is live and the field app is rebuilt, delete
    GEMINI_API_KEY from the field app's `.env`: the app then carries no key.
    Also deploy `improve-report` (17 October): the Report tab's Improve with AI.

**Test any of these before it goes live:** `npm run test:sql` runs every
file above in real Postgres (PGlite, in memory) and tries what each must
allow and refuse — 9 suites, 333 checks — the final check query on its
own, as the SQL editor runs it. The suites are in `tools/sql-tests/`.

**Steps 1–12 are in the live database** (map layers and CLIRAM seen working, 15 October); step 13 is new. Not deployed: the
`manage-account` server function — until it is, PGENRO's "Update email" and
"Change password" say so and do nothing, and locking an account stops its
writes but does not sign it out.

**The RISE PDF reader (temporary).** To switch it on: Supabase dashboard →
Edge Functions → Secrets → add `GEMINI_API_KEY` (the field app's key, from its
`.env`), then deploy `supabase/functions/rise-extract/index.ts` as a function
named `rise-extract`. To remove it when the backlog is done: delete
`src/components/pgenro/RiseAutofill.jsx` and its one line in
`SpeciesEditor.jsx` (and the reader tests in `SpeciesLibrary.test.jsx`), and
delete the function and the secret in the dashboard. The species form stays.
Profiles filled in with it keep `autofilled = true`. **Redeploy it** after
step 13: it now also reads the site-need figures (elevation, rainfall,
temperature, soils, flooding, origin) when an issue states them.

When a training batch is done: `supabase/training_purge.sql`. It deletes every
training row and leaves real rows alone; its section 3, commented out, also
archives the training accounts.

Steps 2, 4 and 5 are the ones the mobile app could feel. All were tested
against real Postgres (20 of 20, 24 of 24, 50 of 50) but never against the
app; step 2's section 4 undoes it in one statement. After step 5, check the
real field app still syncs a tree — nothing in it should change for a real
account.

Still open:
- **A MENRO can create a field officer in any municipality.** The Arborists
  page lets them pick any of the thirty. The new officer then lands in that
  LGU — out of sight of the MENRO who created them. The list should be their
  own LGU only.
- **Field officer accounts are still created from the browser.**
  `ManageArborists.jsx` calls `supabase.auth.signUp` to make another person's
  account. With email confirmation on, as it is, that works, but the MENRO
  chooses the officer's first password. Since field officers already register
  themselves in the app, the cleaner fix may be to remove the form, not move it
  to a server.
- **Two lists of arborists.** `public.arborists` (the task-assignment table)
  and `public.profiles` with `role = 'field_officer'` both say who the field
  officers are, and nothing keeps them in step.

Resolved by phase 1: the single global admin (now PGENRO, with LGU admins
under it), and open sign-up (the web page is now account-code activation;
field officers still register in the app, by design). Found and closed on the
way: **any signed-in arborist could make themselves an admin** by updating the
`role` column of their own profile row. `accounts.sql` section 5.

Closed on 15 October (`closing_gaps.sql`): **`promote_pending_tree` did not
check jurisdiction** — any verifier who knew a tag's id could publish another
LGU's tag or a training one, and "adopt" any tree. And **old area documents
stayed online** after the area was deleted or its PDF replaced.

## Asked for on 14 October, not built yet

- **Messages, and News and Events** (16 October, from the mockups). Messages:
  the About page's contact form asks which city or municipality, and that
  MENRO / CENRO reads it in Messages (PGENRO reads all) — reply opens the
  office's email with the message quoted; delete and archive. News and
  Events: not yet designed beyond the menu item.
- **The field app's tree identification change is not committed** (16
  October): lib/ai_service.dart and lib/tree_details_screen.dart in
  tree_inventory, sending the photos to `identify-tree`. Also: `flutter test`
  there needs CMake installed (dartcv4 builds OpenCV), on this PC it does not run.

- **One standard format for every Excel download** (15 October). The MENRO
  report, the PGENRO permit report and the inventory export each lay their
  sheets out differently. Waiting on the official format to standardise on —
  a template from PGENRO, or the DENR form it should follow.
- **A hall for every LGU, pinned by PGENRO.** An LGU with no real office yet
  has no hall, so its map's centre button shows the whole town, a training
  account's included (trainees cannot pin the real hall, by design). The
  database already lets PGENRO pin any LGU's hall (`set_lgu_hall` with an
  LGU); there is no screen for it yet.

- **No landslide layer.** Phase 4 is built; PGENRO's folder (Documents/Acads/
  Tree Inventory Web App Tech Files) has soil, the DEM, NOAH flooding and
  CLIRAM for all 30 LGUs, but no NOAH rain-induced landslide map. Its slot on
  the Map layers page waits for one; areas say "Not assessed" until then.
- **Files in that folder not used, and why.** The elevation bands GeoJSON
  carries codes (-2 … 1001) with no key, so the DEM it came from is used
  instead. The 100-year flood shapefile is the same NOAH data as the GeoJSON.
  Laguna-BuiltUp.geojson (28 MB) could mark built-up ground on the map, or
  feed the land cover suggestion — not asked for yet.
- **Phase 5: reports** — the GHG inventory table, and the City Biodiversity
  Index. *Built:* the map sheet (Make map on the office map → /map-sheet): the
  CDRA layout with Santa Cruz's plate as the template, any survey layer, A4 or
  A3, printed or saved as PDF at its stated scale, or as a PNG. Not yet: CDRA's
  hatching for hazard levels (solid colours now), and hazard data other than
  NOAH's — Santa Cruz's own CDRA landslide plate (UPLB) shows low
  susceptibility where NOAH maps none.
- **CAPSTONE_SPECS.md is behind.** Written 10 October: it predates accounts and
  roles, the office map, training, RISE, the province board, saving areas, and
  clustering coming back. Yours to update, or to ask me to.

- **A permit's LGU is worked out, not stored.** PGENRO's permit logs place a
  permit by its tree's barangay, or by the point a walk-in permit was issued
  for. A walk-in permit with neither lands under "Not placed". Storing
  `lgu_psgc` on `permits` when one is issued would make that exact.
- **The RISE fields on the public map.** The forester's Species (RISE) tab
  saves family, local names, status, distribution, site needs, flowering and
  fruiting months, propagation, uses and pests. The public tree panel still
  shows only the description. Showing the rest is a design question: which of
  them a resident wants.
- **Google sign-in for the public, and a leaderboard** of who tagged the most
  trees. Counts registered residents and their tags, for the City Biodiversity
  Index later.

## Waiting on another system

- **MAI per hectare, deliberately not done.** The BioDashboard now shows
  *mapped* tree cover (hectares, by NAMRIA class, and the growth at each
  class's published rate) once an office saves tree-cover areas. Dividing the
  tagged trees' growth by those hectares was the old plan; it mixes a sample
  (wherever somebody tagged) with an area (what somebody drew) into a figure
  that describes neither. A per-hectare figure needs a plot survey instead.
- **The emissions feed.** Total Carbon Emission comes from outside this system
  (Greenhouse Gases Quantification Sheet, Climate Change Commission).
- **Downloads.** The data request form collects who is asking and what for,
  then says the downloads are not ready. The exports themselves are unbuilt.
- **Species write-ups.** Mango has one; the rest do not. Query 5 of
  `supabase/data_checks.sql` is the PGENRO to-do list.
- **A cloud-free satellite basemap.** You have a Copernicus API for a
  cloudless mosaic, to sit beside Esri as the satellite option. After the
  PGENRO account is set up.

### Waiting on the PGENRO account

The map draws land cover and tree planting sites, read out of
`src/data/mockMapSites.js` — real polygons in real barangays, placeholder
figures, marked in amber. These turn it real; each needs the PGENRO account
that can upload a layer.

- **The landslide upload.** Soil, elevation, flood and CLIRAM are live (15
  October); a sample area opened on the map is measured against them. Only
  NOAH's rain-induced landslide map is missing.
- **Unlocking the rest of the land cover table.** All 29 published rows are in
  `src/lib/landCover.js`; four are `publicVisible`. The other 25 should become a
  PGENRO toggle rather than a second table — one table cannot drift from itself.
- **Site needs for the species library.** The matching is built: a planting
  site being saved suggests the library's trees that suit its ground, each
  with why. It suggests nothing until the forester records each species' site
  needs (Trees → Species (RISE) → "Site needs, in figures"), by hand or read
  from the RISE PDF. Origin matters too: invasive species are never suggested.
- **Soil series names.** The sample ones are plausible for lowland Laguna, not
  verified against the BSWM sheet.

### Waiting on a measurement

- **The growth rate.** `ANNUAL_DBH_GROWTH_CM` is 0.5 cm a year, chosen rather
  than measured, and the whole mean annual increment scales off it. It is
  amber on the Forestry tab. Replace it with, in order of preference: a
  re-measurement of the same tree at two dates, a published per-species figure
  from PGENRO or ERDB, or a figure somebody there will put their name to.
- **Merchantable height in the field app.** Four of the forestry and carbon
  figures need it; the app does not ask for it. You have said this gets done
  no matter what. Until it does, every one of those figures speaks for only the
  trees that happen to have one.
- **The 30% family threshold.** Santamour's rule has three thresholds and the
  page checks two. The third needs a species-to-family list.

## Elsewhere

- **Odd columns in public.trees.** A column named `trees` that nothing reads,
  `heightClass` beside `height_class`, `photo_url` beside `imageUrl`, and
  `is_tagged`, which nothing touches. Query 8 of `supabase/data_checks.sql`
  counts the non-null values in each: empty everywhere is safe to drop.
- **Phone-width screenshots.** The About page, the BioDashboard and both map
  panels have only ever been seen on a desktop.

## Finding this stuff on the page

Anything on the public pages that is **not** computed from the inventory is
marked in amber, through `src/components/public/Provisional.jsx`. Four kinds,
and the distinction is the point — they clear in different ways:

| Kind | What it means | Clears when |
|---|---|---|
| **Assumed** | a constant this system chose | somebody changes the constant |
| **Borrowed** | published, but measured elsewhere | an equivalent is measured in Laguna |
| **Placeholder** | invented, standing in for real data | the real layer is uploaded |
| **Awaiting data** | no figure at all yet | another system supplies one |

Everything unmarked is live: counted from the tagged trees on every load, and
already right the moment a tree is tagged. `grep -rn 'data-provisional' src/`
lists every marked figure on the site, and the key explaining the colour is at
the foot of the BioDashboard.

Do NOT mark something amber because it reads like a caveat. "From 103 of 110
trees measured", "no tagged trees in Pila yet" and "2 not yet identified" are
all live figures that move by themselves. Amber only means something while it
stays reserved for the four kinds above.

## Done

- ~~The BioDashboard rebuild.~~ All five items in BIODASHBOARD.md, and the
  layout revamp after them.
- ~~The JavaScript bundle, 2.5 MB.~~ Split by route. The landing page is 118 kB
  gzipped; the spreadsheet library and the confetti arrive only when used.
- ~~The carbon estimate.~~ No longer 2.5 kg CO₂ per cm of diameter, which had no
  source. It is the DENR volume equation for Southern Luzon (FMB Technical
  Bulletin No. 3), with every constant shown on the Forestry tab.
- ~~Tooltips cut off.~~ One shared `InfoHint`, portalled to the page body so no
  `overflow` can clip it. (Three of the four copies — see above.)
- ~~Image weight.~~ 160 MB → 6.7 MB of built assets.
- ~~Marker clustering.~~ Built, removed on request (14 October) because a
  bubble sat at the average of its trees, then **brought back** (15 October)
  without numbers: a bubble stands on one of its own trees, takes its most
  urgent tree's colour on the office map, and nothing is grouped at the
  furthest zoom.
- ~~Saving what is drawn (phase 3).~~ Areas, NAMRIA classes, the suggestion,
  legal designations with their documents, planting sites, edit, delete, and
  PGENRO proposals. `map_areas.sql`, 42 of 42 in PGlite.
- ~~Training sandbox, RISE species form and reader, PGENRO's Action Board and
  permit logs.~~ 14–15 October.
- ~~The web tagging form asking OpenStreetMap.~~ It worked out the barangay from
  Nominatim and offered Santa Cruz's barangays only, so a resident anywhere else
  could not send a tag. It now uses the PSA boundaries and lists the barangays
  of whichever town the tag is in.
- ~~Barangay names.~~ 111 of 112 trees linked to a real PSA barangay; the field
  app no longer asks OpenStreetMap.
- ~~RLS audit.~~ `public.trees` had row level security off, so the website's
  anon key could change and delete the inventory. Closed, along with
  `arborists`, the backup table, and three storage policies.
- ~~Phenology for the public.~~ The policies were authenticated-only, so leaf,
  flower and fruit state was blank for every visitor.
