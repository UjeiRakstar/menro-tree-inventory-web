-- Green Tag: a PGENRO training account (22 October).
--
-- Run once, whole, in the SQL editor, after training_sandbox.sql and the
-- files it names, permits_fence.sql, map_areas.sql, planting_requests.sql,
-- field_team_fence.sql and super_admin.sql (step 35 of PARKED.md). Safe to
-- run again. Ends in ONE query whose rows say whether each part took.
--
-- ===========================================================================
-- WHAT THIS IS
-- ===========================================================================
-- The training wall (training_sandbox.sql) already keeps a training account to
-- training rows. A PGENRO training account sees the whole province's training
-- data — every LGU's mock trees, tags, permits, planting sites — and practises
-- PGENRO's own work on it: dispatching tags, deciding planting site requests,
-- keeping the sites. Nothing else.
--
-- What it can NOT do is anything PGENRO does to the live system: issue real
-- account codes, approve, lock or move accounts, write the species write-ups
-- or choose their photos, post news, upload map layers, change the satellite,
-- read the inbox or the data requests. All of those ask is_pgenro(), which is
-- now false for a training account — refused by default, so a power added
-- later is refused too without anyone remembering to.
--
-- The rules on the walled tables ask sees_as_pgenro() instead: true for PGENRO
-- and its trainee alike, and safe there because the wall shows a trainee
-- nothing but training rows. The same changes are in the files those rules
-- come from, so running any of them again keeps them.
--
-- Section 4 makes the account: put its email in, and run this again.


-- ===========================================================================
-- 1. Who acts as PGENRO
-- ===========================================================================
create or replace function public.is_pgenro()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'pgenro', false)
     and not coalesce((select (to_jsonb(p) ->> 'is_training')::boolean
                       from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.sees_as_pgenro()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'pgenro', false);
$$;

revoke all on function public.sees_as_pgenro() from public;
grant execute on function public.sees_as_pgenro() to authenticated;

-- The super admin acts for every LGU's office: never from a training account.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_super_admin') then
    execute $f$
      create or replace function public.is_super_admin()
      returns boolean language sql stable security definer set search_path = public as $b$
        select coalesce((select is_super_admin and not coalesce((to_jsonb(p) ->> 'is_training')::boolean, false)
                         from public.profiles p where id = auth.uid() and status = 'active'), false);
      $b$
    $f$;
  end if;
end $$;


-- ===========================================================================
-- 2. The walled tables, province-wide for a training PGENRO
--
-- As in accounts.sql, field_team_fence.sql, permits_fence.sql /
-- super_admin.sql, map_areas.sql and planting_requests.sql.
-- ===========================================================================
drop policy if exists "pgenro reads the whole log" on public.activity_log;
create policy "pgenro reads the whole log" on public.activity_log
  for select to authenticated using (public.sees_as_pgenro());

-- The field team: every trainee arborist, as PGENRO sees every real one.
do $$
begin
  if to_regprocedure('public.is_my_field_officer(text)') is not null then
    execute $f$
      create or replace function public.is_my_field_officer(p_email text)
      returns boolean language sql stable security definer set search_path = public as $b$
        select coalesce(public.sees_as_pgenro(), false)
            or exists (select 1 from public.profiles p
                       where lower(p.email) = lower(trim(coalesce(p_email, '')))
                         and p.role = 'field_officer'
                         and public.is_lgu_admin_of(p.lgu_psgc));
      $b$
    $f$;
  end if;
end $$;

-- Permits: every LGU's, to read; issuing stays the offices' (and the super
-- admin's, who is never a trainee).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'permits' and column_name = 'lgu_psgc') then
    drop policy if exists "permits stay with their LGU" on public.permits;
    if to_regprocedure('public.is_super_admin()') is not null then
      create policy "permits stay with their LGU" on public.permits as restrictive
        for all to authenticated
        using (
          (select public.sees_as_pgenro())
          or ((select public.my_role()) = 'lgu_admin' and lgu_psgc = (select public.my_lgu()))
        )
        with check (
          ((select public.my_role()) = 'lgu_admin' and lgu_psgc = (select public.my_lgu()))
          or (select public.is_super_admin())
        );
    else
      create policy "permits stay with their LGU" on public.permits as restrictive
        for all to authenticated
        using (
          (select public.sees_as_pgenro())
          or ((select public.my_role()) = 'lgu_admin' and lgu_psgc = (select public.my_lgu()))
        )
        with check ((select public.my_role()) = 'lgu_admin' and lgu_psgc = (select public.my_lgu()));
    end if;
  end if;
end $$;

-- The map's areas, and PGENRO's proposals on an office's area.
do $$
begin
  if to_regclass('public.map_areas') is not null then
    drop policy if exists "offices save areas" on public.map_areas;
    create policy "offices save areas" on public.map_areas
      for insert to authenticated
      with check (public.sees_as_pgenro() or public.is_lgu_admin_of(lgu_psgc));
  end if;
  if to_regclass('public.map_area_proposals') is not null then
    drop policy if exists "pgenro and the lgu see proposals" on public.map_area_proposals;
    create policy "pgenro and the lgu see proposals" on public.map_area_proposals
      for select to authenticated
      using (public.sees_as_pgenro() or public.is_lgu_admin_of(public.area_lgu(area_id)));
    drop policy if exists "pgenro proposes" on public.map_area_proposals;
    create policy "pgenro proposes" on public.map_area_proposals
      for insert to authenticated
      with check (public.sees_as_pgenro() and public.area_drawn_by_office(area_id));
    drop policy if exists "pgenro withdraws a pending proposal" on public.map_area_proposals;
    create policy "pgenro withdraws a pending proposal" on public.map_area_proposals
      for delete to authenticated
      using (public.sees_as_pgenro() and status = 'pending' and proposed_by = auth.uid());
  end if;
end $$;

-- Planting sites: the requests to decide, and the approved sites to keep.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'map_areas' and column_name = 'approval') then
    return;
  end if;

  drop policy if exists "requests are seen by who decides them" on public.map_areas;
  create policy "requests are seen by who decides them" on public.map_areas as restrictive
    for select to authenticated
    using (approval = 'approved' or public.sees_as_pgenro() or public.is_lgu_admin_of(lgu_psgc));

  drop policy if exists "pgenro keeps the planting sites" on public.map_areas;
  create policy "pgenro keeps the planting sites" on public.map_areas
    for update to authenticated
    using (public.sees_as_pgenro() and kind = 'planting-site' and approval = 'approved')
    with check (public.sees_as_pgenro() and kind = 'planting-site');

  drop policy if exists "pgenro removes planting sites" on public.map_areas;
  create policy "pgenro removes planting sites" on public.map_areas
    for delete to authenticated
    using (public.sees_as_pgenro() and kind = 'planting-site' and approval = 'approved');

  drop policy if exists "approved planting sites are pgenro's" on public.map_areas;
  create policy "approved planting sites are pgenro's" on public.map_areas as restrictive
    for update to authenticated
    using (kind <> 'planting-site' or approval <> 'approved' or public.sees_as_pgenro());

  drop policy if exists "approved planting sites stay unless pgenro removes them" on public.map_areas;
  create policy "approved planting sites stay unless pgenro removes them" on public.map_areas as restrictive
    for delete to authenticated
    using (kind <> 'planting-site' or approval <> 'approved' or public.sees_as_pgenro());

  execute $f$
    create or replace function public.decide_planting_request(p_id uuid, p_approve boolean, p_note text default null)
    returns void language plpgsql security definer set search_path = public as $b$
    declare
      v_area public.map_areas%rowtype;
    begin
      -- A training PGENRO decides the training requests (the wall check below).
      if not public.sees_as_pgenro() or not public.is_active_account() then
        raise exception 'Only PGENRO decides on planting site requests.' using errcode = '42501';
      end if;
      select * into v_area from public.map_areas where id = p_id for update;
      -- A real account does not decide a trainee's request, nor the other way.
      if v_area.id is null
         or coalesce((to_jsonb(v_area) ->> 'is_training')::boolean, false) is distinct from
            coalesce(public.in_training(), false) then
        raise exception 'No such request.' using errcode = 'P0002';
      end if;
      if v_area.kind <> 'planting-site' or v_area.approval <> 'requested' then
        raise exception 'That planting site is not waiting for a decision.' using errcode = 'P0001';
      end if;
      update public.map_areas
      set approval    = case when p_approve then 'approved' else 'declined' end,
          review_note = nullif(trim(p_note), ''),
          reviewed_by = auth.uid(),
          reviewed_at = now()
      where id = p_id;
    end $b$
  $f$;
end $$;


-- ===========================================================================
-- 3. The training accounts, for a training PGENRO
--
-- PGENRO reads every account; its trainee, the training ones only — not the
-- real offices, nor the real field officers waiting for approval.
-- ===========================================================================
drop policy if exists "a training pgenro reads the training accounts" on public.profiles;
create policy "a training pgenro reads the training accounts" on public.profiles
  for select to authenticated
  using (public.sees_as_pgenro() and (select public.in_training()) and is_training);

notify pgrst, 'reload schema';


-- ===========================================================================
-- 4. The account
--
-- 1. Authentication → Users → Add user → Create new user: an email for the
--    trainee (one that is not a real PGENRO account) and a password; tick
--    "Auto Confirm User".
-- 2. Put that email below and run this file again.
-- It becomes a PGENRO account behind the training wall: the violet "Training
-- mode" banner on every page, the province's training data, no live power.
-- training_purge.sql leaves the account; set_account_training() or deleting
-- the user in Authentication ends it.
-- ===========================================================================
do $$
declare
  v_email text := 'PUT-THE-TRAINING-ACCOUNT-EMAIL-HERE';   -- ← the trainee's sign-in email
  v_row public.profiles%rowtype;
begin
  if v_email like 'PUT-%' then
    raise notice 'No training PGENRO account made: put its email in section 4 and run this again.';
    return;
  end if;
  select * into v_row from public.profiles where lower(email) = lower(trim(v_email));
  if v_row.id is null then
    raise exception 'No account has the email % — add the user in Authentication first.', v_email;
  end if;
  if v_row.role = 'pgenro' and not v_row.is_training then
    raise exception '% is a real PGENRO account. Use a separate email for training.', v_email;
  end if;
  if coalesce((to_jsonb(v_row) ->> 'is_super_admin')::boolean, false) then
    raise exception '% is the super admin. Use a separate email for training.', v_email;
  end if;
  update public.profiles
  set role = 'pgenro', status = 'active', is_approved = true, is_training = true, lgu_psgc = null
  where id = v_row.id;
end $$;


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'a training account does not act as PGENRO' as check,
       pg_get_functiondef('public.is_pgenro()'::regprocedure) like '%is_training%' as ok,
       '' as detail
union all
select 'PGENRO''s rules on the walled tables include its trainee',
       exists (select 1 from pg_proc where proname = 'sees_as_pgenro')
       and exists (select 1 from pg_policies where tablename = 'activity_log' and policyname = 'pgenro reads the whole log'
                   and qual like '%sees_as_pgenro%'),
       ''
union all
select 'a training PGENRO reads the training accounts only',
       exists (select 1 from pg_policies where tablename = 'profiles'
               and policyname = 'a training pgenro reads the training accounts'),
       ''
union all
select 'READ: training PGENRO accounts', null,
       coalesce((select string_agg(email, ', ' order by email) from public.profiles
                 where role = 'pgenro' and is_training), 'none yet');
