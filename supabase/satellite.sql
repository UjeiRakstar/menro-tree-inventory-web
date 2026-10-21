-- Green Tag: the cloud-free satellite base map, kept in the system (21 October).
--
-- Run once, whole, in the SQL editor, after accounts.sql (step 30 of
-- PARKED.md). Safe to run again. Ends in ONE query whose rows say whether
-- each part took.
--
-- Every week, or twice a month, PGENRO takes a snapshot of Laguna from its
-- Copernicus Data Space configuration on the Map layers page: Sentinel-2,
-- each spot as its clear looks over the last sixty days show it, cut into map
-- tiles and stored in the 'satellite-tiles' bucket. The maps — public and
-- office — and the map sheet draw those stored tiles, so looking at the map
-- never asks Copernicus for anything: the month's requests go only to the
-- snapshots themselves.
--
--   anyone   sees the snapshots and their tiles
--   PGENRO   keeps the configuration's instance ID, takes snapshots, and
--            removes old ones
--
-- The instance ID opens PGENRO's Copernicus configuration, so it is read by
-- PGENRO alone, like a key; it is never in the code.


-- ===========================================================================
-- 1. PGENRO's Copernicus settings — one row
-- ===========================================================================
create table if not exists public.satellite_settings (
  id            boolean primary key default true check (id),
  instance_id   text,
  -- How often a new snapshot is due: every week, or twice a month.
  cadence_days  int not null default 7,
  updated_by    uuid,
  updated_at    timestamptz not null default now()
);

alter table public.satellite_settings drop constraint if exists satellite_settings_cadence_check;
alter table public.satellite_settings add constraint satellite_settings_cadence_check
  check (cadence_days in (7, 15));

alter table public.satellite_settings drop constraint if exists satellite_settings_instance_check;
alter table public.satellite_settings add constraint satellite_settings_instance_check
  check (instance_id is null or instance_id ~ '^[0-9a-fA-F-]{20,64}$');

create or replace function public.stamp_satellite_settings()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.updated_by := auth.uid();
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists stamp_satellite_settings on public.satellite_settings;
create trigger stamp_satellite_settings
  before insert or update on public.satellite_settings
  for each row execute function public.stamp_satellite_settings();

alter table public.satellite_settings enable row level security;

drop policy if exists "pgenro keeps the satellite settings" on public.satellite_settings;
create policy "pgenro keeps the satellite settings" on public.satellite_settings
  for all to authenticated using (public.is_pgenro()) with check (public.is_pgenro());

drop policy if exists "only active accounts" on public.satellite_settings;
create policy "only active accounts" on public.satellite_settings as restrictive
  for all to authenticated
  using (public.is_active_account()) with check (public.is_active_account());


-- ===========================================================================
-- 2. The snapshots
-- ===========================================================================
create table if not exists public.satellite_snapshots (
  id             uuid primary key default gen_random_uuid(),
  -- building: tiles going up; live: the one the maps draw; retired: the one
  -- before, kept a while; failed: stopped part-way, its tiles to remove.
  status         text not null default 'building',
  -- The days the imagery was chosen from.
  imagery_from   date not null,
  imagery_to     date not null,
  min_zoom       int not null default 9,
  max_zoom       int not null default 14,
  -- Tiles fetched from Copernicus so far (in order: a stopped snapshot
  -- carries on from here), and the requests that took, retries included.
  tiles_done     int not null default 0,
  tile_count     int not null default 0,
  requests       int not null default 0,
  note           text,
  taken_by       uuid,
  taken_at       timestamptz not null default now(),
  finished_at    timestamptz
);

alter table public.satellite_snapshots drop constraint if exists satellite_snapshots_status_check;
alter table public.satellite_snapshots add constraint satellite_snapshots_status_check
  check (status in ('building', 'live', 'retired', 'failed'));

alter table public.satellite_snapshots drop constraint if exists satellite_snapshots_window_check;
alter table public.satellite_snapshots add constraint satellite_snapshots_window_check
  check (imagery_from <= imagery_to and min_zoom between 0 and max_zoom and max_zoom <= 16);

-- One snapshot on the maps at a time.
create unique index if not exists satellite_snapshots_one_live
  on public.satellite_snapshots ((true)) where status = 'live';
create index if not exists satellite_snapshots_taken_idx
  on public.satellite_snapshots (taken_at desc);

-- Who took it, and when; and a snapshot going live retires the one before.
create or replace function public.stamp_satellite_snapshot()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and current_user in ('authenticated', 'anon') then
    new.taken_by := auth.uid();
    new.taken_at := now();
    new.status := 'building';
  end if;
  if new.status = 'live' and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    update public.satellite_snapshots set status = 'retired'
    where status = 'live' and id <> new.id;
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end $$;

drop trigger if exists stamp_satellite_snapshot on public.satellite_snapshots;
create trigger stamp_satellite_snapshot
  before insert or update on public.satellite_snapshots
  for each row execute function public.stamp_satellite_snapshot();

alter table public.satellite_snapshots enable row level security;

drop policy if exists "anyone sees the snapshots" on public.satellite_snapshots;
create policy "anyone sees the snapshots" on public.satellite_snapshots
  for select to anon, authenticated using (true);

drop policy if exists "pgenro takes snapshots" on public.satellite_snapshots;
create policy "pgenro takes snapshots" on public.satellite_snapshots
  for insert to authenticated with check (public.is_pgenro());

drop policy if exists "pgenro finishes snapshots" on public.satellite_snapshots;
create policy "pgenro finishes snapshots" on public.satellite_snapshots
  for update to authenticated using (public.is_pgenro()) with check (public.is_pgenro());

drop policy if exists "pgenro removes snapshots" on public.satellite_snapshots;
create policy "pgenro removes snapshots" on public.satellite_snapshots
  for delete to authenticated using (public.is_pgenro() and status <> 'live');

drop policy if exists "only active accounts" on public.satellite_snapshots;
create policy "only active accounts" on public.satellite_snapshots as restrictive
  for all to authenticated
  using (public.is_active_account()) with check (public.is_active_account());


-- ===========================================================================
-- 3. The tiles — public, PGENRO's to write
-- ===========================================================================
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('satellite-tiles', 'satellite-tiles', true, 1048576, array['image/jpeg'])
  on conflict (id) do update
    set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg'];

  execute 'drop policy if exists "pgenro uploads satellite tiles" on storage.objects';
  execute $p$create policy "pgenro uploads satellite tiles" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'satellite-tiles' and public.is_pgenro())$p$;

  -- A snapshot carried on after a stop writes over the tile it was on.
  execute 'drop policy if exists "pgenro replaces satellite tiles" on storage.objects';
  execute $p$create policy "pgenro replaces satellite tiles" on storage.objects
    for update to authenticated
    using (bucket_id = 'satellite-tiles' and public.is_pgenro())
    with check (bucket_id = 'satellite-tiles' and public.is_pgenro())$p$;

  execute 'drop policy if exists "anyone reads satellite tiles" on storage.objects';
  execute $p$create policy "anyone reads satellite tiles" on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'satellite-tiles')$p$;

  execute 'drop policy if exists "pgenro removes satellite tiles" on storage.objects';
  execute $p$create policy "pgenro removes satellite tiles" on storage.objects
    for delete to authenticated
    using (bucket_id = 'satellite-tiles' and public.is_pgenro())$p$;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'PGENRO keeps its Copernicus settings' as check,
       to_regclass('public.satellite_settings') is not null as ok, '' as detail
union all
select 'snapshots are recorded', to_regclass('public.satellite_snapshots') is not null, ''
union all
select 'one snapshot on the maps at a time',
       exists (select 1 from pg_indexes where indexname = 'satellite_snapshots_one_live'), ''
union all
select 'the settings are PGENRO''s alone',
       exists (select 1 from pg_policies where tablename = 'satellite_settings'
               and policyname = 'pgenro keeps the satellite settings'), ''
union all
select 'satellite tiles bucket, public',
       case when to_regclass('storage.buckets') is null then null
            else exists (select 1 from storage.buckets where id = 'satellite-tiles' and public) end,
       ''
union all
select 'READ: the snapshot on the maps', null,
       coalesce((select 'imagery ' || imagery_from || ' to ' || imagery_to || ', ' || tile_count || ' tiles'
                 from public.satellite_snapshots where status = 'live'), 'none yet');
