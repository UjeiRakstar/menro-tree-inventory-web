-- Green Tag: is everything in? A health check of the live database.
--
-- READ-ONLY. It changes nothing; run it any time, as often as you like, in
-- the SQL editor. One query: each row says whether a part is there (ok =
-- true), missing (ok = false, with what is missing in the detail), or is a
-- figure to read (ok = null).
--
-- It looks for what steps 1–19 of PARKED.md make: tables, the rules on who
-- reads what, the triggers that stamp and route, the functions the pages
-- call, and the storage buckets. A count that matters (tags no LGU will get,
-- a Google account sitting in the approval queue) is read out at the end.

with
want_tables(name) as (values
  ('lgus'), ('barangays'), ('profiles'), ('trees'), ('pending_trees'), ('permits'), ('account_codes'),
  ('activity_log'), ('species_profiles'), ('map_areas'), ('map_area_proposals'), ('map_layers'),
  ('lgu_climate'), ('office_profiles'), ('barangay_stats'), ('office_ai_settings'), ('inbox_messages'),
  ('news_posts'), ('residents')),
want_rls(name) as (values
  ('profiles'), ('trees'), ('pending_trees'), ('permits'), ('account_codes'), ('map_areas'),
  ('office_ai_settings'), ('inbox_messages'), ('news_posts'), ('residents')),
want_triggers(name) as (values
  ('guard_profile_changes'), ('zzz_apply_account_code'), ('route_pending_tree'), ('stamp_training'),
  ('guard_map_area'), ('guard_planting_request'), ('notify_planting_site'), ('notify_unknown_species'),
  ('stamp_permit_lgu'), ('stamp_news_post'), ('aaa_keep_residents_out'), ('zzzz_add_resident'),
  ('stamp_tag_sender'), ('trees_sync_barangay')),
want_restrictive(tbl, policy) as (values
  ('trees', 'only active accounts'), ('pending_trees', 'only active accounts'),
  ('permits', 'permits stay with their LGU'), ('permits', 'the public reads no permit'),
  ('profiles', 'training stays in training'), ('map_areas', 'requests stay with the offices')),
want_functions(name) as (values
  ('my_role'), ('my_lgu'), ('is_pgenro'), ('check_account_code'), ('issue_account_code'), ('set_lgu_hall'),
  ('can_see_tag'), ('can_manage_tag'), ('promote_pending_tree'), ('archive_permit'), ('decide_planting_request'),
  ('set_office_ai_key'), ('office_ai_key'), ('send_contact_message'), ('notify_offices'),
  ('nickname_problem'), ('set_resident_profile'), ('community_leaderboard'), ('community_counts')),
want_buckets(name) as (values ('area-documents'), ('map-layers'), ('office-logos'), ('news-photos')),
-- A count from a table or column that may not be there yet: null instead of an error.
n(label, value) as (values
  ('google_in_profiles', case when to_regclass('public.residents') is not null then
     (xpath('/row/n/text()', query_to_xml(
       'select count(*) n from public.profiles p where public.is_google_account(p.id)', false, true, '')))[1]::text end),
  ('not_onboarded', case when exists (select 1 from information_schema.columns
                                      where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarded_at') then
     (xpath('/row/n/text()', query_to_xml(
       'select count(*) n from public.profiles where role = ''lgu_admin'' and onboarded_at is null', false, true, '')))[1]::text end),
  ('permits_no_lgu', case when exists (select 1 from information_schema.columns
                                       where table_schema = 'public' and table_name = 'permits' and column_name = 'lgu_psgc') then
     (xpath('/row/n/text()', query_to_xml(
       'select count(*) n from public.permits where lgu_psgc is null', false, true, '')))[1]::text end),
  ('tags_no_lgu', (xpath('/row/n/text()', query_to_xml(
       'select count(*) n from public.pending_trees where lgu_psgc is null and status in (''pending'', ''dispatched'')', false, true, '')))[1]::text),
  ('residents', case when to_regclass('public.residents') is not null then
     (xpath('/row/n/text()', query_to_xml(
       'select count(*) || '' signed in, '' || count(consented_at) || '' joined'' n from public.residents', false, true, '')))[1]::text end))
select 'tables' as check,
       not exists (select 1 from want_tables w where to_regclass('public.' || w.name) is null) as ok,
       coalesce('missing: ' || (select string_agg(name, ', ') from want_tables w where to_regclass('public.' || w.name) is null), '') as detail
union all
select 'row level security on',
       not exists (select 1 from want_rls w join pg_class c on c.oid = to_regclass('public.' || w.name) where not c.relrowsecurity),
       coalesce('off on: ' || (select string_agg(w.name, ', ') from want_rls w join pg_class c on c.oid = to_regclass('public.' || w.name)
                               where not c.relrowsecurity), '')
union all
select 'triggers',
       not exists (select 1 from want_triggers w where not exists (select 1 from information_schema.triggers t where t.trigger_name = w.name)),
       coalesce('missing: ' || (select string_agg(w.name, ', ') from want_triggers w
                                where not exists (select 1 from information_schema.triggers t where t.trigger_name = w.name)), '')
union all
select 'restrictive rules',
       not exists (select 1 from want_restrictive w where not exists (
         select 1 from pg_policies p where p.tablename = w.tbl and p.policyname = w.policy and p.permissive = 'RESTRICTIVE')),
       coalesce('missing: ' || (select string_agg(w.tbl || ' "' || w.policy || '"', ', ') from want_restrictive w where not exists (
         select 1 from pg_policies p where p.tablename = w.tbl and p.policyname = w.policy and p.permissive = 'RESTRICTIVE')), '')
union all
select 'functions',
       not exists (select 1 from want_functions w where not exists (
         select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = w.name)),
       coalesce('missing: ' || (select string_agg(w.name, ', ') from want_functions w where not exists (
         select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = w.name)), '')
union all
select 'storage buckets, public',
       not exists (select 1 from want_buckets w where not exists (select 1 from storage.buckets b where b.id = w.name and b.public)),
       coalesce('missing or private: ' || (select string_agg(w.name, ', ') from want_buckets w
                                           where not exists (select 1 from storage.buckets b where b.id = w.name and b.public)), '')
union all
select 'no Google account in the approval queue',
       (select value from n where label = 'google_in_profiles') = '0',
       coalesce((select value from n where label = 'google_in_profiles') || ' found', 'community.sql not run')
union all
select 'READ: accounts', null,
       coalesce((select string_agg(role || ' ' || status || ' ' || k, ', ' order by role, status)
                 from (select role, coalesce(status, '?') status, count(*) k from public.profiles group by 1, 2) a), 'none')
union all
select 'READ: residents (Google)', null, coalesce((select value from n where label = 'residents'), 'community.sql not run')
union all
select 'READ: office accounts not yet set up', null, coalesce((select value from n where label = 'not_onboarded'), 'onboarding.sql not run')
union all
select 'READ: permits with no LGU (PGENRO only)', null, coalesce((select value from n where label = 'permits_no_lgu'), 'permits_fence.sql not run')
union all
select 'READ: open tags with no LGU (PGENRO only)', null, (select value from n where label = 'tags_no_lgu')
union all
select 'READ: halls pinned', null,
       (select count(hall_lat) || ' of ' || count(*) from public.lgus)
union all
select 'READ: trees with no barangay', null,
       (select count(*)::text from public.trees where barangay_psgc is null)
union all
select 'READ: trees at 0,0 (delete_unplaceable_tree.sql)', null,
       (select count(*)::text from public.trees where coalesce(latitude::float8, 0) = 0 and coalesce(longitude::float8, 0) = 0);
