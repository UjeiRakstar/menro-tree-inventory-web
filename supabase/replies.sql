-- Green Tag: an office replies to a message from inside Green Tag.
--
-- Run once, whole, in the SQL editor, after inbox.sql, office_settings.sql and
-- community.sql (step 21 of PARKED.md). Safe to run again. Ends in ONE query
-- whose rows say whether each part took.
--
-- Decided 19 October. A message sent through the Contact form:
--
--   from a resident signed in with Google — the office replies in Green Tag;
--     the reply waits for the resident on the Community page.
--   from a guest — the office replies by email, sent by the system itself
--     (the send-reply server function), without leaving Green Tag. Until that
--     function is set up, "Reply by email" opens the office's own email app,
--     as before.
--
-- Every reply is kept with a copy of the message it answers, so a resident
-- still has it after the office deletes the message from its inbox.

-- ===========================================================================
-- 1. Who sent it: a resident's account, stamped by the database
-- ===========================================================================
alter table public.inbox_messages
  add column if not exists sender_id uuid references auth.users (id) on delete set null;

-- On the insert send_contact_message() makes, whatever version of it runs:
-- a trigger, so running inbox.sql again does not undo it.
create or replace function public.stamp_message_sender()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'contact' then
    new.sender_id := case
      when auth.uid() is not null and exists (select 1 from public.residents r where r.id = auth.uid()) then auth.uid()
    end;
  end if;
  return new;
end $$;

drop trigger if exists stamp_message_sender on public.inbox_messages;
create trigger stamp_message_sender
  before insert on public.inbox_messages
  for each row execute function public.stamp_message_sender();


-- ===========================================================================
-- 2. Replies
-- ===========================================================================
create table if not exists public.message_replies (
  id             uuid primary key default gen_random_uuid(),
  message_id     uuid references public.inbox_messages (id) on delete set null,
  office         text not null,
  office_label   text not null,
  resident_id    uuid references auth.users (id) on delete cascade,
  subject        text not null,
  original_body  text not null default '',
  body           text not null,
  channel        text not null,
  sent_by        uuid references auth.users (id) on delete set null,
  sent_by_name   text,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.message_replies drop constraint if exists message_replies_channel_check;
alter table public.message_replies add constraint message_replies_channel_check
  check (channel in ('in-app', 'email'));
alter table public.message_replies drop constraint if exists message_replies_body_check;
alter table public.message_replies add constraint message_replies_body_check
  check (length(body) between 1 and 4000);

create index if not exists message_replies_message_idx on public.message_replies (message_id, created_at);
create index if not exists message_replies_resident_idx on public.message_replies (resident_id, created_at desc);

alter table public.message_replies enable row level security;
drop policy if exists "an office reads its replies" on public.message_replies;
create policy "an office reads its replies" on public.message_replies
  for select to authenticated
  using (public.is_active_account() and office = public.my_document_folder());
drop policy if exists "a resident reads replies to them" on public.message_replies;
create policy "a resident reads replies to them" on public.message_replies
  for select to authenticated
  using (resident_id = auth.uid());
revoke all on public.message_replies from anon;
revoke insert, update, delete on public.message_replies from authenticated;
grant select on public.message_replies to authenticated;

-- What an office's name is, on a reply.
create or replace function public.office_label(p_office text)
returns text language sql stable security definer set search_path = public as $$
  select case when p_office = 'pgenro' then 'PGENRO Laguna'
              else coalesce((select l.label from public.lgus l where l.psgc::text = p_office), p_office) || ' MENRO / CENRO' end;
$$;

-- Who a reply goes to, and how — for the office the message is in only.
-- The send-reply function asks this as the office, before it sends an email.
create or replace function public.reply_target(p_message uuid)
returns table (to_email text, to_name text, subject text, original_body text, sent_at timestamptz,
               office_label text, reply_to text, in_app boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  m public.inbox_messages%rowtype;
begin
  select * into m from public.inbox_messages where id = p_message;
  if not found or not public.keeps_office(m.office) then
    raise exception 'That message is not in your inbox.' using errcode = '42501';
  end if;
  if m.kind <> 'contact' then
    raise exception 'Only a message from the public is replied to.' using errcode = '22023';
  end if;
  return query
    select m.sender_email, m.sender_name, 'Re: ' || m.subject, m.body, m.created_at,
           public.office_label(m.office),
           nullif(trim((select coalesce(op.email, '') from public.office_profiles op where op.office = m.office)), ''),
           m.sender_id is not null;
end $$;
revoke all on function public.reply_target(uuid) from public;
grant execute on function public.reply_target(uuid) to authenticated;

-- A reply, kept: 'in-app' to a resident (the only way it reaches them), or
-- 'email' once the send-reply function has sent it.
create or replace function public.record_reply(p_message uuid, p_body text, p_channel text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m public.inbox_messages%rowtype;
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  select * into m from public.inbox_messages where id = p_message;
  if not found or not public.keeps_office(m.office) then
    raise exception 'That message is not in your inbox.' using errcode = '42501';
  end if;
  if m.kind <> 'contact' then
    raise exception 'Only a message from the public is replied to.' using errcode = '22023';
  end if;
  if p_channel not in ('in-app', 'email') then
    raise exception 'A reply goes in Green Tag or by email.' using errcode = '22023';
  end if;
  if p_channel = 'in-app' and m.sender_id is null then
    raise exception 'This was sent without a Green Tag account: reply by email.' using errcode = '22023';
  end if;
  if length(v_body) not between 1 and 4000 then
    raise exception 'Write a reply of up to 4,000 characters.' using errcode = '22023';
  end if;

  insert into public.message_replies (message_id, office, office_label, resident_id, subject, original_body,
                                      body, channel, sent_by, sent_by_name)
  values (m.id, m.office, public.office_label(m.office), m.sender_id, 'Re: ' || m.subject, m.body,
          v_body, p_channel, auth.uid(), (select full_name from public.profiles where id = auth.uid()))
  returning id into v_id;
  update public.inbox_messages set read_at = coalesce(read_at, now()) where id = m.id;
  return v_id;
end $$;
revoke all on function public.record_reply(uuid, text, text) from public;
grant execute on function public.record_reply(uuid, text, text) to authenticated;

-- A resident has read the replies waiting for them.
create or replace function public.mark_my_replies_read()
returns void language sql security definer set search_path = public as $$
  update public.message_replies set read_at = now() where resident_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_my_replies_read() from public;
grant execute on function public.mark_my_replies_read() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and tablename = 'message_replies') then
    execute 'alter publication supabase_realtime add table public.message_replies';
  end if;
end $$;

notify pgrst, 'reload schema';


-- ===========================================================================
-- 3. Check
-- ===========================================================================
select 'a resident''s message carries their account' as check,
       exists (select 1 from information_schema.triggers where trigger_name = 'stamp_message_sender') as ok,
       '' as detail
union all
select 'replies are kept, each seen by its office and its resident',
       exists (select 1 from pg_policies where tablename = 'message_replies' and policyname = 'a resident reads replies to them'),
       ''
union all
select 'READ: replies sent', null,
       (select count(*) || ' (' || count(*) filter (where channel = 'in-app') || ' in Green Tag, '
               || count(*) filter (where channel = 'email') || ' by email)' from public.message_replies);
