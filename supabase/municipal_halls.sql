-- Green Tag: where each LGU's Municipal or City Hall is.
-- Run AFTER supabase/accounts.sql. Safe to run again. Ends in ONE check query.
--
-- The office map's centre button used to fly to the whole LGU. It now flies to
-- the hall — the place the office actually is — once the hall has been
-- pinned. An officer pins it while activating their account (if nobody from
-- their LGU has yet), or later from the map.
--
-- One pin per LGU, not per officer: five admins of Santa Cruz work from one
-- building.


-- ===========================================================================
-- 1. The pin
-- ===========================================================================
alter table public.lgus
  add column if not exists hall_lat    double precision,
  add column if not exists hall_lng    double precision,
  add column if not exists hall_set_by uuid,
  add column if not exists hall_set_at timestamptz;

-- A rough box around Laguna. The page checks the LGU boundary itself; this is
-- the database refusing a pin that is plainly nowhere near the province.
create or replace function public.in_laguna_box(p_lat double precision, p_lng double precision)
returns boolean language sql immutable as $$
  select p_lat between 13.95 and 14.55 and p_lng between 120.95 and 121.75;
$$;

-- Pin (or move) the hall. An LGU admin pins their own; PGENRO any.
create or replace function public.set_lgu_hall(
  p_lat double precision, p_lng double precision, p_lgu bigint default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lgu bigint := coalesce(p_lgu, public.my_lgu());
begin
  if v_lgu is null or not (public.is_pgenro() or public.is_lgu_admin_of(v_lgu)) then
    raise exception 'Only this LGU''s MENRO/CENRO, or PGENRO, can pin its hall.' using errcode = '42501';
  end if;
  if not public.in_laguna_box(p_lat, p_lng) then
    raise exception 'That pin is not in Laguna.' using errcode = '22023';
  end if;

  update public.lgus
  set hall_lat = p_lat, hall_lng = p_lng, hall_set_by = auth.uid(), hall_set_at = now()
  where psgc = v_lgu;

  perform public.log_activity('lgu.hall_pinned', 'lgu', v_lgu::text, v_lgu,
    jsonb_build_object('lat', p_lat, 'lng', p_lng));
end $$;

revoke all on function public.set_lgu_hall(double precision, double precision, bigint) from public;
grant execute on function public.set_lgu_hall(double precision, double precision, bigint) to authenticated;


-- ===========================================================================
-- 2. The activation page needs to know which LGU a code is for — by name, to
--    draw its boundary for the pin — and whether its hall is pinned already.
--
--    Its answer gains columns, which Postgres will not do in place, so the
--    function is dropped and created again. Same grants as before.
-- ===========================================================================
drop function if exists public.check_account_code(text);

create function public.check_account_code(p_code text)
returns table (
  ok boolean, reason text, lgu_label text, is_city boolean,
  lgu_name text, hall_lat double precision, hall_lng double precision
)
language sql stable security definer set search_path = public, extensions as $$
  with found as (
    select c.*, l.label, l.is_city, l.name, l.hall_lat as h_lat, l.hall_lng as h_lng
    from public.account_codes c join public.lgus l on l.psgc = c.lgu_psgc
    where c.code_hash = public.account_code_hash(p_code)
  ),
  judged as (
    select f.*,
      case when f.id is null then 'not_found'
           when f.revoked_at is not null then 'revoked'
           when f.redeemed_at is not null then 'used'
           when f.expires_at <= now() then 'expired'
           else 'ok' end as verdict
    from (select 1) one left join found f on true
  )
  -- Nothing about the LGU for a code that does not work: a wrong guess learns
  -- only that it was wrong.
  select verdict = 'ok', verdict,
         case when verdict = 'ok' then label end,
         case when verdict = 'ok' then is_city end,
         case when verdict = 'ok' then name end,
         case when verdict = 'ok' then h_lat end,
         case when verdict = 'ok' then h_lng end
  from judged;
$$;

revoke all on function public.check_account_code(text) from public;
grant execute on function public.check_account_code(text) to anon, authenticated;


-- ===========================================================================
-- 3. Saving the pin with the account
--
--    The activating officer has no session yet (they still have to confirm
--    their email), so the pin travels in the sign-up metadata like the code
--    does, and is saved as the account is created. Only when the LGU has no
--    pin: a second officer activating later does not move the first one's.
--
--    The same function as in accounts.sql, with the pin added.
-- ===========================================================================
create or replace function public.apply_account_code()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text := nullif(trim(new.raw_user_meta_data->>'account_code'), '');
  v_lgu  bigint;
  v_lat  double precision;
  v_lng  double precision;
begin
  if v_code is null then
    update public.profiles
    set lgu_psgc = coalesce(lgu_psgc, public.lgu_named(municipality))
    where id = new.id;
    return new;
  end if;

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

  -- The hall, if the officer pinned one and the LGU does not have one yet.
  begin
    v_lat := (new.raw_user_meta_data->>'hall_lat')::double precision;
    v_lng := (new.raw_user_meta_data->>'hall_lng')::double precision;
  exception when others then
    v_lat := null; v_lng := null;
  end;
  if v_lat is not null and v_lng is not null and public.in_laguna_box(v_lat, v_lng) then
    update public.lgus
    set hall_lat = v_lat, hall_lng = v_lng, hall_set_by = new.id, hall_set_at = now()
    where psgc = v_lgu and hall_lat is null;
  end if;

  insert into public.activity_log (actor, actor_email, actor_role, lgu_psgc, action, entity, entity_id, details)
  values (new.id, new.email, 'lgu_admin', v_lgu, 'code.redeemed', 'profile', new.id::text, null);

  return new;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 4. Check
-- ===========================================================================
select 'halls can be pinned' as check,
       exists (select 1 from information_schema.columns
               where table_name = 'lgus' and column_name = 'hall_lat') as ok,
       '' as detail
union all
select 'activation knows the LGU by name',
       exists (select 1 from information_schema.routines r
               join information_schema.parameters p on p.specific_name = r.specific_name
               where r.routine_name = 'check_account_code' and p.parameter_name = 'lgu_name'),
       ''
union all
select 'READ: LGUs with their hall pinned', null,
       coalesce((select string_agg(label, ', ' order by label) from public.lgus where hall_lat is not null), 'none yet');
