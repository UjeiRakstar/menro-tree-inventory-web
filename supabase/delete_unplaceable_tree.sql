-- Green Tag: remove the tree nothing can place.
--
-- One Mahogany sits at latitude 0, longitude 0 — a GPS fix that never landed.
-- It is invisible on every map, counted in no barangay, and the only row the
-- backfill could not settle.
--
-- RUN SECTION 1 FIRST. A delete cannot be undone, and this is somebody's field
-- work: if it has photos, a species identification and a date, it is a real
-- tree with a broken coordinate, and re-surveying it is cheaper than finding
-- it again from nothing.

-- ===========================================================================
-- 1. What is actually in the row.
--
-- Look at `photos` and `assigned_to`. A row with photographs and a named
-- arborist is a tree somebody stood next to; only the position is wrong, and
-- that can be fixed with one visit. A row with nothing in it is a mis-tap.
-- ===========================================================================
select
  id,
  species,
  scientific_name,
  barangay,
  "dateCaptured",
  assigned_to,
  dbh,
  merchantable_height,
  (case when coalesce("imageUrl", '') <> '' then 1 else 0 end)
  + (case when coalesce(leaves_url, '') <> '' then 1 else 0 end)
  + (case when coalesce(bark_url, '') <> '' then 1 else 0 end)
  + (case when coalesce(fruits_url, '') <> '' then 1 else 0 end) as photos
from public.trees
where barangay_psgc is null;

-- ===========================================================================
-- 2a. IF IT IS WORTH KEEPING — give it its real coordinates instead.
--
-- Fill in the readings from the field and run this. The trigger from
-- barangay_link.sql will not set the barangay from a coordinate on its own, so
-- run tools/backfill-barangays.mjs afterwards and it will be placed.
-- ===========================================================================
-- update public.trees
-- set latitude = ?, longitude = ?
-- where id = '?';

-- ===========================================================================
-- 2b. IF IT IS NOT — delete it.
--
-- Scoped by id, not by "where latitude = 0", so it can only ever remove the
-- one row you looked at in section 1. Paste the id from there.
-- ===========================================================================
-- delete from public.trees where id = '?';

-- ---------------------------------------------------------------------------
-- 3. Afterwards: nothing should be left unplaced.
-- ---------------------------------------------------------------------------
-- select count(*) as still_unplaced from public.trees where barangay_psgc is null;
