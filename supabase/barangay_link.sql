-- Green Tag: tie a tree to a real barangay, and keep the text column honest.
--
-- Run AFTER supabase/barangays.sql, which creates the reference table.
--
-- THE PROBLEM THIS SOLVES
-- public.trees.barangay is free text that the field app fills from a reverse
-- geocode against OpenStreetMap. OSM answers with whatever a mapper tagged, so
-- the column collected subdivision names, placeholders, and names stripped
-- down to "V". Nothing rejected any of it, and nothing could: free text has no
-- opinion about what a barangay is.
--
-- WHY THERE IS NO CHECK CONSTRAINT HERE
-- The obvious move is to reject any barangay that is not on the list. Do not.
-- The field app is still writing "Brgy. Whatever" today, and a rejected row
-- does not come back — it fails inside a sync, on a phone, after a day of
-- field work, and the arborist finds out when the tree is not on the map.
--
-- So this is staged. The trigger below corrects rather than rejects, the new
-- column is nullable, and nothing that works today stops working. Turn on the
-- hard constraint at the bottom only once the field app fills barangay_psgc
-- and the report shows nothing left to fix.
--
-- Running this twice is harmless.

-- ---------------------------------------------------------------------------
-- 1. The link, and somewhere for the old answer to live.
--
-- barangay_psgc is the real one: a code, pointing at a row that exists.
-- barangay stays, because every screen and export reads it, but it becomes a
-- copy of the reference name rather than a thing anyone types.
--
-- landmark is where the OSM answer goes. "Villa Silangan Subdivision" is not a
-- barangay, but it is the only clue anyone has to where that tree actually
-- stands, and deleting it would throw that away.
-- ---------------------------------------------------------------------------
alter table public.trees
  add column if not exists barangay_psgc bigint references public.barangays (psgc),
  add column if not exists municipality text,
  add column if not exists landmark text;

comment on column public.trees.municipality is
  'The city or municipality, as the field app worked it out from the coordinates. It is what tells one "Barangay I" from another: five towns in Laguna have one.';

comment on column public.trees.barangay_psgc is
  'The barangay this tree stands in, by PSGC code. Filled by the field app from the bundled boundaries. The barangay text column is kept in step with it by a trigger.';
comment on column public.trees.landmark is
  'A local name for where the tree is — a subdivision, a street, a school. Not a barangay.';

create index if not exists trees_barangay_psgc_idx on public.trees (barangay_psgc);

-- ---------------------------------------------------------------------------
-- 2. Keep the text in step with the code.
--
-- Two directions, both on the way in:
--
--   code given    the text is overwritten from the reference table, so it can
--                 never disagree with the code and cannot be misspelt.
--   no code, but  the code is filled in. This is what quietly cleans up the
--   a name that   field app's writes until the app is changed, and what
--   matches       backfills the rows already here.
--
-- A name matching nothing is left exactly as written. It is still somewhere,
-- and the report in section 4 is where it gets chased.
-- ---------------------------------------------------------------------------
create or replace function public.sync_tree_barangay()
returns trigger
language plpgsql
as $$
declare
  v_name    text;
  v_psgc    bigint;
  v_matches integer;
  v_written text := trim(coalesce(new.barangay, ''));
  v_bare    text;
begin
  -- A code was given: the name follows from it, and cannot be misspelt.
  if new.barangay_psgc is not null then
    select name into v_name from public.barangays where psgc = new.barangay_psgc;
    if v_name is not null then
      new.barangay := v_name;
      return new;
    end if;
  end if;

  if v_written = '' then
    return new;
  end if;

  -- The name as written, the same without a prefix, and the same with the word
  -- "Barangay" put back in front — which is what matches a bare "V" against
  -- the real Barangay V.
  v_bare := regexp_replace(v_written, '^(brgy\.?|barangay)\s+', '', 'i');

  -- With a city or municipality to go on there is nothing to be ambiguous
  -- about: (municipality, name) is unique across all 681 of them. This is the
  -- path the field app takes, since it now sends both.
  if coalesce(trim(new.municipality), '') <> '' then
    select b.psgc, b.name into v_psgc, v_name
    from public.barangays b
    where lower(b.municipality) = lower(trim(new.municipality))
      and lower(b.name) in (lower(v_written), lower(v_bare), lower('Barangay ' || v_bare));

    if v_psgc is not null then
      new.barangay_psgc := v_psgc;
      new.barangay := v_name;
      return new;
    end if;
  end if;

  select count(*) into v_matches
  from public.barangays b
  where lower(b.name) in (lower(v_written), lower(v_bare), lower('Barangay ' || v_bare));

  -- Only when it is unambiguous. "Barangay I" is a real name in five different
  -- towns and "San Jose" in more, so without a code there is nothing to choose
  -- between them, and guessing would be worse than leaving it.
  if v_matches = 1 then
    select b.psgc, b.name into v_psgc, v_name
    from public.barangays b
    where lower(b.name) in (lower(v_written), lower(v_bare), lower('Barangay ' || v_bare));

    new.barangay_psgc := v_psgc;
    new.barangay := v_name;
  end if;

  return new;
end;
$$;

drop trigger if exists trees_sync_barangay on public.trees;
create trigger trees_sync_barangay
  before insert or update of barangay, barangay_psgc, municipality on public.trees
  for each row execute function public.sync_tree_barangay();

-- ---------------------------------------------------------------------------
-- 3. Backfill what is already here.
--
-- Touching the column is enough: the trigger does the work.
-- ---------------------------------------------------------------------------
update public.trees set barangay = barangay where barangay is not null;

-- ---------------------------------------------------------------------------
-- 4. What is left.
--
-- Rows with a code are settled. Rows without one are either a name no barangay
-- in Laguna has, or a name that five towns share and nothing says which. Both
-- need a person: the first a correction, the second a coordinate.
-- ---------------------------------------------------------------------------
select
  coalesce(nullif(trim(t.barangay), ''), '(not recorded)') as written,
  count(*) as trees,
  case
    when t.barangay_psgc is not null then 'settled — linked to the barangay list'
    when t.barangay is null or trim(t.barangay) = '' then 'not recorded'
    when t.barangay ~* '^(unknown|n/?a)' then 'placeholder — needs the coordinates'
    when exists (
      select 1 from public.barangays b where lower(b.name) = lower(trim(t.barangay))
    ) then 'ambiguous — this name is used by more than one town'
    else 'no barangay of this name in Laguna — check what was meant'
  end as status
from public.trees t
group by 1, 3
order by 3, 1;

-- ---------------------------------------------------------------------------
-- 5. LATER — the hard constraint.
--
-- Run this only once section 4 shows nothing but 'settled', and the field app
-- is filling barangay_psgc. After that a tree cannot be saved into a barangay
-- that does not exist, which is the end of this whole class of problem.
--
-- alter table public.trees
--   add constraint trees_barangay_psgc_required
--   check (barangay_psgc is not null) not valid;
--
-- "not valid" lets the rows already here stay while new ones are checked.
-- Validate it when they are all fixed:
-- alter table public.trees validate constraint trees_barangay_psgc_required;
