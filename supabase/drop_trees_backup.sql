-- Green Tag: look at trees_backup_may17, then drop it.
--
-- Dropping a table cannot be undone, and nobody remembers what this one is
-- for. A backup made on 17 May is only worth keeping if it still holds
-- something the live table does not — a tree that was deleted since, or a
-- column that was dropped. One query settles it.
--
-- RUN SECTION 1 FIRST. Section 2 is the drop, and it is commented out.

-- ===========================================================================
-- 1. What is in it.
--
-- Read `rows_only_in_backup`. That is the number of trees that existed on
-- 17 May and do not exist now.
--
--   0       Nothing would be lost. Drop it.
--   not 0   Those rows are in no other table. Look at them — the query for
--           that is at the bottom — before dropping anything.
-- ===========================================================================
select 'rows in the backup' as check, count(*)::text as value
  from public.trees_backup_may17
union all
select 'rows in public.trees now',
       count(*)::text from public.trees
union all
select 'rows_only_in_backup',
       (select count(*)::text
          from public.trees_backup_may17 b
         where not exists (select 1 from public.trees t where t.id = b.id))
union all
select 'columns the backup has that trees does not',
       coalesce(string_agg(column_name, ', '), 'none')
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name = 'trees_backup_may17'
   and not exists (
     select 1 from information_schema.columns t
      where t.table_schema = 'public' and t.table_name = 'trees'
        and t.column_name = c.column_name
   )
union all
select 'anything in the app reading it',
       'no — grep of both repos found no reference';

-- ===========================================================================
-- 2. The drop.
--
-- Uncomment and run ONLY once section 1 says rows_only_in_backup is 0, or you
-- have looked at the rows it found and decided they are not wanted.
-- ===========================================================================
-- drop table public.trees_backup_may17;

-- ---------------------------------------------------------------------------
-- The rows that exist only in the backup, if there are any. Export this before
-- dropping if any of it matters: the Supabase table editor downloads CSV.
-- ---------------------------------------------------------------------------
-- select b.*
-- from public.trees_backup_may17 b
-- where not exists (select 1 from public.trees t where t.id = b.id);
