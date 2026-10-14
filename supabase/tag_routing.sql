-- Green Tag: a resident's tag goes to the LGU it was tagged in.
-- Run AFTER supabase/accounts.sql and supabase/lgu_fence.sql.
-- Safe to run again. Ends in ONE check query.
--
-- ===========================================================================
-- READ THIS FIRST
-- ===========================================================================
-- A tree tagged from the public map lands in public.pending_trees. Until now
-- every signed-in account saw every tag in the province. From here a tag
-- carries the LGU it was tagged in, and:
--
--   PGENRO          sees every tag
--   MENRO / CENRO   sees, dispatches and deletes their own LGU's tags
--   field officer   sees their own LGU's tags, and any tag they were
--                   dispatched to wherever it is
--   the public      submits tags; reads none, not even their own
--
-- The field app needs no change: it already asks for "tags dispatched to me",
-- and that is still exactly what it gets.
--
-- The LGU comes from the municipality the public map works out from where the
-- resident was standing, sent with the tag. A tag without one — sent by an
-- older copy of the website, or from outside Laguna — is filled in from its
-- barangay when that barangay's name is unique in Laguna, and otherwise is left
-- for PGENRO, who sees everything.
--
-- THIS FILE REPLACES EVERY EXISTING POLICY ON pending_trees except the
-- "only active accounts" one from accounts.sql — there was no record of what
-- had been set up there by hand. The check at the end lists what is left.


-- ===========================================================================
-- 1. Where a tag is
-- ===========================================================================
alter table public.pending_trees
  add column if not exists municipality text,
  add column if not exists lgu_psgc bigint references public.lgus (psgc);

create index if not exists pending_trees_lgu_idx on public.pending_trees (lgu_psgc, status);

-- A barangay name that is the name of exactly one barangay in Laguna — "Labuin"
-- — places a tag; one shared by several towns — "Barangay I" — does not.
create or replace function public.lgu_of_unique_barangay(p_barangay text)
returns bigint language sql stable set search_path = public as $$
  select min(b.municipality_psgc)
  from public.barangays b
  where lower(b.name) = lower(trim(regexp_replace(coalesce(p_barangay, ''), '^\s*(brgy\.?|barangay)\s+(?=[a-z])', '', 'i')))
     or lower(b.name) = lower(trim(coalesce(p_barangay, '')))
  having count(distinct b.municipality_psgc) = 1;
$$;

-- The tag's LGU is worked out here, never taken from the request: a resident
-- cannot route a tag to a town by saying so.
create or replace function public.route_pending_tree()
returns trigger language plpgsql set search_path = public as $$
begin
  new.lgu_psgc := coalesce(public.lgu_named(new.municipality),
                           public.lgu_of_unique_barangay(new.barangay));
  return new;
end $$;

drop trigger if exists route_pending_tree on public.pending_trees;
create trigger route_pending_tree
  before insert or update of municipality, barangay on public.pending_trees
  for each row execute function public.route_pending_tree();

-- Tags already waiting, routed by their barangay where that is unambiguous.
update public.pending_trees
set lgu_psgc = public.lgu_of_unique_barangay(barangay)
where lgu_psgc is null;


-- ===========================================================================
-- 2. Who sees and handles which tags
-- ===========================================================================
create or replace function public.can_see_tag(p_lgu bigint, p_assigned_to text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'pgenro' then true
    when 'lgu_admin' then p_lgu = public.my_lgu()
    when 'field_officer' then
      p_lgu = public.my_lgu()
      or (p_assigned_to is not null and lower(p_assigned_to) = public.my_email())
    else false
  end;
$$;

create or replace function public.can_manage_tag(p_lgu bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'pgenro' then true
    when 'lgu_admin' then p_lgu = public.my_lgu()
    else false
  end;
$$;

revoke all on function public.can_see_tag(bigint, text) from public;
revoke all on function public.can_manage_tag(bigint) from public;
grant execute on function public.can_see_tag(bigint, text) to authenticated;
grant execute on function public.can_manage_tag(bigint) to authenticated;

alter table public.pending_trees enable row level security;

-- Clear whatever was there, keeping accounts.sql's lock.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'pending_trees'
      and policyname <> 'only active accounts'
  loop
    execute format('drop policy %I on public.pending_trees', p.policyname);
  end loop;
end $$;

create policy "anyone submits a tag" on public.pending_trees
  for insert to anon, authenticated with check (true);

create policy "see tags in your jurisdiction" on public.pending_trees
  for select to authenticated using (public.can_see_tag(lgu_psgc, assigned_to));

create policy "handle tags in your jurisdiction" on public.pending_trees
  for update to authenticated
  using (public.can_manage_tag(lgu_psgc)) with check (public.can_manage_tag(lgu_psgc));

create policy "delete tags in your jurisdiction" on public.pending_trees
  for delete to authenticated using (public.can_manage_tag(lgu_psgc));

notify pgrst, 'reload schema';


-- ===========================================================================
-- 3. Check
-- ===========================================================================
select 'tags carry an LGU' as check,
       exists (select 1 from information_schema.columns
               where table_name = 'pending_trees' and column_name = 'lgu_psgc') as ok,
       '' as detail
union all
select 'tags are routed as they arrive',
       exists (select 1 from pg_trigger where tgname = 'route_pending_tree' and not tgisinternal), ''
union all
select 'row level security is on',
       (select relrowsecurity from pg_class where oid = 'public.pending_trees'::regclass), ''
union all
select 'READ: policies on pending_trees now', null,
       (select string_agg(policyname, '; ' order by policyname) from pg_policies
        where schemaname = 'public' and tablename = 'pending_trees')
union all
select 'READ: tags by LGU', null,
       coalesce((select string_agg(coalesce(l.label, 'no LGU — PGENRO only') || ' ' || n, ', ')
                 from (select lgu_psgc, count(*) n from public.pending_trees group by lgu_psgc) t
                 left join public.lgus l on l.psgc = t.lgu_psgc), 'no tags');
