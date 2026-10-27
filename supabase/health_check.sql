-- Green Tag: is everything in? A health check of the live database.
--
-- READ-ONLY. It changes nothing; run it any time, as often as you like, in
-- the SQL editor. One query: each row says whether a part is there (ok =
-- true), missing (ok = false, with what is missing in the detail), or is a
-- figure to read (ok = null).
--
-- It looks for what steps 1–38 of PARKED.md make: tables, the columns the
-- later steps add, the rules on who reads what, the triggers that stamp and
-- route, the functions the pages call, and the storage buckets. A count that
-- matters (tags no LGU will get, a Google account sitting in the approval
-- queue, a climate plan waiting) is read out at the end.

with
want_tables(name) as (values
  ('lgus'), ('barangays'), ('profiles'), ('trees'), ('pending_trees'), ('permits'), ('account_codes'),
  ('activity_log'), ('species_profiles'), ('map_areas'), ('map_area_proposals'), ('map_layers'),
  ('lgu_climate'), ('office_profiles'), ('barangay_stats'), ('office_ai_settings'), ('inbox_messages'),
  ('news_posts'), ('residents'), ('data_requests'), ('lccap_submissions'), ('satellite_settings'),
  ('satellite_snapshots'), ('species_photo_choices')),
-- Columns later steps add to tables made earlier (steps 22, 26, 28, 31, 32).
want_columns(tbl, col) as (values
  ('profiles', 'is_super_admin'), ('species_profiles', 'wood_density'), ('species_profiles', 'wood_density_source'),
  ('news_posts', 'event_kind'), ('news_posts', 'cbi_credit'), ('news_posts', 'event_end_date'), ('news_posts', 'lgu_psgc'),
  ('news_posts', 'venue_lat'), ('news_posts', 'venue_lng'), ('news_posts', 'map_area_id'),
  ('news_posts', 'office_post'), ('news_posts', 'forwarded_at'), ('satellite_settings', 'auto'),
  ('satellite_snapshots', 'by_schedule'), ('trees', 'captured_by'), ('trees', 'archived_at')),
want_rls(name) as (values
  ('profiles'), ('trees'), ('pending_trees'), ('permits'), ('account_codes'), ('map_areas'),
  ('office_ai_settings'), ('inbox_messages'), ('news_posts'), ('residents'), ('data_requests'),
  ('lccap_submissions'), ('satellite_settings'), ('satellite_snapshots'), ('species_photo_choices')),
want_triggers(name) as (values
  ('guard_profile_changes'), ('zzz_apply_account_code'), ('route_pending_tree'), ('stamp_training'),
  ('guard_map_area'), ('guard_planting_request'), ('notify_planting_site'), ('notify_unknown_species'),
  ('stamp_permit_lgu'), ('stamp_news_post'), ('aaa_keep_residents_out'), ('zzzz_add_resident'),
  ('stamp_tag_sender'), ('trees_sync_barangay'), ('send_news_to_offices'), ('stamp_lccap_submission'),
  ('notify_lccap_submission'), ('stamp_satellite_settings'), ('stamp_satellite_snapshot'),
  ('stamp_tree_capture'), ('keep_tree_archive'), ('stamp_species_photo_choice')),
want_restrictive(tbl, policy) as (values
  ('trees', 'only active accounts'), ('pending_trees', 'only active accounts'),
  ('permits', 'permits stay with their LGU'), ('permits', 'the public reads no permit'),
  ('profiles', 'training stays in training'), ('map_areas', 'requests stay with the offices'),
  ('satellite_settings', 'only active accounts'), ('satellite_snapshots', 'only active accounts'),
  ('trees', 'archived trees are out of the inventory')),
-- Rules that let someone in (step 31: a MENRO / CENRO's own events).
want_policies(tbl, policy) as (values
  ('news_posts', 'an office posts its own events'), ('satellite_settings', 'pgenro keeps the satellite settings'),
  ('species_photo_choices', 'pgenro chooses the photos'), ('profiles', 'a training pgenro reads the training accounts')),
want_functions(name) as (values
  ('my_role'), ('my_lgu'), ('is_pgenro'), ('check_account_code'), ('issue_account_code'), ('set_lgu_hall'),
  ('can_see_tag'), ('can_manage_tag'), ('promote_pending_tree'), ('archive_permit'), ('decide_planting_request'),
  ('set_office_ai_key'), ('office_ai_key'), ('send_contact_message'), ('notify_offices'),
  ('nickname_problem'), ('set_resident_profile'), ('community_leaderboard'), ('community_counts'),
  ('publish_due_news'), ('deliver_news_post'), ('is_training_account'), ('record_reply'), ('mark_my_replies_read'),
  ('delete_my_account'), ('clear_office_ai_key'), ('log_data_request'), ('review_lccap'), ('is_super_admin'),
  ('keeps_office'), ('forward_news_post'), ('archive_tree'), ('archived_trees'), ('same_side_of_the_wall'),
  ('sees_as_pgenro')),
want_buckets(name) as (values ('area-documents'), ('map-layers'), ('office-logos'), ('news-photos'),
  ('lccap-documents'), ('satellite-tiles')),
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
       'select count(*) || '' signed in, '' || count(consented_at) || '' joined'' n from public.residents', false, true, '')))[1]::text end),
  ('super_admins', case when exists (select 1 from information_schema.columns
                                     where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_super_admin') then
     (xpath('/row/n/text()', query_to_xml(
       'select count(*) n from public.profiles where is_super_admin', false, true, '')))[1]::text end),
  ('plans', case when to_regclass('public.lccap_submissions') is not null then
     (xpath('/row/n/text()', query_to_xml(
       'select count(*) filter (where status = ''pending'') || '' waiting, '' || count(*) filter (where status = ''verified'') || '' verified'' n from public.lccap_submissions',
       false, true, '')))[1]::text end),
  ('data_requests', case when to_regclass('public.data_requests') is not null then
     (xpath('/row/n/text()', query_to_xml('select count(*) n from public.data_requests', false, true, '')))[1]::text end),
  ('snapshot', case when to_regclass('public.satellite_snapshots') is not null then
     (xpath('/row/n/text()', query_to_xml(
       'select coalesce(max(''imagery to '' || imagery_to || '', taken '' || taken_at::date || '', '' || tile_count || '' tiles'') filter (where status = ''live''), ''none yet'') n from public.satellite_snapshots',
       false, true, '')))[1]::text end))
select 'tables' as check,
       not exists (select 1 from want_tables w where to_regclass('public.' || w.name) is null) as ok,
       coalesce('missing: ' || (select string_agg(name, ', ') from want_tables w where to_regclass('public.' || w.name) is null), '') as detail
union all
select 'columns the later steps add',
       not exists (select 1 from want_columns w where not exists (select 1 from information_schema.columns c
                   where c.table_schema = 'public' and c.table_name = w.tbl and c.column_name = w.col)),
       coalesce('missing: ' || (select string_agg(w.tbl || '.' || w.col, ', ') from want_columns w where not exists (
                 select 1 from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = w.tbl and c.column_name = w.col)), '')
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
select 'rules that let someone in',
       not exists (select 1 from want_policies w where not exists (
         select 1 from pg_policies p where p.tablename = w.tbl and p.policyname = w.policy)),
       coalesce('missing: ' || (select string_agg(w.tbl || ' "' || w.policy || '"', ', ') from want_policies w where not exists (
         select 1 from pg_policies p where p.tablename = w.tbl and p.policyname = w.policy)), '')
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
select 'a training account does not act as PGENRO (step 35)',
       coalesce(pg_get_functiondef(to_regprocedure('public.is_pgenro()')) like '%is_training%', false),
       case when coalesce(pg_get_functiondef(to_regprocedure('public.is_pgenro()')) like '%is_training%', false)
            then '' else 'pgenro_training.sql not run' end
union all
select 'an area can be a bamboo stand (step 36)',
       exists (select 1 from pg_constraint where conname = 'map_areas_cover_check'
               and pg_get_constraintdef(oid) like '%bamboo-stand%'),
       case when exists (select 1 from pg_constraint where conname = 'map_areas_cover_check'
                         and pg_get_constraintdef(oid) like '%bamboo-stand%')
            then '' else 'bamboo_stands.sql not run' end
union all
select 'the odd columns of trees are gone (step 37)',
       not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'trees'
                   and column_name in ('trees', 'height_class', 'is_tagged')),
       coalesce('still there: ' || (select string_agg(column_name::text, ', ' order by column_name) from information_schema.columns
                                    where table_schema = 'public' and table_name = 'trees'
                                      and column_name in ('trees', 'height_class', 'is_tagged'))
                || ' — tidy_trees.sql not run, or it kept them (its check says why)', '')
union all
select 'the City and Urban Biodiversity Index (step 38)',
       to_regclass('public.cbi_self_assessments') is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'map_areas' and column_name = 'condition')
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'news_posts' and column_name = 'partners'),
       case when to_regclass('public.cbi_self_assessments') is not null
                 and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'map_areas' and column_name = 'condition')
                 and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'news_posts' and column_name = 'partners')
            then '' else 'cbi_ubi.sql not run' end
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
select 'READ: super admins (step 22 / 27)', null, coalesce((select value from n where label = 'super_admins'), 'super_admin.sql not run')
union all
select 'READ: climate plans (step 29)', null, coalesce((select value from n where label = 'plans'), 'lccap.sql not run')
union all
select 'READ: data requests kept (step 25)', null, coalesce((select value from n where label = 'data_requests'), 'data_requests.sql not run')
union all
select 'READ: satellite snapshot on the maps (step 30)', null, coalesce((select value from n where label = 'snapshot'), 'satellite.sql not run')
union all
select 'READ: scheduled news sent by', null,
       case when exists (select 1 from pg_extension where extname = 'pg_cron')
            then 'pg_cron, every 5 minutes' else 'the pages as they load (pg_cron is off)' end
union all
select 'READ: trees at 0,0 (delete_unplaceable_tree.sql)', null,
       (select count(*)::text from public.trees where coalesce(latitude::float8, 0) = 0 and coalesce(longitude::float8, 0) = 0);
