-- Green Tag: each LGU's Local Climate Change Action Plan, checked by PGENRO
-- (21 October).
--
-- Run once, whole, in the SQL editor, after accounts.sql, training_sandbox.sql
-- and inbox.sql (step 29 of PARKED.md). Safe to run again. Ends in ONE query
-- whose rows say whether each part took.
--
-- An LGU's office files its LCCAP or eLCCAP — the plan, the years it covers,
-- and the Climate Change Commission's Certificate of Receipt if it has one —
-- from Settings or its first sign-in. PGENRO (its CCAMD) checks it, and
-- verifies it or returns it with a note; each side is told in its Inbox.
--
-- Verified, the LGU shows two badges where its city or municipality is
-- chosen: "LCCAP on file", while the plan's years run, and "Submitted to the
-- CCC" when the certificate came with it — a Certificate of Receipt says the
-- Commission received the plan, not that it approved it, and the badge says
-- only that. The biodiversity report's CBI table counts it among the LGU's
-- policies and plans.
--
-- Who sees what: the office its own submissions; PGENRO every one; the public
-- the verified ones, with their documents. The files are in a public bucket
-- under names nobody can guess, filed by LGU.


-- ===========================================================================
-- 1. The submissions
-- ===========================================================================
create table if not exists public.lccap_submissions (
  id            uuid primary key default gen_random_uuid(),
  lgu_psgc      bigint not null,
  plan_kind     text not null default 'lccap',
  term_start    smallint not null,
  term_end      smallint not null,
  plan_url      text not null,
  receipt_url   text,
  status        text not null default 'pending',
  review_note   text,
  submitted_by  uuid,
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid,
  reviewed_at   timestamptz
);
create index if not exists lccap_submissions_lgu_idx on public.lccap_submissions (lgu_psgc, submitted_at desc);

alter table public.lccap_submissions drop constraint if exists lccap_submissions_check;
alter table public.lccap_submissions add constraint lccap_submissions_check check (
  plan_kind in ('lccap', 'elccap')
  and status in ('pending', 'verified', 'returned')
  and term_start between 2000 and 2100
  and term_end between term_start and term_start + 15
);

-- Filed by the office, for its own LGU, waiting for PGENRO: whatever the page
-- sent. The review is PGENRO's, through review_lccap() only.
create or replace function public.stamp_lccap_submission()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(public.in_training(), false) then
      raise exception 'A training account files no plan for the real office.' using errcode = '42501';
    end if;
    if not public.is_lgu_admin_of(new.lgu_psgc) then
      raise exception 'An office files its own LGU''s plan.' using errcode = '42501';
    end if;
    new.submitted_by := auth.uid();
    new.submitted_at := now();
    new.status := 'pending';
    new.review_note := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    raise exception 'A filed plan is not changed: file a new one.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists stamp_lccap_submission on public.lccap_submissions;
create trigger stamp_lccap_submission before insert or update on public.lccap_submissions
  for each row execute function public.stamp_lccap_submission();

alter table public.lccap_submissions enable row level security;

drop policy if exists "the public sees verified plans" on public.lccap_submissions;
create policy "the public sees verified plans" on public.lccap_submissions
  for select to anon, authenticated using (status = 'verified');

drop policy if exists "an office sees its own plans, PGENRO all" on public.lccap_submissions;
create policy "an office sees its own plans, PGENRO all" on public.lccap_submissions
  for select to authenticated
  using (public.is_pgenro() or public.is_lgu_admin_of(lgu_psgc));

drop policy if exists "an office files its own plan" on public.lccap_submissions;
create policy "an office files its own plan" on public.lccap_submissions
  for insert to authenticated with check (public.is_lgu_admin_of(lgu_psgc));

drop policy if exists "an office withdraws a plan not yet checked" on public.lccap_submissions;
create policy "an office withdraws a plan not yet checked" on public.lccap_submissions
  for delete to authenticated using (status = 'pending' and public.is_lgu_admin_of(lgu_psgc));

revoke all on public.lccap_submissions from anon, authenticated;
grant select on public.lccap_submissions to anon, authenticated;
grant insert, delete on public.lccap_submissions to authenticated;


-- ===========================================================================
-- 2. PGENRO checks it, and each side is told
-- ===========================================================================
create or replace function public.review_lccap(p_id uuid, p_verified boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.lccap_submissions%rowtype;
begin
  if not (public.is_pgenro() and public.is_active_account()) then
    raise exception 'PGENRO checks the plans.' using errcode = '42501';
  end if;
  if not p_verified and length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say why it is returned, so the office can put it right.' using errcode = '22023';
  end if;
  -- The trigger refuses an update from the API; this is the definer's.
  update public.lccap_submissions
  set status = case when p_verified then 'verified' else 'returned' end,
      review_note = nullif(trim(coalesce(p_note, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_id
  returning * into v_row;
  if not found then
    raise exception 'No such plan.' using errcode = 'P0002';
  end if;

  if to_regclass('public.inbox_messages') is not null then
    insert into public.inbox_messages (kind, office, subject, body, link, source_id)
    values ('notice', v_row.lgu_psgc::text,
            case when p_verified then 'Your climate plan is verified' else 'Your climate plan was returned' end,
            case when p_verified
              then 'PGENRO verified your ' || upper(v_row.plan_kind) || ' for ' || v_row.term_start || '–' || v_row.term_end
                   || '. Its badges now show where your city or municipality is chosen.'
              else 'PGENRO returned your ' || upper(v_row.plan_kind) || ' for ' || v_row.term_start || '–' || v_row.term_end
                   || ': ' || v_row.review_note || ' File it again from Settings once it is put right.'
            end,
            jsonb_build_object('kind', 'lccap', 'id', v_row.id),
            v_row.id::text);
  end if;
end $$;
revoke all on function public.review_lccap(uuid, boolean, text) from public;
grant execute on function public.review_lccap(uuid, boolean, text) to authenticated;

-- A new submission reaches PGENRO's Inbox.
create or replace function public.notify_lccap_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text := coalesce((select label from public.lgus where psgc = new.lgu_psgc), new.lgu_psgc::text);
begin
  if to_regclass('public.inbox_messages') is not null then
    insert into public.inbox_messages (kind, office, subject, body, link, source_id)
    values ('notice', 'pgenro',
            'Climate plan to check: ' || v_label,
            v_label || ' filed its ' || upper(new.plan_kind) || ' for ' || new.term_start || '–' || new.term_end
              || case when new.receipt_url is not null then ', with the CCC''s Certificate of Receipt' else ', without a CCC receipt' end
              || '. Check it under Climate plans.',
            jsonb_build_object('kind', 'lccap', 'id', new.id),
            new.id::text);
  end if;
  return null;
end $$;

drop trigger if exists notify_lccap_submission on public.lccap_submissions;
create trigger notify_lccap_submission after insert on public.lccap_submissions
  for each row execute function public.notify_lccap_submission();


-- ===========================================================================
-- 3. The files: the plan and the certificate, filed by LGU
-- ===========================================================================
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('lccap-documents', 'lccap-documents', true, 52428800, array['application/pdf', 'image/png', 'image/jpeg'])
  on conflict (id) do update
    set public = true, file_size_limit = 52428800, allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg'];

  execute 'drop policy if exists "offices upload their climate plans" on storage.objects';
  execute $p$create policy "offices upload their climate plans" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'lccap-documents'
                and (storage.foldername(name))[1] ~ '^[0-9]{9}$'
                and public.is_lgu_admin_of(((storage.foldername(name))[1])::bigint)
                and not coalesce(public.in_training(), false))$p$;
  execute 'drop policy if exists "anyone reads climate plans" on storage.objects';
  execute $p$create policy "anyone reads climate plans" on storage.objects
    for select to anon, authenticated using (bucket_id = 'lccap-documents')$p$;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 4. Check
-- ===========================================================================
select 'climate plans are filed' as check,
       to_regclass('public.lccap_submissions') is not null as ok,
       '' as detail
union all
select 'an office files its own, PGENRO checks them',
       exists (select 1 from pg_policies where tablename = 'lccap_submissions' and policyname = 'an office files its own plan')
       and to_regprocedure('public.review_lccap(uuid, boolean, text)') is not null,
       ''
union all
select 'the public sees only the verified',
       exists (select 1 from pg_policies where tablename = 'lccap_submissions' and policyname = 'the public sees verified plans'),
       ''
union all
select 'READ: climate plans', null,
       (select count(*) filter (where status = 'verified') || ' verified, '
             || count(*) filter (where status = 'pending') || ' waiting, '
             || count(*) filter (where status = 'returned') || ' returned'
        from public.lccap_submissions);
