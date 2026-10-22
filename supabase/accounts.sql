-- Green Tag: one account per LGU. Phase 1 of ACCOUNTS_AND_MAPPING.md.
--
-- Run once, whole, in the SQL editor. Safe to run again. Ends in ONE query
-- whose rows say whether each part took — the SQL editor only shows the last
-- result, so everything to check is in it.
--
-- ===========================================================================
-- READ THIS FIRST
-- ===========================================================================
-- 1. Your account becomes the first PGENRO account. Every profile with role
--    'admin' becomes 'pgenro', and every 'arborist' becomes 'field_officer'.
--    Today that is your account and the field team. Check before running:
--        select email, role from public.profiles order by role, email;
--
-- 2. It closes a hole that exists today. The only update rule on profiles is
--    "a user may update their own row" — every column of it, role included.
--    Any signed-in arborist could run
--        update profiles set role = 'admin' where id = auth.uid()
--    from the browser console and become an admin. Section 5 stops that: role,
--    LGU and status can now only be changed by PGENRO, and approval only by
--    PGENRO or the field officer's own MENRO/CENRO.
--
-- 3. A locked or archived account can no longer write to the inventory, even
--    with a session still open. That is enforced here, not in the page.
--
-- 4. Field officers keep registering from the mobile app exactly as now. The
--    municipality they pick decides which MENRO/CENRO approves them.
--
-- Needs: supabase/barangays.sql (for public.barangays), and
-- ../tree_inventory/supabase/profiles_columns.sql (for municipality,
-- rejected_at, rejection_reason on profiles). Both already run.


-- ===========================================================================
-- 1. The LGUs
--
-- Thirty: 24 municipalities and 6 cities. `short_code` is the prefix on an
-- account code, so a code read over the phone says whose it is.
-- ===========================================================================
create table if not exists public.lgus (
  psgc       bigint primary key,
  name       text    not null unique,
  label      text    not null,
  is_city    boolean not null default false,
  short_code text    not null unique check (short_code ~ '^[A-Z]{3}$')
);

comment on table public.lgus is
  'The 30 cities and municipalities of Laguna. One LGU account each; see ACCOUNTS_AND_MAPPING.md.';

insert into public.lgus (psgc, name, label, is_city, short_code) values
  (403401000, 'Alaminos', 'Alaminos', false, 'ALM'),
  (403402000, 'Bay', 'Bay', false, 'BAY'),
  (403403000, 'Biñan', 'Biñan City', true, 'BIN'),
  (403404000, 'Cabuyao', 'Cabuyao City', true, 'CBY'),
  (403405000, 'Calamba', 'Calamba City', true, 'CLB'),
  (403406000, 'Calauan', 'Calauan', false, 'CLU'),
  (403407000, 'Cavinti', 'Cavinti', false, 'CVT'),
  (403408000, 'Famy', 'Famy', false, 'FMY'),
  (403409000, 'Kalayaan', 'Kalayaan', false, 'KLY'),
  (403410000, 'Liliw', 'Liliw', false, 'LLW'),
  (403411000, 'Los Baños', 'Los Baños', false, 'LBN'),
  (403412000, 'Luisiana', 'Luisiana', false, 'LSN'),
  (403413000, 'Lumban', 'Lumban', false, 'LMB'),
  (403414000, 'Mabitac', 'Mabitac', false, 'MBT'),
  (403415000, 'Magdalena', 'Magdalena', false, 'MGD'),
  (403416000, 'Majayjay', 'Majayjay', false, 'MJY'),
  (403417000, 'Nagcarlan', 'Nagcarlan', false, 'NGC'),
  (403418000, 'Paete', 'Paete', false, 'PAE'),
  (403419000, 'Pagsanjan', 'Pagsanjan', false, 'PGS'),
  (403420000, 'Pakil', 'Pakil', false, 'PAK'),
  (403421000, 'Pangil', 'Pangil', false, 'PNG'),
  (403422000, 'Pila', 'Pila', false, 'PIL'),
  (403423000, 'Rizal', 'Rizal', false, 'RZL'),
  (403424000, 'San Pablo', 'San Pablo City', true, 'SPB'),
  (403425000, 'San Pedro', 'San Pedro City', true, 'SPD'),
  (403426000, 'Santa Cruz', 'Santa Cruz', false, 'SCZ'),
  (403427000, 'Santa Maria', 'Santa Maria', false, 'STM'),
  (403428000, 'Santa Rosa', 'Santa Rosa City', true, 'STR'),
  (403429000, 'Siniloan', 'Siniloan', false, 'SNL'),
  (403430000, 'Victoria', 'Victoria', false, 'VCT')
on conflict (psgc) do update set
  name = excluded.name, label = excluded.label,
  is_city = excluded.is_city, short_code = excluded.short_code;

alter table public.lgus enable row level security;
drop policy if exists "anyone reads lgus" on public.lgus;
create policy "anyone reads lgus" on public.lgus
  for select to anon, authenticated using (true);

-- What the field app sends is whatever the officer picked or typed: "Santa
-- Cruz", "Sta. Cruz", "Calamba City", "Santa Cruz, Laguna". This reads all of
-- them, and returns null rather than guessing at anything it cannot place.
create or replace function public.lgu_named(p_name text)
returns bigint
language sql
stable
set search_path = public
as $$
  with cleaned as (
    select trim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
             lower(coalesce(p_name, '')),
             ',\s*laguna\s*$', ''),          -- "Santa Cruz, Laguna"
             '^city of\s+|\s+city$', '', 'g'), -- "City of Calamba", "Calamba City"
             '^sta\.?\s+', 'santa '),         -- "Sta. Cruz"
             '^sto\.?\s+', 'santo ')) as name
  )
  select l.psgc
  from public.lgus l, cleaned c
  where c.name <> ''
    and (lower(l.name) = c.name
         or lower(translate(l.name, 'ñÑ', 'nN')) = translate(c.name, 'ñÑ', 'nN'))
  limit 1;
$$;


-- ===========================================================================
-- 2. Roles, LGU and status on a profile
-- ===========================================================================
alter table public.profiles
  add column if not exists role              text,
  add column if not exists lgu_psgc          bigint references public.lgus (psgc),
  add column if not exists status            text not null default 'active',
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid;

-- The two roles that exist today, renamed to what they now mean. Your account
-- is the only 'admin'; it becomes the first PGENRO account.
update public.profiles set role = 'pgenro'        where role = 'admin';
update public.profiles set role = 'field_officer' where role = 'arborist' or role is null;

alter table public.profiles alter column role set default 'field_officer';
alter table public.profiles alter column role set not null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('pgenro', 'lgu_admin', 'field_officer'));

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'locked', 'archived'));

-- An LGU admin without an LGU is an account that can see nothing and do
-- nothing, and is almost certainly a mistake. PGENRO belongs to the province.
alter table public.profiles drop constraint if exists profiles_lgu_admin_has_lgu;
alter table public.profiles add constraint profiles_lgu_admin_has_lgu
  check (role <> 'lgu_admin' or lgu_psgc is not null);

-- Field officers already registered: their LGU is the municipality they
-- picked in the app. Anyone it cannot place stays null and shows up in the
-- check at the end, for PGENRO to assign by hand.
update public.profiles
set lgu_psgc = public.lgu_named(municipality)
where role = 'field_officer' and lgu_psgc is null and municipality is not null;

create index if not exists profiles_lgu_role_idx on public.profiles (lgu_psgc, role, status);


-- ===========================================================================
-- 3. Who is asking — the checks every rule below is built from
--
-- SECURITY DEFINER for the same reason as is_menro_admin() before them: a
-- policy on profiles that reads profiles recurses into itself. These run as
-- their owner and are not subject to RLS.
-- ===========================================================================
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.my_lgu()
returns bigint language sql stable security definer set search_path = public as $$
  select lgu_psgc from public.profiles where id = auth.uid() and status = 'active';
$$;

-- PGENRO, acting for real. A PGENRO training account (training_sandbox.sql,
-- pgenro_training.sql) is not: every live power — accounts, codes, write-ups,
-- news, layers, settings — asks this, and refuses a trainee without having to
-- name them. is_training is read through to_jsonb: this file runs before the
-- sandbox adds the column.
create or replace function public.is_pgenro()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'pgenro', false)
     and not coalesce((select (to_jsonb(p) ->> 'is_training')::boolean
                       from public.profiles p where p.id = auth.uid()), false);
$$;

-- PGENRO's province-wide view of a table behind the training wall: the real
-- PGENRO, or a training one. The wall decides which rows; this, whose LGUs.
-- Only ever used on walled tables, where a trainee sees training rows alone.
create or replace function public.sees_as_pgenro()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'pgenro', false);
$$;

create or replace function public.is_lgu_admin_of(p_lgu bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'lgu_admin' and public.my_lgu() = p_lgu, false);
$$;

-- A locked or archived account is not active. An account with no profile row
-- at all is left alone: there is nothing on it to lock.
create or replace function public.is_active_account()
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles where id = auth.uid() and status <> 'active'
  );
$$;

-- The function the existing dashboard pages ask. It used to mean "role is
-- admin"; it now means "an active PGENRO or LGU admin", which is who those
-- pages are for. What each of them may then SEE is narrowed by the policies.
create or replace function public.is_menro_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('pgenro', 'lgu_admin'), false);
$$;

do $$
declare f text;
begin
  foreach f in array array['my_role()', 'my_lgu()', 'is_pgenro()', 'sees_as_pgenro()',
                           'is_lgu_admin_of(bigint)', 'is_active_account()',
                           'is_menro_admin()']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;


-- ===========================================================================
-- 4. The activity log — how PGENRO monitors the LGU accounts
--
-- Written by the database as each change happens, never by the page, so
-- nothing can be done that skips it. Nobody can write to it directly or edit
-- what is in it.
-- ===========================================================================
create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  actor_role  text,
  lgu_psgc    bigint,
  action      text not null,
  entity      text,
  entity_id   text,
  details     jsonb
);

create index if not exists activity_log_at_idx  on public.activity_log (at desc);
create index if not exists activity_log_lgu_idx on public.activity_log (lgu_psgc, at desc);

alter table public.activity_log enable row level security;
drop policy if exists "pgenro reads the whole log" on public.activity_log;
create policy "pgenro reads the whole log" on public.activity_log
  for select to authenticated using (public.sees_as_pgenro());
drop policy if exists "lgu admins read their lgu's log" on public.activity_log;
create policy "lgu admins read their lgu's log" on public.activity_log
  for select to authenticated using (public.is_lgu_admin_of(lgu_psgc));

create or replace function public.log_activity(
  p_action text, p_entity text, p_entity_id text, p_lgu bigint, p_details jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_role  text;
begin
  select email, role into v_email, v_role from public.profiles where id = auth.uid();
  insert into public.activity_log (actor, actor_email, actor_role, lgu_psgc, action, entity, entity_id, details)
  values (auth.uid(), v_email, v_role, p_lgu, p_action, p_entity, p_entity_id, p_details);
end $$;

revoke all on function public.log_activity(text, text, text, bigint, jsonb) from public;


-- ===========================================================================
-- 5. Who may change what on a profile
--
-- Policies decide WHICH ROWS a user may update; they cannot say which
-- COLUMNS. So the old "update your own row" policy allowed a user to update
-- their own role. This trigger is the column half: it runs on every change
-- and refuses the ones the caller has no business making.
--
-- Trusted callers pass straight through: the SQL editor, the service role,
-- and the SECURITY DEFINER functions in this file, whose statements run as
-- the function's owner. A request from the website or the app always runs as
-- 'authenticated' or 'anon', and that is what gets checked.
-- ===========================================================================
create or replace function public.guard_profile_changes()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A profile written directly from the client starts as a field officer
    -- waiting for approval, whatever it claims to be.
    new.role        := 'field_officer';
    new.status      := 'active';
    new.is_approved := false;
    new.lgu_psgc    := public.lgu_named(new.municipality);
    return new;
  end if;

  if new.role is distinct from old.role
     or new.lgu_psgc is distinct from old.lgu_psgc
     or new.status is distinct from old.status then
    if not public.is_pgenro() then
      raise exception 'Only PGENRO can change an account''s role, LGU or status.'
        using errcode = '42501';
    end if;
  end if;

  if new.is_approved is distinct from old.is_approved
     or new.rejected_at is distinct from old.rejected_at
     or new.rejection_reason is distinct from old.rejection_reason then
    if not (public.is_pgenro()
            or (old.role = 'field_officer' and public.is_lgu_admin_of(old.lgu_psgc))) then
      raise exception 'Only PGENRO or this officer''s own MENRO/CENRO can approve them.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists guard_profile_changes on public.profiles;
create trigger guard_profile_changes
  before insert or update on public.profiles
  for each row execute function public.guard_profile_changes();

-- Record the changes PGENRO monitors.
create or replace function public.log_profile_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.log_activity('account.' || new.status, 'profile', new.id::text, new.lgu_psgc,
      jsonb_build_object('email', new.email, 'from', old.status, 'to', new.status));
  end if;
  if new.role is distinct from old.role or new.lgu_psgc is distinct from old.lgu_psgc then
    perform public.log_activity('account.reassigned', 'profile', new.id::text, new.lgu_psgc,
      jsonb_build_object('email', new.email, 'role', new.role, 'from_lgu', old.lgu_psgc));
  end if;
  if new.is_approved is distinct from old.is_approved and new.is_approved then
    perform public.log_activity('field_officer.approved', 'profile', new.id::text, new.lgu_psgc,
      jsonb_build_object('email', new.email));
  end if;
  if new.rejected_at is distinct from old.rejected_at and new.rejected_at is not null then
    perform public.log_activity('field_officer.declined', 'profile', new.id::text, new.lgu_psgc,
      jsonb_build_object('email', new.email, 'reason', new.rejection_reason));
  end if;
  return new;
end $$;

drop trigger if exists log_profile_changes on public.profiles;
create trigger log_profile_changes
  after update on public.profiles
  for each row execute function public.log_profile_changes();


-- ===========================================================================
-- 6. Who may SEE and approve whom
--
-- Replaces the two "Admins … every profile" policies, which would now hand
-- every LGU admin the whole province's staff list. Each user's own row is
-- still theirs to read and edit (the existing policies for that stay), minus
-- the columns section 5 protects.
-- ===========================================================================
drop policy if exists "Admins read every profile"   on public.profiles;
drop policy if exists "Admins update every profile" on public.profiles;

drop policy if exists "pgenro reads every profile" on public.profiles;
create policy "pgenro reads every profile" on public.profiles
  for select to authenticated using (public.is_pgenro());

drop policy if exists "lgu admins read their lgu" on public.profiles;
create policy "lgu admins read their lgu" on public.profiles
  for select to authenticated using (public.is_lgu_admin_of(lgu_psgc));

drop policy if exists "pgenro updates every profile" on public.profiles;
create policy "pgenro updates every profile" on public.profiles
  for update to authenticated
  using (public.is_pgenro()) with check (public.is_pgenro());

drop policy if exists "lgu admins approve their field officers" on public.profiles;
create policy "lgu admins approve their field officers" on public.profiles
  for update to authenticated
  using (role = 'field_officer' and public.is_lgu_admin_of(lgu_psgc))
  with check (role = 'field_officer' and public.is_lgu_admin_of(lgu_psgc));

-- A locked account may still READ its own profile — that is how the website
-- knows to tell them they are locked — but may change nothing.
drop policy if exists "only active accounts change profiles" on public.profiles;
create policy "only active accounts change profiles" on public.profiles
  as restrictive for update to authenticated
  using (public.is_active_account()) with check (public.is_active_account());


-- ===========================================================================
-- 7. A locked account writes nothing, anywhere
--
-- RESTRICTIVE policies are ANDed with everything else, so this narrows what
-- the existing policies allow without rewriting any of them. Only tables that
-- exist are touched.
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['trees', 'arborists', 'phenology_records',
                           'species_profiles', 'pending_trees']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "only active accounts" on public.%I', t);
      execute format(
        'create policy "only active accounts" on public.%I as restrictive '
        'for all to authenticated '
        'using (public.is_active_account()) with check (public.is_active_account())', t);
    end if;
  end loop;
end $$;


-- ===========================================================================
-- 8. Account codes
--
-- One code is one seat. Only a hash is stored, so somebody reading this table
-- cannot redeem what is in it. Nobody writes to it directly; the functions
-- below do, and log as they go.
-- ===========================================================================
create table if not exists public.account_codes (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,
  lgu_psgc    bigint not null references public.lgus (psgc),
  role        text not null default 'lgu_admin' check (role in ('lgu_admin')),
  note        text,
  issued_by   uuid,
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  redeemed_by uuid,
  redeemed_at timestamptz,
  revoked_by  uuid,
  revoked_at  timestamptz
);

create index if not exists account_codes_lgu_idx on public.account_codes (lgu_psgc);

alter table public.account_codes enable row level security;
drop policy if exists "pgenro reads codes" on public.account_codes;
create policy "pgenro reads codes" on public.account_codes
  for select to authenticated using (public.is_pgenro());

-- The same normalisation the website uses (src/lib/accountCodes.js): case and
-- separators do not matter, so "scz 7k2p 9qxm" and "SCZ-7K2P-9QXM" are one code.
create or replace function public.account_code_hash(p_code text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
$$;

-- Seats an LGU has given out: admins who are not archived, plus codes that
-- could still be used. Locked admins keep their seat — locking is reversible.
create or replace function public.lgu_seats_taken(p_lgu bigint)
returns integer language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.profiles
       where lgu_psgc = p_lgu and role = 'lgu_admin' and status <> 'archived')::int
  + (select count(*) from public.account_codes
       where lgu_psgc = p_lgu and redeemed_at is null and revoked_at is null
         and expires_at > now())::int;
$$;

create or replace function public.lgu_seat_limit()
returns integer language sql immutable as $$ select 5 $$;

-- PGENRO issues a code. The plain code is returned ONCE, here, and never
-- stored; if it is lost, revoke it and issue another.
create or replace function public.issue_account_code(p_lgu bigint, p_note text default null)
returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0/O, 1/I/L
  v_prefix text;
  v_body   text := '';
  v_bytes  bytea;
  v_code   text;
  v_expiry timestamptz;
  i int;
begin
  if not public.is_pgenro() then
    raise exception 'Only PGENRO can issue account codes.' using errcode = '42501';
  end if;

  select short_code into v_prefix from public.lgus where psgc = p_lgu;
  if v_prefix is null then
    raise exception 'No such LGU: %', p_lgu using errcode = '22023';
  end if;

  if public.lgu_seats_taken(p_lgu) >= public.lgu_seat_limit() then
    raise exception 'This LGU already has % admin seats taken. Archive an account or revoke a code first.',
      public.lgu_seat_limit() using errcode = 'P0001';
  end if;

  v_bytes := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    v_body := v_body || substr(alphabet, (get_byte(v_bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  v_code := v_prefix || '-' || substr(v_body, 1, 4) || '-' || substr(v_body, 5, 4);

  insert into public.account_codes (code_hash, lgu_psgc, note, issued_by)
  values (public.account_code_hash(v_code), p_lgu, nullif(trim(p_note), ''), auth.uid())
  returning account_codes.expires_at into v_expiry;

  perform public.log_activity('code.issued', 'lgu', p_lgu::text, p_lgu,
    jsonb_build_object('note', p_note, 'expires_at', v_expiry));

  return query select v_code, v_expiry;
end $$;

create or replace function public.revoke_account_code(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_lgu bigint;
begin
  if not public.is_pgenro() then
    raise exception 'Only PGENRO can revoke account codes.' using errcode = '42501';
  end if;
  update public.account_codes
  set revoked_at = now(), revoked_by = auth.uid()
  where id = p_id and redeemed_at is null and revoked_at is null
  returning lgu_psgc into v_lgu;
  if v_lgu is null then
    raise exception 'That code has already been used or revoked.' using errcode = 'P0001';
  end if;
  perform public.log_activity('code.revoked', 'account_code', p_id::text, v_lgu, null);
end $$;

-- What the activation page asks before the officer types anything else: is
-- this a real code, and whose account does it unlock? Says nothing about a
-- code it cannot find beyond that it cannot find it.
create or replace function public.check_account_code(p_code text)
returns table (ok boolean, reason text, lgu_label text, is_city boolean)
language sql stable security definer set search_path = public, extensions as $$
  with found as (
    select c.*, l.label, l.is_city
    from public.account_codes c join public.lgus l on l.psgc = c.lgu_psgc
    where c.code_hash = public.account_code_hash(p_code)
  )
  select
    case when f.id is null then false
         when f.revoked_at is not null or f.redeemed_at is not null or f.expires_at <= now() then false
         else true end,
    case when f.id is null then 'not_found'
         when f.revoked_at is not null then 'revoked'
         when f.redeemed_at is not null then 'used'
         when f.expires_at <= now() then 'expired'
         else 'ok' end,
    case when f.id is not null and f.revoked_at is null and f.redeemed_at is null
              and f.expires_at > now() then f.label end,
    case when f.id is not null and f.revoked_at is null and f.redeemed_at is null
              and f.expires_at > now() then f.is_city end
  from (select 1) one left join found f on true;
$$;

-- PGENRO locks, archives or reactivates an account. Never deletes: an
-- archived officer's name stays on everything they did.
create or replace function public.set_account_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.profiles%rowtype;
begin
  if not public.is_pgenro() then
    raise exception 'Only PGENRO can lock or archive accounts.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'locked', 'archived') then
    raise exception 'Unknown status: %', p_status using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot change the status of your own account.' using errcode = 'P0001';
  end if;

  select * into v_row from public.profiles where id = p_user;
  if not found then
    raise exception 'No such account.' using errcode = 'P0002';
  end if;

  -- Bringing an archived admin back takes a seat again.
  if v_row.role = 'lgu_admin' and v_row.status = 'archived' and p_status <> 'archived'
     and public.lgu_seats_taken(v_row.lgu_psgc) >= public.lgu_seat_limit() then
    raise exception 'This LGU has no free admin seat to bring this account back into.'
      using errcode = 'P0001';
  end if;

  update public.profiles
  set status = p_status, status_changed_at = now(), status_changed_by = auth.uid()
  where id = p_user;
end $$;

do $$
begin
  revoke all on function public.issue_account_code(bigint, text) from public;
  revoke all on function public.revoke_account_code(uuid) from public;
  revoke all on function public.set_account_status(uuid, text) from public;
  revoke all on function public.lgu_seats_taken(bigint) from public;
  revoke all on function public.check_account_code(text) from public;

  grant execute on function public.issue_account_code(bigint, text) to authenticated;
  grant execute on function public.revoke_account_code(uuid) to authenticated;
  grant execute on function public.set_account_status(uuid, text) to authenticated;
  grant execute on function public.lgu_seats_taken(bigint) to authenticated;
  -- The activation page is used before the officer has an account.
  grant execute on function public.check_account_code(text) to anon, authenticated;
end $$;


-- ===========================================================================
-- 9. Redeeming a code as the account is created
--
-- The activation page sends the code in the sign-up metadata. This runs right
-- after the existing zz_sync_arborist_profile trigger has written the profile
-- (same-timing triggers fire in name order, hence 'zzz_'), and turns that
-- profile into an LGU admin.
--
-- The code is checked here as well as on the page. A page that skipped its
-- own check, or a request built by hand, still cannot create an admin: a bad
-- code makes the whole sign-up fail.
--
-- No code means a field officer registering from the app — the path that
-- already exists. That profile only gets its LGU filled in.
-- ===========================================================================
create or replace function public.apply_account_code()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := nullif(trim(new.raw_user_meta_data->>'account_code'), '');
  v_lgu  bigint;
begin
  if v_code is null then
    update public.profiles
    set lgu_psgc = coalesce(lgu_psgc, public.lgu_named(municipality))
    where id = new.id;
    return new;
  end if;

  -- Atomic: two people redeeming one code at the same moment cannot both win.
  update public.account_codes
  set redeemed_at = now(), redeemed_by = new.id
  where code_hash = public.account_code_hash(v_code)
    and redeemed_at is null and revoked_at is null and expires_at > now()
  returning lgu_psgc into v_lgu;

  if v_lgu is null then
    raise exception 'That account code is not valid. It may have been used, revoked or expired.'
      using errcode = 'P0001';
  end if;

  update public.profiles
  set role = 'lgu_admin', lgu_psgc = v_lgu, is_approved = true, status = 'active',
      municipality = (select name from public.lgus where psgc = v_lgu)
  where id = new.id;

  if not found then
    insert into public.profiles (id, email, full_name, role, lgu_psgc, is_approved, status, municipality)
    values (new.id, new.email, nullif(new.raw_user_meta_data->>'full_name', ''),
            'lgu_admin', v_lgu, true, 'active',
            (select name from public.lgus where psgc = v_lgu));
  end if;

  insert into public.activity_log (actor, actor_email, actor_role, lgu_psgc, action, entity, entity_id, details)
  values (new.id, new.email, 'lgu_admin', v_lgu, 'code.redeemed', 'profile', new.id::text, null);

  return new;
end $$;

drop trigger if exists zzz_apply_account_code on auth.users;
create trigger zzz_apply_account_code
  after insert on auth.users
  for each row execute function public.apply_account_code();


-- ===========================================================================
-- 10. Changes to the inventory, for the log
--
-- Which columns changed, not the whole row: enough to see who dispatched what
-- and who issued which permit, without copying the inventory into the log.
-- ===========================================================================
create or replace function public.log_tree_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row     jsonb := to_jsonb(coalesce(new, old));
  v_lgu     bigint;
  v_changed text[];
begin
  select b.municipality_psgc into v_lgu
  from public.barangays b
  where b.psgc = (v_row->>'barangay_psgc')::bigint;

  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(to_jsonb(new)) n
    where n.value is distinct from (to_jsonb(old) -> n.key)
      and n.key not in ('updated_at', 'last_synced_at');
    if v_changed is null then
      return new;  -- nothing a person would call a change
    end if;
  end if;

  perform public.log_activity('tree.' || lower(tg_op), 'tree', v_row->>'id', v_lgu,
    case when tg_op = 'UPDATE' then jsonb_build_object('changed', v_changed)
         else jsonb_build_object('species', v_row->>'species') end);
  return coalesce(new, old);
end $$;

drop trigger if exists log_tree_changes on public.trees;
create trigger log_tree_changes
  after insert or update or delete on public.trees
  for each row execute function public.log_tree_changes();

notify pgrst, 'reload schema';


-- ===========================================================================
-- 11. Check. One result: every row should say ok = true, except the last two,
--     which are lists for you to read.
-- ===========================================================================
select 'lgus: all 30 seeded' as check, (select count(*) from public.lgus) = 30 as ok,
       (select count(*) from public.lgus)::text as detail
union all
select 'lgus: every barangay''s LGU is known',
       not exists (select 1 from public.barangays b
                   where not exists (select 1 from public.lgus l where l.psgc = b.municipality_psgc)),
       (select count(distinct municipality_psgc) from public.barangays)::text || ' LGUs referenced'
union all
select 'roles: only the three new ones',
       not exists (select 1 from public.profiles where role not in ('pgenro', 'lgu_admin', 'field_officer')),
       (select string_agg(role || ' ' || n, ', ') from
          (select role, count(*) n from public.profiles group by role order by role) r)
union all
select 'pgenro: at least one account',
       exists (select 1 from public.profiles where role = 'pgenro' and status = 'active'),
       coalesce((select string_agg(email, ', ') from public.profiles where role = 'pgenro'), 'NONE')
union all
select 'guard: self-promotion blocked',
       exists (select 1 from pg_trigger where tgname = 'guard_profile_changes' and not tgisinternal),
       'trigger on public.profiles'
union all
select 'codes: redeemed at sign-up',
       exists (select 1 from pg_trigger where tgname = 'zzz_apply_account_code' and not tgisinternal),
       'trigger on auth.users'
union all
select 'codes: can generate', exists (select 1 from pg_proc where proname = 'gen_random_bytes'),
       'pgcrypto in the extensions schema'
union all
select 'locked accounts: blocked on trees',
       exists (select 1 from pg_policies where tablename = 'trees' and policyname = 'only active accounts'),
       'restrictive policy'
union all
select 'READ: field officers with no LGU', null,
       coalesce((select string_agg(coalesce(email, id::text) || ' (' || coalesce(municipality, 'no municipality') || ')', '; ')
                 from public.profiles where role = 'field_officer' and lgu_psgc is null), 'none')
union all
select 'READ: field officers by LGU', null,
       coalesce((select string_agg(l.label || ' ' || n, ', ' order by l.label)
                 from (select lgu_psgc, count(*) n from public.profiles
                       where role = 'field_officer' and lgu_psgc is not null group by lgu_psgc) p
                 join public.lgus l on l.psgc = p.lgu_psgc), 'none');
