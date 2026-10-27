-- Green Tag: the City and Urban Biodiversity Index (27 October).
--
-- Run once, whole, in the SQL editor, after map_areas.sql, inbox.sql,
-- super_admin.sql and training_sandbox.sql (step 38 of PARKED.md). Safe to
-- run again. Ends in ONE query whose rows say whether each part took.
--
-- What the BMB lecture on the Singapore Index (Handbook, 2021) showed the
-- system was counting only roughly, and what it could not count at all:
--
--   1. An area's condition. Indicator 1 counts natural areas "not highly
--      disturbed", and restored and naturalised ones too: a land cover area
--      can now be marked natural, degraded, or restored. Indicator 7A
--      (habitat restoration) is the restored share of what was marked.
--   2. An event's partners. Indicator 24 counts the organisations a city
--      partners with, not partnership events: each event can name them.
--   3. The office's self-assessment. Most governance indicators — the LBSAP,
--      the budget, the agencies, the school curricula — are the office's to
--      say, a level on the Handbook's scale or a figure, with a note of the
--      evidence, one year at a time.
--
-- Who sees the self-assessment: the office its own, PGENRO every LGU's. Only
-- the office — or the super admin, working in it — changes it; a training
-- account cannot (keeps_office()).


-- ===========================================================================
-- 1. An area's condition
-- ===========================================================================
alter table public.map_areas add column if not exists condition text;

alter table public.map_areas drop constraint if exists map_areas_condition_check;
alter table public.map_areas add constraint map_areas_condition_check
  check (condition is null or (kind = 'land-cover' and condition in ('natural', 'degraded', 'restored')));

-- Approving a proposal applies its condition too: the same function as in
-- map_areas.sql, with the one column more.
create or replace function public.approve_area_proposal(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_prop public.map_area_proposals%rowtype;
  v_area public.map_areas%rowtype;
  v_new  public.map_areas%rowtype;
begin
  select * into v_prop from public.map_area_proposals where id = p_id for update;
  if v_prop.id is null then
    raise exception 'No such proposal.' using errcode = 'P0002';
  end if;
  select * into v_area from public.map_areas where id = v_prop.area_id for update;
  if not public.is_lgu_admin_of(v_area.lgu_psgc) then
    raise exception 'Only this LGU''s MENRO / CENRO can approve a change to its area.' using errcode = '42501';
  end if;
  if v_prop.status <> 'pending' then
    raise exception 'That proposal has already been %.', v_prop.status using errcode = 'P0001';
  end if;

  v_new := jsonb_populate_record(v_area, v_prop.changes);

  update public.map_areas set
    kind = v_new.kind, name = v_new.name, geometry = v_new.geometry,
    area_m2 = v_new.area_m2, perimeter_m = v_new.perimeter_m,
    municipality = v_new.municipality, barangay = v_new.barangay, barangay_psgc = v_new.barangay_psgc,
    cover_class = v_new.cover_class, suggested_class = v_new.suggested_class,
    suggestion_reason = v_new.suggestion_reason, trees_inside = v_new.trees_inside,
    condition = v_new.condition,
    designation = v_new.designation, doc_type = v_new.doc_type, doc_number = v_new.doc_number,
    doc_title = v_new.doc_title, doc_url = v_new.doc_url,
    planting_status = v_new.planting_status, planting_window = v_new.planting_window,
    spacing_m = v_new.spacing_m, access_note = v_new.access_note, contact = v_new.contact,
    recommended = v_new.recommended, notes = v_new.notes,
    updated_by = auth.uid(), updated_at = now()
  where id = v_area.id;

  update public.map_area_proposals
  set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
  where id = p_id;

  perform public.log_activity('area.proposal_approved', 'map_area', v_area.id::text, v_area.lgu_psgc,
    jsonb_build_object('name', v_new.name, 'proposal', p_id));
end $$;


-- ===========================================================================
-- 2. An event's partners
-- ===========================================================================
alter table public.news_posts add column if not exists partners text[] not null default '{}';

alter table public.news_posts drop constraint if exists news_posts_partners_check;
alter table public.news_posts add constraint news_posts_partners_check
  check (cardinality(partners) <= 40);


-- ===========================================================================
-- 3. The office's self-assessment
-- ===========================================================================
create table if not exists public.cbi_self_assessments (
  lgu_psgc    bigint not null references public.lgus (psgc),
  year        smallint not null,
  indicator   smallint not null,
  -- A level on the Handbook's scale (0–4), or a figure scored on its bands.
  points      smallint,
  value       numeric,
  note        text,
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  primary key (lgu_psgc, year, indicator)
);

alter table public.cbi_self_assessments drop constraint if exists cbi_self_assessments_check;
alter table public.cbi_self_assessments add constraint cbi_self_assessments_check check (
  indicator between 1 and 28
  and year between 2000 and 2100
  and (points is null or points between 0 and 4)
  and (points is not null or value is not null)
  and char_length(coalesce(note, '')) <= 2000
);

-- Who saved it and when are the database's to say.
create or replace function public.stamp_cbi_self_assessment()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists stamp_cbi_self_assessment on public.cbi_self_assessments;
create trigger stamp_cbi_self_assessment before insert or update on public.cbi_self_assessments
  for each row execute function public.stamp_cbi_self_assessment();

alter table public.cbi_self_assessments enable row level security;

drop policy if exists "an office reads its own, PGENRO all" on public.cbi_self_assessments;
create policy "an office reads its own, PGENRO all" on public.cbi_self_assessments
  for select to authenticated
  using (public.is_pgenro() or public.is_lgu_admin_of(lgu_psgc) or public.keeps_office(lgu_psgc::text));

drop policy if exists "the office keeps its own" on public.cbi_self_assessments;
create policy "the office keeps its own" on public.cbi_self_assessments
  for all to authenticated
  using (public.keeps_office(lgu_psgc::text))
  with check (public.keeps_office(lgu_psgc::text));

revoke all on public.cbi_self_assessments from anon, authenticated;
grant select, insert, update, delete on public.cbi_self_assessments to authenticated;

notify pgrst, 'reload schema';


-- ===========================================================================
-- Did it take? Self-contained: the SQL editor runs this last query alone.
-- ===========================================================================
select 'an area can be marked natural, degraded or restored' as check,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'map_areas' and column_name = 'condition')
       and position('condition = v_new.condition' in pg_get_functiondef('public.approve_area_proposal(uuid, text)'::regprocedure)) > 0 as ok,
       '' as detail
union all
select 'an event names its partners',
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'news_posts' and column_name = 'partners'),
       ''
union all
select 'the office keeps its own self-assessment, PGENRO reads all',
       to_regclass('public.cbi_self_assessments') is not null
       and exists (select 1 from pg_policies where tablename = 'cbi_self_assessments' and policyname = 'the office keeps its own')
       and exists (select 1 from pg_policies where tablename = 'cbi_self_assessments' and policyname = 'an office reads its own, PGENRO all'),
       ''
union all
select 'READ: self-assessments', null,
       (select count(distinct (lgu_psgc, year))::text || ' LGU-years, ' || count(*)::text || ' indicators'
        from public.cbi_self_assessments);
