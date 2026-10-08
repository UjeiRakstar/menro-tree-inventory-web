-- Green Tag: let a MENRO admin approve and decline arborist applications.
--
-- WHY APPROVE LOOKED LIKE IT WORKED BUT DID NOT
-- Approving updates ANOTHER user's row in public.profiles. The only update
-- policy on that table is the arborist's own ("auth.uid() = id"), which
-- matches nothing when an admin updates someone else.
--
-- The important part: RLS *filters rows out of* an UPDATE rather than
-- rejecting it. Zero rows matched means zero rows changed and NO error is
-- raised. So the dashboard saw success, removed the card, and wrote the
-- arborists row — while is_approved stayed false. Refreshing brought the
-- application straight back.
--
-- Two fixes. The dashboard now checks how many rows an update actually
-- touched, and this file gives admins a policy so it touches one.
--
-- Run AFTER supabase/profiles_columns.sql and profile_signup_trigger.sql
-- (both in the mobile repo, ../tree_inventory/supabase/).

-- ---------------------------------------------------------------------------
-- 1. A way to tell an admin from an arborist.
--
-- Nothing in either project recorded one, so this adds the simplest thing
-- that works: a role column. Everyone already in the table is an arborist.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'arborist';

-- Who are your users? Run this first if you are unsure which to promote.
--   select id, email, full_name, role from public.profiles order by email;

-- >>> CHANGE THIS EMAIL to the account you sign in to the dashboard with. <<<
update public.profiles
set role = 'admin'
where email = 'zaldy.ybardolaza@lspu.edu.ph';

-- ---------------------------------------------------------------------------
-- 2. The admin check, as a SECURITY DEFINER function.
--
-- This CANNOT be inlined into the policy. A policy on public.profiles whose
-- expression selects from public.profiles re-enters its own policy and fails
-- with "infinite recursion detected in policy for relation profiles". A
-- SECURITY DEFINER function runs as its owner, which is not subject to RLS,
-- so the lookup inside it does not re-trigger the policy.
-- ---------------------------------------------------------------------------
create or replace function public.is_menro_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_menro_admin() from public;
grant execute on function public.is_menro_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The policies.
--
-- PERMISSIVE policies OR together, so these only add to what already works —
-- the arborist's own-row access and whatever lets the dashboard list users
-- stay exactly as they are.
-- ---------------------------------------------------------------------------
drop policy if exists "Admins read every profile" on public.profiles;
create policy "Admins read every profile"
  on public.profiles for select
  to authenticated
  using (public.is_menro_admin());

drop policy if exists "Admins update every profile" on public.profiles;
create policy "Admins update every profile"
  on public.profiles for update
  to authenticated
  using (public.is_menro_admin())
  with check (public.is_menro_admin());

-- ---------------------------------------------------------------------------
-- 4. Verify.
-- ---------------------------------------------------------------------------

-- (a) Exactly the accounts you meant to promote, and no others.
select email, role from public.profiles order by role desc, email;

-- (b) Signed in as that admin in the dashboard, this must return true.
--     Run it from the browser, not here: in the SQL editor auth.uid() is null
--     and it will always say false.
--       select public.is_menro_admin();

-- (c) After clicking Approve, is_approved must actually be true. This is the
--     check that would have caught the silent failure.
select email, full_name, is_approved, rejected_at
from public.profiles
order by is_approved, email;
