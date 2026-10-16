-- Green Tag: each office's settings — its profile and logos, its barangays'
-- figures, its field team's last sign-in, and its own AI key.
--
-- Run once, whole, in the SQL editor, after accounts.sql, lgu_fence.sql,
-- training_sandbox.sql and closing_gaps.sql. Safe to run again. Ends in ONE
-- query whose rows say whether each part took.
--
-- An office is what my_document_folder() names it (closing_gaps.sql): an
-- LGU's PSGC code, '403426000', or 'pgenro'. Each office edits its own
-- settings and nobody else's; a trainee edits none — they are the real
-- office's.
--
-- THE AI KEY. Each office brings its own Gemini API key, so its AI use is its
-- own (decided 16 October). The key goes into Supabase Vault, encrypted, and
-- no page can read it back: an office sees only that one is set, its last four
-- characters, and whether AI is on. The server functions read it with the
-- service key (office_ai_key()), for the field app's tree identification
-- (supabase/functions/identify-tree) and PGENRO's RISE reader.

-- ===========================================================================
-- 0. Vault, where the keys are kept (on by default in Supabase; made sure of)
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'supabase_vault')
     and exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
    create extension supabase_vault with schema vault;
  end if;
end $$;

-- ===========================================================================
-- 1. The office's profile — public, as on its letterhead
-- ===========================================================================
create table if not exists public.office_profiles (
  office          text primary key check (office ~ '^(pgenro|[0-9]{9})$'),
  chief_executive text,
  office_head     text,
  address_line1   text,
  address_line2   text,
  facebook_url    text,
  website_url     text,
  email           text,
  phone           text,
  lgu_logo_url    text,
  office_logo_url text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);

create or replace function public.stamp_office_row()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists stamp_office_profile on public.office_profiles;
create trigger stamp_office_profile before insert or update on public.office_profiles
  for each row execute function public.stamp_office_row();

-- Whether the signed-in account may change this office's settings.
create or replace function public.keeps_office(p_office text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_account()
     and not coalesce(public.in_training(), false)
     and p_office is not null
     and p_office = public.my_document_folder();
$$;
revoke all on function public.keeps_office(text) from public;
grant execute on function public.keeps_office(text) to authenticated;

alter table public.office_profiles enable row level security;
drop policy if exists "anyone reads office profiles" on public.office_profiles;
create policy "anyone reads office profiles" on public.office_profiles
  for select to anon, authenticated using (true);
drop policy if exists "an office keeps its own profile" on public.office_profiles;
create policy "an office keeps its own profile" on public.office_profiles
  for all to authenticated
  using (public.keeps_office(office)) with check (public.keeps_office(office));

-- ===========================================================================
-- 2. Each barangay's population and households — the LGU's to keep
-- ===========================================================================
create table if not exists public.barangay_stats (
  barangay_psgc bigint primary key,
  lgu_psgc      bigint not null,
  population    integer check (population is null or population >= 0),
  households    integer check (households is null or households >= 0),
  census_year   smallint check (census_year is null or census_year between 1900 and 2100),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

-- Its LGU is the barangay's, whatever the page sent.
create or replace function public.guard_barangay_stats()
returns trigger language plpgsql set search_path = public as $$
begin
  new.lgu_psgc := public.lgu_of_barangay(new.barangay_psgc);
  if new.lgu_psgc is null then
    raise exception 'No such barangay.' using errcode = 'P0002';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists guard_barangay_stats on public.barangay_stats;
create trigger guard_barangay_stats before insert or update on public.barangay_stats
  for each row execute function public.guard_barangay_stats();

alter table public.barangay_stats enable row level security;
drop policy if exists "anyone reads barangay figures" on public.barangay_stats;
create policy "anyone reads barangay figures" on public.barangay_stats
  for select to anon, authenticated using (true);
drop policy if exists "an LGU keeps its barangays' figures" on public.barangay_stats;
create policy "an LGU keeps its barangays' figures" on public.barangay_stats
  for all to authenticated
  using (public.keeps_office(lgu_psgc::text))
  with check (public.keeps_office(public.lgu_of_barangay(barangay_psgc)::text));

-- ===========================================================================
-- 3. The office's own AI key, in Vault
-- ===========================================================================
create table if not exists public.office_ai_settings (
  office     text primary key check (office ~ '^(pgenro|[0-9]{9})$'),
  enabled    boolean not null default true,
  key_hint   text,
  secret_id  uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.office_ai_settings enable row level security;
-- An office sees its own; PGENRO sees which offices have one. Never the key.
revoke all on public.office_ai_settings from anon, authenticated;
grant select (office, enabled, key_hint, updated_at) on public.office_ai_settings to authenticated;
drop policy if exists "an office sees its own AI setting" on public.office_ai_settings;
create policy "an office sees its own AI setting" on public.office_ai_settings
  for select to authenticated
  using (office = public.my_document_folder() or public.is_pgenro());

create or replace function public.set_office_ai_key(p_key text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_office text := public.my_document_folder();
  v_key text := trim(coalesce(p_key, ''));
  v_row public.office_ai_settings%rowtype;
begin
  if not public.keeps_office(v_office) then
    raise exception 'Only the office itself sets its AI key.' using errcode = '42501';
  end if;
  if length(v_key) < 20 or length(v_key) > 200 or v_key ~ '\s' then
    raise exception 'That does not look like an API key.' using errcode = '22023';
  end if;
  select * into v_row from public.office_ai_settings where office = v_office;
  if v_row.secret_id is not null then
    perform vault.update_secret(v_row.secret_id, v_key);
  else
    v_row.secret_id := vault.create_secret(v_key, 'ai-key-' || v_office, 'Gemini API key of office ' || v_office);
  end if;
  insert into public.office_ai_settings (office, enabled, key_hint, secret_id, updated_at, updated_by)
  values (v_office, true, right(v_key, 4), v_row.secret_id, now(), auth.uid())
  on conflict (office) do update
    set key_hint = excluded.key_hint, secret_id = excluded.secret_id,
        updated_at = now(), updated_by = auth.uid();
  return right(v_key, 4);
end $$;

create or replace function public.clear_office_ai_key()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_office text := public.my_document_folder();
  v_secret uuid;
begin
  if not public.keeps_office(v_office) then
    raise exception 'Only the office itself removes its AI key.' using errcode = '42501';
  end if;
  select secret_id into v_secret from public.office_ai_settings where office = v_office;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  update public.office_ai_settings
  set secret_id = null, key_hint = null, updated_at = now(), updated_by = auth.uid()
  where office = v_office;
end $$;

create or replace function public.set_office_ai_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_office text := public.my_document_folder();
begin
  if not public.keeps_office(v_office) then
    raise exception 'Only the office itself switches its AI on or off.' using errcode = '42501';
  end if;
  insert into public.office_ai_settings (office, enabled, updated_at, updated_by)
  values (v_office, coalesce(p_enabled, false), now(), auth.uid())
  on conflict (office) do update set enabled = excluded.enabled, updated_at = now(), updated_by = auth.uid();
end $$;

-- For the server functions only (service key): an office's key, when it has
-- one and AI is on; otherwise null.
create or replace function public.office_ai_key(p_office text)
returns text language sql stable security definer set search_path = public as $$
  select s.decrypted_secret
  from public.office_ai_settings a
  join vault.decrypted_secrets s on s.id = a.secret_id
  where a.office = p_office and a.enabled;
$$;

-- Whether an office has switched AI off — the field app is then told so.
create or replace function public.office_ai_enabled(p_office text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select enabled from public.office_ai_settings where office = p_office), true);
$$;

revoke all on function public.set_office_ai_key(text) from public;
revoke all on function public.clear_office_ai_key() from public;
revoke all on function public.set_office_ai_enabled(boolean) from public;
revoke all on function public.office_ai_key(text) from public, anon, authenticated;
revoke all on function public.office_ai_enabled(text) from public, anon, authenticated;
grant execute on function public.set_office_ai_key(text) to authenticated;
grant execute on function public.clear_office_ai_key() to authenticated;
grant execute on function public.set_office_ai_enabled(boolean) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.office_ai_key(text) to service_role';
    execute 'grant execute on function public.office_ai_enabled(text) to service_role';
  end if;
end $$;

-- ===========================================================================
-- 4. When the field team last signed in
-- ===========================================================================
create or replace function public.team_last_sign_in()
returns table (id uuid, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_active_account()
    and p.role = 'field_officer'
    and (public.is_pgenro() or (public.my_role() = 'lgu_admin' and p.lgu_psgc = public.my_lgu()));
$$;
revoke all on function public.team_last_sign_in() from public;
grant execute on function public.team_last_sign_in() to authenticated;

-- ===========================================================================
-- 5. The logos — public, pictures only, filed by office
-- ===========================================================================
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('office-logos', 'office-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

  execute 'drop policy if exists "offices upload their logos" on storage.objects';
  execute $p$create policy "offices upload their logos" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'office-logos' and public.keeps_office((storage.foldername(name))[1]))$p$;
  execute 'drop policy if exists "offices remove their logos" on storage.objects';
  execute $p$create policy "offices remove their logos" on storage.objects
    for delete to authenticated
    using (bucket_id = 'office-logos' and public.keeps_office((storage.foldername(name))[1]))$p$;
  -- Deleting needs the row to be readable; the bucket is public anyway.
  execute 'drop policy if exists "anyone reads office logos" on storage.objects';
  execute $p$create policy "anyone reads office logos" on storage.objects
    for select to anon, authenticated using (bucket_id = 'office-logos')$p$;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'office profiles' as check,
       to_regclass('public.office_profiles') is not null as ok, '' as detail
union all
select 'barangay figures', to_regclass('public.barangay_stats') is not null, ''
union all
select 'AI keys kept in Vault',
       to_regclass('public.office_ai_settings') is not null and to_regclass('vault.secrets') is not null,
       case when to_regclass('vault.secrets') is null then 'Vault is not available: enable the supabase_vault extension' else '' end
union all
select 'no page reads a key',
       not has_function_privilege('authenticated', 'public.office_ai_key(text)', 'execute'), ''
union all
select 'logos bucket, public, pictures only',
       case when to_regclass('storage.buckets') is null then null
            else exists (select 1 from storage.buckets where id = 'office-logos' and public) end,
       ''
union all
select 'READ: offices with an AI key', null,
       (select count(*)::text from public.office_ai_settings where secret_id is not null);
