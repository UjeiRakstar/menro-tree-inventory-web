-- Green Tag: what the tree is doing right now — leaves, flowers, fruit.
--
-- SUPERSEDED — read this before running it.
--
-- The Green Tag mobile app already records phenology, and better: one row per
-- visit in public.phenology_records (foliage_status, flowering_status,
-- fruiting_status, observed_at, observed_by), so a tree keeps a timeline
-- instead of a single current state. That table is live, and the public map's
-- panel now reads the latest row from it.
--
-- The three columns below are not written by anything. They are left in place
-- because they are already applied and harmless, and the web app still accepts
-- them if a row happens to carry them. To be rid of them:
--
--   alter table public.trees
--     drop column if exists leaf_status,
--     drop column if exists flower_status,
--     drop column if exists fruit_status;
--
-- WHAT THIS IS FOR
-- The public map's "Tree Details" tab shows a tree's phenology beside its
-- height and DBH. Nothing in public.trees recorded it, so these three columns
-- are where the mobile app will write what the field officer observed.
--
-- They are nullable on purpose. Null means "not observed on this visit", which
-- is not the same as 'none' — 'none' is a real observation, that the tree is
-- carrying no flowers or no fruit at all. The panel draws nothing for either,
-- so a tree that is simply not in flower does not get an icon implying it is.
--
-- The web app reads these loosely: case and punctuation do not matter, and a
-- value it does not recognise is treated as not recorded rather than breaking
-- the panel. The constraints below are what the mobile app should write.

alter table public.trees
  add column if not exists leaf_status text,
  add column if not exists flower_status text,
  add column if not exists fruit_status text;

comment on column public.trees.leaf_status is
  'Leaf phenology: peak | color_change | shedding | budding. Null = not observed.';
comment on column public.trees.flower_status is
  'Flower phenology: none | budding | full_bloom | fading. Null = not observed.';
comment on column public.trees.fruit_status is
  'Fruit phenology: none | unripe | ripe | dispersing. Null = not observed.';

alter table public.trees drop constraint if exists trees_leaf_status_check;
alter table public.trees
  add constraint trees_leaf_status_check
  check (leaf_status is null or leaf_status in ('peak', 'color_change', 'shedding', 'budding'));

alter table public.trees drop constraint if exists trees_flower_status_check;
alter table public.trees
  add constraint trees_flower_status_check
  check (flower_status is null or flower_status in ('none', 'budding', 'full_bloom', 'fading'));

alter table public.trees drop constraint if exists trees_fruit_status_check;
alter table public.trees
  add constraint trees_fruit_status_check
  check (fruit_status is null or fruit_status in ('none', 'unripe', 'ripe', 'dispersing'));

-- ---------------------------------------------------------------------------
-- Something to look at before the mobile app writes any of this.
--
-- Deletes nothing and invents nothing permanent: it only fills in the three
-- columns for trees that have no observation yet, so the panel can be seen
-- working. Drop this block, or run the UPDATE at the bottom, once real
-- observations start arriving.
-- ---------------------------------------------------------------------------
-- update public.trees
-- set leaf_status   = 'peak',
--     flower_status = case when tree_category ilike 'fruit%' then 'full_bloom' else 'none' end,
--     fruit_status  = case when tree_category ilike 'fruit%' then 'unripe' else 'none' end
-- where leaf_status is null;

-- Clear the sample observations again:
-- update public.trees set leaf_status = null, flower_status = null, fruit_status = null;
