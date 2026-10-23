-- Green Tag: the odd columns of public.trees, and the May backup (step 37,
-- 23 October 2026).
--
-- Run in the SQL editor. Safe to run again. Each thing below is removed only
-- when the check before it finds it safe; otherwise it stays, and the check
-- at the end says why.
--
-- Found in October (data_checks.sql, query 8), and settled on 23 October
-- against the live data and both repositories' history:
--
--   trees         a column named after its own table. Empty in every row;
--                 nothing in either repository has ever written or read it.
--                 Dropped, if still empty.
--   height_class  the field app's name for the height class until 12 May
--                 2026, when it became "heightClass". All 97 values in it
--                 (trees synced in May) are the same as that tree's
--                 "heightClass", and the field app reads it only as a
--                 fallback. Copied into "heightClass" where that is empty,
--                 then dropped once every value agrees.
--   is_tagged     an early-May task filter in the field app, gone from it
--                 since 7 May. Its value now says only which version of the
--                 app saved the tree (true before August, false since), and
--                 nothing reads it. Dropped.
--   photo_url     KEPT. It is the main photograph of 103 of the 111 public
--                 trees — the ones synced before August, when the field app
--                 wrote photo_url; it writes "imageUrl" now. The web reads
--                 photo_url first and falls back to "imageUrl"
--                 (treeColumns.js).
--
--   trees_backup_may17   a copy of public.trees made on 17 May. Dropped only
--                 if every tree in it is still in public.trees, so that
--                 nothing is lost (drop_trees_backup.sql, section 1, is the
--                 same check by hand).
--
-- One thing to know: a field app build from before 12 May 2026 sends
-- height_class, and its sync would fail once the column is gone. Every phone
-- should run the current build in any case.

-- The fold below writes to trees, which writes to PGENRO's activity log.
-- Paused, so tidying the table is not logged as somebody's edit.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'log_tree_changes') then
    alter table public.trees disable trigger log_tree_changes;
  end if;
end $$;

-- Every statement on a column goes through execute: the column may already
-- be gone (a second run), and a plain statement naming it would not compile.
do $$
declare
  v_kept boolean;
begin
  -- trees: only while empty.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'trees' and column_name = 'trees') then
    execute 'select exists (select 1 from public.trees where trees is not null)' into v_kept;
    if not v_kept then
      alter table public.trees drop column trees;
    end if;
  end if;

  -- height_class: into "heightClass" where that is empty, then gone once
  -- the two agree everywhere.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'trees' and column_name = 'height_class') then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'trees' and column_name = 'heightClass') then
      execute 'update public.trees set "heightClass" = height_class
               where "heightClass" is null and height_class is not null';
      execute 'select exists (select 1 from public.trees
                              where height_class is not null and height_class is distinct from "heightClass")'
        into v_kept;
    else
      v_kept := true; -- no "heightClass" to keep its values in
    end if;
    if not v_kept then
      alter table public.trees drop column height_class;
    end if;
  end if;

  -- is_tagged: carries nothing.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'trees' and column_name = 'is_tagged') then
    alter table public.trees drop column is_tagged;
  end if;

  -- The May backup: only if no tree in it is missing from public.trees.
  if to_regclass('public.trees_backup_may17') is not null then
    execute 'select exists (select 1 from public.trees_backup_may17 b
                            where not exists (select 1 from public.trees t where t.id = b.id))'
      into v_kept;
    if not v_kept then
      drop table public.trees_backup_may17;
    end if;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'log_tree_changes') then
    alter table public.trees enable trigger log_tree_changes;
  end if;
end $$;

-- ===========================================================================
-- Did it take? Self-contained: it reads only the catalogue and the tables.
-- ===========================================================================
select 'the column named trees is gone' as check,
       not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'trees' and column_name = 'trees') as ok,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'trees' and column_name = 'trees')
            then 'kept: it has values in it — somebody''s data; look before dropping' else '' end as detail
union all
select 'height_class is gone, folded into "heightClass"',
       not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'trees' and column_name = 'height_class'),
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'trees' and column_name = 'height_class')
            then 'kept: some trees have a height_class that differs from their "heightClass"' else '' end
union all
select 'is_tagged is gone',
       not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'trees' and column_name = 'is_tagged'), ''
union all
select 'photo_url is kept (the main photograph of the older trees)',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'trees' and column_name = 'photo_url'), ''
union all
select 'the May backup is gone',
       to_regclass('public.trees_backup_may17') is null,
       case when to_regclass('public.trees_backup_may17') is not null
            then 'kept: it has trees that public.trees no longer has — drop_trees_backup.sql shows them' else '' end
union all
select 'the activity log is paused no longer',
       not exists (select 1 from pg_trigger where tgname = 'log_tree_changes' and tgenabled = 'D'), '';
