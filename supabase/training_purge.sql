-- Green Tag: delete everything made in training.
--
-- Run in the SQL editor when a training batch is done. Deletes every row
-- behind the training wall — the dummy Siniloan data and everything the
-- trainees added on top of it, from the website and the app alike. Real rows
-- are never touched: every delete below says "where is_training".
--
-- To start the next batch from the same dummy data, run training_seed.sql
-- afterwards.
--
-- The training ACCOUNTS are left alone, so one batch can carry on another
-- day. To close them too, uncomment section 3.

-- 1. The trees' activity-log entries go with them, below; pausing the logger
--    keeps the deletes themselves from writing 150 entries to the real log.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'log_tree_changes') then
    alter table public.trees disable trigger log_tree_changes;
  end if;
end $$;

-- 2. The data. Children before parents: permits and observations point at
--    trees.
do $$
declare t text;
begin
  foreach t in array array['permits', 'phenology_records', 'pending_trees', 'trees', 'arborists', 'activity_log']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where is_training', t);
    end if;
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'log_tree_changes') then
    alter table public.trees enable trigger log_tree_changes;
  end if;
end $$;

-- 3. The accounts. Archived, not deleted — the same rule as every account:
--    they can no longer sign in to do anything, and PGENRO can still see who
--    they were. Unused training codes are revoked so nobody activates late.
--
-- update public.profiles
-- set status = 'archived', status_changed_at = now()
-- where is_training and status <> 'archived';
--
-- update public.account_codes
-- set revoked_at = now()
-- where is_training and redeemed_at is null and revoked_at is null;

-- ===========================================================================
-- Did it take? Self-contained: the Supabase SQL editor runs this last query
-- on its own, so it reads only the tables themselves.
-- ===========================================================================
select 'no training trees left' as check,
       not exists (select 1 from public.trees where is_training) as ok, '' as detail
union all
select 'no training tags left', not exists (select 1 from public.pending_trees where is_training), ''
union all
select 'no training permits left', not exists (select 1 from public.permits where is_training), ''
union all
select 'no trainee arborists left', not exists (select 1 from public.arborists where is_training), ''
union all
select 'no training entries left in the activity log',
       not exists (select 1 from public.activity_log where is_training), ''
union all
select 'real trees untouched', true, (select count(*) from public.trees)::text || ' trees'
union all
select 'the activity log is running again',
       not exists (select 1 from pg_trigger where tgname = 'log_tree_changes' and tgenabled = 'D'), ''
union all
select 'READ: training accounts still open', null,
       coalesce((select string_agg(email, ', ' order by email) from public.profiles
                 where is_training and status <> 'archived'), 'none');
