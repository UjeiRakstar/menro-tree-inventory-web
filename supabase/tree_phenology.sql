-- Green Tag: remove the phenology columns that were never the right home.
--
-- WHAT HAPPENED
-- The public map's "Tree Details" tab shows what a tree is doing — leaves,
-- flowers, fruit. Nothing in public.trees appeared to record it, so this file
-- originally added three columns for the mobile app to fill in.
--
-- It turned out the mobile app had been recording phenology all along, into
-- public.phenology_records: one row per visit, with foliage_status,
-- flowering_status, fruiting_status, observed_at and observed_by. That is the
-- better design — a tree keeps a timeline instead of a single current state,
-- and phenology goes stale, so knowing when someone last looked matters. The
-- panel reads the newest row from that table now.
--
-- So the three columns are dead weight: nothing writes them, and leaving them
-- invites someone to start, which would split the same fact across two places.
-- This file drops them. The earlier version of it, which added them, is in the
-- git history if it is ever wanted back.
--
-- Running this twice is harmless. It does NOT touch public.phenology_records,
-- which holds the real observations, and it does not touch trees.source, which
-- marks crowdsourced trees and is added by supabase/species_profiles.sql.

alter table public.trees
  drop column if exists leaf_status,
  drop column if exists flower_status,
  drop column if exists fruit_status;

-- The CHECK constraints went with the columns they constrained; these lines
-- only matter if a column was dropped by hand earlier and a constraint stayed.
alter table public.trees drop constraint if exists trees_leaf_status_check;
alter table public.trees drop constraint if exists trees_flower_status_check;
alter table public.trees drop constraint if exists trees_fruit_status_check;

-- ---------------------------------------------------------------------------
-- Checking the result.
--
-- The first query should return no rows. The second shows the observations the
-- field app has synced so far — empty until an arborist records one and the
-- inventory sync pushes it.
-- ---------------------------------------------------------------------------
-- select column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'trees'
--   and column_name in ('leaf_status', 'flower_status', 'fruit_status');

-- select tree_id, foliage_status, flowering_status, fruiting_status, observed_at
-- from public.phenology_records
-- order by observed_at desc
-- limit 20;
