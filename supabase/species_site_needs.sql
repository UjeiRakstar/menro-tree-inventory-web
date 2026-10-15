-- Green Tag: what each species needs of the ground, in figures.
--
-- Run once, whole, in the SQL editor, after species_rise.sql. Safe to run
-- again. Ends in ONE query whose rows say whether each part took.
--
-- RISE says where a tree grows in prose (site_requirements). These are the
-- same facts as figures, so a planting site can be matched against what
-- PGENRO's layers measured there (src/lib/speciesMatch.js): elevation,
-- rainfall and temperature ranges, the soils it grows in, how it takes
-- flooding, and where it comes from — an invasive species is never
-- recommended. The PGENRO forester records them in the Species (RISE) tab;
-- who may write is unchanged (can_edit_species_profiles).
--
-- Every column is optional. A blank is "the issue does not say", and the
-- matching leaves that need unchecked rather than guessing.

alter table public.species_profiles
  add column if not exists origin             text,
  add column if not exists elevation_min_m    integer,
  add column if not exists elevation_max_m    integer,
  add column if not exists rainfall_min_mm    integer,
  add column if not exists rainfall_max_mm    integer,
  add column if not exists temperature_min_c  numeric(4,1),
  add column if not exists temperature_max_c  numeric(4,1),
  add column if not exists soil_textures      text[],
  add column if not exists flood_tolerance    text;

alter table public.species_profiles drop constraint if exists species_profiles_site_needs_check;
alter table public.species_profiles add constraint species_profiles_site_needs_check check (
  (origin is null or origin in ('endemic', 'native', 'introduced', 'invasive'))
  and (flood_tolerance is null or flood_tolerance in ('none', 'brief', 'prolonged'))
  and (soil_textures is null
       or soil_textures <@ array['clay', 'clay-loam', 'loam', 'silt-loam', 'sandy-loam', 'sand']::text[])
  and (elevation_min_m is null or elevation_max_m is null or elevation_min_m <= elevation_max_m)
  and (rainfall_min_mm is null or rainfall_max_mm is null or rainfall_min_mm <= rainfall_max_mm)
  and (temperature_min_c is null or temperature_max_c is null or temperature_min_c <= temperature_max_c)
);

notify pgrst, 'reload schema';

select 'site needs on species profiles' as check,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'species_profiles'
          and column_name in ('origin', 'elevation_min_m', 'elevation_max_m', 'rainfall_min_mm',
                              'rainfall_max_mm', 'temperature_min_c', 'temperature_max_c',
                              'soil_textures', 'flood_tolerance')) = 9 as ok,
       '' as detail
union all
select 'the figures are checked',
       exists (select 1 from pg_constraint where conname = 'species_profiles_site_needs_check'),
       ''
union all
select 'species with site needs recorded',
       true,
       (select count(*)::text from public.species_profiles
        where elevation_min_m is not null or elevation_max_m is not null
           or rainfall_min_mm is not null or rainfall_max_mm is not null
           or soil_textures is not null or flood_tolerance is not null)
       || ' of ' || (select count(*)::text from public.species_profiles);
