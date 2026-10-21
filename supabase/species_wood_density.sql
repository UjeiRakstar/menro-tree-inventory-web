-- Green Tag: each species' wood density, for its carbon (21 October).
--
-- Run once, whole, in the SQL editor, after species_rise.sql (step 26 of
-- PARKED.md). Safe to run again. Ends in ONE query whose rows say whether
-- each part took.
--
-- Carbon comes from Chave et al. (2014) on diameter, total height and wood
-- density (src/lib/treeCarbon.js). Until a species has its own density, its
-- trees take 0.57 g/cm³, the tropical Asian mean (Reyes et al. 1992). The
-- PGENRO forester records the species' own here, in the Species (RISE) tab,
-- with where it comes from — the Global Wood Density Database (Zanne et al.
-- 2009), ERDB, or a RISE issue. Who may write is unchanged
-- (can_edit_species_profiles).

alter table public.species_profiles
  add column if not exists wood_density        numeric(4,3),
  add column if not exists wood_density_source text;

-- Oven-dry mass over green volume, in g/cm³: 0.1 (balsa) to 1.5 (the
-- densest ironwoods). Anything outside is a typing mistake or kg/m³.
alter table public.species_profiles drop constraint if exists species_profiles_wood_density_check;
alter table public.species_profiles add constraint species_profiles_wood_density_check check (
  wood_density is null or wood_density between 0.1 and 1.5
);

notify pgrst, 'reload schema';

select 'wood density on species profiles' as check,
       (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'species_profiles'
          and column_name in ('wood_density', 'wood_density_source')) = 2 as ok,
       '' as detail
union all
select 'a density outside 0.1–1.5 g/cm³ is refused',
       exists (select 1 from pg_constraint where conname = 'species_profiles_wood_density_check'),
       ''
union all
select 'READ: species with their own wood density', null,
       (select count(*)::text from public.species_profiles where wood_density is not null)
       || ' of ' || (select count(*)::text from public.species_profiles);
