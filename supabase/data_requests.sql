-- Green Tag: who downloads the inventory, and what for (21 October).
--
-- Run once, whole, in the SQL editor, after accounts.sql (step 25 of
-- PARKED.md). Safe to run again. Ends in ONE query whose rows say whether
-- each part took.
--
-- The public pages' data request form asks for a name, an email, an
-- affiliation and a purpose before it offers the downloads: the tagged trees
-- as an Excel workbook and as GeoJSON, for Laguna or one city or
-- municipality. Each request is kept here through log_data_request(), and
-- PGENRO reads them on its Inbox page. Nobody else reads them, and nobody
-- writes them directly.
--
-- What is downloaded is only what the public map already shows of a tree;
-- the request records who asked, under RA 10173, with their agreement.


-- ===========================================================================
-- 1. The requests
-- ===========================================================================
create table if not exists public.data_requests (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text not null,
  email        text not null,
  affiliation  text not null,
  purpose      text not null,
  place        text not null default 'Laguna',
  formats      text[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index if not exists data_requests_created_idx on public.data_requests (created_at desc);

alter table public.data_requests enable row level security;

drop policy if exists "pgenro reads the data requests" on public.data_requests;
create policy "pgenro reads the data requests" on public.data_requests
  for select to authenticated using (public.is_pgenro() and public.is_active_account());

drop policy if exists "pgenro removes data requests" on public.data_requests;
create policy "pgenro removes data requests" on public.data_requests
  for delete to authenticated using (public.is_pgenro() and public.is_active_account());

revoke all on public.data_requests from anon, authenticated;
grant select, delete on public.data_requests to authenticated;


-- ===========================================================================
-- 2. Recording one: the form's only way in
-- ===========================================================================
create or replace function public.log_data_request(
  p_first_name text, p_last_name text, p_email text, p_affiliation text, p_purpose text,
  p_place text default 'Laguna', p_formats text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_id uuid;
begin
  if length(trim(coalesce(p_first_name, ''))) not between 1 and 80
     or length(trim(coalesce(p_last_name, ''))) not between 1 and 80 then
    raise exception 'Give your first and last name.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    raise exception 'Give an email address.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_affiliation, ''))) not between 1 and 200 then
    raise exception 'Give your affiliation.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_purpose, ''))) not between 1 and 1000 then
    raise exception 'Say what the data is for, in up to 1,000 characters.' using errcode = '22023';
  end if;
  -- Twenty an hour from one address is plenty for a person, and too few for a flood.
  if (select count(*) from public.data_requests
      where email = v_email and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many requests from this address in the last hour. Try again later.' using errcode = '22023';
  end if;

  insert into public.data_requests (first_name, last_name, email, affiliation, purpose, place, formats)
  values (trim(p_first_name), trim(p_last_name), v_email, trim(p_affiliation), trim(p_purpose),
          coalesce(nullif(trim(coalesce(p_place, '')), ''), 'Laguna'),
          coalesce(p_formats, '{}'))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_data_request(text, text, text, text, text, text, text[]) from public;
grant execute on function public.log_data_request(text, text, text, text, text, text, text[]) to anon, authenticated;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 3. Check
-- ===========================================================================
select 'data requests are kept' as check,
       to_regclass('public.data_requests') is not null as ok,
       '' as detail
union all
select 'only PGENRO reads them',
       exists (select 1 from pg_policies where tablename = 'data_requests' and policyname = 'pgenro reads the data requests'),
       ''
union all
select 'the form records them',
       to_regprocedure('public.log_data_request(text, text, text, text, text, text, text[])') is not null,
       ''
union all
select 'READ: data requests so far', null,
       (select count(*)::text from public.data_requests);
