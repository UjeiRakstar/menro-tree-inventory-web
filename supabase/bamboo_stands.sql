-- Green Tag: a bamboo stand, as a land cover class (22 October).
--
-- Run once, whole, in the SQL editor, after map_areas.sql (step 36 of
-- PARKED.md). Safe to run again. Ends in ONE query whose rows say whether
-- each part took.
--
-- NAMRIA's twelve classes have no bamboo; the drawing tool now has it, for the
-- Forest Land Use Plan (riverbank and slope protection, livelihood). The area
-- form suggests it when most of the points inside are bamboo clumps the field
-- officers tagged (src/lib/coverSuggestion.js). Not tree cover: no growth
-- rate, no carbon. map_areas.sql has the same list, for when it is run again.

alter table public.map_areas drop constraint if exists map_areas_cover_check;
alter table public.map_areas add constraint map_areas_cover_check check (
  (kind <> 'land-cover' or cover_class is not null)
  and (cover_class is null or cover_class in (
    'closed-forest', 'open-forest', 'brush-shrubs', 'perennial-crop', 'grassland',
    'mangrove-forest', 'annual-crop', 'open-barren', 'built-up', 'marshland-swamp',
    'fishpond', 'inland-water', 'bamboo-stand'))
);


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'an area can be a bamboo stand' as check,
       pg_get_constraintdef(c.oid) like '%bamboo-stand%' as ok,
       '' as detail
from pg_constraint c
where c.conname = 'map_areas_cover_check'
union all
select 'READ: bamboo stands drawn', null,
       (select count(*)::text from public.map_areas where cover_class = 'bamboo-stand');
