-- Green Tag: residents who sign in with Google, their tags, the leaderboard
-- (Round D, 19 October).
--
-- Run once, whole, in the SQL editor, after accounts.sql, tag_routing.sql and
-- crowdsource_promotion.sql (step 18 of PARKED.md). Safe to run again. Ends in
-- ONE query whose rows say whether each part took.
--
-- BEFORE IT WORKS: Google sign-in has to be switched on in the Supabase
-- dashboard (Authentication → Sign In / Providers → Google), with a client ID
-- and secret from a Google Cloud OAuth client whose redirect URI is the one
-- that page shows. Until then the Join button says so; nothing else changes.
--
-- ===========================================================================
-- READ THIS FIRST
-- ===========================================================================
-- A resident is not an office account and must never become one. Every new
-- sign-in gets a public.profiles row from the triggers already on auth.users,
-- and a profile defaults to an unapproved FIELD OFFICER — so, left alone, every
-- resident who signed in with Google would appear in the offices' approval
-- queue. Section 1 keeps them out of profiles altogether: a Google account
-- gets a row in public.residents instead, and no profile, so it can open none
-- of the offices' pages.
--
-- What is kept of a resident, and shown to them before they agree (decided
-- 18 October): the name Google gives, or the nickname they choose instead;
-- the email Google signs them in with (in auth.users, as for every account,
-- and shown to nobody); the trees they tag. Nothing else. The leaderboard
-- shows the name or nickname and the counts, never the email.
--
-- Since 19 October a tag needs a sign-in (section 2), each LGU has its own
-- count and leaderboard as well as Laguna's (section 4), and a resident can
-- delete their own account and everything kept of them (section 5).
--
-- Nicknames are checked here, not only on the page (section 3): lewd,
-- abusive or slurring names are refused, in English and in Filipino, spelled
-- straight or with numbers for letters; so are names that pass for an office.


-- ===========================================================================
-- 1. Residents, apart from the offices
-- ===========================================================================
create table if not exists public.residents (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text,
  nickname      text,
  show_as       text not null default 'name',
  consented_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.residents drop constraint if exists residents_show_as_check;
alter table public.residents add constraint residents_show_as_check
  check (show_as in ('name', 'nickname') and (show_as = 'name' or nickname is not null));

-- Whether an auth account signed up with Google.
create or replace function public.is_google_account(p_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_id
      and (u.raw_app_meta_data ->> 'provider' = 'google'
           or coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google')
      and coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) - 'google' = '[]'::jsonb
  );
$$;
revoke all on function public.is_google_account(uuid) from public;

-- No profile for a Google account: a BEFORE trigger that returns nothing
-- leaves the row unwritten, whichever trigger tried to write it.
create or replace function public.keep_residents_out_of_profiles()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_google_account(new.id) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists aaa_keep_residents_out on public.profiles;
create trigger aaa_keep_residents_out
  before insert on public.profiles
  for each row execute function public.keep_residents_out_of_profiles();

-- A resident row instead, with the name Google gives.
create or replace function public.add_resident()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_google_account(new.id) then
    insert into public.residents (id, full_name)
    values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists zzzz_add_resident on auth.users;
create trigger zzzz_add_resident
  after insert on auth.users
  for each row execute function public.add_resident();

-- Any Google account that signed in before this ran.
insert into public.residents (id, full_name)
select u.id, nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
from auth.users u
where public.is_google_account(u.id)
on conflict (id) do nothing;

-- …and the unapproved field-officer profile the old triggers gave it. Neither
-- app signs an office in with Google, so such a profile is only ever a
-- resident left in the approval queue. One that something else points to is
-- left, and counted in the check below.
do $$
declare v_id uuid;
begin
  for v_id in
    select p.id from public.profiles p
    where public.is_google_account(p.id) and p.role = 'field_officer' and not coalesce(p.is_approved, false)
  loop
    begin
      delete from public.profiles where id = v_id;
    exception when foreign_key_violation then
      raise notice 'Kept the profile of %: other rows point to it.', v_id;
    end;
  end loop;
end $$;

alter table public.residents enable row level security;
drop policy if exists "a resident reads their own row" on public.residents;
create policy "a resident reads their own row" on public.residents
  for select to authenticated using (id = auth.uid());
revoke all on public.residents from anon;
revoke insert, update, delete on public.residents from authenticated;
grant select on public.residents to authenticated;


-- ===========================================================================
-- 2. Who tagged what
-- ===========================================================================
alter table public.pending_trees
  add column if not exists submitted_by uuid references auth.users (id) on delete set null,
  add column if not exists source       text not null default 'community',
  add column if not exists details      jsonb;

alter table public.pending_trees drop constraint if exists pending_trees_source_check;
alter table public.pending_trees add constraint pending_trees_source_check
  check (source in ('community', 'import'));

create index if not exists pending_trees_submitted_by_idx on public.pending_trees (submitted_by, status);

-- Who sent a tag is the database's to say. An office's spreadsheet import
-- (onboarding.sql) is the only other source, and only an office's.
create or replace function public.stamp_tag_sender()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  -- Decided 19 October: a tag needs a sign-in, so every tag is a real
  -- resident's, counted for the CBI.
  if auth.uid() is null then
    raise exception 'Sign in with Google to tag a tree.' using errcode = '42501';
  end if;
  new.submitted_by := auth.uid();
  if new.source = 'import' then
    -- route_pending_tree() has placed the row in its LGU by now.
    if public.is_pgenro() then
      -- PGENRO brings in an LGU's inventory for it — San Pedro's, before San
      -- Pedro has an account (19 October) — as long as it is in an LGU.
      if new.lgu_psgc is null then
        raise exception 'A tree in the spreadsheet is in no city or municipality of Laguna.' using errcode = '42501';
      end if;
    elsif coalesce(public.my_role(), '') <> 'lgu_admin' then
      raise exception 'Only a MENRO / CENRO, or PGENRO, imports a tree inventory.' using errcode = '42501';
    -- A MENRO / CENRO: its own LGU's trees only.
    elsif new.lgu_psgc is distinct from public.my_lgu() then
      raise exception 'A tree in the spreadsheet is outside your LGU.' using errcode = '42501';
    end if;
  else
    new.source := 'community';
    -- A resident who has joined, or an office's own account.
    if public.my_role() is null
       and not exists (select 1 from public.residents r where r.id = auth.uid() and r.consented_at is not null) then
      raise exception 'Join the community first: sign in with Google and agree to what is kept.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stamp_tag_sender on public.pending_trees;
create trigger stamp_tag_sender
  before insert on public.pending_trees
  for each row execute function public.stamp_tag_sender();


-- ===========================================================================
-- 3. Nicknames
-- ===========================================================================
-- Why a nickname is refused, or null. Spellings with numbers for letters are
-- read as letters (4 → a, 1 → i, 0 → o …); a word repeated letter by letter
-- ("fuuuck") is read once. Long words are looked for anywhere in the name; short
-- ones only as whole words, so "Essex" and "Dickson" are not caught.
create or replace function public.nickname_problem(p_nickname text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v_name text := trim(coalesce(p_nickname, ''));
  v_plain text;
  v_squashed text;
  v_collapsed text;
  v_word text;
  v_tokens text[];
  -- Anywhere in the name.
  v_long text[] := array[
    'fuck', 'fvck', 'phuck', 'shit', 'bitch', 'cunt', 'pussy', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'porn', 'penis',
    'vagina', 'asshole', 'bastard', 'blowjob', 'dildo', 'orgasm', 'horny', 'hentai', 'masturb', 'rapist',
    'putangina', 'putang', 'tangina', 'kantot', 'kantut', 'jakol', 'burat', 'pekpek', 'tamod', 'libog',
    'pokpok', 'hindot', 'kupal', 'tarantado', 'pakyu', 'pakshet', 'etits', 'bilat', 'kiffy'
  ];
  -- As whole words only.
  v_short text[] := array[
    'sex', 'sexy', 'ass', 'dick', 'cock', 'tit', 'tits', 'boob', 'boobs', 'cum', 'xxx', 'rape', 'fag', 'puta',
    'gago', 'gaga', 'ulol', 'bobo', 'tanga', 'iyot', 'tite', 'titi', 'puke', 'bayag', 'suso', 'hayop', 'nude',
    'admin', 'administrator', 'moderator', 'pgenro', 'menro', 'cenro', 'denr', 'official', 'greentag'
  ];
begin
  if length(v_name) < 3 or length(v_name) > 24 then
    return 'A nickname is 3 to 24 characters.';
  end if;
  if v_name !~ '^[A-Za-z0-9ÑñÁÉÍÓÚáéíóú ._-]+$' then
    return 'Use letters, numbers, spaces, dots, dashes or underscores only.';
  end if;

  v_plain := translate(lower(v_name), '013457@$!ñáéíóú', 'oieastasinaeiou');
  v_squashed := regexp_replace(v_plain, '[^a-z]', '', 'g');
  v_collapsed := regexp_replace(v_squashed, '(.)\1+', '\1', 'g');
  foreach v_word in array v_long loop
    if position(v_word in v_squashed) > 0
       or position(regexp_replace(v_word, '(.)\1+', '\1', 'g') in v_collapsed) > 0 then
      return 'That nickname is not allowed. Choose one that is not lewd, abusive or an office''s name.';
    end if;
  end loop;

  -- Whole words, read two ways: numbers as letters ("b0b0"), and numbers as
  -- spaces ("gago123"); and the whole name run together ("t a n g a").
  v_tokens := regexp_split_to_array(regexp_replace(v_plain, '[^a-z]+', ' ', 'g'), ' ')
              || regexp_split_to_array(regexp_replace(lower(v_name), '[^a-zñáéíóú]+', ' ', 'g'), ' ')
              || v_squashed;
  foreach v_word in array v_tokens loop
    if v_word = any (v_short) or regexp_replace(v_word, '(.)\1+', '\1', 'g') = any (v_short) then
      return 'That nickname is not allowed. Choose one that is not lewd, abusive or an office''s name.';
    end if;
  end loop;
  return null;
end $$;
grant execute on function public.nickname_problem(text) to anon, authenticated;

-- A resident's choices: shown by name or nickname, and their agreement to
-- what is kept. Nothing else of theirs can be written.
create or replace function public.set_resident_profile(p_show_as text, p_nickname text, p_agree boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_nickname text := nullif(trim(coalesce(p_nickname, '')), '');
  v_problem text;
begin
  if not exists (select 1 from public.residents where id = auth.uid()) then
    raise exception 'Sign in with Google first.' using errcode = '42501';
  end if;
  if not coalesce(p_agree, false) then
    raise exception 'Agree to what is kept before you join.' using errcode = '22023';
  end if;
  if p_show_as not in ('name', 'nickname') then
    raise exception 'Choose how you are shown.' using errcode = '22023';
  end if;
  if p_show_as = 'nickname' or v_nickname is not null then
    v_problem := public.nickname_problem(v_nickname);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = '22023';
    end if;
  end if;
  update public.residents
  set show_as = p_show_as,
      nickname = v_nickname,
      consented_at = coalesce(consented_at, now()),
      updated_at = now()
  where id = auth.uid();
end $$;
revoke all on function public.set_resident_profile(text, text, boolean) from public;
grant execute on function public.set_resident_profile(text, text, boolean) to authenticated;


-- ===========================================================================
-- 4. The leaderboard, and the count the CBI asks for — for Laguna, or one LGU
-- ===========================================================================
-- Residents who agreed, by trees verified in the field, then by tags sent.
-- Names or nicknames and counts only; never an email. With p_lgu, only the
-- tags sent in that city or municipality (decided 19 October: the CBI is
-- each city's own, as well as the province's).
drop function if exists public.community_leaderboard(int);
create or replace function public.community_leaderboard(p_limit int default 10, p_lgu bigint default null)
returns table (rank int, display_name text, verified int, submitted int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with counts as (
    select r.id,
           case when r.show_as = 'nickname' and r.nickname is not null then r.nickname
                else coalesce(nullif(r.full_name, ''), 'A resident') end as display_name,
           count(p.*) filter (where p.status = 'verified')::int as verified,
           count(p.*)::int as submitted,
           min(p.submitted_at) as first_tag
    from public.residents r
    join public.pending_trees p on p.submitted_by = r.id and p.source = 'community'
    where r.consented_at is not null
      and not coalesce((to_jsonb(p) ->> 'is_training')::boolean, false)
      and (p_lgu is null or p.lgu_psgc = p_lgu)
    group by r.id
  )
  select (row_number() over (order by verified desc, submitted desc, first_tag))::int,
         display_name, verified, submitted, id = auth.uid()
  from counts
  order by verified desc, submitted desc, first_tag
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;
grant execute on function public.community_leaderboard(int, bigint) to anon, authenticated;

-- Residents taking part: in Laguna, those who joined; in one LGU, those who
-- tagged a tree there (a resident is counted where they took part, which is
-- what the CBI's citizen-science indicator is about).
drop function if exists public.community_counts();
create or replace function public.community_counts(p_lgu bigint default null)
returns table (residents int, taggers int, tags int, verified_tags int)
language sql stable security definer set search_path = public as $$
  with tags as (
    select p.submitted_by, p.status
    from public.pending_trees p
    join public.residents r on r.id = p.submitted_by and r.consented_at is not null
    where p.source = 'community'
      and not coalesce((to_jsonb(p) ->> 'is_training')::boolean, false)
      and (p_lgu is null or p.lgu_psgc = p_lgu)
  )
  select (case when p_lgu is null
               then (select count(*) from public.residents where consented_at is not null)
               else (select count(distinct submitted_by) from tags) end)::int,
         (select count(distinct submitted_by) from tags)::int,
         (select count(*) from tags)::int,
         (select count(*) from tags where status = 'verified')::int;
$$;
grant execute on function public.community_counts(bigint) to anon, authenticated;

-- Every LGU's, side by side, for PGENRO and the province's CBI.
create or replace function public.community_counts_by_lgu()
returns table (lgu_psgc bigint, taggers int, tags int, verified_tags int)
language sql stable security definer set search_path = public as $$
  select p.lgu_psgc,
         count(distinct p.submitted_by)::int,
         count(*)::int,
         count(*) filter (where p.status = 'verified')::int
  from public.pending_trees p
  join public.residents r on r.id = p.submitted_by and r.consented_at is not null
  where p.source = 'community' and p.lgu_psgc is not null
    and not coalesce((to_jsonb(p) ->> 'is_training')::boolean, false)
  group by p.lgu_psgc
  order by p.lgu_psgc;
$$;
grant execute on function public.community_counts_by_lgu() to anon, authenticated;


-- ===========================================================================
-- 5. A resident deletes their own account (RA 10173, the right to erasure)
-- ===========================================================================
-- Everything kept of them goes: the sign-in and its email (auth.users), their
-- name, nickname and agreement (residents, by cascade). The trees they tagged
-- stay, as trees — credited to nobody (pending_trees.submitted_by is set
-- null). Only a resident's own account: an office's is archived by PGENRO,
-- never deleted, so its records keep their author.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not exists (select 1 from public.residents where id = v_me) then
    raise exception 'Only a resident''s own account can be deleted here.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = v_me) then
    raise exception 'An office account is archived by PGENRO, not deleted.' using errcode = '42501';
  end if;
  delete from auth.users where id = v_me;
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 6. Unverified trees, grey on the public map (decided 19 October)
-- ===========================================================================
-- A tree already tagged — from an LGU's inventory spreadsheet, or by a
-- resident — is shown to everyone before it is verified, so nobody tags it
-- again. Only what places it: where, what species, which barangay and LGU, and
-- where it came from. Never who sent it, their photos, or who is sent to check.
create or replace function public.public_unverified_trees()
returns table (id text, latitude float8, longitude float8, species text, barangay text,
               lgu_psgc bigint, source text, status text, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id::text, p.latitude::float8, p.longitude::float8, p.species, p.barangay, p.lgu_psgc,
         p.source, coalesce(p.status, 'pending'), p.submitted_at
  from public.pending_trees p
  where coalesce(p.status, 'pending') in ('pending', 'dispatched')
    and p.latitude is not null and p.longitude is not null
    and not coalesce((to_jsonb(p) ->> 'is_training')::boolean, false);
$$;
revoke all on function public.public_unverified_trees() from public;
grant execute on function public.public_unverified_trees() to anon, authenticated;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 7. Check
-- ===========================================================================
select 'residents, apart from the offices' as check,
       to_regclass('public.residents') is not null
       and exists (select 1 from information_schema.triggers where trigger_name = 'aaa_keep_residents_out') as ok,
       '' as detail
union all
select 'a Google sign-in becomes a resident',
       exists (select 1 from information_schema.triggers where trigger_name = 'zzzz_add_resident'),
       ''
union all
select 'tags carry who sent them',
       exists (select 1 from information_schema.columns where table_name = 'pending_trees' and column_name = 'submitted_by'),
       ''
union all
select 'nicknames are checked',
       public.nickname_problem('fuuuck') is not null and public.nickname_problem('Puno ng Laguna') is null,
       ''
union all
select 'no Google account waits in the approval queue',
       not exists (select 1 from public.profiles p
                   where public.is_google_account(p.id) and p.role = 'field_officer' and not coalesce(p.is_approved, false)),
       ''
union all
select 'a tag needs a sign-in',
       position('Sign in with Google' in pg_get_functiondef('public.stamp_tag_sender()'::regprocedure)) > 0,
       ''
union all
select 'unverified trees show on the public map, without who sent them',
       exists (select 1 from pg_proc where proname = 'public_unverified_trees'),
       ''
union all
select 'a resident can delete their own account',
       exists (select 1 from pg_proc where proname = 'delete_my_account'),
       ''
union all
select 'READ: residents who have joined', null,
       (select count(*) from public.residents where consented_at is not null)::text;
