-- Green Tag: is the barangay work actually finished? Read-only.
--
-- The backfill's own report reads the name through a join on the code, so it
-- cannot disagree with itself — it would look right even if trees.barangay
-- still held "Brgy. V". This checks the column every screen and every export
-- actually reads.
--
-- Run it after the backfill. One result set; every count should be 0 except
-- the first.

select 'trees in total'                                    as check, count(*) as rows from public.trees
union all
select 'settled — linked to a real barangay',
       count(*) from public.trees where barangay_psgc is not null
union all
-- The trigger copies the reference name onto trees.barangay whenever a code
-- is set. If this is not 0, the text and the code disagree and the screens are
-- showing the text.
select 'TEXT DISAGREES WITH THE CODE',
       count(*)
  from public.trees t
  join public.barangays b on b.psgc = t.barangay_psgc
 where coalesce(trim(t.barangay), '') <> b.name
union all
-- Nothing should still carry a prefix, a placeholder, or a name no barangay
-- in Laguna has.
select 'still written "Brgy. …"',
       count(*) from public.trees where barangay ~* '^brgy\.?\s+'
union all
select 'still a placeholder',
       count(*) from public.trees where barangay ~* '^(unknown|n/?a)'
union all
select 'name is not a barangay of Laguna',
       count(*)
  from public.trees t
 where coalesce(trim(t.barangay), '') <> ''
   and not exists (select 1 from public.barangays b where b.name = trim(t.barangay))
union all
-- Expected: 1, the Mahogany at 0,0. Anything more is a tree the boundaries
-- could not place, which is worth knowing about.
select 'unplaced — needs a field visit',
       count(*) from public.trees where barangay_psgc is null;

-- The trees nothing could place, by name. Run this if the last count is not 1.
-- select id, species, barangay, latitude, longitude, "dateCaptured", assigned_to
-- from public.trees where barangay_psgc is null;
