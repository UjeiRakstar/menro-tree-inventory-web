-- Green Tag: the species write-ups the public map's side panel shows.
--
-- WHAT THIS IS FOR
-- Tapping a tree point on the public map opens a panel with two tabs. The
-- "Description" tab is the species' published write-up, copied from the
-- DENR-ERDB publications on ERDB Services and Knowledge Resources Integrated
-- System (RISE) by a PGENRO account — which is what this table holds, and why
-- the panel renders the ERDB disclaimer under it. ("Tree Details" is the other
-- tab, and it is measured field data from public.trees, not this.)
--
-- One row per species, keyed by the common name the mobile app writes into
-- public.trees.species — "Narra", "Mango", "Mahogany". Spelling counts: a row
-- keyed 'Manga' would never be found, because no tree is recorded that way.
-- That name is still the only key the two sides reliably share, since
-- trees.scientific_name is "Unknown" on 8 of the 112 rows today.
--
-- A species with no row here is not an error. The panel says the write-up has
-- not been published yet, which is also what a PGENRO account sees as its
-- to-do list.
--
-- Run AFTER supabase/admin_approval_policy.sql: the write policy below reads
-- profiles.role, which that file adds.
--
-- If an earlier run of this file created a "details" column, it is unused now
-- and can go:  alter table public.species_profiles drop column if exists details;

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------
create table if not exists public.species_profiles (
  species text primary key,
  scientific_name text,
  -- The "Description" tab: what the tree is, how it grows, where it thrives.
  -- Blank lines separate paragraphs; the panel renders them as paragraphs and
  -- does not interpret any markup.
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

comment on table public.species_profiles is
  'PGENRO-authored species write-ups from DENR-ERDB RISE, shown in the public map panel.';

-- Keep updated_at honest without relying on the client to send it.
create or replace function public.touch_species_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists species_profiles_touch on public.species_profiles;
create trigger species_profiles_touch
  before update on public.species_profiles
  for each row execute function public.touch_species_profile();

-- ---------------------------------------------------------------------------
-- 2. Row level security.
--
-- The map is public and signed-out visitors read it, so the read policy is
-- open to anon. Writing is the PGENRO account's job, which this project
-- already identifies through profiles.role.
-- ---------------------------------------------------------------------------
alter table public.species_profiles enable row level security;

drop policy if exists "species profiles are readable by everyone" on public.species_profiles;
create policy "species profiles are readable by everyone"
  on public.species_profiles
  for select
  to anon, authenticated
  using (true);

-- Who may publish a write-up. PGENRO sits alongside the MENRO admin here:
-- both are staff accounts, and the mobile app's arborists are neither.
create or replace function public.can_edit_species_profiles()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'pgenro')
  );
$$;

drop policy if exists "staff may write species profiles" on public.species_profiles;
create policy "staff may write species profiles"
  on public.species_profiles
  for all
  to authenticated
  using (public.can_edit_species_profiles())
  with check (public.can_edit_species_profiles());

-- ---------------------------------------------------------------------------
-- 3. Where a tree record came from.
--
-- The panel's third icon says whether a tree was crowdsourced by a resident or
-- gathered by a field officer, and nothing in public.trees recorded that. Rows
-- that exist today all came from the field officers' mobile app, so 'field' is
-- the right default for them; the crowdsourcing flow sets 'crowdsource' when it
-- promotes an approved public.pending_trees row into public.trees.
--
-- The web app treats a missing or unrecognised value as 'field', so it keeps
-- working if this section has not been run yet.
-- ---------------------------------------------------------------------------
alter table public.trees
  add column if not exists source text not null default 'field';

alter table public.trees
  drop constraint if exists trees_source_check;
alter table public.trees
  add constraint trees_source_check check (source in ('field', 'crowdsource'));

-- ---------------------------------------------------------------------------
-- 4. A starting row, so the panel can be seen working end to end.
--     (Text below is from the ERDB RISE entry for Mangifera indica.)
-- ---------------------------------------------------------------------------
insert into public.species_profiles (species, scientific_name, description)
values (
  -- The common name must match public.trees.species exactly, and the mobile
  -- app writes "Mango" (11 trees), not "Manga".
  'Mango',
  'Mangifera indica',
  'The Mango Tree is a large, densely crowded evergreen that can reach a height of 33 m and a diameter of 2 m. Its leaves are oblong to oblong-lanceolate, and its bark exudes a milky latex when injured.'
    || E'\n\n'
    || 'For its site requirements, the mango tree thrives in deep, rich soil that is high in organic matter. It prefers an ideal temperature of 24-27°C and an evenly distributed annual rainfall of 800 mm.'
    || E'\n\n'
    || 'While most commercial production is below 610 m, it is known to grow at elevations up to 1,220 m.'
)
on conflict (species) do nothing;
