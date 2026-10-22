-- Green Tag: the Tree Database's photos — PGENRO's choice of cover, and the
-- photos it hides (22 October).
--
-- Run once, whole, in the SQL editor, after accounts.sql (step 34 of
-- PARKED.md). Safe to run again. Ends in ONE query whose rows say whether
-- each part took.
--
-- The Tree Database shows each species with the photos its tagged trees
-- already have — main, leaves, bark, fruits — taken by the field officers (a
-- resident's tag never illustrates a species). The page picks a cover by
-- itself; this table is only for where PGENRO knows better:
--
--   cover_url    the photo to show first for the species
--   hidden_urls  photos never shown — one with a person's face or a house in
--                it, a blurred one, a wrong one
--
-- One row per species, keyed by its name in lower case (as the page matches
-- species). Everyone reads it; only PGENRO writes it.

create table if not exists public.species_photo_choices (
  species     text primary key,
  cover_url   text,
  hidden_urls text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

comment on table public.species_photo_choices is
  'PGENRO''s cover photo and hidden photos per species, for the Tree Database.';

-- The key as the page looks it up; who and when, whatever was sent; a hidden
-- photo is never the cover.
create or replace function public.stamp_species_photo_choice()
returns trigger language plpgsql set search_path = public as $$
begin
  new.species := lower(trim(new.species));
  if new.species = '' then
    raise exception 'Which species?' using errcode = '22023';
  end if;
  new.hidden_urls := coalesce(array(select distinct u from unnest(new.hidden_urls) u where nullif(trim(u), '') is not null), '{}');
  if new.cover_url = any (new.hidden_urls) or nullif(trim(new.cover_url), '') is null then
    new.cover_url := null;
  end if;
  new.updated_at := now();
  if current_user in ('authenticated', 'anon') then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists stamp_species_photo_choice on public.species_photo_choices;
create trigger stamp_species_photo_choice
  before insert or update on public.species_photo_choices
  for each row execute function public.stamp_species_photo_choice();

alter table public.species_photo_choices enable row level security;

drop policy if exists "everyone reads the photo choices" on public.species_photo_choices;
create policy "everyone reads the photo choices" on public.species_photo_choices
  for select to anon, authenticated using (true);

-- is_pgenro() is false for a locked account and, from pgenro_training.sql on,
-- for a training one: the live Tree Database is no practice ground.
drop policy if exists "pgenro chooses the photos" on public.species_photo_choices;
create policy "pgenro chooses the photos" on public.species_photo_choices
  for all to authenticated
  using (public.is_pgenro() and public.is_active_account())
  with check (public.is_pgenro() and public.is_active_account());

grant select on public.species_photo_choices to anon, authenticated;
grant insert, update, delete on public.species_photo_choices to authenticated;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'the photo choices are kept' as check,
       to_regclass('public.species_photo_choices') is not null as ok,
       '' as detail
union all
select 'only PGENRO chooses them',
       exists (select 1 from pg_policies where tablename = 'species_photo_choices' and policyname = 'pgenro chooses the photos')
       and (select relrowsecurity from pg_class where oid = 'public.species_photo_choices'::regclass),
       ''
union all
select 'READ: species with a chosen cover or hidden photos', null,
       (select count(*)::text from public.species_photo_choices);
