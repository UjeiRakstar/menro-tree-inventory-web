-- Green Tag: what a DENR-ERDB RISE publication says about a species.
--
-- Run once, whole, in the SQL editor, after species_profiles.sql. Safe to run
-- again. Ends in ONE query whose rows say whether each part took.
--
-- species_profiles already holds the write-up the public map's tree panel
-- shows (description). The PGENRO forester now records the rest of a RISE
-- issue alongside it, from the Trees page → Species (RISE) tab. Who may write
-- is unchanged: PGENRO only (can_edit_species_profiles in species_profiles.sql).
--
-- Every column is optional: a RISE issue that says nothing about pests leaves
-- pests blank rather than "none".

alter table public.species_profiles
  add column if not exists family              text,
  add column if not exists local_names         text,
  add column if not exists conservation_status text,
  add column if not exists distribution        text,
  add column if not exists site_requirements   text,
  -- Months as numbers, 1 = January, so the phenology features can use them
  -- without parsing prose; the note keeps whatever the issue says in words.
  add column if not exists flowering_months    smallint[],
  add column if not exists fruiting_months     smallint[],
  add column if not exists phenology_note      text,
  add column if not exists propagation         text,
  add column if not exists uses                text,
  add column if not exists pests_diseases      text,
  -- Which RISE issue it came from: "RISE Vol. 21 No. 2 (2019), Narra".
  add column if not exists rise_citation       text,
  add column if not exists rise_url            text,
  -- True when the form was filled in from the PDF by the reading tool and then
  -- checked by the forester, rather than typed. Kept after the tool is gone,
  -- so those entries can be found again if ever needed.
  add column if not exists autofilled          boolean not null default false;

alter table public.species_profiles drop constraint if exists species_profiles_months_check;
alter table public.species_profiles add constraint species_profiles_months_check check (
  (flowering_months is null or flowering_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[])
  and (fruiting_months is null or fruiting_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[])
);

-- Who saved it last, filled in by the database rather than trusted from the
-- page.
create or replace function public.stamp_species_profile_editor()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists species_profiles_editor on public.species_profiles;
create trigger species_profiles_editor
  before insert or update on public.species_profiles
  for each row execute function public.stamp_species_profile_editor();

notify pgrst, 'reload schema';

select 'RISE fields on species profiles' as check,
       (select count(*) from information_schema.columns
        where table_name = 'species_profiles'
          and column_name in ('family', 'local_names', 'conservation_status', 'distribution',
                              'site_requirements', 'flowering_months', 'fruiting_months',
                              'phenology_note', 'propagation', 'uses', 'pests_diseases',
                              'rise_citation', 'rise_url', 'autofilled')) = 14 as ok,
       '' as detail
union all
select 'only PGENRO writes them',
       exists (select 1 from pg_policies
               where tablename = 'species_profiles' and policyname = 'staff may write species profiles'),
       ''
union all
select 'READ: species with a write-up', null,
       coalesce((select string_agg(species, ', ' order by species) from public.species_profiles), 'none yet');
