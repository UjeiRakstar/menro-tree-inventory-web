-- Green Tag: a training sandbox, walled off inside the live database.
--
-- Run once, whole, in the SQL editor, after accounts.sql, lgu_fence.sql,
-- municipal_halls.sql and tag_routing.sql. Safe to run again. Ends in ONE
-- query whose rows say whether each part took.
--
-- ===========================================================================
-- WHAT THIS IS
-- ===========================================================================
-- LGU officers learn the system on the real system: the same website, the
-- same app, the same database, signed in with a TRAINING account. Everything a
-- training account creates is marked as training, and a wall keeps the two
-- worlds apart:
--
--   a training account sees ONLY training rows   — the dummy Siniloan trees,
--                                                  and whatever trainees add
--   every other account, and the public,         — never sees a training row:
--     sees ONLY real rows                          not on the public map, not
--                                                  in the BioDashboard counts,
--                                                  not on any office's board
--
-- The wall is in the database, not the page, so the mobile app is walled too
-- without changing a line of it: a trainee field officer's synced trees are
-- training trees because of who synced them.
--
-- Afterwards, training_purge.sql deletes every training row in one go, and
-- training_seed.sql puts the dummy Siniloan data back for the next batch.
--
-- ===========================================================================
-- WHO IS A TRAINING ACCOUNT
-- ===========================================================================
--   * A MENRO/CENRO who activates with a TRAINING CODE. PGENRO issues those
--     from the Accounts page; they do not take one of the LGU's five seats.
--   * A field officer approved BY a training account. They register in the
--     app as usual; the trainee MENRO approves them, and that makes them a
--     trainee too.
--   * Anyone PGENRO moves in or out of training (set_account_training).
--
-- Two things a trainee CAN still touch, by design:
--   * A field officer waiting for approval is visible to their LGU's trainee
--     and real MENRO alike — otherwise a trainee could never approve their
--     trainee field officer. Whoever approves decides which world they join.
--   * Nothing else. The municipal hall in particular is the real one: a
--     training account can neither pin it nor move it.


-- ===========================================================================
-- 1. Who is in training
-- ===========================================================================
alter table public.profiles
  add column if not exists is_training boolean not null default false;

-- SECURITY DEFINER for the same reason as my_role(): a policy on profiles that
-- reads profiles recurses. A visitor with no account is never in training.
create or replace function public.in_training()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_training from public.profiles where id = auth.uid()), false);
$$;

revoke all on function public.in_training() from public;
grant execute on function public.in_training() to anon, authenticated;


-- ===========================================================================
-- 2. The wall, around every table of inventory data
--
-- Each table gets an is_training column, a trigger that fills it in, and a
-- RESTRICTIVE policy. Restrictive policies are ANDed with the existing ones,
-- so this narrows what they allow without rewriting any of them: the LGU
-- fence, tag routing and the locked-account rule all still apply on top.
--
-- The trigger, on a new row:
--   * written by a training account → training, whatever it claimed
--   * written by anyone else from the website or the app → not training,
--     whatever it claimed (it could not see the row afterwards otherwise)
--   * written from the SQL editor → as given; that is how the seed works
-- and on a changed row it never changes: a row does not cross the wall.
--
-- auth.uid() is still the caller inside a SECURITY DEFINER function, so a
-- trainee publishing a tag through promote_pending_tree() makes a training
-- tree, as it should.
-- ===========================================================================
create or replace function public.stamp_training()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if current_user in ('authenticated', 'anon') or auth.uid() is not null then
      new.is_training := old.is_training;
    end if;
    return new;
  end if;

  if public.in_training() then
    new.is_training := true;
  elsif current_user in ('authenticated', 'anon') or auth.uid() is not null then
    new.is_training := false;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['trees', 'pending_trees', 'permits', 'arborists', 'phenology_records']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists is_training boolean not null default false', t);
    execute format(
      'create index if not exists %I on public.%I (is_training) where is_training', t || '_training_idx', t);

    execute format('drop trigger if exists stamp_training on public.%I', t);
    execute format(
      'create trigger stamp_training before insert or update on public.%I '
      'for each row execute function public.stamp_training()', t);

    -- (select …) so Postgres asks once per query, not once per row.
    execute format('drop policy if exists "training stays in training" on public.%I', t);
    execute format(
      'create policy "training stays in training" on public.%I as restrictive '
      'for all to anon, authenticated '
      'using (is_training = (select public.in_training())) '
      'with check (is_training = (select public.in_training()))', t);
  end loop;
end $$;


-- ===========================================================================
-- 3. The activity log, walled the same way
--
-- PGENRO monitors the real accounts; a trainee's practice clicks would only
-- bury that. A trainee's own MENRO view of the log shows their own practice.
-- ===========================================================================
alter table public.activity_log
  add column if not exists is_training boolean not null default false;

create or replace function public.stamp_training_log()
returns trigger language plpgsql set search_path = public as $$
begin
  new.is_training := new.is_training or public.in_training();
  return new;
end $$;

drop trigger if exists stamp_training on public.activity_log;
create trigger stamp_training
  before insert on public.activity_log
  for each row execute function public.stamp_training_log();

drop policy if exists "training stays in training" on public.activity_log;
create policy "training stays in training" on public.activity_log as restrictive
  for select to authenticated
  using (is_training = (select public.in_training()));


-- ===========================================================================
-- 4. Accounts, either side of the wall
--
-- PGENRO sees every account, training or not: it manages them all. Everyone
-- else sees their own row, the accounts on their side of the wall, and the
-- field officers still waiting for somebody to approve them.
-- ===========================================================================
drop policy if exists "training stays in training" on public.profiles;
create policy "training stays in training" on public.profiles as restrictive
  for all to authenticated
  using (
    id = auth.uid()
    or public.is_pgenro()
    or is_training = (select public.in_training())
    or (role = 'field_officer' and is_approved is not true and rejected_at is null)
  )
  with check (
    id = auth.uid()
    or public.is_pgenro()
    or is_training = (select public.in_training())
  );

-- The column half, as guard_profile_changes() is for role and status. Named
-- to run after that trigger: before-triggers fire in name order.
create or replace function public.training_follows_approver()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_training := false;
    return new;
  end if;

  if new.is_training is distinct from old.is_training and not public.is_pgenro() then
    raise exception 'Only PGENRO can move an account in or out of training.'
      using errcode = '42501';
  end if;

  -- A field officer approved by a trainee is a trainee.
  if new.is_approved is true and old.is_approved is not true and public.in_training() then
    new.is_training := true;
  end if;

  return new;
end $$;

drop trigger if exists training_follows_approver on public.profiles;
create trigger training_follows_approver
  before insert or update on public.profiles
  for each row execute function public.training_follows_approver();

-- PGENRO's own switch, for the account that ended up on the wrong side.
create or replace function public.set_account_training(p_user uuid, p_training boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.profiles%rowtype;
begin
  if not public.is_pgenro() then
    raise exception 'Only PGENRO can move an account in or out of training.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'PGENRO cannot put its own account into training.' using errcode = 'P0001';
  end if;

  update public.profiles set is_training = coalesce(p_training, false)
  where id = p_user
  returning * into v_row;
  if v_row.id is null then
    raise exception 'No such account.' using errcode = 'P0002';
  end if;

  perform public.log_activity(
    case when v_row.is_training then 'account.training_on' else 'account.training_off' end,
    'profile', p_user::text, v_row.lgu_psgc, jsonb_build_object('email', v_row.email));
end $$;

revoke all on function public.set_account_training(uuid, boolean) from public;
grant execute on function public.set_account_training(uuid, boolean) to authenticated;


-- ===========================================================================
-- 5. Training codes
--
-- The same kind of code, the same activation page — but the account it makes
-- is a trainee, and it does not take one of the LGU's five real seats. Ten
-- unused training codes per LGU at a time is plenty for one batch.
-- ===========================================================================
alter table public.account_codes
  add column if not exists is_training boolean not null default false;

-- Seats are for real accounts: trainees and training codes do not count.
create or replace function public.lgu_seats_taken(p_lgu bigint)
returns integer language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.profiles
       where lgu_psgc = p_lgu and role = 'lgu_admin' and status <> 'archived'
         and not is_training)::int
  + (select count(*) from public.account_codes
       where lgu_psgc = p_lgu and redeemed_at is null and revoked_at is null
         and expires_at > now() and not is_training)::int;
$$;

create or replace function public.issue_training_code(p_lgu bigint, p_note text default null)
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

  if (select count(*) from public.account_codes c
      where c.lgu_psgc = p_lgu and c.is_training and c.redeemed_at is null
        and c.revoked_at is null and c.expires_at > now()) >= 10 then
    raise exception 'This LGU already has 10 unused training codes. Revoke some first.'
      using errcode = 'P0001';
  end if;

  v_bytes := extensions.gen_random_bytes(8);
  for i in 0..7 loop
    v_body := v_body || substr(alphabet, (get_byte(v_bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  v_code := v_prefix || '-' || substr(v_body, 1, 4) || '-' || substr(v_body, 5, 4);

  insert into public.account_codes (code_hash, lgu_psgc, note, issued_by, is_training)
  values (public.account_code_hash(v_code), p_lgu,
          coalesce(nullif(trim(p_note), ''), 'Training'), auth.uid(), true)
  returning account_codes.expires_at into v_expiry;

  perform public.log_activity('code.issued_training', 'lgu', p_lgu::text, p_lgu,
    jsonb_build_object('note', p_note, 'expires_at', v_expiry));

  return query select v_code, v_expiry;
end $$;

revoke all on function public.issue_training_code(bigint, text) from public;
grant execute on function public.issue_training_code(bigint, text) to authenticated;

-- After apply_account_code() has redeemed the code (zzz_ runs before zzzz_:
-- triggers fire in name order), a training code makes the new account a
-- trainee, takes back any hall pin it set — the hall is the real one — and
-- moves its activation entry behind the wall with it.
create or replace function public.apply_training_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.account_codes where redeemed_by = new.id and is_training) then
    update public.profiles set is_training = true where id = new.id;
    update public.lgus
    set hall_lat = null, hall_lng = null, hall_set_by = null, hall_set_at = null
    where hall_set_by = new.id;
    update public.activity_log set is_training = true where actor = new.id;
  end if;
  return new;
end $$;

drop trigger if exists zzzz_apply_training_code on auth.users;
create trigger zzzz_apply_training_code
  after insert on auth.users
  for each row execute function public.apply_training_code();


-- ===========================================================================
-- 6. The hall is real
-- ===========================================================================
create or replace function public.keep_hall_from_training()
returns trigger language plpgsql set search_path = public as $$
begin
  if public.in_training()
     and (new.hall_lat is distinct from old.hall_lat or new.hall_lng is distinct from old.hall_lng) then
    raise exception 'A training account cannot pin the municipal hall: it is the real one.'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists keep_hall_from_training on public.lgus;
create trigger keep_hall_from_training
  before update on public.lgus
  for each row execute function public.keep_hall_from_training();

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take?
-- ===========================================================================
select 'accounts can be in training' as check,
       exists (select 1 from information_schema.columns
               where table_name = 'profiles' and column_name = 'is_training') as ok,
       '' as detail
union all
select 'the wall stands around ' || t.name,
       exists (select 1 from pg_policies
               where tablename = t.name and policyname = 'training stays in training'),
       ''
from (values ('trees'), ('pending_trees'), ('permits'), ('arborists'), ('activity_log'), ('profiles')) t(name)
where to_regclass('public.' || t.name) is not null
union all
-- A restrictive policy does nothing on a table with row security off: every
-- training row in it would be visible to everyone.
select 'row security is on for ' || c.relname, c.relrowsecurity,
       case when c.relrowsecurity then '' else 'TURN IT ON before seeding: training rows would be public' end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('trees', 'pending_trees', 'permits', 'arborists', 'phenology_records', 'activity_log')
union all
select 'training codes can be issued',
       exists (select 1 from information_schema.routines where routine_name = 'issue_training_code'),
       ''
union all
select 'READ: training accounts', null,
       coalesce((select string_agg(email, ', ' order by email) from public.profiles where is_training), 'none yet');
