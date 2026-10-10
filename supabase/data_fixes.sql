-- Green Tag: the data fixes from supabase/data_checks.sql, ready to run.
--
-- data_checks.sql reports; this one changes things. Read it first — the counts
-- in its comments are from 8 October 2026, against 112 trees.
--
-- Running this twice is harmless: each fix only touches rows that still need
-- it, so a second run reports zero and changes nothing.
--
-- The Supabase SQL editor shows only the last result set, so everything is
-- reported in one go at the bottom.
--
-- NOT HERE: the Mahogany sitting at 0, 0. Nobody can invent its coordinates;
-- it has to be re-surveyed in the field, and the update waiting for those
-- readings is at the foot of data_checks.sql.

-- ---------------------------------------------------------------------------
-- 1. One barangay, one name.
--
-- Eight rows are written "Brgy. Bubukal" beside the same barangay written
-- plain. The map and the panel both strip the prefix before showing it, so
-- this is invisible there — but every grouping by barangay counts them as two
-- separate places: the bar chart on the analytics page, the list in the map's
-- area panel, and anything MENRO exports.
--
-- Doubled spaces and stray whitespace go the same way, for the same reason.
-- ---------------------------------------------------------------------------
update public.trees
set barangay = regexp_replace(
      trim(regexp_replace(barangay, '^(brgy\.?|barangay)\s+', '', 'i')),
      '\s+', ' ', 'g'
    )
where barangay is not null
  and barangay <> regexp_replace(
        trim(regexp_replace(barangay, '^(brgy\.?|barangay)\s+', '', 'i')),
        '\s+', ' ', 'g'
      );

-- ---------------------------------------------------------------------------
-- 2. One spelling for the fruit trees.
--
-- "Fruit" (2) and "Fruit Tree" (48) are the same category. The web app already
-- reads them as one, so nothing on screen changes; this stops the two
-- spellings spreading any further through exports and the mobile app.
-- ---------------------------------------------------------------------------
update public.trees
set tree_category = 'Fruit Tree'
where tree_category = 'Fruit';

-- ---------------------------------------------------------------------------
-- 3. What it looks like now.
--
-- One row per barangay, with no "Brgy." prefixes left and no duplicate
-- spellings. The blank and "Unknown" rows stay: those are genuinely
-- unrecorded, and writing a name into them would be inventing one.
--
-- `still_prefixed` and `still_fruit` should both be 0. If they are not, the
-- fix above did not reach every row and nothing should be assumed about the
-- groupings until it does.
-- ---------------------------------------------------------------------------
select
  coalesce(nullif(trim(t.barangay), ''), '(not recorded)') as barangay,
  count(*) as trees,
  (select count(*) from public.trees
    where barangay ~* '^(brgy\.?|barangay)\s+') as still_prefixed,
  (select count(*) from public.trees
    where tree_category = 'Fruit') as still_fruit
from public.trees t
group by 1
order by 1;
