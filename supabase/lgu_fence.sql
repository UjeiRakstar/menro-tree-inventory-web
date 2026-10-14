-- Green Tag: an LGU account changes its own LGU's trees, and no one else's.
-- Phase 2 of ACCOUNTS_AND_MAPPING.md. Run AFTER supabase/accounts.sql.
--
-- Run once, whole. Safe to run again. Ends in ONE check query.
--
-- ===========================================================================
-- READ THIS FIRST
-- ===========================================================================
-- Today every signed-in account can change and delete every tree in Laguna:
-- the only write rule on public.trees is "authenticated users full access".
-- accounts.sql already stops a LOCKED account writing. This narrows the rest:
--
--   PGENRO          any tree in the province
--   MENRO / CENRO   trees in their own LGU
--   field officer   trees in their own LGU, and any tree they have been
--                   dispatched to, wherever it stands
--
-- Reading is untouched — the inventory is public — and so is ADDING a tree: a
-- field officer tagging a tree a few metres over the town line is doing their
-- job, and the activity log records who added what, where.
--
-- WHAT COULD BREAK: the field app. A field officer updating a tree that is in
-- another LGU and not assigned to them will now be refused. That should never
-- be legitimate work, but the app has not been tested against it. Run this,
-- then sync one tree from the app. If it fails, section 4 puts the old rule
-- back in one statement.
--
-- Which LGU a tree is in comes from its barangay (barangay_psgc, set from its
-- coordinates by supabase/barangay_link.sql). A tree with no barangay belongs
-- to no LGU, and only PGENRO can change it.


-- ===========================================================================
-- 1. Which LGU a tree is in, and whether a tree is mine to change
-- ===========================================================================
create or replace function public.lgu_of_barangay(p_barangay bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select municipality_psgc from public.barangays where psgc = p_barangay;
$$;

create or replace function public.my_email()
returns text language sql stable security definer set search_path = public as $$
  select lower(email) from public.profiles where id = auth.uid() and status = 'active';
$$;

-- One rule, written once, used by both the update and the delete policy.
create or replace function public.can_change_tree(p_barangay bigint, p_assigned_to text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'pgenro' then true
    when 'lgu_admin' then public.lgu_of_barangay(p_barangay) = public.my_lgu()
    when 'field_officer' then
      public.lgu_of_barangay(p_barangay) = public.my_lgu()
      or (p_assigned_to is not null and lower(p_assigned_to) = public.my_email())
    else false
  end;
$$;

revoke all on function public.lgu_of_barangay(bigint) from public;
revoke all on function public.my_email() from public;
revoke all on function public.can_change_tree(bigint, text) from public;
grant execute on function public.lgu_of_barangay(bigint) to authenticated;
grant execute on function public.my_email() to authenticated;
grant execute on function public.can_change_tree(bigint, text) to authenticated;


-- ===========================================================================
-- 2. The policies
--
-- The old catch-all goes; in its place, one policy per kind of access. The
-- restrictive "only active accounts" policy from accounts.sql stays on top of
-- all of them.
--
-- UPDATE checks the row BEFORE (using) and AFTER (with check): a Santa Cruz
-- MENRO can neither edit a Calamba tree, nor move one of their own trees into
-- Calamba by changing its barangay.
--
-- Except for a field officer's AFTER. An officer dispatched to a tree in the
-- next town may finish the job by clearing the assignment, and the row
-- afterwards — no longer assigned to them, not in their LGU — would fail the
-- check and refuse the very work they were sent to do. For them the BEFORE
-- check is the fence: they still cannot touch a tree that was not theirs.
-- ===========================================================================
begin;

drop policy if exists "authenticated users full access" on public.trees;

drop policy if exists "signed-in accounts read trees" on public.trees;
create policy "signed-in accounts read trees" on public.trees
  for select to authenticated using (true);

drop policy if exists "signed-in accounts add trees" on public.trees;
create policy "signed-in accounts add trees" on public.trees
  for insert to authenticated with check (true);

drop policy if exists "change trees in your own lgu" on public.trees;
create policy "change trees in your own lgu" on public.trees
  for update to authenticated
  using (public.can_change_tree(barangay_psgc, assigned_to))
  with check (public.my_role() = 'field_officer'
              or public.can_change_tree(barangay_psgc, assigned_to));

drop policy if exists "delete trees in your own lgu" on public.trees;
create policy "delete trees in your own lgu" on public.trees
  for delete to authenticated
  using (public.can_change_tree(barangay_psgc, assigned_to)
         and public.my_role() in ('pgenro', 'lgu_admin'));

commit;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 3. Check. Every row should say ok = true.
-- ===========================================================================
select 'the catch-all is gone' as check,
       not exists (select 1 from pg_policies where tablename = 'trees'
                   and policyname = 'authenticated users full access') as ok,
       '' as detail
union all
select 'changes are fenced to the LGU',
       exists (select 1 from pg_policies where tablename = 'trees'
               and policyname = 'change trees in your own lgu'),
       ''
union all
select 'locked accounts still blocked',
       exists (select 1 from pg_policies where tablename = 'trees'
               and policyname = 'only active accounts'),
       'from accounts.sql'
union all
select 'the public can still read',
       exists (select 1 from pg_policies where tablename = 'trees' and 'anon' = any(roles)
               and cmd = 'SELECT'),
       ''
union all
select 'trees with no barangay (PGENRO only)', null,
       (select count(*)::text from public.trees where barangay_psgc is null);


-- ===========================================================================
-- 4. IF THE FIELD APP BREAKS — put the old rule back, then tell me what the
--    app was doing when it failed:
--
--   create policy "authenticated users full access" on public.trees
--     for all to authenticated using (true) with check (true);
--
-- Permissive policies add together, so that one line reopens writes for every
-- active account while the fenced ones stay in place to be fixed.
-- ===========================================================================
