-- Green Tag: a permit belongs to an LGU, and only that LGU's office sees it.
--
-- Run once, whole, in the SQL editor, after accounts.sql, lgu_fence.sql and
-- permit_archive.sql (step 16 of PARKED.md). Safe to run again. Ends in ONE
-- query whose rows say whether each part took.
--
-- ===========================================================================
-- READ THIS FIRST
-- ===========================================================================
-- Found 18 October: signed in as Kalayaan, the Permit Logs listed Santa
-- Cruz's permits — the clients' names, contact numbers and addresses. No SQL
-- file ever wrote a rule for public.permits; whatever the dashboard holds lets
-- every signed-in office read every permit. A permit carried no LGU of its
-- own, so there was nothing to fence it by.
--
-- This gives each permit its LGU, and fences it:
--
--   PGENRO          reads every permit (and archives through archive_permit())
--   MENRO / CENRO   reads, issues and updates its own LGU's permits only
--   field officer   nothing — the field app reads has_cutting_permit on the
--                   tree, never the permit
--   the public      nothing
--
-- The LGU is the database's to say, never the page's: a permit an office
-- issues is that office's LGU. Issuing one for a tree in another LGU is
-- refused. Permits already written take their tree's LGU; a walk-in permit
-- with no tagged tree takes the LGU of the nearest tagged tree within about
-- 2 km of its point. Any left without one are PGENRO's to see, and counted in
-- the check below.
--
-- The rule is RESTRICTIVE: it narrows whatever the dashboard already allows,
-- and running an older file again cannot widen it.


-- ===========================================================================
-- 1. Each permit's LGU
-- ===========================================================================
alter table public.permits add column if not exists lgu_psgc bigint;
create index if not exists permits_lgu_idx on public.permits (lgu_psgc);

create or replace function public.stamp_permit_lgu()
returns trigger language plpgsql set search_path = public as $$
declare
  v_tree_lgu bigint;
begin
  -- The SQL editor and the service role keep what they set (the backfill).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- A permit's LGU does not change after it is issued.
  if tg_op = 'UPDATE' then
    new.lgu_psgc := old.lgu_psgc;
    return new;
  end if;

  select public.lgu_of_barangay(t.barangay_psgc) into v_tree_lgu
  from public.trees t
  where new.tree_id is not null and t.id::text = new.tree_id::text;

  if public.my_role() = 'lgu_admin' then
    if v_tree_lgu is not null and v_tree_lgu <> public.my_lgu() then
      raise exception 'That tree is in another LGU: its permit is that LGU''s to issue.' using errcode = '42501';
    end if;
    new.lgu_psgc := public.my_lgu();
  else
    new.lgu_psgc := v_tree_lgu;
  end if;
  return new;
end $$;

drop trigger if exists stamp_permit_lgu on public.permits;
create trigger stamp_permit_lgu
  before insert or update on public.permits
  for each row execute function public.stamp_permit_lgu();

-- Permits already written: their tree's LGU first …
update public.permits p
set lgu_psgc = public.lgu_of_barangay(t.barangay_psgc)
from public.trees t
where p.lgu_psgc is null
  and p.tree_id is not null
  and t.id::text = p.tree_id::text
  and t.barangay_psgc is not null;

-- … then, for a walk-in permit with no tagged tree, the nearest tagged tree's
-- within about 2 km (0.02° of latitude) of where it was issued.
update public.permits p
set lgu_psgc = nearest.lgu
from (
  select p2.id,
         (select public.lgu_of_barangay(t.barangay_psgc)
          from public.trees t
          where t.barangay_psgc is not null
            and t.latitude is not null and t.longitude is not null
            and abs(t.latitude::float8 - p2.latitude::float8) < 0.02
            and abs(t.longitude::float8 - p2.longitude::float8) < 0.02
          order by (t.latitude::float8 - p2.latitude::float8) ^ 2
                 + ((t.longitude::float8 - p2.longitude::float8) * cos(radians(p2.latitude::float8))) ^ 2
          limit 1) as lgu
  from public.permits p2
  where p2.lgu_psgc is null and p2.latitude is not null and p2.longitude is not null
) nearest
where p.id = nearest.id and nearest.lgu is not null;


-- ===========================================================================
-- 2. Who sees and changes which permits
-- ===========================================================================
alter table public.permits enable row level security;

-- What a signed-in account may attempt; the restrictive rule below narrows it.
drop policy if exists "offices read permits" on public.permits;
create policy "offices read permits" on public.permits
  for select to authenticated using (true);

drop policy if exists "offices issue permits" on public.permits;
create policy "offices issue permits" on public.permits
  for insert to authenticated with check (true);

drop policy if exists "offices update their permits" on public.permits;
create policy "offices update their permits" on public.permits
  for update to authenticated using (true) with check (true);

-- The public: nothing, whatever any other policy says.
drop policy if exists "the public reads no permit" on public.permits;
create policy "the public reads no permit" on public.permits as restrictive
  for all to anon using (false) with check (false);

drop policy if exists "permits stay with their LGU" on public.permits;
create policy "permits stay with their LGU" on public.permits as restrictive
  for all to authenticated
  using (
    (select public.sees_as_pgenro())
    or ((select public.my_role()) = 'lgu_admin' and lgu_psgc = (select public.my_lgu()))
  )
  with check ((select public.my_role()) = 'lgu_admin' and lgu_psgc = (select public.my_lgu()));

notify pgrst, 'reload schema';


-- ===========================================================================
-- 3. Check
-- ===========================================================================
select 'permits carry an LGU' as check,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'permits' and column_name = 'lgu_psgc') as ok,
       '' as detail
union all
select 'a new permit is stamped with its LGU',
       exists (select 1 from information_schema.triggers
               where event_object_table = 'permits' and trigger_name = 'stamp_permit_lgu'),
       ''
union all
select 'row level security is on',
       (select relrowsecurity from pg_class where oid = 'public.permits'::regclass),
       ''
union all
select 'each office sees its own LGU''s permits only',
       exists (select 1 from pg_policies
               where tablename = 'permits' and policyname = 'permits stay with their LGU' and permissive = 'RESTRICTIVE'),
       ''
union all
select 'READ: permits by LGU', null,
       coalesce((select string_agg(coalesce(l.label, 'not placed — PGENRO only') || ' ' || n, ', ' order by n desc)
                 from (select lgu_psgc, count(*) n from public.permits group by lgu_psgc) c
                 left join public.lgus l on l.psgc = c.lgu_psgc), 'no permits');
