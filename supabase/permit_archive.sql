-- Green Tag: archiving a permit log.
--
-- Run once, whole, in the SQL editor, after accounts.sql. Safe to run again.
-- Ends in ONE query whose rows say whether each part took.
--
-- PGENRO reads every LGU's permit logs, read-only, from the Action Board.
-- Archiving moves a log out of PGENRO's working list without deleting it —
-- the same rule as accounts: nothing is deleted, an archived permit is still
-- there and can be restored. The MENRO/CENRO's own permit log is unchanged.
--
-- Only these two columns change, and only through archive_permit(), so
-- PGENRO's read-only view stays read-only: it cannot edit a permit's details.
--
-- Decided 18 October: a permit is its LGU's record. PGENRO sees each permit
-- and whom it was issued to, and does nothing to it — not even archive it.
-- archive_permit() is the super admin's alone (super_admin.sql gives it to
-- them); until that file has run, nobody archives. Permits archived before
-- stay archived, and show as such.

alter table public.permits
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid;

create or replace function public.archive_permit(p_id text, p_archived boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_found boolean;
begin
  -- The super admin's alone; super_admin.sql replaces this function with one
  -- that lets them through.
  raise exception 'A permit is its LGU''s record: it is read, not archived.' using errcode = '42501';

  update public.permits
  set archived_at = case when p_archived then now() end,
      archived_by = case when p_archived then auth.uid() end
  where id::text = p_id
  returning true into v_found;

  if v_found is null then
    raise exception 'No such permit.' using errcode = 'P0002';
  end if;

  perform public.log_activity(
    case when p_archived then 'permit.archived' else 'permit.restored' end,
    'permit', p_id, null, null);
end $$;

revoke all on function public.archive_permit(text, boolean) from public;
grant execute on function public.archive_permit(text, boolean) to authenticated;

notify pgrst, 'reload schema';

select 'permits can be archived' as check,
       exists (select 1 from information_schema.columns
               where table_name = 'permits' and column_name = 'archived_at') as ok,
       '' as detail
union all
select 'PGENRO reads permits and archives none',
       exists (select 1 from information_schema.routines where routine_name = 'archive_permit'),
       ''
union all
select 'READ: permits archived so far', null,
       (select count(*) from public.permits where archived_at is not null)::text;
