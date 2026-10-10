-- Green Tag: what the public key can do. Read-only, one result set.
--
-- The anon key ships inside the web app. It is meant to be public — that is
-- how a visitor reads the map without signing in — so the only thing standing
-- between the inventory and the internet is row level security.
--
-- The Supabase SQL editor shows only the LAST result set, so this is one
-- query. Read the `verdict` column first; `look_at` rows are the ones that
-- need a decision.
--
-- WHAT THE PUBLIC SIDE ACTUALLY NEEDS
--   public.trees             anon SELECT. Nothing else.
--   public.pending_trees     anon INSERT (a resident submitting a tag).
--                            Not SELECT: one resident's submission, with its
--                            GPS fix and photos, is not another's to read.
--   public.species_profiles  anon SELECT (the Description tab).
--   public.phenology_records anon SELECT (the Tree Details tab).
--   public.barangays         anon SELECT (the tagging form's barangay list).
--   everything else          nothing. profiles, arborists, permits and the
--                            audit trail are staff tables.
--
-- A table reading 'RLS OFF' is the finding that matters most. Policies on a
-- table with RLS off are not enforced at all, so a table can have a careful
-- policy and still be wide open — which is exactly what this found.

with
-- 1. Is the fence up on each table, and does it have anything written on it?
tables as (
  select
    '1. table' as section,
    c.relname as subject,
    case when c.relrowsecurity then 'RLS on' else 'RLS OFF' end as detail,
    (select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname)::text as extra,
    case
      when not c.relrowsecurity then 'look_at — anyone with the anon key can read this table'
      when c.relrowsecurity and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      ) then 'ok — RLS on with no policies denies everyone'
      else 'ok'
    end as verdict
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),

-- 2. Every policy, and who it admits. A policy with no role named is granted
--    to public, which includes anon — easy to write by accident.
policies as (
  select
    '2. policy' as section,
    tablename || ' · ' || policyname as subject,
    cmd as detail,
    array_to_string(roles, ', ') as extra,
    case
      when ('anon' = any (roles) or 'public' = any (roles))
           and cmd in ('ALL', 'UPDATE', 'DELETE', 'INSERT')
           and tablename <> 'pending_trees'
        then 'look_at — the public can ' || cmd || ' this'
      when ('anon' = any (roles) or 'public' = any (roles))
           and cmd = 'SELECT'
           -- The public side reads these four and nothing else. barangays is
           -- on the list because the tagging form needs it to offer a barangay
           -- to pick from; it is a published PSA list, not staff data.
           and tablename not in ('trees', 'species_profiles', 'phenology_records', 'barangays')
        then 'look_at — the public can read a staff table'
      else 'ok'
    end as verdict
  from pg_policies
  where schemaname = 'public'
),

-- 3. SECURITY DEFINER functions run as their owner, around RLS by design.
--    Each one is a door; a door anon can open is the internet running as the
--    owner.
functions as (
  select
    '3. function' as section,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as subject,
    'security definer' as detail,
    case when has_function_privilege('anon', p.oid, 'execute') then 'anon may execute'
         else 'authenticated only' end as extra,
    case when has_function_privilege('anon', p.oid, 'execute')
      then 'look_at — revoke execute from anon unless the public is meant to call it'
      else 'ok' end as verdict
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
),

-- 4. A public bucket is readable by anyone holding the URL. For tree photos
--    that is the point — they are shown on a public map. What matters is who
--    may WRITE to it, which is a storage policy, below.
buckets as (
  select
    '4. storage' as section,
    id as subject,
    case when public then 'public bucket' else 'private bucket' end as detail,
    (select count(*)::text from storage.objects o where o.bucket_id = b.id) as extra,
    case when public
      then 'ok if it only holds photos meant for the map — check 5 for who may write'
      else 'ok' end as verdict
  from storage.buckets b
),

-- 5. Who may write to storage.
storage_policies as (
  select
    '5. storage policy' as section,
    policyname as subject,
    cmd as detail,
    array_to_string(roles, ', ') as extra,
    case when ('anon' = any (roles) or 'public' = any (roles)) and cmd <> 'SELECT'
      then 'look_at — the public can ' || cmd || ' files'
      else 'ok' end as verdict
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
)

select * from (
  select * from tables
  union all select * from policies
  union all select * from functions
  union all select * from buckets
  union all select * from storage_policies
) report
-- Everything needing a decision first, then the rest in order.
order by (verdict like 'look_at%') desc, section, subject;

-- ---------------------------------------------------------------------------
-- FIXES — read the report first, then run only what you mean.
--
-- Check these against what you already have: if a policy with the same intent
-- exists under another name, change that one instead of adding a second.
-- ---------------------------------------------------------------------------

-- Turn the fence on. Do this before adding policies, not after: enabling RLS
-- with no policies denies everyone, which is the safe order to be wrong in.
-- alter table public.trees             enable row level security;
-- alter table public.pending_trees     enable row level security;
-- alter table public.species_profiles  enable row level security;
-- alter table public.phenology_records enable row level security;

-- The map: anyone may read the inventory, nobody anonymous may change it.
-- create policy "anon reads trees" on public.trees
--   for select to anon using (true);

-- The tagging form: a resident may submit, and may not read back what anyone
-- submitted — including their own, which the form does not need.
-- create policy "anon submits a tag" on public.pending_trees
--   for insert to anon with check (true);

-- The panel's two read-only tables.
-- create policy "anon reads species write-ups" on public.species_profiles
--   for select to anon using (true);
-- create policy "anon reads observations" on public.phenology_records
--   for select to anon using (true);

-- Staff do the rest, signed in. Narrow this further to the roles in
-- public.profiles if MENRO and the arborists should not have the same reach.
-- create policy "staff manage trees" on public.trees
--   for all to authenticated using (true) with check (true);
-- create policy "staff review submissions" on public.pending_trees
--   for all to authenticated using (true) with check (true);

-- Photos: anyone may look at a tree photo, only staff may put one there.
-- The web form uploads to Cloudinary, not to storage, so nothing public needs
-- to write here.
-- create policy "anyone views tree photos" on storage.objects
--   for select to anon using (bucket_id = 'tree_images');
-- create policy "staff upload tree photos" on storage.objects
--   for insert to authenticated with check (bucket_id = 'tree_images');

-- If the report shows anon can execute a definer function, shut that door:
-- revoke execute on function public.promote_pending_tree(text, text) from anon;
-- revoke execute on function public.reject_pending_tree(text, text) from anon;
