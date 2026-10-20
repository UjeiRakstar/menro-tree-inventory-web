-- Green Tag: the super admin — one account that can do everything.
--
-- Run once, whole, in the SQL editor, LAST: after every other file in
-- PARKED.md's run order (step 22). It replaces functions and a rule some of
-- those files make, so run it again whenever one of them is run again —
-- accounts.sql, permit_archive.sql or permits_fence.sql. Safe to run again.
-- Ends in ONE query whose rows say whether each part took.
--
-- Decided 18 October: PGENRO watches and does not act on an LGU's records —
-- it reads permits, archives none, and pins no LGU's hall. The super admin
-- (the developer's own account) can do every function the system has, for
-- any LGU: issue and archive permits, dispatch, verify, approve field
-- officers, pin halls, and everything PGENRO does.
--
-- It is a flag on one PGENRO account, not a fourth role, so every page that
-- works for PGENRO works for it. It is set here, in the SQL editor, and
-- nowhere else: no page, and no signed-in account, can set or clear it.
--
-- BEFORE YOU RUN IT: put the email of your own PGENRO account on the marked
-- line in section 4. Left as it is, the file sets up everything and flags
-- nobody.


-- ===========================================================================
-- 1. The flag, which only the SQL editor sets
-- ===========================================================================
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

create or replace function public.guard_super_admin_flag()
returns trigger language plpgsql set search_path = public as $$
begin
  -- The SQL editor and the service role keep what they set.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_super_admin := false;
  elsif new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'The super admin is set in the SQL editor only.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists aab_guard_super_admin_flag on public.profiles;
create trigger aab_guard_super_admin_flag
  before insert or update on public.profiles
  for each row execute function public.guard_super_admin_flag();

-- Whether the caller is the super admin: flagged, and an active account.
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from public.profiles where id = auth.uid() and status = 'active'), false);
$$;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to anon, authenticated;


-- ===========================================================================
-- 2. Every LGU's office, for the super admin
-- ===========================================================================
-- accounts.sql's helper, which the rules on trees, tags, areas, halls and
-- field officers are built from, says yes to the super admin for every LGU.
create or replace function public.is_lgu_admin_of(p_lgu bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'lgu_admin' and public.my_lgu() = p_lgu, false)
      or public.is_super_admin();
$$;


-- ===========================================================================
-- 3. Permits: the super admin issues, changes and archives any LGU's
-- ===========================================================================
do $$
begin
  if to_regclass('public.permits') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'permits' and column_name = 'lgu_psgc') then
    drop policy if exists "permits stay with their LGU" on public.permits;
    create policy "permits stay with their LGU" on public.permits as restrictive
      for all to authenticated
      using (
        (select public.is_pgenro())
        or ((select public.my_role()) = 'lgu_admin' and lgu_psgc = (select public.my_lgu()))
      )
      with check (
        ((select public.my_role()) = 'lgu_admin' and lgu_psgc = (select public.my_lgu()))
        or (select public.is_super_admin())
      );
  end if;
end $$;

create or replace function public.archive_permit(p_id text, p_archived boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_found boolean;
begin
  if not public.is_super_admin() then
    raise exception 'A permit is its LGU''s record: it is read, not archived.' using errcode = '42501';
  end if;

  update public.permits
  set archived_at = case when p_archived then now() end,
      archived_by = case when p_archived then auth.uid() end
  where id::text = p_id
  returning true into v_found;

  if v_found is null then
    raise exception 'No such permit.' using errcode = 'P0002';
  end if;

  perform public.log_activity(
    case when p_archived then 'permit.archived' else 'permit.restored' end,
    'permit', p_id, null, null);
end $$;
revoke all on function public.archive_permit(text, boolean) from public;
grant execute on function public.archive_permit(text, boolean) to authenticated;


-- ===========================================================================
-- 4. Who it is
-- ===========================================================================
do $$
declare
  v_email text := 'PUT-YOUR-PGENRO-ACCOUNT-EMAIL-HERE';   -- ← your own PGENRO account
  v_found int;
begin
  if v_email like 'PUT-%' then
    raise notice 'No super admin set: put your PGENRO account''s email in section 4 and run this again.';
    return;
  end if;
  update public.profiles
  set is_super_admin = true
  where lower(email) = lower(trim(v_email)) and role = 'pgenro';
  get diagnostics v_found = row_count;
  if v_found = 0 then
    raise notice 'No PGENRO account has the email %: nobody was made super admin.', v_email;
  end if;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 5. Check
-- ===========================================================================
select 'the super admin flag, set in the SQL editor only' as check,
       exists (select 1 from information_schema.triggers where trigger_name = 'aab_guard_super_admin_flag') as ok,
       '' as detail
union all
select 'the super admin acts for every LGU',
       position('is_super_admin' in pg_get_functiondef('public.is_lgu_admin_of(bigint)'::regprocedure)) > 0,
       ''
union all
select 'the super admin alone archives permits',
       position('is_super_admin' in pg_get_functiondef('public.archive_permit(text, boolean)'::regprocedure)) > 0,
       ''
union all
select 'READ: super admin', null,
       coalesce((select string_agg(coalesce(email, id::text), ', ') from public.profiles where is_super_admin), 'nobody yet');
