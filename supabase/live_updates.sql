-- Green Tag: map areas and PGENRO's proposals update on screen as they change.
--
-- Run once, whole, in the SQL editor, after map_areas.sql. Safe to run again.
-- Ends in ONE query whose rows say whether each part took.
--
-- Supabase sends a page a change only for tables in its "supabase_realtime"
-- publication. The map listens for changes to the saved areas and to the
-- proposals, so a MENRO sees PGENRO's proposal — and PGENRO sees it approved,
-- and anyone sees an area saved, edited or deleted — without refreshing.
-- What each page is sent still follows the same row rules as reading: the
-- public gets no proposals, a trainee nothing real.

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication here: nothing to add.';
    return;
  end if;
  foreach t in array array['map_areas', 'map_area_proposals']
  loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'live: ' || t.name as check,
       exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t.name) as ok,
       '' as detail
from (values ('map_areas'), ('map_area_proposals')) t(name)
union all
-- Read only: the map already listens to trees; this says whether they are on.
select 'READ: trees are live too', null,
       case when exists (select 1 from pg_publication_tables
                         where pubname = 'supabase_realtime' and tablename = 'trees')
            then 'yes' else 'no — new trees appear on the office map only after a refresh' end;
