-- Green Tag: the last link in the crowdsourcing chain.
--
-- WHAT WAS MISSING
-- A resident tags a tree from the mobile view and it lands in
-- public.pending_trees. MENRO dispatches an arborist, which sets that row's
-- status to 'dispatched'. And there it stopped: nothing ever created a row in
-- public.trees, so a verified community tag could never appear on the public
-- map. The web admin only updated the pending row, and the mobile app does not
-- read public.pending_trees at all.
--
-- This file adds the step both sides were missing, as one function so the two
-- clients cannot drift apart: promote_pending_tree() publishes a submission and
-- marks it verified in the same transaction.
--
-- Run AFTER supabase/species_profiles.sql — it adds public.trees.source, which
-- is what tells a crowdsourced tree from a field-gathered one.

-- ---------------------------------------------------------------------------
-- 1. The life of a submission.
--
--   pending   a resident submitted it, nobody has looked yet
--   dispatched an arborist is going out to verify it on the ground
--   verified  it was confirmed and published; published_tree_id says where
--   rejected  it was not a tree, or not where it said it was
--
-- Rejected submissions are kept rather than deleted. What the public sent in is
-- a record of its own, and a deleted row cannot tell anyone why it went.
-- ---------------------------------------------------------------------------
alter table public.pending_trees
  add column if not exists published_tree_id text,
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users (id),
  add column if not exists rejection_reason text;

comment on column public.pending_trees.published_tree_id is
  'public.trees.id this submission became, once verified. Null until then.';

alter table public.pending_trees drop constraint if exists pending_trees_status_check;
alter table public.pending_trees
  add constraint pending_trees_status_check
  check (status is null or status in ('pending', 'dispatched', 'verified', 'rejected'));

-- Link the two tables, if public.trees.id can be referenced. It is the key the
-- mobile app upserts on, so this normally succeeds; a NOTICE rather than a
-- failure keeps the rest of this file runnable either way.
do $$
begin
  alter table public.pending_trees
    add constraint pending_trees_published_tree_fk
    foreign key (published_tree_id) references public.trees (id) on delete set null;
exception
  when duplicate_object then null;
  when others then
    raise notice 'Could not link pending_trees.published_tree_id to trees.id: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1b. Check the columns this file is about to depend on.
--
-- A PL/pgSQL body is not checked against the schema until it runs, so a column
-- that is not there fails in the field, in front of an arborist, rather than
-- here. This says so now instead.
--
-- Note the quoted names: public.trees was created by the mobile app's upsert,
-- so the photo and date columns are camelCase and have to be written exactly
-- as they are, "imageUrl" and "dateCaptured", not imageurl.
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text[] := '{}';
  v_column text;
begin
  foreach v_column in array array['id', 'species', 'barangay', 'latitude', 'longitude',
                                  'imageUrl', 'leaves_url', 'bark_url', 'fruits_url',
                                  'dateCaptured', 'source']
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'trees' and column_name = v_column
    ) then
      v_missing := v_missing || v_column;
    end if;
  end loop;

  if 'source' = any (v_missing) then
    raise exception 'public.trees has no "source" column. Run supabase/species_profiles.sql first.';
  end if;

  if array_length(v_missing, 1) > 0 then
    raise exception 'public.trees is missing %. promote_pending_tree() would fail the first time an arborist used it, so it is not being created.', v_missing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Who may publish a submission.
--
-- Verification happens in the field, so the arborists doing it must be allowed,
-- alongside the MENRO and PGENRO staff accounts. An arborist who has not been
-- approved yet is not one.
-- ---------------------------------------------------------------------------
create or replace function public.can_verify_crowdsourced()
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
      and (role in ('admin', 'pgenro') or is_approved = true)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Publish a verified submission.
--
-- Two ways in, because verification can happen either way round:
--
--   promote_pending_tree(id)            the submission's own details become the
--                                       tree — MENRO publishing from the web
--   promote_pending_tree(id, tree_id)   the arborist already recorded the tree
--                                       in the mobile app with its full
--                                       measurements; this adopts that row
--
-- Either way the tree ends up marked source = 'crowdsource', and the submission
-- ends up 'verified' pointing at it. Calling it twice returns the same tree
-- instead of publishing a second one, so a retry after a dropped connection is
-- harmless.
--
-- p_pending_id is text so this does not care whether pending_trees.id is a
-- uuid, a bigint or a string.
-- ---------------------------------------------------------------------------
create or replace function public.promote_pending_tree(
  p_pending_id text,
  p_tree_id text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending public.pending_trees%rowtype;
  v_tree_id text;
begin
  if not public.can_verify_crowdsourced() then
    raise exception 'Not allowed to publish crowdsourced submissions'
      using errcode = '42501';
  end if;

  select * into v_pending
  from public.pending_trees
  where id::text = p_pending_id
  for update;

  if not found then
    raise exception 'Submission % does not exist', p_pending_id using errcode = 'P0002';
  end if;

  -- Already published: hand back the same tree rather than making another.
  if v_pending.published_tree_id is not null then
    return v_pending.published_tree_id;
  end if;

  if p_tree_id is not null then
    update public.trees set source = 'crowdsource' where id = p_tree_id;
    if not found then
      raise exception 'Tree % does not exist', p_tree_id using errcode = 'P0002';
    end if;
    v_tree_id := p_tree_id;
  else
    v_tree_id := gen_random_uuid()::text;
    -- "imageUrl" and "dateCaptured" are quoted because that is how the mobile
    -- app's upsert created them; unquoted, Postgres would fold them to
    -- imageurl and datecaptured and not find the columns. The submission's
    -- photo_url is the tree's main photo.
    insert into public.trees (
      id, species, barangay, latitude, longitude,
      "imageUrl", leaves_url, bark_url, fruits_url,
      source, "dateCaptured"
    )
    values (
      v_tree_id, v_pending.species, v_pending.barangay, v_pending.latitude, v_pending.longitude,
      v_pending.photo_url, v_pending.leaves_url, v_pending.bark_url, v_pending.fruits_url,
      'crowdsource', coalesce(v_pending.submitted_at, now())
    );
  end if;

  update public.pending_trees
  set status = 'verified',
      published_tree_id = v_tree_id,
      verified_at = now(),
      verified_by = auth.uid()
  where id::text = p_pending_id;

  return v_tree_id;
end;
$$;

revoke execute on function public.promote_pending_tree(text, text) from anon;
grant execute on function public.promote_pending_tree(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Turning a submission down, without losing it.
-- ---------------------------------------------------------------------------
create or replace function public.reject_pending_tree(
  p_pending_id text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_verify_crowdsourced() then
    raise exception 'Not allowed to review crowdsourced submissions'
      using errcode = '42501';
  end if;

  update public.pending_trees
  set status = 'rejected',
      rejection_reason = p_reason,
      verified_at = now(),
      verified_by = auth.uid()
  where id::text = p_pending_id
    and published_tree_id is null;
end;
$$;

revoke execute on function public.reject_pending_tree(text, text) from anon;
grant execute on function public.reject_pending_tree(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. What the mobile app has to do.
--
-- The Green Tag mobile app does not read public.pending_trees today, so an
-- arborist dispatched to verify a submission has no way to see it. Two changes
-- close the loop from that side:
--
--   a. List the submissions assigned to the signed-in arborist:
--        select * from pending_trees
--        where status = 'dispatched' and assigned_to = <their email>
--
--   b. When the arborist finishes recording the tree, call this instead of
--      leaving the submission behind:
--        supabase.rpc('promote_pending_tree', {
--          'p_pending_id': pending.id.toString(),
--          'p_tree_id': justSavedTree.id,     // the row the app upserted
--        });
--
-- Until (a) and (b) ship, MENRO can publish a verified submission from the web
-- admin, which calls the same function with no p_tree_id.
-- ---------------------------------------------------------------------------
