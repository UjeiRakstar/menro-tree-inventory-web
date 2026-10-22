-- Green Tag: tree planting sites are PGENRO's; a MENRO / CENRO requests one.
--
-- Run once, whole, in the SQL editor, after map_areas.sql, training_sandbox.sql
-- and map_layers.sql.
-- Safe to run again, and safe to run map_areas.sql again after it: everything
-- here is its own policy, trigger and function, which map_areas.sql does not
-- touch. Ends in ONE query whose rows say whether each part took.
--
-- As decided (15 October):
--
--   PGENRO                     saves a tree planting site, and it is on the
--                              map at once. It edits and deletes every
--                              approved planting site, whoever asked for it.
--   a MENRO / CENRO            saves a planting site as a REQUEST. It is seen
--                              only by that office and PGENRO until PGENRO
--                              approves it (it goes on the public map) or
--                              declines it, with a note. The office can edit
--                              or withdraw its request until then, and edit a
--                              declined one, which asks again.
--   land cover                 unchanged (map_areas.sql).
--
-- approval: 'approved' | 'requested' | 'declined'. Land cover is always
-- 'approved'. Nobody sets it by hand: the database does, here, and PGENRO's
-- decision goes through decide_planting_request().

alter table public.map_areas
  add column if not exists approval     text not null default 'approved',
  add column if not exists review_note  text,
  add column if not exists reviewed_by  uuid,
  add column if not exists reviewed_at  timestamptz;

alter table public.map_areas drop constraint if exists map_areas_approval_check;
alter table public.map_areas add constraint map_areas_approval_check check (
  approval in ('approved', 'requested', 'declined')
  and (kind = 'planting-site' or approval = 'approved')
);

create index if not exists map_areas_requests_idx on public.map_areas (approval) where approval <> 'approved';

-- Whether a planting site is approved is the database's to say. Fires after
-- guard_map_area (triggers run in name order), so the role and LGU are set.
create or replace function public.guard_planting_request()
returns trigger language plpgsql set search_path = public as $$
begin
  -- decide_planting_request(), and the SQL editor, set it themselves.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.kind <> 'planting-site' or public.my_role() = 'pgenro' then
    new.approval := 'approved';
  else
    -- An office's planting site waits for PGENRO — and a declined one,
    -- changed, is asked for again.
    new.approval := 'requested';
  end if;

  if tg_op = 'INSERT' then
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    new.review_note := old.review_note;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
    -- A refresh of the layer facts is not a change of mind.
    if (to_jsonb(new) - array['layer_facts', 'layer_facts_at', 'updated_at', 'updated_by', 'approval'])
       = (to_jsonb(old) - array['layer_facts', 'layer_facts_at', 'updated_at', 'updated_by', 'approval']) then
      new.approval := old.approval;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_planting_request on public.map_areas;
create trigger guard_planting_request
  before insert or update on public.map_areas
  for each row execute function public.guard_planting_request();

-- Who sees a request: the office that made it, and PGENRO. The public sees
-- only what is approved. Restrictive, so map_areas.sql's "anyone sees the
-- areas" cannot open it up again.
drop policy if exists "requests stay with the offices" on public.map_areas;
create policy "requests stay with the offices" on public.map_areas as restrictive
  for select to anon
  using (approval = 'approved');

drop policy if exists "requests are seen by who decides them" on public.map_areas;
create policy "requests are seen by who decides them" on public.map_areas as restrictive
  for select to authenticated
  using (approval = 'approved' or public.sees_as_pgenro() or public.is_lgu_admin_of(lgu_psgc));

-- An approved planting site is PGENRO's to keep, whoever asked for it.
drop policy if exists "pgenro keeps the planting sites" on public.map_areas;
create policy "pgenro keeps the planting sites" on public.map_areas
  for update to authenticated
  using (public.sees_as_pgenro() and kind = 'planting-site' and approval = 'approved')
  with check (public.sees_as_pgenro() and kind = 'planting-site');

drop policy if exists "pgenro removes planting sites" on public.map_areas;
create policy "pgenro removes planting sites" on public.map_areas
  for delete to authenticated
  using (public.sees_as_pgenro() and kind = 'planting-site' and approval = 'approved');

-- …and not the office's any more, once approved.
drop policy if exists "approved planting sites are pgenro's" on public.map_areas;
create policy "approved planting sites are pgenro's" on public.map_areas as restrictive
  for update to authenticated
  using (kind <> 'planting-site' or approval <> 'approved' or public.sees_as_pgenro());

drop policy if exists "approved planting sites stay unless pgenro removes them" on public.map_areas;
create policy "approved planting sites stay unless pgenro removes them" on public.map_areas as restrictive
  for delete to authenticated
  using (kind <> 'planting-site' or approval <> 'approved' or public.sees_as_pgenro());

-- PGENRO's decision, with a note the office sees.
create or replace function public.decide_planting_request(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
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
end $$;

revoke all on function public.decide_planting_request(uuid, boolean, text) from public;
grant execute on function public.decide_planting_request(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'planting sites carry an approval' as check,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'map_areas' and column_name = 'approval') as ok,
       '' as detail
union all
select 'the database sets it',
       exists (select 1 from pg_trigger where tgname = 'guard_planting_request'), ''
union all
select 'requests are seen by the office and PGENRO only',
       (select count(*) from pg_policies where tablename = 'map_areas'
          and policyname in ('requests stay with the offices', 'requests are seen by who decides them')) = 2, ''
union all
select 'approved planting sites are PGENRO''s',
       (select count(*) from pg_policies where tablename = 'map_areas'
          and policyname in ('pgenro keeps the planting sites', 'pgenro removes planting sites',
                             'approved planting sites are pgenro''s',
                             'approved planting sites stay unless pgenro removes them')) = 4, ''
union all
select 'PGENRO decides', to_regprocedure('public.decide_planting_request(uuid, boolean, text)') is not null, ''
union all
select 'READ: planting site requests waiting', null,
       (select count(*)::text from public.map_areas where approval = 'requested');
