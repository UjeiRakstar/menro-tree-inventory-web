-- Green Tag: who captured each tree, and archiving a tree (22 October).
--
-- Run once, whole, in the SQL editor, after accounts.sql and lgu_fence.sql
-- (step 33 of PARKED.md). Safe to run again. Ends in ONE query whose rows say
-- whether each part took.
--
-- 1. WHO CAPTURED IT. The field app saves no "captured by", so the Trees page
--    could not say which officer tagged a tree. From now on the database
--    stamps every new tree with the account that saved it; trees saved before
--    get it from the activity log where the log has their insert.
--
-- 2. ARCHIVE, NOT DELETE. A MENRO / CENRO takes a tree out of its inventory
--    with a reason — cut under a permit, died, a duplicate, recorded in the
--    wrong place — and can put it back. An archived tree is in no page and no
--    count: the map, the dashboards, the reports, the downloads. Deleting it
--    instead would take its carbon, its CBI figures and its permit history
--    with it, and could not be undone.


-- ===========================================================================
-- 1. Who captured it
-- ===========================================================================
alter table public.trees add column if not exists captured_by uuid;

create or replace function public.stamp_tree_capture()
returns trigger language plpgsql set search_path = public as $$
begin
  -- The account saving it, whatever the page or the app sent.
  if current_user in ('authenticated', 'anon') then
    new.captured_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists stamp_tree_capture on public.trees;
create trigger stamp_tree_capture
  before insert on public.trees
  for each row execute function public.stamp_tree_capture();

-- Nobody changes who captured a tree afterwards.
create or replace function public.keep_tree_capture()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.captured_by := old.captured_by;
  end if;
  return new;
end $$;

drop trigger if exists keep_tree_capture on public.trees;
create trigger keep_tree_capture
  before update on public.trees
  for each row execute function public.keep_tree_capture();

-- Trees saved before: the account the activity log recorded for their insert.
update public.trees t
set captured_by = l.actor
from (
  select distinct on (entity_id) entity_id, actor
  from public.activity_log
  where entity = 'tree' and action = 'tree.insert' and actor is not null
  order by entity_id, at
) l
where t.captured_by is null and t.id::text = l.entity_id;


-- ===========================================================================
-- 2. Archiving a tree
-- ===========================================================================
alter table public.trees
  add column if not exists archived_at    timestamptz,
  add column if not exists archived_by    uuid,
  add column if not exists archive_reason text;

-- An archived tree is in no ordinary read: not the public's, not an office's.
-- Its office sees it through archived_trees() below, to put it back.
drop policy if exists "archived trees are out of the inventory" on public.trees;
create policy "archived trees are out of the inventory" on public.trees as restrictive
  for select to anon, authenticated
  using (archived_at is null);

-- Archive or restore: the MENRO / CENRO of the tree's LGU, with a reason to
-- archive. The archive fields are written only here.
create or replace function public.archive_tree(p_id text, p_archived boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_barangay bigint;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select barangay_psgc into v_barangay from public.trees where id::text = p_id for update;
  if not found then
    raise exception 'No such tree.' using errcode = 'P0002';
  end if;
  if not (public.my_role() = 'lgu_admin' and public.is_active_account()
          and public.lgu_of_barangay(v_barangay) = public.my_lgu()) then
    raise exception 'Only the tree''s own MENRO / CENRO archives it.' using errcode = '42501';
  end if;
  if p_archived and (v_reason is null or length(v_reason) > 300) then
    raise exception 'Say why it is archived, in up to 300 characters.' using errcode = '22023';
  end if;
  update public.trees
  set archived_at = case when p_archived then now() end,
      archived_by = case when p_archived then auth.uid() end,
      archive_reason = case when p_archived then v_reason end
  where id::text = p_id;
end $$;

revoke all on function public.archive_tree(text, boolean, text) from public;
grant execute on function public.archive_tree(text, boolean, text) to authenticated;

-- The office's archived trees, to look back at and restore.
create or replace function public.archived_trees()
returns setof public.trees language sql stable security definer set search_path = public as $$
  select t.* from public.trees t
  where t.archived_at is not null
    and public.my_role() = 'lgu_admin' and public.is_active_account()
    and public.lgu_of_barangay(t.barangay_psgc) = public.my_lgu()
  order by t.archived_at desc;
$$;

revoke all on function public.archived_trees() from public;
grant execute on function public.archived_trees() to authenticated;

-- Nobody writes the archive fields directly.
create or replace function public.keep_tree_archive()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.archived_at := null;
      new.archived_by := null;
      new.archive_reason := null;
    else
      new.archived_at := old.archived_at;
      new.archived_by := old.archived_by;
      new.archive_reason := old.archive_reason;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists keep_tree_archive on public.trees;
create trigger keep_tree_archive
  before insert or update on public.trees
  for each row execute function public.keep_tree_archive();

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'new trees say who captured them' as check,
       exists (select 1 from information_schema.columns where table_name = 'trees' and column_name = 'captured_by')
       and exists (select 1 from information_schema.triggers where trigger_name = 'stamp_tree_capture') as ok,
       '' as detail
union all
select 'a tree is archived, not deleted',
       exists (select 1 from information_schema.columns where table_name = 'trees' and column_name = 'archived_at')
       and exists (select 1 from information_schema.routines where routine_name = 'archive_tree'),
       ''
union all
select 'archived trees are out of every page',
       exists (select 1 from pg_policies where tablename = 'trees'
               and policyname = 'archived trees are out of the inventory' and permissive = 'RESTRICTIVE'),
       ''
union all
select 'READ: trees whose capturer is known', null,
       (select count(captured_by) || ' of ' || count(*) from public.trees)
union all
select 'READ: trees archived', null,
       (select count(*)::text from public.trees where archived_at is not null);
