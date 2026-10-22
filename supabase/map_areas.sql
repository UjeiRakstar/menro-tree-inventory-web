-- Green Tag: saving what is drawn on the map — phase 3 of ACCOUNTS_AND_MAPPING.md.
--
-- Run once, whole, in the SQL editor, after accounts.sql (and after
-- training_sandbox.sql, if training is in use — the areas join its wall).
-- Safe to run again. Ends in ONE query whose rows say whether each part took.
--
-- An area is a land cover polygon or a tree planting site that an office
-- drew on the map. Who may do what, as decided:
--
--   anyone, signed in or not   sees every area: the map is public, and there
--                              is no review step — it is for planning, never a
--                              title (decision 3)
--   a MENRO / CENRO            draws inside its own LGU, and edits and deletes
--                              the areas its LGU drew (decisions 2 and 4)
--   PGENRO                     draws anywhere in Laguna, edits and deletes
--                              what PGENRO drew — and when it changes a
--                              MENRO's area, the change is HELD AS A PROPOSAL
--                              that the MENRO approves or declines (decision 4)
--
-- A legal designation needs its document; land cover alone does not
-- (decision 7). Documents go in the public 'area-documents' bucket: they are
-- published for anyone to read, and the page says so before an upload.
--
-- Not checked here: that the polygon lies inside the LGU. Postgres cannot
-- tell without PostGIS; the map refuses a point outside the LGU as it is
-- drawn, and the area is filed under the drawing office's LGU whatever it
-- claims.


-- ===========================================================================
-- 1. The areas
-- ===========================================================================
create table if not exists public.map_areas (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null default 'land-cover',
  name              text not null,
  -- GeoJSON, longitude first: {"type": "Polygon", "coordinates": [[[lng, lat], …]]}
  geometry          jsonb not null,
  -- As measured when saved. The panel measures the polygon again itself.
  area_m2           double precision,
  perimeter_m       double precision,
  lgu_psgc          bigint references public.lgus (psgc),
  municipality      text,
  barangay          text,
  barangay_psgc     bigint,

  -- Land cover: a NAMRIA class (src/lib/namriaCover.js), and what the page
  -- suggested when it was saved, kept so a later look can see both.
  cover_class       text,
  suggested_class   text,
  suggestion_reason text,
  trees_inside      integer,

  -- A legal designation, and the document that backs it.
  designation       text,
  doc_type          text,
  doc_number        text,
  doc_title         text,
  doc_url           text,

  -- Tree planting sites.
  planting_status   text,
  planting_window   text,
  spacing_m         double precision,
  access_note       text,
  contact           text,
  recommended       jsonb,

  notes             text,
  created_by        uuid,
  created_by_role   text,
  created_at        timestamptz not null default now(),
  updated_by        uuid,
  updated_at        timestamptz not null default now()
);

create index if not exists map_areas_lgu_idx on public.map_areas (lgu_psgc);

alter table public.map_areas drop constraint if exists map_areas_kind_check;
alter table public.map_areas add constraint map_areas_kind_check
  check (kind in ('land-cover', 'planting-site'));

alter table public.map_areas drop constraint if exists map_areas_geometry_check;
alter table public.map_areas add constraint map_areas_geometry_check
  check (geometry->>'type' in ('Polygon', 'MultiPolygon')
         and jsonb_typeof(geometry->'coordinates') = 'array');

alter table public.map_areas drop constraint if exists map_areas_cover_check;
alter table public.map_areas add constraint map_areas_cover_check check (
  (kind <> 'land-cover' or cover_class is not null)
  and (cover_class is null or cover_class in (
    'closed-forest', 'open-forest', 'brush-shrubs', 'perennial-crop', 'grassland',
    'mangrove-forest', 'annual-crop', 'open-barren', 'built-up', 'marshland-swamp',
    'fishpond', 'inland-water', 'bamboo-stand'))
);

-- Decision 7: a legal designation is only as good as its document.
alter table public.map_areas drop constraint if exists map_areas_designation_check;
alter table public.map_areas add constraint map_areas_designation_check check (
  designation is null
  or (designation in ('protected-area', 'forest-land', 'zoning', 'flup')
      and doc_url is not null and nullif(trim(doc_title), '') is not null
      and nullif(trim(doc_type), '') is not null)
);

alter table public.map_areas drop constraint if exists map_areas_planting_status_check;
alter table public.map_areas add constraint map_areas_planting_status_check
  check (planting_status is null or planting_status in ('open', 'full', 'maintenance'));

-- Who drew it, and which LGU it is filed under, are the database's to say:
-- an office's area is its own LGU's whatever the page sent; PGENRO's is
-- the LGU named by its municipality. Neither changes after it is saved.
create or replace function public.guard_map_area()
returns trigger language plpgsql set search_path = public as $$
declare
  v_role text := public.my_role();
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if v_role not in ('pgenro', 'lgu_admin') then
      raise exception 'Only PGENRO or a MENRO / CENRO account can save an area.' using errcode = '42501';
    end if;
    new.created_by      := auth.uid();
    new.created_by_role := v_role;
    new.created_at      := now();
    new.lgu_psgc := case when v_role = 'lgu_admin' then public.my_lgu()
                         else coalesce(public.lgu_named(new.municipality), new.lgu_psgc) end;
  else
    new.created_by      := old.created_by;
    new.created_by_role := old.created_by_role;
    new.created_at      := old.created_at;
    new.lgu_psgc        := old.lgu_psgc;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists guard_map_area on public.map_areas;
create trigger guard_map_area
  before insert or update on public.map_areas
  for each row execute function public.guard_map_area();

-- Who may change an area directly. PGENRO changing a MENRO's area is not
-- here on purpose: that goes through a proposal (section 2).
create or replace function public.can_change_area(p_lgu bigint, p_created_by_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'pgenro'    then p_created_by_role = 'pgenro'
    when 'lgu_admin' then p_created_by_role = 'lgu_admin' and public.is_lgu_admin_of(p_lgu)
    else false
  end;
$$;

revoke all on function public.can_change_area(bigint, text) from public;
grant execute on function public.can_change_area(bigint, text) to authenticated;

alter table public.map_areas enable row level security;

drop policy if exists "anyone sees the areas" on public.map_areas;
create policy "anyone sees the areas" on public.map_areas
  for select to anon, authenticated using (true);

drop policy if exists "offices save areas" on public.map_areas;
create policy "offices save areas" on public.map_areas
  for insert to authenticated
  with check (public.sees_as_pgenro() or public.is_lgu_admin_of(lgu_psgc));

drop policy if exists "offices change their own areas" on public.map_areas;
create policy "offices change their own areas" on public.map_areas
  for update to authenticated
  using (public.can_change_area(lgu_psgc, created_by_role))
  with check (public.can_change_area(lgu_psgc, created_by_role));

drop policy if exists "offices delete their own areas" on public.map_areas;
create policy "offices delete their own areas" on public.map_areas
  for delete to authenticated
  using (public.can_change_area(lgu_psgc, created_by_role));

-- A locked or archived account changes nothing, here as everywhere.
drop policy if exists "only active accounts" on public.map_areas;
create policy "only active accounts" on public.map_areas as restrictive
  for all to authenticated
  using (public.is_active_account()) with check (public.is_active_account());


-- ===========================================================================
-- 2. PGENRO's proposals
--
-- PGENRO edits a MENRO's area as a proposal: the whole changed area, held
-- until the MENRO of that LGU approves it (and it is applied) or declines it.
-- ===========================================================================
create table if not exists public.map_area_proposals (
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references public.map_areas (id) on delete cascade,
  changes       jsonb not null,
  note          text,
  status        text not null default 'pending',
  proposed_by   uuid,
  proposed_at   timestamptz not null default now(),
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text
);

alter table public.map_area_proposals drop constraint if exists map_area_proposals_status_check;
alter table public.map_area_proposals add constraint map_area_proposals_status_check
  check (status in ('pending', 'approved', 'declined'));

create index if not exists map_area_proposals_area_idx on public.map_area_proposals (area_id, status);

create or replace function public.guard_map_area_proposal()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.proposed_by := auth.uid();
    new.proposed_at := now();
    new.status      := 'pending';
    new.decided_by  := null;
    new.decided_at  := null;
    return new;
  end if;
  raise exception 'A proposal is approved or declined with approve_area_proposal() / decline_area_proposal().'
    using errcode = '42501';
end $$;

drop trigger if exists guard_map_area_proposal on public.map_area_proposals;
create trigger guard_map_area_proposal
  before insert or update on public.map_area_proposals
  for each row execute function public.guard_map_area_proposal();

-- Whose area it is: the MENRO / CENRO deciding, PGENRO proposing.
create or replace function public.area_lgu(p_area uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select lgu_psgc from public.map_areas where id = p_area;
$$;

create or replace function public.area_drawn_by_office(p_area uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select created_by_role = 'lgu_admin' from public.map_areas where id = p_area), false);
$$;

revoke all on function public.area_lgu(uuid) from public;
revoke all on function public.area_drawn_by_office(uuid) from public;
grant execute on function public.area_lgu(uuid) to authenticated;
grant execute on function public.area_drawn_by_office(uuid) to authenticated;

alter table public.map_area_proposals enable row level security;

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

drop policy if exists "only active accounts" on public.map_area_proposals;
create policy "only active accounts" on public.map_area_proposals as restrictive
  for all to authenticated
  using (public.is_active_account()) with check (public.is_active_account());

-- Approving applies the proposed area. Only the columns a proposal may
-- change are taken from it; who drew it and its LGU stay as they are.
create or replace function public.approve_area_proposal(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prop public.map_area_proposals%rowtype;
  v_area public.map_areas%rowtype;
  v_new  public.map_areas%rowtype;
begin
  select * into v_prop from public.map_area_proposals where id = p_id for update;
  if v_prop.id is null then
    raise exception 'No such proposal.' using errcode = 'P0002';
  end if;
  select * into v_area from public.map_areas where id = v_prop.area_id for update;
  if not public.is_lgu_admin_of(v_area.lgu_psgc) then
    raise exception 'Only this LGU''s MENRO / CENRO can approve a change to its area.' using errcode = '42501';
  end if;
  if v_prop.status <> 'pending' then
    raise exception 'That proposal has already been %.', v_prop.status using errcode = 'P0001';
  end if;

  v_new := jsonb_populate_record(v_area, v_prop.changes);

  update public.map_areas set
    kind = v_new.kind, name = v_new.name, geometry = v_new.geometry,
    area_m2 = v_new.area_m2, perimeter_m = v_new.perimeter_m,
    municipality = v_new.municipality, barangay = v_new.barangay, barangay_psgc = v_new.barangay_psgc,
    cover_class = v_new.cover_class, suggested_class = v_new.suggested_class,
    suggestion_reason = v_new.suggestion_reason, trees_inside = v_new.trees_inside,
    designation = v_new.designation, doc_type = v_new.doc_type, doc_number = v_new.doc_number,
    doc_title = v_new.doc_title, doc_url = v_new.doc_url,
    planting_status = v_new.planting_status, planting_window = v_new.planting_window,
    spacing_m = v_new.spacing_m, access_note = v_new.access_note, contact = v_new.contact,
    recommended = v_new.recommended, notes = v_new.notes,
    updated_by = auth.uid(), updated_at = now()
  where id = v_area.id;

  update public.map_area_proposals
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = p_id;

  perform public.log_activity('area.proposal_approved', 'map_area', v_area.id::text, v_area.lgu_psgc,
    jsonb_build_object('name', v_new.name, 'proposal', p_id));
end $$;

create or replace function public.decline_area_proposal(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prop public.map_area_proposals%rowtype;
  v_lgu  bigint;
begin
  select * into v_prop from public.map_area_proposals where id = p_id for update;
  if v_prop.id is null then
    raise exception 'No such proposal.' using errcode = 'P0002';
  end if;
  v_lgu := public.area_lgu(v_prop.area_id);
  if not public.is_lgu_admin_of(v_lgu) then
    raise exception 'Only this LGU''s MENRO / CENRO can decline a change to its area.' using errcode = '42501';
  end if;
  if v_prop.status <> 'pending' then
    raise exception 'That proposal has already been %.', v_prop.status using errcode = 'P0001';
  end if;

  update public.map_area_proposals
  set status = 'declined', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = p_id;

  perform public.log_activity('area.proposal_declined', 'map_area', v_prop.area_id::text, v_lgu,
    jsonb_build_object('proposal', p_id, 'note', p_note));
end $$;

revoke all on function public.approve_area_proposal(uuid, text) from public;
revoke all on function public.decline_area_proposal(uuid, text) from public;
grant execute on function public.approve_area_proposal(uuid, text) to authenticated;
grant execute on function public.decline_area_proposal(uuid, text) to authenticated;


-- ===========================================================================
-- 3. The activity log — what PGENRO monitors
-- ===========================================================================
create or replace function public.log_map_area_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row public.map_areas%rowtype := coalesce(new, old);
begin
  perform public.log_activity('area.' || lower(tg_op), 'map_area', v_row.id::text, v_row.lgu_psgc,
    jsonb_build_object('name', v_row.name, 'kind', v_row.kind, 'cover', v_row.cover_class));
  return coalesce(new, old);
end $$;

drop trigger if exists log_map_area_changes on public.map_areas;
create trigger log_map_area_changes
  after insert or update or delete on public.map_areas
  for each row execute function public.log_map_area_changes();

create or replace function public.log_map_area_proposals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.log_activity('area.proposed', 'map_area', new.area_id::text, public.area_lgu(new.area_id),
    jsonb_build_object('proposal', new.id, 'note', new.note));
  return new;
end $$;

drop trigger if exists log_map_area_proposals on public.map_area_proposals;
create trigger log_map_area_proposals
  after insert on public.map_area_proposals
  for each row execute function public.log_map_area_proposals();


-- ===========================================================================
-- 4. Behind the training wall, if training is in use
--
-- The same wall as training_sandbox.sql puts round the inventory: a trainee's
-- areas are training areas, seen by trainees only.
-- ===========================================================================
do $$
declare t text;
begin
  if to_regprocedure('public.in_training()') is null then
    return;
  end if;
  foreach t in array array['map_areas', 'map_area_proposals']
  loop
    execute format(
      'alter table public.%I add column if not exists is_training boolean not null default false', t);
    execute format('drop trigger if exists stamp_training on public.%I', t);
    execute format(
      'create trigger stamp_training before insert or update on public.%I '
      'for each row execute function public.stamp_training()', t);
    execute format('drop policy if exists "training stays in training" on public.%I', t);
    execute format(
      'create policy "training stays in training" on public.%I as restrictive '
      'for all to anon, authenticated '
      'using (is_training = (select public.in_training())) '
      'with check (is_training = (select public.in_training()))', t);
  end loop;
end $$;


-- ===========================================================================
-- 5. The documents — public, PDF only
-- ===========================================================================
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('area-documents', 'area-documents', true, 20971520, array['application/pdf'])
  on conflict (id) do update
    set public = true, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

  execute 'drop policy if exists "offices upload area documents" on storage.objects';
  execute $p$create policy "offices upload area documents" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'area-documents' and public.is_menro_admin())$p$;

  execute 'drop policy if exists "offices remove area documents" on storage.objects';
  execute $p$create policy "offices remove area documents" on storage.objects
    for delete to authenticated
    using (bucket_id = 'area-documents' and public.is_menro_admin() and owner = auth.uid())$p$;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'areas can be saved' as check,
       to_regclass('public.map_areas') is not null as ok, '' as detail
union all
select 'proposals can be made', to_regclass('public.map_area_proposals') is not null, ''
union all
select 'anyone sees the areas, offices change only their own',
       (select count(*) from pg_policies where tablename = 'map_areas'
          and policyname in ('anyone sees the areas', 'offices save areas',
                             'offices change their own areas', 'offices delete their own areas')) = 4,
       ''
union all
select 'a designation needs its document',
       exists (select 1 from pg_constraint where conname = 'map_areas_designation_check'), ''
union all
select 'behind the training wall',
       case when to_regprocedure('public.in_training()') is null then null
            else exists (select 1 from pg_policies where tablename = 'map_areas'
                         and policyname = 'training stays in training') end,
       case when to_regprocedure('public.in_training()') is null
            then 'training_sandbox.sql has not been run; nothing to join' else '' end
union all
select 'documents bucket, public, PDF only',
       case when to_regclass('storage.buckets') is null then null
            else exists (select 1 from storage.buckets where id = 'area-documents' and public) end,
       ''
union all
select 'READ: areas saved so far', null, (select count(*) from public.map_areas)::text;
