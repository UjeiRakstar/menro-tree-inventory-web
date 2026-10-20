// accounts.sql → inbox.sql: notices, News & Events, the RISE check and the
// public's messages — who is sent what, and who reads and changes it.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const SQL = (f) => readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8');
const db = new PGlite();
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const PG = '00000000-0000-0000-0000-00000000000a';
const SCZ_ADMIN = '00000000-0000-0000-0000-0000000000c1';
const KAL_ADMIN = '00000000-0000-0000-0000-0000000000c2';
const SCZ = 403426000;
const KAL = 403409000;

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function extensions.digest(data text, type text) returns bytea language sql immutable as $$ select sha256(convert_to(data, 'UTF8')) $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$ select decode(string_agg(lpad(to_hex((random()*255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
  create table public.barangays (psgc bigint primary key, name text, municipality text, municipality_label text, municipality_psgc bigint, is_city boolean);
  create table public.profiles (id uuid primary key references auth.users(id), email text, full_name text, role text default 'arborist', is_approved boolean default false,
    municipality text, barangay text, contact_number text, avatar_url text, observer_height numeric, rejected_at timestamptz, rejection_reason text, created_at timestamptz default now());
  alter table public.profiles enable row level security;
  create policy "own read" on public.profiles for select to authenticated using (auth.uid() = id);
  create table public.trees (id text primary key, species text, scientific_name text, barangay text, municipality text,
    latitude float8, longitude float8, barangay_psgc bigint, is_training boolean not null default false);
  create table public.species_profiles (species text primary key, scientific_name text);
  insert into public.species_profiles values ('Narra', 'Pterocarpus indicus');
  create table public.map_areas (id uuid primary key default gen_random_uuid(), kind text, name text, approval text,
    area_m2 double precision, barangay text, municipality text, is_training boolean not null default false);
  grant usage on schema public, auth, extensions to anon, authenticated;
  insert into auth.users (id, email) values ('${PG}', 'pgenro@laguna.gov.ph'), ('${SCZ_ADMIN}', 'menro@scz.ph'), ('${KAL_ADMIN}', 'menro@kalayaan.ph');
  insert into public.profiles (id, email) values ('${PG}', 'pgenro@laguna.gov.ph'), ('${SCZ_ADMIN}', 'menro@scz.ph'), ('${KAL_ADMIN}', 'menro@kalayaan.ph');
  update public.profiles set role = 'admin', is_approved = true where id = '${PG}';
`);
await db.exec(SQL('accounts.sql'));
await db.exec(`
  update public.profiles set role = 'lgu_admin', lgu_psgc = ${SCZ}, status = 'active', is_approved = true where id = '${SCZ_ADMIN}';
  update public.profiles set role = 'lgu_admin', lgu_psgc = ${KAL}, status = 'active', is_approved = true where id = '${KAL_ADMIN}';
  -- As closing_gaps.sql writes it.
  create or replace function public.my_document_folder() returns text language sql stable security definer set search_path = public as $$
    select case public.my_role() when 'pgenro' then 'pgenro' when 'lgu_admin' then public.my_lgu()::text end; $$;
  grant execute on function public.my_document_folder() to authenticated;
`);
for (const run of ['runs', 'runs twice']) {
  try {
    const out = await db.exec(SQL('inbox.sql'));
    const rows = out[out.length - 1].rows;
    ok(`inbox.sql ${run}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
  } catch (error) {
    ok(`inbox.sql ${run}`, false, error.message);
    process.exit(1);
  }
}

async function as(id, role, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ''}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const run = (id, sql, params = [], role = 'authenticated') =>
  as(id, role, async () => {
    try {
      const out = await db.query(sql, params);
      return { error: null, rows: out.rows, affected: out.affectedRows };
    } catch (e) {
      return { error: e.message };
    }
  });
const inbox = async (id) => (await run(id, `select kind, subject, body from public.inbox_messages order by created_at`)).rows ?? [];
const count = async (sql) => Number((await db.query(sql)).rows[0].n);
const lgus = await count(`select count(*) n from public.lgus`);

// Planting sites.
await db.exec(`insert into public.map_areas (kind, name, approval, area_m2, barangay, municipality) values ('planting-site', 'Labuin Riverbank', 'approved', 12345, 'Labuin', 'Santa Cruz')`);
ok('a planting site PGENRO sets is announced to every LGU', (await count(`select count(*) n from public.inbox_messages where kind = 'notice'`)) === lgus, `${lgus} LGUs`);
const kalNotice = (await inbox(KAL_ADMIN)).find((m) => m.kind === 'notice');
ok('…with where it is and how big', /^New tree planting site: Labuin Riverbank/.test(kalNotice?.subject ?? '') && /Labuin, Santa Cruz.*1\.23 ha/.test(kalNotice?.body ?? ''), kalNotice?.body);
await db.exec(`insert into public.map_areas (kind, name, approval, municipality) values ('planting-site', 'Gatid Field', 'requested', 'Santa Cruz')`);
ok('a request is not announced', (await count(`select count(*) n from public.inbox_messages where kind = 'notice'`)) === lgus);
await db.exec(`update public.map_areas set approval = 'approved' where name = 'Gatid Field'`);
ok('…its approval is', (await count(`select count(*) n from public.inbox_messages where subject = 'Planting site request approved: Gatid Field'`)) === lgus);
await db.exec(`update public.map_areas set approval = 'approved', name = name where name = 'Gatid Field'`);
ok('…once', (await count(`select count(*) n from public.inbox_messages where subject like '%Gatid Field'`)) === lgus);
await db.exec(`insert into public.map_areas (kind, name, approval, is_training) values ('planting-site', 'Training site', 'approved', true)`);
ok('a training site is not announced', (await count(`select count(*) n from public.inbox_messages where subject like '%Training site'`)) === 0);
await db.exec(`insert into public.map_areas (kind, name) values ('land-cover', 'Forest')`);
ok('land cover is not announced', (await count(`select count(*) n from public.inbox_messages where subject like '%Forest'`)) === 0);

// News & Events.
const posted = await run(PG, `insert into public.news_posts (title, body, venue, event_date) values ('Tree Planting Day', 'Bring seedlings.', 'Labuin', '2026-11-08')`);
ok('PGENRO posts News & Events', posted.error === null, posted.error ?? '');
const news = (await inbox(SCZ_ADMIN)).find((m) => m.kind === 'news');
ok('…every office is sent it', (await count(`select count(*) n from public.inbox_messages where kind = 'news'`)) === lgus);
ok('…with its date and venue', /^8 November 2026 · Labuin\n\nBring seedlings\.$/.test(news?.body ?? ''), JSON.stringify(news?.body));
const officePost = await run(SCZ_ADMIN, `insert into public.news_posts (title) values ('Ours')`);
ok('an office does not post News & Events', officePost.error !== null, officePost.error ?? 'POSTED');
ok('the public reads the news', ((await run(null, `select title from public.news_posts`, [], 'anon')).rows ?? []).length === 1);

// Scheduled and archived (19 October).
const sentOf = async (title) => count(`select count(*) n from public.inbox_messages where kind = 'news' and subject = '${title}'`);
const scheduled = await run(PG, `insert into public.news_posts (title, publish_at) values ('Arbor Day', now() + interval '3 days')`);
ok('PGENRO schedules a post', scheduled.error === null, scheduled.error ?? '');
ok('…which is sent to nobody yet', (await sentOf('Arbor Day')) === 0);
ok('…nor shown to the public', !((await run(null, `select title from public.news_posts`, [], 'anon')).rows ?? []).some((r) => r.title === 'Arbor Day'));
ok('…while PGENRO sees it, to plan', ((await run(PG, `select title from public.news_posts`)).rows ?? []).some((r) => r.title === 'Arbor Day'));
ok('nothing is due yet', (await run(null, `select public.publish_due_news() n`, [], 'anon')).rows[0].n === 0);
// Three days pass: the trigger is set aside so only publish_due_news() can send it.
await db.exec(`alter table public.news_posts disable trigger send_news_to_offices;
  update public.news_posts set publish_at = now() - interval '1 minute' where title = 'Arbor Day';
  alter table public.news_posts enable trigger send_news_to_offices;`);
ok('when its time comes it goes out — called by anyone, a page as it loads',
  (await run(null, `select public.publish_due_news() n`, [], 'anon')).rows[0].n === 1 && (await sentOf('Arbor Day')) === lgus);
ok('…once, however often it is called', (await run(null, `select public.publish_due_news() n`, [], 'anon')).rows[0].n === 0 && (await sentOf('Arbor Day')) === lgus);
ok('…and the public sees it now', ((await run(null, `select title from public.news_posts`, [], 'anon')).rows ?? []).some((r) => r.title === 'Arbor Day'));

await run(PG, `insert into public.news_posts (title, publish_at) values ('Moved up', now() + interval '1 day')`);
await run(PG, `update public.news_posts set publish_at = now() where title = 'Moved up'`);
ok('a scheduled post moved to now goes out at once', (await sentOf('Moved up')) === lgus);

const archived = await run(PG, `update public.news_posts set archived_at = now() where title = 'Arbor Day'`);
ok('PGENRO archives a post', archived.error === null);
ok('…which leaves the home page', !((await run(null, `select title from public.news_posts`, [], 'anon')).rows ?? []).some((r) => r.title === 'Arbor Day'));
ok('…and is kept, for PGENRO', ((await run(PG, `select title from public.news_posts where archived_at is not null`)).rows ?? []).length === 1);
await run(PG, `insert into public.news_posts (title, publish_at) values ('Shelved', now() + interval '1 day')`);
await run(PG, `update public.news_posts set archived_at = now() where title = 'Shelved'`);
await db.exec(`alter table public.news_posts disable trigger send_news_to_offices;
  update public.news_posts set publish_at = now() - interval '1 minute' where title = 'Shelved';
  alter table public.news_posts enable trigger send_news_to_offices;`);
await run(null, `select public.publish_due_news()`, [], 'anon');
ok('an archived post is never sent, even when its time comes', (await sentOf('Shelved')) === 0);
const faked = await run(PG, `update public.news_posts set sent_at = null where title = 'Moved up'`);
ok('when a newsletter went out is not the page’s to change',
  faked.error === null && (await count(`select count(*) n from public.news_posts where title = 'Moved up' and sent_at is not null`)) === 1);

// The RISE check.
await db.exec(`insert into public.trees (id, species, scientific_name, barangay, municipality) values ('t1', 'Narra', 'Pterocarpus indicus', 'Labuin', 'Santa Cruz')`);
ok('a species in the library is no news', (await count(`select count(*) n from public.inbox_messages where kind = 'rise'`)) === 0);
await db.exec(`insert into public.trees (id, species, scientific_name, barangay, municipality) values ('t2', 'Kamagong', 'Diospyros blancoi', 'Labuin', 'Santa Cruz')`);
const rise = (await inbox(PG)).find((m) => m.kind === 'rise');
ok('one missing from it reaches PGENRO', rise?.subject === 'Not in the species library: Kamagong' && /Diospyros blancoi.*Labuin, Santa Cruz/.test(rise.body), rise?.body);
await db.exec(`insert into public.trees (id, species) values ('t3', 'kamagong')`);
ok('…once per species', (await count(`select count(*) n from public.inbox_messages where kind = 'rise'`)) === 1);
await db.exec(`insert into public.trees (id, species, is_training) values ('t4', 'Banaba', true), ('t5', 'Unknown', false)`);
ok('a training tree or an unknown one is not', (await count(`select count(*) n from public.inbox_messages where kind = 'rise'`)) === 1);
ok('…and it is not sent to an office', !(await inbox(SCZ_ADMIN)).some((m) => m.kind === 'rise'));

// The public's messages.
const sent = await run(null, `select public.send_contact_message($1, 'Juan Dela Cruz', 'juan@example.com', 'Labuin', 'LSPU', 'May a tree be cut?')`, [String(SCZ)], 'anon');
ok('the public writes to an office', sent.error === null, sent.error ?? '');
const msg = (await run(SCZ_ADMIN, `select * from public.inbox_messages where kind = 'contact'`)).rows?.[0];
ok('…which that office reads, with whom to reply to', msg?.sender_email === 'juan@example.com' && msg?.body === 'May a tree be cut?' && msg?.sender_affiliation === 'LSPU');
ok('…and no other office does', !(await inbox(KAL_ADMIN)).some((m) => m.kind === 'contact'));
ok('…nor PGENRO', !(await inbox(PG)).some((m) => m.kind === 'contact'));
ok('the public reads no inbox', ((await run(null, `select id from public.inbox_messages`, [], 'anon')).rows ?? []).length === 0);
const toPg = await run(null, `select public.send_contact_message('pgenro', 'Ana', 'ana@example.com', null, null, 'Hello PGENRO')`, [], 'anon');
ok('…or writes to PGENRO', toPg.error === null && (await inbox(PG)).some((m) => m.kind === 'contact'), toPg.error ?? '');
for (const [name, args] of [
  ['an office that does not exist', `'999', 'Juan', 'juan@example.com', null, null, 'Hi'`],
  ['no name', `'pgenro', '', 'juan@example.com', null, null, 'Hi'`],
  ['an address that is not one', `'pgenro', 'Juan', 'not-an-email', null, null, 'Hi'`],
  ['an empty message', `'pgenro', 'Juan', 'juan@example.com', null, null, '  '`],
]) {
  const bad = await run(null, `select public.send_contact_message(${args})`, [], 'anon');
  ok(`refused: ${name}`, bad.error !== null, bad.error ?? 'SENT');
}
for (let i = 0; i < 4; i++) await run(null, `select public.send_contact_message('pgenro', 'Flood', 'flood@example.com', null, null, 'spam')`, [], 'anon');
const sixth = await run(null, `select public.send_contact_message('pgenro', 'Flood', 'flood@example.com', null, null, 'spam')`, [], 'anon');
ok('five an hour from one address is the limit', sixth.error === null);
const seventh = await run(null, `select public.send_contact_message('pgenro', 'Flood', 'flood@example.com', null, null, 'spam')`, [], 'anon');
ok('…a sixth is refused', seventh.error !== null, seventh.error ?? 'SENT');

// Filing.
const read = await run(SCZ_ADMIN, `update public.inbox_messages set read_at = now(), archived_at = now() where kind = 'contact'`);
ok('an office marks its own messages read and archived', read.error === null && read.affected === 1, read.error ?? '');
const rewrite = await run(SCZ_ADMIN, `update public.inbox_messages set body = 'changed' where kind = 'contact'`);
ok('…but cannot change what was sent', rewrite.error !== null, rewrite.error ?? 'CHANGED');
const forge = await run(SCZ_ADMIN, `insert into public.inbox_messages (kind, office, subject) values ('notice', '${KAL}', 'Fake')`);
ok('nobody writes a message directly', forge.error !== null, forge.error ?? 'INSERTED');
const theirs = await run(KAL_ADMIN, `delete from public.inbox_messages where office = '${SCZ}'`);
ok("an office cannot delete another's messages", theirs.error === null && theirs.affected === 0, JSON.stringify(theirs));
const mine = await run(SCZ_ADMIN, `delete from public.inbox_messages where kind = 'contact'`);
ok('…only its own', mine.error === null && mine.affected === 1, JSON.stringify(mine));

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
