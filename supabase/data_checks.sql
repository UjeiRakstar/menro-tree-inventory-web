-- Green Tag: what the public map cannot show, and why.
--
-- Nothing here changes data. Each query answers one question the map raises but
-- has no way to report on its own — a tree the map silently cannot draw looks
-- exactly like a tree that was never tagged. Run it now and then; the fixes are
-- at the bottom, commented out, so nothing runs by accident.
--
-- Counts in the comments are what these returned on 8 October 2026, against
-- 112 trees.

-- ---------------------------------------------------------------------------
-- 1. Trees the map cannot place. (1 row: a Mahogany sitting at 0, 0.)
--
-- The web app skips 0,0 and null coordinates on purpose — drawing them would
-- put a pin in the Gulf of Guinea — so these trees are invisible to the public
-- and to anyone counting pins. They need their coordinates re-surveyed.
-- ---------------------------------------------------------------------------
select id, species, barangay, latitude, longitude, "dateCaptured", assigned_to
from public.trees
where latitude is null
   or longitude is null
   or (latitude = 0 and longitude = 0);

-- ---------------------------------------------------------------------------
-- 2. Trees outside Laguna. (0 rows.)
--
-- A rough box around the province. Anything here is a GPS or data-entry slip:
-- the map would draw it under the grey cover, where nobody can see it.
-- ---------------------------------------------------------------------------
select id, species, barangay, latitude, longitude
from public.trees
where latitude <> 0
  and (latitude not between 13.9 and 14.7 or longitude not between 120.9 and 121.7);

-- ---------------------------------------------------------------------------
-- 3. Category spellings. ("Fruit Tree" 48, "Timber" 41, "Ornamental" 19,
--    "Fruit" 2, "Unknown" 2.)
--
-- The web app now treats "Fruit" and "Fruit Tree" as one category, so this no
-- longer hides trees from the filter — but the mobile app should settle on one
-- spelling, and "Unknown" means somebody could not tell at tagging time.
-- ---------------------------------------------------------------------------
select tree_category, count(*)
from public.trees
group by tree_category
order by count(*) desc;

-- ---------------------------------------------------------------------------
-- 4. Barangay names that will not group. (7 unknown or blank, 8 written as
--    "Brgy. X" beside the same barangay written plain.)
--
-- The panel strips a leading "Brgy."/"Barangay" before showing it, so this is
-- cosmetic on the map — but any grouping by barangay counts them as two
-- different places.
-- ---------------------------------------------------------------------------
select coalesce(barangay, '(null)') as barangay, count(*)
from public.trees
group by barangay
order by barangay;

-- ---------------------------------------------------------------------------
-- 5. Species with no published write-up yet.
--
-- The PGENRO to-do list: every species on the map whose Description tab still
-- says nothing has been published. (Mango has one; the rest do not.)
-- ---------------------------------------------------------------------------
select t.species, count(*) as tagged_trees
from public.trees t
left join public.species_profiles p on p.species = t.species
where p.species is null
  and t.species is not null
group by t.species
order by count(*) desc;

-- ---------------------------------------------------------------------------
-- FIXES — read the rows above first, then run the one you mean.
-- ---------------------------------------------------------------------------

-- Give the unmappable Mahogany its real coordinates once it has been
-- re-surveyed (fill in the id and the readings):
-- update public.trees set latitude = ?, longitude = ? where id = '?';

-- Settle the category spelling on the value the filter pills use:
-- update public.trees set tree_category = 'Fruit Tree' where tree_category = 'Fruit';

-- Drop the "Brgy. " prefix so each barangay groups as one place:
-- update public.trees
-- set barangay = trim(regexp_replace(barangay, '^(brgy\.?|barangay)\s+', '', 'i'))
-- where barangay ~* '^(brgy\.?|barangay)\s+';

-- ---------------------------------------------------------------------------
-- 6. How much of the inventory the carbon figure can speak for.
--
-- The DENR volume equation (FMB Technical Bulletin No. 3) needs a diameter at
-- breast height AND a merchantable height. A tree missing either is counted on
-- the map and left out of the carbon total, and the dashboard says so beside
-- the figure.
--
-- If `both` is a small share of `trees`, that is a field-work finding rather
-- than a software one: merchantable height is the measurement to push on.
-- ---------------------------------------------------------------------------
select
  count(*)                                                     as trees,
  count(*) filter (where nullif(trim(dbh::text), '') is not null
                     and (dbh::text) ~ '[1-9]')                as has_dbh,
  count(*) filter (where merchantable_height is not null
                     and merchantable_height::text ~ '[1-9]')  as has_merchantable_height,
  count(*) filter (where (dbh::text) ~ '[1-9]'
                     and merchantable_height is not null
                     and merchantable_height::text ~ '[1-9]')  as both,
  count(*) filter (where total_height is not null
                     and total_height::text ~ '[1-9]'
                     and (merchantable_height is null
                          or merchantable_height::text !~ '[1-9]')) as total_height_only
from public.trees;

-- ---------------------------------------------------------------------------
-- 7. Is merchantable_height actually a merchantable height?
--
-- One row holds 0.61 against a 17 cm diameter. The DENR measures the bole from
-- a stump about 0.5 m above the ground to the first major branch and records
-- it to the nearest metre, so 0.61 is not a short bole — it is not a bole.
--
-- This asks whether that is one bad row or the whole column. Read `band`:
--
--   under 1 m          not a merchantable height. Something else is being
--                      written into the column.
--   1 to 30 m          plausible.
--   over 30 m          taller than almost any tree in Laguna; likely a total
--                      height, or a reading in the wrong unit.
--
-- If most rows are under a metre, the carbon figure on the dashboard is
-- resting on nothing and the column needs fixing before the figure means
-- anything. The dashboard already leaves those trees out and says so.
-- ---------------------------------------------------------------------------
select
  case
    when merchantable_height is null then 'not recorded'
    when merchantable_height::numeric < 1  then 'under 1 m — not a bole'
    when merchantable_height::numeric <= 30 then '1 to 30 m — plausible'
    else 'over 30 m — suspect'
  end as band,
  count(*) as trees,
  round(min(merchantable_height::numeric), 2) as smallest,
  round(max(merchantable_height::numeric), 2) as largest
from public.trees
group by 1
order by 2 desc;

-- Side by side with total height, for the rows that have both. If
-- merchantable_height tracks total_height closely, the app is recording the
-- whole tree rather than the bole, and the volumes would be overstated.
-- select id, species, dbh, merchantable_height, total_height
-- from public.trees
-- where merchantable_height is not null and total_height is not null
-- order by species limit 50;

-- ---------------------------------------------------------------------------
-- 8. Columns of public.trees that look like accidents.
--
-- From the 43 columns the table turned out to have (October 2026). None of
-- this is urgent; it is here so it is written down rather than rediscovered.
--
--   trees          a column named after its own table. Nothing reads or writes
--                  it anywhere in either repo.
--   heightClass    two columns for one fact. The field app writes heightClass;
--   height_class   the web app reads heightClass; nothing uses height_class.
--   photo_url      two columns for the main photograph. The field app writes
--   imageUrl       imageUrl; the web reads photo_url first and falls back.
--   is_tagged      nothing in either repo reads or writes it.
--
-- Run this before dropping anything: a column that is empty everywhere is safe
-- to drop, one with values in it is somebody's data.
-- ---------------------------------------------------------------------------
select
  'trees'        as column_name, count(trees)        as non_null_values from public.trees
union all
select 'height_class', count(height_class) from public.trees
union all
select 'heightClass',  count("heightClass") from public.trees
union all
select 'photo_url',    count(photo_url) from public.trees
union all
select 'imageUrl',     count("imageUrl") from public.trees
union all
select 'is_tagged',    count(is_tagged) from public.trees
order by 2 desc;
