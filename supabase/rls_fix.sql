-- Green Tag: close what the audit found. Run this before launch.
--
-- Written against the rls_audit.sql output of 10 October 2026. Re-run the
-- audit afterwards: every 'look_at' below should be gone.
--
-- READ THIS FIRST
-- The dangerous half of this file is turning row level security ON. A table
-- with RLS off ignores its policies entirely — which is why public.trees has a
-- policy and is still wide open. The moment RLS goes on, that policy starts
-- being enforced, and the only policy on trees today is "authenticated users
-- full access". Enabling it on its own would take the public map dark.
--
-- So each table's read policy is created in the SAME transaction that enables
-- RLS on it. Run each section whole. If a section errors, nothing in it
-- happened.

-- ===========================================================================
-- 1. public.trees — the inventory. RLS OFF today.
--
-- This is the serious one. With RLS off, the anon key that ships inside the
-- website is not limited by any policy: it can read the inventory, and it can
-- also change and delete it. Anyone who opens the site has that key.
-- ===========================================================================
begin;

-- The public may read the inventory. This is what the map and the analytics
-- page are: nothing here is secret.
drop policy if exists "anon reads trees" on public.trees;
create policy "anon reads trees" on public.trees
  for select to anon using (true);

-- Staff keep full access; this policy already exists, and is only enforced
-- once RLS is on.
alter table public.trees enable row level security;

commit;

-- ===========================================================================
-- 2. public.arborists — staff records. RLS OFF, no policies at all.
--
-- Names, assignments and contact details of the field team. Nothing public
-- reads this table; only the admin console does, signed in.
-- ===========================================================================
begin;

drop policy if exists "staff manage arborists" on public.arborists;
create policy "staff manage arborists" on public.arborists
  for all to authenticated using (true) with check (true);

alter table public.arborists enable row level security;

commit;

-- ===========================================================================
-- 3. public.trees_backup_may17 — a backup, readable by the whole internet.
--
-- RLS on with no policy denies everybody except the service role, which is
-- what a backup wants: nothing in the app reads it, and the service role still
-- can if it is ever needed.
--
-- If this is an old copy nobody needs, drop it instead — a table nobody can
-- read is still a table someone has to remember to protect.
-- ===========================================================================
alter table public.trees_backup_may17 enable row level security;
-- drop table public.trees_backup_may17;

-- ===========================================================================
-- 4. public.phenology_records — and a bug the audit turned up.
--
-- All three policies on this table are 'authenticated'. The PUBLIC map reads
-- it: the Tree Details tab asks for the newest observation of the open tree.
-- With the anon key that query returns no rows, so the leaf, flower and fruit
-- state has been blank for every visitor — not because nothing was recorded,
-- but because they were not allowed to see it.
--
-- Observations of a public tree are public. Writing stays with staff.
-- ===========================================================================
drop policy if exists "anon reads observations" on public.phenology_records;
create policy "anon reads observations" on public.phenology_records
  for select to anon using (true);

-- ===========================================================================
-- 5. Storage — anyone can upload, overwrite and DELETE the tree photos.
--
-- Three policies grant INSERT, UPDATE and DELETE on storage.objects to
-- 'public', which includes anon. Anybody with the key could empty the bucket.
--
-- Nothing public needs to write there. The public tagging form uploads to
-- Cloudinary, and so does the field app; this bucket is read-only as far as
-- the website is concerned.
--
-- Reading stays public: that is how a tree photo appears on the map.
-- ===========================================================================
begin;

drop policy if exists "Allow public uploads 63djcp_1" on storage.objects;
drop policy if exists "Allow public uploads 63djcp_2" on storage.objects;
drop policy if exists "Allow public uploads 63djcp_3" on storage.objects;

drop policy if exists "staff write tree photos" on storage.objects;
create policy "staff write tree photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'tree_images');

drop policy if exists "staff replace tree photos" on storage.objects;
create policy "staff replace tree photos" on storage.objects
  for update to authenticated using (bucket_id = 'tree_images');

drop policy if exists "staff remove tree photos" on storage.objects;
create policy "staff remove tree photos" on storage.objects
  for delete to authenticated using (bucket_id = 'tree_images');

commit;

-- ===========================================================================
-- 6. SECURITY DEFINER functions the public may execute.
--
-- WHY THE EARLIER REVOKE DID NOT WORK
-- crowdsource_promotion.sql ends with "revoke execute ... from anon", and the
-- audit still reports anon may execute. That revoke was pointing at the wrong
-- grantee: PostgreSQL grants EXECUTE on every new function to PUBLIC, and anon
-- inherits it from there. Revoking from anon takes away a grant anon never
-- had. The grant to take away is PUBLIC's.
--
-- promote_pending_tree and reject_pending_tree check can_verify_crowdsourced()
-- before doing anything, so this was not an open door — but a door with a lock
-- on the inside is not a reason to leave it unlatched.
-- ===========================================================================
revoke execute on function public.promote_pending_tree(text, text) from public;
revoke execute on function public.reject_pending_tree(text, text) from public;
grant execute on function public.promote_pending_tree(text, text) to authenticated;
grant execute on function public.reject_pending_tree(text, text) to authenticated;

-- These three answer a question rather than doing anything, and the answer for
-- an anonymous caller is always false. Latched anyway.
revoke execute on function public.can_verify_crowdsourced() from public;
revoke execute on function public.can_edit_species_profiles() from public;
revoke execute on function public.is_menro_admin() from public;
grant execute on function public.can_verify_crowdsourced() to authenticated;
grant execute on function public.can_edit_species_profiles() to authenticated;
grant execute on function public.is_menro_admin() to authenticated;

-- NOT touched: handle_new_user() and sync_arborist_profile_from_metadata().
-- Those are trigger functions. Postgres runs a trigger as the table owner
-- regardless of who may execute the function by name, and revoking from PUBLIC
-- can break signup. Leave them.

-- ===========================================================================
-- 7. public.profiles — worth a look, not a change.
--
-- Two policies are granted to 'public' rather than 'authenticated':
--   "Users can insert own profile."
--   "Users can update own profile."
--
-- Almost certainly harmless: a policy like that reads auth.uid() = id, and an
-- anonymous caller has no auth.uid(), so no row ever matches. Signup also
-- depends on one of them, which is why this file does not touch them blind.
--
-- Run this to see what they actually check, and tighten only if the
-- expression does NOT mention auth.uid():
-- ===========================================================================
select policyname, cmd, roles, qual as using_expression, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
  and 'public' = any (roles);
