-- Green Tag: an office sees its own field team, not every LGU's.
--
-- Run once, whole, in the SQL editor, after accounts.sql (step 20 of
-- PARKED.md). Safe to run again. Ends in ONE query whose rows say whether
-- each part took.
--
-- Found 19 October: the Kalayaan account's "Assign to Arborist" listed every
-- field officer in Laguna. public.arborists is the first version's list of the
-- field team; it has no LGU of its own, and its one rule (rls_fix.sql) let any
-- signed-in account read, change and delete every row. Nobody could sign in
-- as another LGU's officer from it — the accounts themselves (profiles) were
-- fenced by accounts.sql — but every office could see every officer's name,
-- email and number, and dispatch to them.
--
-- The website now dispatches from the accounts (profiles), which are fenced.
-- This fences the old list too, by the account each row belongs to:
--
--   PGENRO          every row
--   MENRO / CENRO   the rows whose email is a field officer's account in its
--                   own LGU — to read, add, change and remove
--   anyone else     nothing
--
-- A row whose email matches no account is PGENRO's alone, and counted below.
-- RESTRICTIVE, so an older file run again cannot widen it.

create or replace function public.is_my_field_officer(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.sees_as_pgenro(), false)
      or exists (select 1 from public.profiles p
                 where lower(p.email) = lower(trim(coalesce(p_email, '')))
                   and p.role = 'field_officer'
                   and public.is_lgu_admin_of(p.lgu_psgc));
$$;
revoke all on function public.is_my_field_officer(text) from public;
grant execute on function public.is_my_field_officer(text) to authenticated;

do $$
begin
  if to_regclass('public.arborists') is not null then
    alter table public.arborists enable row level security;
    drop policy if exists "an office sees its own field team" on public.arborists;
    create policy "an office sees its own field team" on public.arborists as restrictive
      for all to authenticated
      using (public.is_my_field_officer(email))
      with check (public.is_my_field_officer(email));
    drop policy if exists "the public reads no field team" on public.arborists;
    create policy "the public reads no field team" on public.arborists as restrictive
      for all to anon using (false) with check (false);
  end if;
end $$;

notify pgrst, 'reload schema';

select 'the field team list is fenced by LGU' as check,
       exists (select 1 from pg_policies where tablename = 'arborists'
               and policyname = 'an office sees its own field team' and permissive = 'RESTRICTIVE') as ok,
       '' as detail
union all
select 'READ: rows on the list with no account (PGENRO only)', null,
       case when to_regclass('public.arborists') is null then 'no list'
            else (xpath('/row/n/text()', query_to_xml(
              'select count(*) n from public.arborists a where not exists (select 1 from public.profiles p where lower(p.email) = lower(a.email))',
              false, true, '')))[1]::text end;
