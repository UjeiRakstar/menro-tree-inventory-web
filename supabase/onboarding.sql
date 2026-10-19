-- Green Tag: a new MENRO / CENRO account's first sign-in (Round D, 19 October).
--
-- Run once, whole, in the SQL editor, after accounts.sql, office_settings.sql
-- (its 'office-logos' bucket holds the photo) and community.sql (step 19 of
-- PARKED.md). Safe to run again. Ends in ONE query whose rows say
-- whether each part took.
--
-- An account is activated with PGENRO's code and confirmed by email; the
-- first time it signs in, it is asked for what the account needs:
--
--   1. its holder's name, address, photo and designation — required;
--   2. the barangays' population — PSA's 2024 count already filled in, to
--      correct or keep; skippable, and in Settings later;
--   3. the office's existing tree inventory, in the standard spreadsheet —
--      skippable, and in Settings later. Its trees come in as unverified tags
--      (pending_trees, source 'import', community.sql), grey on the map until
--      a field officer confirms each one with photos.
--
-- onboarded_at marks the account done with it.

alter table public.profiles
  add column if not exists designation  text,
  add column if not exists address      text,
  add column if not exists onboarded_at timestamptz;

-- An account changes its own details (not its role, LGU or status: the guard
-- in accounts.sql refuses those). As the field app's policy already allows.
drop policy if exists "Arborists update their own profile" on public.profiles;
create policy "Arborists update their own profile" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Accounts made before this have been working without it; they are not
-- stopped at the door. Only accounts that have never signed in are asked.
update public.profiles p
set onboarded_at = coalesce(p.onboarded_at, now())
where p.role in ('lgu_admin', 'pgenro')
  and p.onboarded_at is null
  and exists (select 1 from auth.users u where u.id = p.id and u.last_sign_in_at is not null);

notify pgrst, 'reload schema';

select 'profiles hold designation, address and onboarding' as check,
       (select count(*) from information_schema.columns
        where table_name = 'profiles' and column_name in ('designation', 'address', 'onboarded_at')) = 3 as ok,
       '' as detail
union all
select 'an account updates its own details',
       exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'Arborists update their own profile'),
       ''
union all
select 'READ: office accounts still to set up', null,
       (select count(*) from public.profiles where role = 'lgu_admin' and onboarded_at is null)::text;
