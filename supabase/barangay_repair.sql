-- Green Tag: put back the barangay names that data_fixes.sql stripped.
--
-- WHAT WENT WRONG
-- data_fixes.sql removed a leading "Brgy." or "Barangay" from every barangay,
-- to stop one place being counted as two. "Brgy." is never part of a real
-- name, so that half was right.
--
-- "Barangay" is. It is part of the official PSA name of 63 barangays in
-- Laguna: Santa Cruz has Barangay I through Barangay V, Alaminos and Santa
-- Maria have I to IV, Pagsanjan has I and II, Cabuyao has Barangay Uno, Dos
-- and Tres, Luisiana has Barangay Zone I to Zone VIII, Calamba has Barangay 1
-- to 7, and San Pablo has Barangay I-A through VII-E.
--
-- Those rows were left holding "V", "Uno", "Zone I" — names that point at
-- nothing. In Santa Cruz that is 28 trees across five barangays.
--
-- WHY THIS IS SAFE
-- No official barangay in Laguna is named with a bare numeral, a bare Spanish
-- number, or a bare "Zone n". So any row holding one of those was damaged by
-- that migration, and putting "Barangay " back in front of it restores the
-- only name it could have had.
--
-- Running this twice is harmless: the second run finds nothing to do, because
-- the names it fixes no longer match.

-- ---------------------------------------------------------------------------
-- 1. The repair.
--
-- Roman numerals (I, II, III, IV, V...), Arabic numbers (1 to 7, Calamba),
-- Spanish numbers (Uno, Dos, Tres, Cabuyao), the Zone names (Luisiana), and
-- San Pablo's hyphenated forms (I-A, VII-E).
-- ---------------------------------------------------------------------------
update public.trees
set barangay = 'Barangay ' || trim(barangay)
where barangay is not null
  and trim(barangay) <> ''
  and (
    trim(barangay) ~* '^[IVX]+(-[A-F])?$'          -- I, IV, VII-E
    or trim(barangay) ~ '^[1-9]$'                   -- 1 to 7
    or trim(barangay) ~* '^(uno|dos|tres)$'         -- Cabuyao
    or trim(barangay) ~* '^zone\s+[IVX]+$'          -- Luisiana
  );

-- ---------------------------------------------------------------------------
-- 2. What it looks like now.
--
-- `repaired` counts the rows that now carry a name beginning with the word
-- Barangay. `still_bare` should be 0 — anything left there is a name this
-- file did not know how to rescue, and should be read before anything else is
-- run.
--
-- `not_an_official_barangay` is a separate matter and is NOT touched here:
-- subdivisions and placeholders that the field team wrote into the barangay
-- box. They are listed so MENRO can decide what each one should have been;
-- nothing here guesses on their behalf.
-- ---------------------------------------------------------------------------
select
  coalesce(nullif(trim(barangay), ''), '(not recorded)') as barangay,
  count(*) as trees,
  case
    when barangay is null or trim(barangay) = '' then 'not recorded'
    when barangay ~* '^barangay\s' then 'official — numbered'
    when barangay ~* '^(unknown|n/?a)' then 'placeholder'
    when barangay ~* '(subdivision|subd\.?|village|homes|heights)$' then 'not a barangay — a subdivision'
    else 'name as written'
  end as reads_as
from public.trees
group by 1, 3
order by 3, 1;
