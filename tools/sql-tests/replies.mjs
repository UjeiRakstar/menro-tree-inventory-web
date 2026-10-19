// accounts.sql → inbox.sql → replies.sql: an office replies to a message —
// in Green Tag to a resident, by email to a guest — and who reads what.
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

// What replies.sql leans on from office_settings.sql and community.sql, as they write it.
await db.exec(`
  create or replace function public.in_training() returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select (to_jsonb(p) ->> 'is_training')::boolean from public.profiles p where id = auth.uid()), false) $$;
  create or replace function public.keeps_office(p_office text) returns boolean language sql stable security definer set search_path = public as $$
    select public.is_active_account() and not coalesce(public.in_training(), false) and p_office is not null and p_office = public.my_document_folder() $$;
  grant execute on function public.keeps_office(text) to authenticated;
  create table public.office_profiles (office text primary key, email text);
  insert into public.office_profiles values ('${SCZ}', 'menro@santacruz.gov.ph');
  create table public.residents (id uuid primary key references auth.users (id), full_name text, consented_at timestamptz);
`);
const ANA = '00000000-0000-0000-0000-0000000000e1';
const BEN = '00000000-0000-0000-0000-0000000000e2';
await db.exec(`insert into auth.users (id, email) values ('${ANA}', 'ana@gmail.com'), ('${BEN}', 'ben@gmail.com');
  insert into public.residents values ('${ANA}', 'Ana Reyes', now()), ('${BEN}', 'Ben Cruz', now());`);

for (const time of ['runs', 'runs twice']) {
  try {
    const out = await db.exec(SQL('replies.sql'));
    const rows = out[out.length - 1].rows;
    ok(`replies.sql ${time}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
  } catch (error) {
    ok(`replies.sql ${time}`, false, error.message);
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
const count = async (sql) => Number((await db.query(sql)).rows[0].n);

const send = (who, role, email, text) =>
  run(who, `select public.send_contact_message('${SCZ}', 'Someone', '${email}', null, null, '${text}')`, [], role);
await send(ANA, 'authenticated', 'ana@gmail.com', 'From a resident');
await send(null, 'anon', 'guest@yahoo.com', 'From a guest');
const sent = (await db.query(`select body, sender_id from public.inbox_messages where kind = 'contact' order by created_at`)).rows;
const byBody = Object.fromEntries(sent.map((m) => [m.body, m]));
ok('a resident’s message carries their account', byBody['From a resident']?.sender_id === ANA, JSON.stringify(sent));
ok('…a guest’s carries none', byBody['From a guest'] && byBody['From a guest'].sender_id === null);
const idOf = async (body) => (await db.query(`select id from public.inbox_messages where body = $1`, [body])).rows[0].id;
const fromAna = await idOf('From a resident');
const fromGuest = await idOf('From a guest');

const target = await run(SCZ_ADMIN, `select * from public.reply_target($1)`, [fromAna]);
ok('the office learns how to reply: in Green Tag to a resident', target.rows?.[0]?.in_app === true && target.rows[0].subject === 'Re: Message from Someone', JSON.stringify(target));
const guestTarget = await run(SCZ_ADMIN, `select * from public.reply_target($1)`, [fromGuest]);
ok('…by email to a guest, the office’s own address to reply to',
  guestTarget.rows?.[0]?.in_app === false && guestTarget.rows[0].to_email === 'guest@yahoo.com' && guestTarget.rows[0].reply_to === 'menro@santacruz.gov.ph'
  && guestTarget.rows[0].office_label === 'Santa Cruz MENRO / CENRO', JSON.stringify(guestTarget));
const otherOffice = await run(KAL_ADMIN, `select * from public.reply_target($1)`, [fromAna]);
ok('another office learns nothing of it', otherOffice.error !== null && /not in your inbox/.test(otherOffice.error));

const inApp = await run(SCZ_ADMIN, `select public.record_reply($1, 'Salamat! We will visit.', 'in-app')`, [fromAna]);
ok('the office replies to the resident in Green Tag', inApp.error === null, inApp.error ?? '');
const inAppGuest = await run(SCZ_ADMIN, `select public.record_reply($1, 'Hello', 'in-app')`, [fromGuest]);
ok('…but not to a guest, who has no account to reply to', /reply by email/.test(inAppGuest.error ?? ''), inAppGuest.error ?? 'SENT');
const emailed = await run(SCZ_ADMIN, `select public.record_reply($1, 'Thank you for writing.', 'email')`, [fromGuest]);
ok('an emailed reply is kept too', emailed.error === null, emailed.error ?? '');
const tooLong = await run(SCZ_ADMIN, `select public.record_reply($1, $2, 'in-app')`, [fromAna, 'x'.repeat(4001)]);
ok('…up to 4,000 characters', tooLong.error !== null);
const kalReply = await run(KAL_ADMIN, `select public.record_reply($1, 'Hi', 'in-app')`, [fromAna]);
ok('another office cannot reply in its place', kalReply.error !== null);

const anaReads = await run(ANA, `select body, office_label, original_body from public.message_replies`);
ok('the resident reads the reply, with what they wrote',
  anaReads.rows?.length === 1 && anaReads.rows[0].body === 'Salamat! We will visit.' && anaReads.rows[0].original_body === 'From a resident',
  JSON.stringify(anaReads));
ok('…and nobody else’s', ((await run(BEN, `select id from public.message_replies`)).rows ?? []).length === 0);
ok('another office reads none of them', ((await run(KAL_ADMIN, `select id from public.message_replies`)).rows ?? []).length === 0);
ok('the office reads both of its own', ((await run(SCZ_ADMIN, `select id from public.message_replies`)).rows ?? []).length === 2);
ok('the public reads none', (await run(null, `select id from public.message_replies`, [], 'anon')).error !== null);
const forged = await run(ANA, `insert into public.message_replies (office, office_label, subject, body, channel) values ('${SCZ}', 'x', 'x', 'x', 'in-app')`);
ok('nobody writes a reply but through record_reply()', forged.error !== null);

await run(ANA, `select public.mark_my_replies_read()`);
ok('the resident marks their replies read', (await count(`select count(*) n from public.message_replies where resident_id = '${ANA}' and read_at is not null`)) === 1);
await run(SCZ_ADMIN, `delete from public.inbox_messages where id = $1`, [fromAna]);
ok('the resident keeps the reply after the office deletes the message', ((await run(ANA, `select id from public.message_replies`)).rows ?? []).length === 1);

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
