-- Green Tag: each office's inbox — notices, News & Events, and the public's
-- messages (Round B, 18 October).
--
-- Run once, whole, in the SQL editor, after accounts.sql, closing_gaps.sql,
-- species_profiles.sql, map_areas.sql and planting_requests.sql (step 17 of
-- PARKED.md). Safe to run again. Ends in ONE query whose rows say whether each
-- part took.
--
-- ===========================================================================
-- WHAT IS IN AN INBOX
-- ===========================================================================
-- One inbox per office — PGENRO's, and each LGU's MENRO / CENRO, shared by
-- that office's accounts — keyed the way office_profiles is: 'pgenro', or the
-- LGU's PSGC code as text.
--
--   notice    PGENRO set a tree planting site, or approved an office's
--             request: every MENRO / CENRO is told, with View on map.
--   news      PGENRO posted News & Events: a newsletter to every office.
--   rise      a tree was saved under a species the RISE library has no
--             profile for: PGENRO is told, once per species.
--   contact   the public's contact form, to the office the visitor chose.
--
-- Nobody writes a message directly. Notices and news come from triggers, the
-- contact form through send_contact_message(); an office only reads its own,
-- marks them read or archived, and deletes them.
--
-- A message from the public carries the sender's name, email, address and
-- affiliation. Only the office it was sent to can read it.


-- ===========================================================================
-- 1. The messages
-- ===========================================================================
create table if not exists public.inbox_messages (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null,
  office             text not null,
  subject            text not null,
  body               text not null default '',
  link               jsonb,
  source_id          text,
  sender_name        text,
  sender_email       text,
  sender_address     text,
  sender_affiliation text,
  read_at            timestamptz,
  archived_at        timestamptz,
  created_at         timestamptz not null default now()
);

alter table public.inbox_messages drop constraint if exists inbox_messages_kind_check;
alter table public.inbox_messages add constraint inbox_messages_kind_check
  check (kind in ('notice', 'news', 'rise', 'contact'));

create index if not exists inbox_messages_office_idx on public.inbox_messages (office, created_at desc);

alter table public.inbox_messages enable row level security;

drop policy if exists "an office reads its own inbox" on public.inbox_messages;
create policy "an office reads its own inbox" on public.inbox_messages
  for select to authenticated
  using (public.is_active_account() and office = public.my_document_folder());

drop policy if exists "an office files its own messages" on public.inbox_messages;
create policy "an office files its own messages" on public.inbox_messages
  for update to authenticated
  using (public.is_active_account() and office = public.my_document_folder())
  with check (public.is_active_account() and office = public.my_document_folder());

drop policy if exists "an office deletes its own messages" on public.inbox_messages;
create policy "an office deletes its own messages" on public.inbox_messages
  for delete to authenticated
  using (public.is_active_account() and office = public.my_document_folder());

-- Read and archived are all an office changes; what was sent stays as sent.
revoke insert, update on public.inbox_messages from anon, authenticated;
grant select, delete on public.inbox_messages to authenticated;
grant update (read_at, archived_at) on public.inbox_messages to authenticated;

-- Every MENRO / CENRO inbox at once: one row per LGU, so an office made later
-- finds the notices sent before it.
create or replace function public.notify_offices(p_kind text, p_subject text, p_body text, p_link jsonb, p_source text)
returns void language sql security definer set search_path = public as $$
  insert into public.inbox_messages (kind, office, subject, body, link, source_id)
  select p_kind, l.psgc::text, p_subject, p_body, p_link, p_source from public.lgus l;
$$;
revoke all on function public.notify_offices(text, text, text, jsonb, text) from public;


-- ===========================================================================
-- 2. Notices: PGENRO sets a planting site, or approves a request
-- ===========================================================================
create or replace function public.notify_planting_site()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_where text := concat_ws(', ', nullif(new.barangay, ''), nullif(new.municipality, ''));
  v_requested boolean := false;
begin
  if new.kind <> 'planting-site' or coalesce(new.approval, 'approved') <> 'approved' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    -- Only the moment a request becomes approved; later edits are not news.
    if old.approval is not distinct from 'approved' then
      return null;
    end if;
    v_requested := true;
  end if;
  if coalesce((to_jsonb(new) ->> 'is_training')::boolean, false) then
    return null;
  end if;

  perform public.notify_offices(
    'notice',
    case when v_requested then 'Planting site request approved: ' else 'New tree planting site: ' end || new.name,
    case when v_requested
      then 'PGENRO approved the request for a tree planting site'
      else 'PGENRO set a tree planting site' end
      || coalesce(' in ' || nullif(v_where, ''), '') || ': ' || new.name || '.'
      || coalesce(' ' || round((new.area_m2 / 10000.0)::numeric, 2) || ' ha.', ''),
    jsonb_build_object('kind', 'area', 'id', new.id, 'municipality', new.municipality),
    new.id::text);
  return null;
end $$;

drop trigger if exists notify_planting_site on public.map_areas;
create trigger notify_planting_site
  after insert or update of approval on public.map_areas
  for each row execute function public.notify_planting_site();


-- ===========================================================================
-- 3. News & Events: PGENRO posts, every office is sent it, the public sees it
-- ===========================================================================
create table if not exists public.news_posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null default '',
  venue       text,
  event_date  date,
  photos      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now()
);

-- Scheduled and archived posts (19 October): a post goes public — on the home
-- page and to every office's inbox — at its publish_at, not before; an
-- archived one leaves the home page and is kept. sent_at is when its
-- newsletter went out. Posts made before this were sent when they were made.
alter table public.news_posts
  add column if not exists publish_at  timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists sent_at     timestamptz;
update public.news_posts set sent_at = created_at where publish_at is null and sent_at is null;
update public.news_posts set publish_at = created_at where publish_at is null;
alter table public.news_posts alter column publish_at set default now();
alter table public.news_posts alter column publish_at set not null;
create index if not exists news_posts_due_idx on public.news_posts (publish_at) where sent_at is null;

-- The event itself (21 October): its last day (null for a one-day event), its
-- kind, the LGU it is held for (null: all of Laguna), and what it counts as
-- toward the City Biodiversity Index's governance indicators — a public
-- awareness event, a partnership, a project or a policy.
alter table public.news_posts
  add column if not exists event_end_date date,
  add column if not exists event_kind     text,
  add column if not exists lgu_psgc       bigint,
  add column if not exists cbi_credit     text;

alter table public.news_posts drop constraint if exists news_posts_event_check;
alter table public.news_posts add constraint news_posts_event_check check (
  (event_end_date is null or (event_date is not null and event_end_date >= event_date))
  and (event_kind is null or event_kind in ('training', 'forum', 'conference', 'seminar', 'orientation', 'tree-planting', 'clean-up', 'other'))
  and (cbi_credit is null or cbi_credit in ('outreach', 'partnership', 'project', 'policy'))
);

alter table public.news_posts drop constraint if exists news_posts_title_check;
alter table public.news_posts add constraint news_posts_title_check
  check (length(trim(title)) between 1 and 200 and jsonb_typeof(photos) = 'array');

create or replace function public.stamp_news_post()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
    new.publish_at := coalesce(new.publish_at, now());
    new.sent_at := null;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- When the newsletter went out is the database's to say, not the page's.
    if current_user in ('authenticated', 'anon') then
      new.sent_at := old.sent_at;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists stamp_news_post on public.news_posts;
create trigger stamp_news_post before insert or update on public.news_posts
  for each row execute function public.stamp_news_post();

alter table public.news_posts enable row level security;

-- The public reads what is published and not archived; PGENRO reads all of
-- it, scheduled and archived too, through its own rule below.
drop policy if exists "anyone reads the news" on public.news_posts;
create policy "anyone reads the news" on public.news_posts
  for select to anon, authenticated using (publish_at <= now() and archived_at is null);

drop policy if exists "pgenro posts the news" on public.news_posts;
create policy "pgenro posts the news" on public.news_posts
  for all to authenticated
  using (public.is_pgenro() and public.is_active_account())
  with check (public.is_pgenro() and public.is_active_account());

grant select on public.news_posts to anon, authenticated;
grant insert, update, delete on public.news_posts to authenticated;

-- One post's newsletter to every office, once, when it is due. True when it
-- went out now.
create or replace function public.deliver_news_post(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  p public.news_posts%rowtype;
begin
  select * into p from public.news_posts
  where id = p_id and sent_at is null and archived_at is null and publish_at <= now()
  for update skip locked;
  if not found then
    return false;
  end if;
  perform public.notify_offices(
    'news',
    p.title,
    concat_ws(E'\n\n',
      nullif(trim(concat_ws(' · ',
        case
          when p.event_date is null then null
          when p.event_end_date is null or p.event_end_date = p.event_date then to_char(p.event_date, 'FMDD FMMonth YYYY')
          else to_char(p.event_date, 'FMDD FMMonth YYYY') || ' to ' || to_char(p.event_end_date, 'FMDD FMMonth YYYY')
        end,
        nullif(p.venue, ''))), ''),
      nullif(p.body, '')),
    jsonb_build_object('kind', 'news', 'id', p.id),
    p.id::text);
  update public.news_posts set sent_at = now() where id = p.id;
  return true;
end $$;
revoke all on function public.deliver_news_post(uuid) from public;

-- Sent the moment a post is made or moved to now; a scheduled one waits.
create or replace function public.send_news_to_offices()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.deliver_news_post(new.id);
  return null;
end $$;

drop trigger if exists send_news_to_offices on public.news_posts;
create trigger send_news_to_offices
  after insert or update of publish_at, archived_at on public.news_posts
  for each row execute function public.send_news_to_offices();

-- Every post whose time has come. Safe to call any time, by anyone, as often
-- as wanted: each newsletter goes out once. The pages call it as they load,
-- and pg_cron every five minutes where it is switched on (below).
create or replace function public.publish_due_news()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_sent integer := 0;
begin
  for v_id in
    select id from public.news_posts
    where sent_at is null and archived_at is null and publish_at <= now()
    order by publish_at
  loop
    if public.deliver_news_post(v_id) then
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end $$;
revoke all on function public.publish_due_news() from public;
grant execute on function public.publish_due_news() to anon, authenticated;

-- Supabase's scheduler, when it is switched on (Database → Extensions →
-- pg_cron): due posts go out within five minutes even with nobody on the site.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'green-tag-news';
    perform cron.schedule('green-tag-news', '*/5 * * * *', 'select public.publish_due_news()');
  end if;
end $$;

-- The photos: public to read, PGENRO's to add and remove.
do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('news-photos', 'news-photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

  execute 'drop policy if exists "pgenro adds news photos" on storage.objects';
  execute $p$create policy "pgenro adds news photos" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'news-photos' and public.is_pgenro() and public.is_active_account())$p$;
  execute 'drop policy if exists "pgenro removes news photos" on storage.objects';
  execute $p$create policy "pgenro removes news photos" on storage.objects
    for delete to authenticated
    using (bucket_id = 'news-photos' and public.is_pgenro() and public.is_active_account())$p$;
  execute 'drop policy if exists "anyone sees news photos" on storage.objects';
  execute $p$create policy "anyone sees news photos" on storage.objects
    for select to anon, authenticated using (bucket_id = 'news-photos')$p$;
end $$;


-- ===========================================================================
-- 4. A tree saved under a species the RISE library does not have
-- ===========================================================================
create or replace function public.notify_unknown_species()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_species text := nullif(trim(coalesce(new.species, '')), '');
  v_key text;
begin
  if v_species is null or lower(v_species) in ('unknown', 'miscellaneous', 'n/a', 'none') then
    return null;
  end if;
  if tg_op = 'UPDATE' and lower(coalesce(old.species, '')) = lower(v_species) then
    return null;
  end if;
  if coalesce((to_jsonb(new) ->> 'is_training')::boolean, false) then
    return null;
  end if;
  if exists (
    select 1 from public.species_profiles s
    where lower(s.species) = lower(v_species)
       or (nullif(trim(coalesce(new.scientific_name, '')), '') is not null
           and lower(s.scientific_name) = lower(trim(new.scientific_name)))
  ) then
    return null;
  end if;

  -- Once per species, until PGENRO archives or deletes the notice.
  v_key := lower(v_species);
  if exists (select 1 from public.inbox_messages
             where office = 'pgenro' and kind = 'rise' and source_id = v_key and archived_at is null) then
    return null;
  end if;

  insert into public.inbox_messages (kind, office, subject, body, link, source_id)
  values (
    'rise', 'pgenro',
    'Not in the species library: ' || v_species,
    'A tree was saved as ' || v_species
      || coalesce(' (' || nullif(trim(coalesce(new.scientific_name, '')), '') || ')', '')
      || coalesce(' in ' || nullif(concat_ws(', ', nullif(new.barangay, ''), nullif(new.municipality, '')), ''), '')
      || ', and the RISE library has no profile for it. Add one under Trees → Species (RISE), or check the identification.',
    jsonb_build_object('kind', 'tree', 'id', new.id, 'lat', new.latitude, 'lng', new.longitude),
    v_key);
  return null;
end $$;

drop trigger if exists notify_unknown_species on public.trees;
create trigger notify_unknown_species
  after insert or update of species on public.trees
  for each row execute function public.notify_unknown_species();


-- ===========================================================================
-- 5. The public's messages
-- ===========================================================================
-- p_topic 'privacy' (20 October): a request about one's own personal data in
-- Green Tag (RA 10173). It goes to PGENRO, which keeps the records, whatever
-- office was chosen, under a subject that says what it is.
drop function if exists public.send_contact_message(text, text, text, text, text, text);
create or replace function public.send_contact_message(
  p_office text, p_name text, p_email text, p_address text, p_affiliation text, p_message text,
  p_topic text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_privacy boolean := coalesce(p_topic, '') = 'privacy';
  v_office text := case when coalesce(p_topic, '') = 'privacy' then 'pgenro' else trim(coalesce(p_office, '')) end;
  v_name text := trim(coalesce(p_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_message text := trim(coalesce(p_message, ''));
begin
  if v_office <> 'pgenro' and not exists (select 1 from public.lgus where psgc::text = v_office) then
    raise exception 'Choose the office to send it to.' using errcode = '22023';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'Give your name.' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then
    raise exception 'Give an email address the office can reply to.' using errcode = '22023';
  end if;
  if length(v_message) not between 1 and 4000 then
    raise exception 'Write a message of up to 4,000 characters.' using errcode = '22023';
  end if;
  -- Five an hour from one address is plenty for a person, and too few for a flood.
  if (select count(*) from public.inbox_messages
      where kind = 'contact' and sender_email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages from this address in the last hour. Try again later.' using errcode = '22023';
  end if;

  insert into public.inbox_messages (kind, office, subject, body, sender_name, sender_email, sender_address, sender_affiliation)
  values ('contact', v_office,
          case when v_privacy then 'Data privacy request from ' else 'Message from ' end || v_name,
          v_message, v_name, v_email,
          nullif(trim(coalesce(p_address, '')), ''), nullif(trim(coalesce(p_affiliation, '')), ''));
end $$;

revoke all on function public.send_contact_message(text, text, text, text, text, text, text) from public;
grant execute on function public.send_contact_message(text, text, text, text, text, text, text) to anon, authenticated;


-- ===========================================================================
-- 6. Live: a new message reaches an open page without a refresh
-- ===========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and tablename = 'inbox_messages') then
    execute 'alter publication supabase_realtime add table public.inbox_messages';
  end if;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 7. Check
-- ===========================================================================
select 'inboxes' as check,
       to_regclass('public.inbox_messages') is not null as ok,
       '' as detail
union all
select 'an office reads only its own',
       exists (select 1 from pg_policies where tablename = 'inbox_messages' and policyname = 'an office reads its own inbox'),
       ''
union all
select 'planting sites are announced',
       exists (select 1 from information_schema.triggers where trigger_name = 'notify_planting_site'),
       ''
union all
select 'News & Events',
       to_regclass('public.news_posts') is not null
       and exists (select 1 from information_schema.triggers where trigger_name = 'send_news_to_offices'),
       ''
union all
select 'an event has its days, its kind and its CBI credit',
       exists (select 1 from information_schema.columns where table_name = 'news_posts' and column_name = 'cbi_credit')
       and exists (select 1 from pg_constraint where conname = 'news_posts_event_check'),
       ''
union all
select 'News & Events can be scheduled and archived',
       exists (select 1 from information_schema.columns where table_name = 'news_posts' and column_name = 'publish_at')
       and exists (select 1 from information_schema.routines where routine_name = 'publish_due_news'),
       ''
union all
select 'READ: scheduled posts sent by',
       null,
       case when exists (select 1 from pg_extension where extname = 'pg_cron')
            then 'pg_cron, every 5 minutes, and the pages as they load'
            else 'the pages as they load (switch on pg_cron to send them with nobody on the site)' end
union all
select 'species missing from RISE reach PGENRO',
       exists (select 1 from information_schema.triggers where trigger_name = 'notify_unknown_species'),
       ''
union all
select 'the public can write to an office',
       exists (select 1 from information_schema.routines where routine_name = 'send_contact_message'),
       ''
union all
select 'READ: messages waiting', null,
       (select count(*) from public.inbox_messages where read_at is null)::text;
