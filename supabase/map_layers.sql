-- Green Tag: PGENRO's map layers — phase 4 of ACCOUNTS_AND_MAPPING.md.
--
-- Run once, whole, in the SQL editor, after map_areas.sql. Safe to run again.
-- Ends in ONE query whose rows say whether each part took.
--
-- PGENRO uploads the survey layers the province has — BSWM soil, the
-- Copernicus elevation model, NOAH flood (and landslide, when there is one)
-- — and DOST-PAGASA's CLIRAM climate figures for each LGU. Each layer is
-- prepared in PGENRO's browser as it is uploaded (src/lib/layers/): a picture
-- or shapes to draw on the map, and a measuring grid. This file keeps track
-- of which upload is live, holds the climate figures, and gives each saved
-- area the facts its ground has.
--
--   anyone      sees the live layers and the climate figures: they are what
--               the public map draws
--   PGENRO      uploads, replaces and retires them
--
-- Layers are reference data for the whole province, so they are not behind
-- the training wall: a trainee's map shows the same soil as everyone's.


-- ===========================================================================
-- 1. The layers
-- ===========================================================================
create table if not exists public.map_layers (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,
  -- The file as PGENRO had it, and where it came from.
  file_name     text,
  source        text,
  -- What the map draws (a picture, or shapes) and what areas are measured
  -- against (the grid), in the 'map-layers' bucket.
  picture_path  text,
  shapes_path   text,
  grid_path     text,
  -- The grid's extent and cell, the picture's bounds, the classes and their
  -- legend, and the counts the upload page showed — all as prepared.
  meta          jsonb not null default '{}'::jsonb,
  active        boolean not null default true,
  uploaded_by   uuid,
  uploaded_at   timestamptz not null default now()
);

alter table public.map_layers drop constraint if exists map_layers_kind_check;
alter table public.map_layers add constraint map_layers_kind_check
  check (kind in ('soil', 'elevation', 'flood', 'landslide'));

-- One live layer of each kind; older uploads stay, retired, as the record.
create unique index if not exists map_layers_one_live on public.map_layers (kind) where active;

-- Publishing a new layer retires the one before it.
create or replace function public.retire_previous_layer()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.active then
    update public.map_layers set active = false
    where kind = new.kind and active and id <> new.id;
  end if;
  if current_user in ('authenticated', 'anon') then
    new.uploaded_by := auth.uid();
    new.uploaded_at := now();
  end if;
  return new;
end $$;

drop trigger if exists retire_previous_layer on public.map_layers;
create trigger retire_previous_layer
  before insert on public.map_layers
  for each row execute function public.retire_previous_layer();

alter table public.map_layers enable row level security;

drop policy if exists "anyone sees the layers" on public.map_layers;
create policy "anyone sees the layers" on public.map_layers
  for select to anon, authenticated using (true);

drop policy if exists "pgenro uploads layers" on public.map_layers;
create policy "pgenro uploads layers" on public.map_layers
  for insert to authenticated with check (public.is_pgenro());

drop policy if exists "pgenro retires layers" on public.map_layers;
create policy "pgenro retires layers" on public.map_layers
  for update to authenticated using (public.is_pgenro()) with check (public.is_pgenro());

drop policy if exists "only active accounts" on public.map_layers;
create policy "only active accounts" on public.map_layers as restrictive
  for all to authenticated
  using (public.is_active_account()) with check (public.is_active_account());


-- ===========================================================================
-- 2. Climate, per LGU (DOST-PAGASA CLIRAM)
-- ===========================================================================
create table if not exists public.lgu_climate (
  lgu_psgc     bigint primary key references public.lgus (psgc),
  place        text,
  scenario     text,
  -- { meanC, monthly[12], projected: { period, meanC } }
  temperature  jsonb not null,
  -- { annualMm, monthly[12], projected: { period, annualMm } }
  rainfall     jsonb not null,
  file_name    text,
  uploaded_by  uuid,
  uploaded_at  timestamptz not null default now()
);

create or replace function public.stamp_climate_upload()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.uploaded_by := auth.uid();
    new.uploaded_at := now();
  end if;
  return new;
end $$;

drop trigger if exists stamp_climate_upload on public.lgu_climate;
create trigger stamp_climate_upload
  before insert or update on public.lgu_climate
  for each row execute function public.stamp_climate_upload();

alter table public.lgu_climate enable row level security;

drop policy if exists "anyone sees the climate" on public.lgu_climate;
create policy "anyone sees the climate" on public.lgu_climate
  for select to anon, authenticated using (true);

drop policy if exists "pgenro keeps the climate" on public.lgu_climate;
create policy "pgenro keeps the climate" on public.lgu_climate
  for all to authenticated using (public.is_pgenro()) with check (public.is_pgenro());

drop policy if exists "only active accounts" on public.lgu_climate;
create policy "only active accounts" on public.lgu_climate as restrictive
  for all to authenticated
  using (public.is_active_account()) with check (public.is_active_account());


-- ===========================================================================
-- 3. Each area's facts from the layers
--
-- Worked out in the browser — by the office as it saves an area, and by
-- PGENRO for every area when it replaces a layer — and kept with the area,
-- so the public panel reads them instead of measuring.
--
-- PGENRO cannot edit an office's area (map_areas.sql), so refreshing the
-- facts goes through set_area_layer_facts(), which touches nothing else.
-- ===========================================================================
alter table public.map_areas
  add column if not exists layer_facts    jsonb,
  add column if not exists layer_facts_at timestamptz;

create or replace function public.set_area_layer_facts(p_area uuid, p_facts jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_area public.map_areas%rowtype;
begin
  select * into v_area from public.map_areas where id = p_area for update;
  if v_area.id is null
     or not (public.is_pgenro() or public.can_change_area(v_area.lgu_psgc, v_area.created_by_role))
     or coalesce((to_jsonb(v_area) ->> 'is_training')::boolean, false) is distinct from
        coalesce(public.in_training(), false) then
    raise exception 'No such area.' using errcode = 'P0002';
  end if;
  update public.map_areas
  set layer_facts = p_facts, layer_facts_at = now()
  where id = p_area;
end $$;

revoke all on function public.set_area_layer_facts(uuid, jsonb) from public;
grant execute on function public.set_area_layer_facts(uuid, jsonb) to authenticated;

-- Refreshing an area's facts is not an edit anybody made: keep it out of the
-- activity log, which logged every update until now (map_areas.sql).
create or replace function public.log_map_area_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row public.map_areas%rowtype := coalesce(new, old);
  v_quiet constant text[] := array['layer_facts', 'layer_facts_at', 'updated_at', 'updated_by'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - v_quiet) = (to_jsonb(new) - v_quiet) then
    return new;
  end if;
  perform public.log_activity('area.' || lower(tg_op), 'map_area', v_row.id::text, v_row.lgu_psgc,
    jsonb_build_object('name', v_row.name, 'kind', v_row.kind, 'cover', v_row.cover_class));
  return coalesce(new, old);
end $$;


-- ===========================================================================
-- 4. The files — public, PGENRO's to write
-- ===========================================================================
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('map-layers', 'map-layers', true, 52428800,
          array['image/png', 'application/geo+json', 'application/json', 'application/gzip', 'application/octet-stream'])
  on conflict (id) do update
    set public = true, file_size_limit = 52428800,
        allowed_mime_types = array['image/png', 'application/geo+json', 'application/json',
                                   'application/gzip', 'application/octet-stream'];

  execute 'drop policy if exists "pgenro uploads layer files" on storage.objects';
  execute $p$create policy "pgenro uploads layer files" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'map-layers' and public.is_pgenro())$p$;

  execute 'drop policy if exists "anyone reads layer files" on storage.objects';
  execute $p$create policy "anyone reads layer files" on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'map-layers')$p$;

  execute 'drop policy if exists "pgenro removes layer files" on storage.objects';
  execute $p$create policy "pgenro removes layer files" on storage.objects
    for delete to authenticated
    using (bucket_id = 'map-layers' and public.is_pgenro())$p$;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'layers can be uploaded' as check, to_regclass('public.map_layers') is not null as ok, '' as detail
union all
select 'one live layer of each kind',
       exists (select 1 from pg_indexes where indexname = 'map_layers_one_live'), ''
union all
select 'climate per LGU', to_regclass('public.lgu_climate') is not null, ''
union all
select 'areas carry their facts',
       exists (select 1 from information_schema.columns
               where table_name = 'map_areas' and column_name = 'layer_facts'), ''
union all
select 'layer files bucket, public',
       case when to_regclass('storage.buckets') is null then null
            else exists (select 1 from storage.buckets where id = 'map-layers' and public) end,
       ''
union all
select 'READ: live layers', null,
       coalesce((select string_agg(kind || ' (' || coalesce(file_name, '?') || ')', ', ' order by kind)
                 from public.map_layers where active), 'none yet')
union all
select 'READ: LGUs with climate figures', null, (select count(*) from public.lgu_climate)::text || ' of 30';
