-- Green Tag: what the public key can do. Read-only.
--
-- The anon key ships inside the web app. It is meant to be public — that is
-- how a visitor reads the map without signing in — so the only thing standing
-- between the inventory and the internet is row level security. This file does
-- not change anything; it reports, and the fixes are at the bottom, commented
-- out, so nothing runs by accident.
--
-- WHAT THE PUBLIC SIDE ACTUALLY NEEDS
--   public.trees             anon SELECT. Nothing else.
--   public.pending_trees     anon INSERT (a resident submitting a tag).
--                            Not SELECT: one resident's submission, with its
--                            GPS fix and photos, is not another's to read.
--   public.species_profiles  anon SELECT (the Description tab).
--   public.phenology_records anon SELECT (the Tree Details tab).
--   everything else          nothing. profiles, arborists, permits and the
--                            audit trail are staff tables.
--
-- Run each section and compare what comes back with that list.

-- ---------------------------------------------------------------------------
-- 1. Is row level security even on?
--
-- `rls_enabled = false` on a table the anon key can reach is the whole fence
-- missing, whatever policies are written below. This is the first thing to
-- look at.
-- ---------------------------------------------------------------------------
select
  c.relname                as table_name,
  c.relrowsecurity         as rls_enabled,
  c.relforcerowsecurity    as rls_forced,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relrowsecurity, c.relname;

-- ---------------------------------------------------------------------------
-- 2. Every policy, and who it lets in.
--
-- Read the `roles` column. A policy granted to `public` applies to anon as
-- well, which is easy to write by accident — `to public` is the default when
-- no role is named.
--
-- `cmd` is the operation: SELECT, INSERT, UPDATE, DELETE or ALL. Look hard at
-- any UPDATE, DELETE or ALL that anon or public can reach.
-- ---------------------------------------------------------------------------
select
  tablename,
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- ---------------------------------------------------------------------------
-- 3. Table grants, which sit underneath the policies.
--
-- A policy cannot let anyone past a grant that was never made, and a grant
-- cannot let anyone past a policy. Both have to line up, so both are worth
-- seeing. Supabase grants broadly to anon and authenticated by default and
-- relies on RLS to do the real work — which is fine, as long as section 1 says
-- rls_enabled.
-- ---------------------------------------------------------------------------
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;

-- ---------------------------------------------------------------------------
-- 4. Functions that run as their owner.
--
-- A SECURITY DEFINER function runs with its creator's rights, so it steps
-- around RLS by design. That is what promote_pending_tree() is for — but each
-- one is a door, and each door should check who is knocking. Ours call
-- can_verify_crowdsourced() first.
--
-- `anon_can_execute` is the column that matters: a definer function anon can
-- call is the public internet running as the owner.
-- ---------------------------------------------------------------------------
select
  p.proname as function_name,
  p.prosecdef as security_definer,
  pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('anon', p.oid, 'execute')          as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by anon_can_execute desc, p.proname;

-- ---------------------------------------------------------------------------
-- 5. Storage, if the photos live there.
--
-- Crowdsourced photos go to Cloudinary today, so this may come back empty.
-- If any bucket is public, anything written to it is readable by anyone with
-- the URL, policies or not.
-- ---------------------------------------------------------------------------
select id as bucket, public as is_public, created_at
from storage.buckets
order by id;

-- ---------------------------------------------------------------------------
-- FIXES — read sections 1 to 4 first, then run only what you mean.
--
-- These are written to match the list at the top of this file. Check them
-- against what you already have: if a policy with the same intent exists under
-- another name, change that one instead of adding a second.
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

-- If section 4 shows anon can execute a definer function, shut that door:
-- revoke execute on function public.promote_pending_tree(text, text) from anon;
-- revoke execute on function public.reject_pending_tree(text, text) from anon;
