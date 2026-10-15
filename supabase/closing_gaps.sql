-- Green Tag: two gaps closed, found in the 15 October read-through.
--
-- Run once, whole, in the SQL editor, after every earlier file (it needs
-- tag_routing.sql, training_sandbox.sql and map_areas.sql). Safe to run again.
-- Ends in ONE query whose rows say whether each part took.
--
-- 1. Publishing a public tag checks whose tag it is.
--
--    promote_pending_tree() and reject_pending_tree() run as their owner, so
--    the routing rules on pending_trees (tag_routing.sql) do not apply inside
--    them. Anyone allowed to verify at all could publish ANY tag whose id they
--    knew — another LGU's, or one behind the training wall — and "adopt" any
--    tree as the published one. Not reachable from the apps' own screens, but
--    a hole all the same. They now ask the same questions the policies ask:
--      - the tag:  can_see_tag(), as for reading it, and the same side of the
--                  training wall as the caller;
--      - the tree being adopted: can_change_tree(), as for editing it — or,
--                  for the field officer the tag was dispatched to, a tree in
--                  the tag's own LGU — and the same side of the wall.
--
-- 2. Area documents are filed by LGU, so an office can clear out its own.
--
--    Uploads now go in a folder named after the office: the LGU's PSGC code,
--    or "pgenro". An office may upload into, and delete from, its own folder;
--    PGENRO may delete any. Deleting an area or replacing its PDF then removes
--    the old file instead of leaving it online.


-- ===========================================================================
-- 1. Publishing and turning down tags
-- ===========================================================================
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
  v_tree    public.trees%rowtype;
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

  -- A tag outside the caller's reach is reported exactly as one that does not
  -- exist: an id somebody guessed learns nothing.
  if not found
     or not public.can_see_tag(v_pending.lgu_psgc, v_pending.assigned_to)
     or v_pending.is_training is distinct from public.in_training() then
    raise exception 'Submission % does not exist', p_pending_id using errcode = 'P0002';
  end if;

  -- Already published: hand back the same tree rather than making another.
  if v_pending.published_tree_id is not null then
    return v_pending.published_tree_id;
  end if;

  if p_tree_id is not null then
    select * into v_tree from public.trees where id = p_tree_id for update;
    -- The tree must be one the caller may change — or, for the field officer
    -- sent to check this tag (possibly in another LGU), a tree in the tag's
    -- own LGU: the one they have just recorded for it.
    if not found
       or not (public.can_change_tree(v_tree.barangay_psgc, v_tree.assigned_to)
               or (v_pending.assigned_to is not null
                   and lower(v_pending.assigned_to) = public.my_email()
                   and public.lgu_of_barangay(v_tree.barangay_psgc) is not distinct from v_pending.lgu_psgc))
       or v_tree.is_training is distinct from public.in_training() then
      raise exception 'Tree % does not exist', p_tree_id using errcode = 'P0002';
    end if;
    update public.trees set source = 'crowdsource' where id = p_tree_id;
    v_tree_id := p_tree_id;
  else
    v_tree_id := gen_random_uuid()::text;
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

create or replace function public.reject_pending_tree(
  p_pending_id text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending public.pending_trees%rowtype;
begin
  if not public.can_verify_crowdsourced() then
    raise exception 'Not allowed to review crowdsourced submissions'
      using errcode = '42501';
  end if;

  select * into v_pending from public.pending_trees where id::text = p_pending_id for update;
  if not found
     or not public.can_see_tag(v_pending.lgu_psgc, v_pending.assigned_to)
     or v_pending.is_training is distinct from public.in_training() then
    raise exception 'Submission % does not exist', p_pending_id using errcode = 'P0002';
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


-- ===========================================================================
-- 2. Area documents, by office
-- ===========================================================================
-- The folder an office files into: its LGU's PSGC code, or 'pgenro'.
create or replace function public.my_document_folder()
returns text language sql stable security definer set search_path = public as $$
  select case public.my_role()
    when 'pgenro'    then 'pgenro'
    when 'lgu_admin' then public.my_lgu()::text
  end;
$$;

revoke all on function public.my_document_folder() from public;
grant execute on function public.my_document_folder() to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  execute 'drop policy if exists "offices upload area documents" on storage.objects';
  execute $p$create policy "offices upload area documents" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'area-documents'
                and (storage.foldername(name))[1] = public.my_document_folder())$p$;

  -- Removing a file needs reading it as well as deleting it. The documents
  -- are public already, through the bucket's public links.
  execute 'drop policy if exists "anyone reads area documents" on storage.objects';
  execute $p$create policy "anyone reads area documents" on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'area-documents')$p$;

  execute 'drop policy if exists "offices remove area documents" on storage.objects';
  execute $p$create policy "offices remove area documents" on storage.objects
    for delete to authenticated
    using (bucket_id = 'area-documents'
           and (public.is_pgenro() or (storage.foldername(name))[1] = public.my_document_folder()))$p$;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'publishing a tag checks whose it is' as check,
       position('can_see_tag' in pg_get_functiondef('public.promote_pending_tree(text, text)'::regprocedure)) > 0 as ok,
       '' as detail
union all
select 'turning one down does too',
       position('can_see_tag' in pg_get_functiondef('public.reject_pending_tree(text, text)'::regprocedure)) > 0,
       ''
union all
select 'documents are filed by office',
       case when to_regclass('storage.objects') is null then null
            else exists (select 1 from pg_policies where schemaname = 'storage'
                         and policyname = 'offices remove area documents') end,
       '';
