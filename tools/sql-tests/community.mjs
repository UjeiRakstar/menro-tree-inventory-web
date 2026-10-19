// accounts.sql → lgu_fence.sql → municipal_halls.sql → tag_routing.sql →
// community.sql → onboarding.sql, in real Postgres: residents who sign in with
// Google stay out of the offices' accounts, their tags count for them, the
// leaderboard shows names only, and a new office account fills in its details.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const FIELD_SCZ = '00000000-0000-0000-0000-0000000000b1';
const BEFORE = '00000000-0000-0000-0000-0000000000d0';
const SCZ = 403426000;
const CLB = 403405000;
const GOOGLE = JSON.stringify({ provider: 'google', providers: ['google'] });

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
    raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{"provider":"email","providers":["email"]}'::jsonb,
    last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function extensions.digest(data text, type text) returns bytea language sql immutable as $$
    select sha256(convert_to(data, 'UTF8')) $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
    select decode(string_agg(lpad(to_hex((random()*255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
  create table public.barangays (psgc bigint primary key, name text, municipality text,
    municipality_label text, municipality_psgc bigint, is_city boolean);
  insert into public.barangays values
    (403426001, 'Labuin', 'Santa Cruz', 'Santa Cruz', 403426000, false),
    (403405001, 'Bucal', 'Calamba', 'Calamba City', 403405000, true);
  create table public.profiles (
    id uuid primary key references auth.users(id), email text, full_name text,
    role text default 'arborist', is_approved boolean default false,
    municipality text, barangay text, contact_number text, avatar_url text,
    observer_height numeric, rejected_at timestamptz, rejection_reason text,
    created_at timestamptz default now());
  alter table public.profiles enable row level security;
  create policy "own read" on public.profiles for select to authenticated using (auth.uid() = id);
  create function public.sync_arborist_profile_from_metadata() returns trigger
  language plpgsql security definer set search_path = public as $$
  begin
    insert into public.profiles (id, email, full_name, municipality, is_approved)
    values (new.id, new.email, nullif(new.raw_user_meta_data->>'full_name', ''),
            nullif(new.raw_user_meta_data->>'municipality', ''), false);
    return new;
  end $$;
  create trigger zz_sync_arborist_profile after insert on auth.users
    for each row execute function public.sync_arborist_profile_from_metadata();
  create table public.trees (id text primary key, species text, barangay_psgc bigint, assigned_to text);
  alter table public.trees enable row level security;
  create policy "authenticated users full access" on public.trees for all to authenticated using (true) with check (true);
  create policy "anon reads trees" on public.trees for select to anon using (true);
  create table public.pending_trees (id uuid primary key default gen_random_uuid(), latitude float8, longitude float8,
    barangay text, species text, status text default 'pending', assigned_to text, submitted_at timestamptz default now());
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  grant insert on public.pending_trees to anon;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  alter default privileges in schema public grant select on tables to anon;
  insert into auth.users (id, email, raw_user_meta_data, last_sign_in_at) values
    ('${ADMIN}', 'admin@laguna.gov.ph', '{}', now()),
    ('${FIELD_SCZ}', 'field@scz.ph', '{"municipality":"Santa Cruz"}', now());
  -- A resident who signed in with Google before community.sql ran: the
  -- stand-in trigger gave them a profile, as the live one would have.
  insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
    ('${BEFORE}', 'early@gmail.com', '{"full_name":"Early Bird"}', '${GOOGLE}');
  update public.profiles set role = 'admin', is_approved = true where id = '${ADMIN}';
`);

const files = ['accounts.sql', 'lgu_fence.sql', 'municipal_halls.sql', 'tag_routing.sql', 'community.sql', 'onboarding.sql'];
for (const file of files) {
  try {
    const out = await db.exec(readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8'));
    const rows = out[out.length - 1].rows;
    check(`${file} runs`, rows.filter((r) => r.ok !== null).every((r) => r.ok === true),
      rows.map((r) => `${r.check}=${r.ok}${r.detail ? ' (' + r.detail + ')' : ''}`).join('; '));
  } catch (error) {
    check(`${file} runs`, false, error.message);
    process.exit(1);
  }
}
for (const file of ['community.sql', 'onboarding.sql']) {
  try {
    await db.exec(readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8'));
    check(`${file} runs twice`, true);
  } catch (error) {
    check(`${file} runs twice`, false, error.message);
  }
}

async function as(userId, role, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function fails(fn) { try { await fn(); return null; } catch (e) { return e.message; } }
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

await db.query(`update public.profiles set is_approved = true where id = $1`, [FIELD_SCZ]);

// ---- Residents, apart from the offices -------------------------------------
const early = await one(`select full_name from public.residents where id = $1`, [BEFORE]);
check('a Google account from before is made a resident', early?.full_name === 'Early Bird', JSON.stringify(early));

const ANA = '00000000-0000-0000-0000-0000000000e1';
const BEN = '00000000-0000-0000-0000-0000000000e2';
const CARL = '00000000-0000-0000-0000-0000000000e3';
await db.query(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ($1, 'ana@gmail.com', '{"full_name":"Ana Reyes"}', $4),
  ($2, 'ben@gmail.com', '{"name":"Ben Cruz"}', $4),
  ($3, 'carl@gmail.com', '{"full_name":"Carl Santos"}', $4)`, [ANA, BEN, CARL, GOOGLE]);
const anaProfile = await one(`select count(*)::int as n from public.profiles where id = $1`, [ANA]);
check('a Google sign-in gets no office profile', anaProfile.n === 0, `${anaProfile.n} profiles`);
const queue = await one(`select count(*)::int as n from public.profiles where email like '%@gmail.com'`);
check('…so no resident waits in an approval queue', queue.n === 0, `${queue.n}`);
const ben = await one(`select full_name, consented_at from public.residents where id = $1`, [BEN]);
check('…and gets a resident row with the name Google gives', ben.full_name === 'Ben Cruz' && ben.consented_at === null, JSON.stringify(ben));

const EMAIL = '00000000-0000-0000-0000-0000000000e9';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'field2@scz.ph', '{"municipality":"Santa Cruz"}')`, [EMAIL]);
const emailProfile = await one(`select role from public.profiles where id = $1`, [EMAIL]);
const emailResident = await one(`select count(*)::int as n from public.residents where id = $1`, [EMAIL]);
check('an email sign-up is still an office account, not a resident',
  emailProfile?.role === 'field_officer' && emailResident.n === 0, JSON.stringify(emailProfile));

const ownRows = (await as(ANA, 'authenticated', () => db.query(`select id from public.residents`))).rows;
check('a resident reads their own row only', ownRows.length === 1 && ownRows[0].id === ANA, `${ownRows.length} rows`);
const anonRows = await as(null, 'anon', () => fails(() => db.query(`select id from public.residents`)));
check('the public reads no residents', anonRows !== null);
const selfWrite = await as(ANA, 'authenticated', () => fails(() => db.query(
  `update public.residents set consented_at = now() where id = $1`, [ANA])));
check('a resident writes their row only through set_resident_profile', selfWrite !== null);
const officeSees = (await as(ADMIN, 'authenticated', () => db.query(`select id from public.residents`))).rows;
check('…and no office reads the residents table', officeSees.length === 0, `${officeSees.length} rows`);

// ---- Nicknames -----------------------------------------------------------------
const verdict = async (name) => (await one(`select public.nickname_problem($1) as p`, [name])).p;
for (const name of ['fuuuck', 'Fvck', 'Put4ng1na', 'puta', 'tan ga', 'Tanga', 'gago123', 'B0b0', 'MENRO Santa Cruz', 'Admin', 'xx', 'a'.repeat(25), 'emoji 🌳']) {
  check(`nickname refused: ${name}`, (await verdict(name)) !== null);
}
for (const name of ['Puno ng Laguna', 'Essex', 'Dickson', 'Tanglaw', 'Mang Kanor', 'Ana_R', 'Señor Narra', 'Bobby']) {
  const problem = await verdict(name);
  check(`nickname allowed: ${name}`, problem === null, problem ?? '');
}

const noAgree = await as(ANA, 'authenticated', () => fails(() => db.query(`select public.set_resident_profile('name', null, false)`)));
check('joining needs agreement to what is kept', noAgree !== null);
const lewd = await as(ANA, 'authenticated', () => fails(() => db.query(`select public.set_resident_profile('nickname', 'tangina mo', true)`)));
check('…and refuses a lewd nickname with the reason', /not allowed/.test(lewd ?? ''), lewd ?? 'SAVED');
const emptyNick = await as(ANA, 'authenticated', () => fails(() => db.query(`select public.set_resident_profile('nickname', '  ', true)`)));
check('…and a nickname that is only spaces', emptyNick !== null);
const notResident = await as(FIELD_SCZ, 'authenticated', () => fails(() => db.query(`select public.set_resident_profile('name', null, true)`)));
check('an office account cannot join as a resident', notResident !== null);
const joined = await as(ANA, 'authenticated', () => fails(() => db.query(`select public.set_resident_profile('nickname', 'Puno ng Laguna', true)`)));
check('a resident joins under a nickname', joined === null, joined ?? '');
await as(BEN, 'authenticated', () => db.query(`select public.set_resident_profile('name', null, true)`));
const firstAgreed = (await one(`select consented_at from public.residents where id = $1`, [ANA])).consented_at;
await as(ANA, 'authenticated', () => db.query(`select public.set_resident_profile('name', 'Puno ng Laguna', true)`));
const ana = await one(`select show_as, nickname, consented_at from public.residents where id = $1`, [ANA]);
check('changing how they are shown keeps the day they agreed',
  ana.show_as === 'name' && ana.nickname === 'Puno ng Laguna' && +ana.consented_at === +firstAgreed, JSON.stringify(ana));
await as(ANA, 'authenticated', () => db.query(`select public.set_resident_profile('nickname', 'Puno ng Laguna', true)`));

// ---- Who tagged what -------------------------------------------------------------
const tag = (who, role, species, extra = '') => as(who, role, () => fails(() => db.query(
  `insert into public.pending_trees (barangay, species, municipality${extra ? ', ' + extra.split('=')[0] : ''})
   values ('Labuin', '${species}', 'Santa Cruz'${extra ? ', ' + extra.split('=')[1] : ''})`)));

const anonTag = await tag(null, 'anon', 'anon-tag');
const anonRow = await one(`select submitted_by, source from public.pending_trees where species = 'anon-tag'`);
check('a tag sent without signing in still goes in, credited to nobody',
  anonTag === null && anonRow.submitted_by === null && anonRow.source === 'community', anonTag ?? JSON.stringify(anonRow));

for (const [who, species] of [[ANA, 'ana-1'], [ANA, 'ana-2'], [ANA, 'ana-3'], [BEN, 'ben-1'], [BEN, 'ben-2'], [CARL, 'carl-1']]) {
  const error = await tag(who, 'authenticated', species);
  if (error) check(`resident tag ${species} goes in`, false, error);
}
const anaRows = (await db.query(`select submitted_by, source from public.pending_trees where species like 'ana-%'`)).rows;
check('a signed-in resident’s tag is credited to them', anaRows.length === 3 && anaRows.every((r) => r.submitted_by === ANA && r.source === 'community'));
const spoofed = await tag(BEN, 'authenticated', 'ben-spoof', `submitted_by='${ANA}'`);
const spoofRow = await one(`select submitted_by from public.pending_trees where species = 'ben-spoof'`);
check('…and cannot be credited to someone else by saying so', spoofed === null && spoofRow.submitted_by === BEN, spoofed ?? JSON.stringify(spoofRow));
const anonImport = await tag(null, 'anon', 'anon-import', `source='import'`);
check('the public cannot send a tag as an office import', anonImport !== null);
const residentImport = await tag(BEN, 'authenticated', 'ben-import', `source='import'`);
check('…nor can a resident', residentImport !== null);
const fieldImport = await tag(FIELD_SCZ, 'authenticated', 'field-import', `source='import'`);
check('…nor a field officer', fieldImport !== null);
await db.query(`delete from public.pending_trees where species = 'ben-spoof'`);

// An office account, by PGENRO's code.
const MENRO = '00000000-0000-0000-0000-0000000000c1';
const code = (await as(ADMIN, 'authenticated', () => db.query(`select * from public.issue_account_code(${SCZ})`))).rows[0].code;
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'menro@scz.gov.ph', $2)`,
  [MENRO, JSON.stringify({ account_code: code, full_name: 'Maria Santos' })]);
const menro = await one(`select role, onboarded_at from public.profiles where id = $1`, [MENRO]);
check('a new MENRO account starts not yet set up', menro.role === 'lgu_admin' && menro.onboarded_at === null, JSON.stringify(menro));

const ownImport = await as(MENRO, 'authenticated', () => fails(() => db.query(
  `insert into public.pending_trees (barangay, species, municipality, source, details)
   values ('Labuin', 'import-1', 'Santa Cruz', 'import', '{"dbh_cm": 32, "height_m": 9}')`)));
const importRow = await one(`select submitted_by, source, details, lgu_psgc from public.pending_trees where species = 'import-1'`);
check('a MENRO imports its own LGU’s inventory, with the spreadsheet’s details',
  ownImport === null && importRow.source === 'import' && importRow.submitted_by === MENRO && importRow.details.dbh_cm === 32,
  ownImport ?? JSON.stringify(importRow));
const otherImport = await as(MENRO, 'authenticated', () => fails(() => db.query(
  `insert into public.pending_trees (barangay, species, municipality, source) values ('Bucal', 'import-clb', 'Calamba City', 'import')`)));
check('…but not another LGU’s trees', otherImport !== null);
const badSource = await tag(BEN, 'authenticated', 'ben-odd', `source='scraped'`);
check('a tag’s source is community or import, nothing else', badSource === null &&
  (await one(`select source from public.pending_trees where species = 'ben-odd'`)).source === 'community', badSource ?? '');
await db.query(`delete from public.pending_trees where species = 'ben-odd'`);

// ---- The leaderboard -------------------------------------------------------------
await db.query(`update public.pending_trees set status = 'verified' where species in ('ben-1', 'ben-2', 'ana-1', 'carl-1', 'import-1')`);
const board = (await as(null, 'anon', () => db.query(`select * from public.community_leaderboard(10)`))).rows;
check('the leaderboard ranks by trees verified, then tags sent',
  board.map((r) => r.display_name).join(', ') === 'Ben Cruz, Puno ng Laguna', board.map((r) => `${r.rank}. ${r.display_name} ${r.verified}/${r.submitted}`).join('; '));
check('…shows the nickname when the resident chose one', board.some((r) => r.display_name === 'Puno ng Laguna') && !board.some((r) => r.display_name === 'Ana Reyes'));
check('…leaves out residents who have not agreed', !board.some((r) => r.display_name === 'Carl Santos'));
check('…and office imports', board.every((r) => r.verified <= 2) && board.find((r) => r.display_name === 'Ben Cruz').verified === 2);
check('…and never carries an email', !JSON.stringify(board).includes('@'), Object.keys(board[0] ?? {}).join(', '));
const mine = (await as(ANA, 'authenticated', () => db.query(`select display_name, is_me from public.community_leaderboard(10)`))).rows;
check('a resident finds themselves on it', mine.find((r) => r.is_me)?.display_name === 'Puno ng Laguna');
const capped = (await as(null, 'anon', () => db.query(`select * from public.community_leaderboard(1)`))).rows;
check('…as long as the limit asked for', capped.length === 1);

const counts = await as(null, 'anon', () => one(`select * from public.community_counts()`));
check('the CBI count: residents who joined, who tagged, and their verified tags',
  counts.residents === 2 && counts.taggers === 2 && counts.verified_tags === 3, JSON.stringify(counts));

// ---- A new office account's details (onboarding.sql) ------------------------------
const details = await as(MENRO, 'authenticated', () => fails(() => db.query(
  `update public.profiles set designation = 'MENRO', address = 'Municipal Hall, Santa Cruz', avatar_url = 'x.jpg', onboarded_at = now() where id = $1`, [MENRO])));
const saved = await one(`select designation, address, onboarded_at from public.profiles where id = $1`, [MENRO]);
check('an office account saves its own designation and address',
  details === null && saved.designation === 'MENRO' && saved.onboarded_at !== null, details ?? JSON.stringify(saved));
const promote = await as(MENRO, 'authenticated', () => fails(() => db.query(`update public.profiles set role = 'pgenro' where id = $1`, [MENRO])));
check('…but not its own role', promote !== null);
const others = (await as(MENRO, 'authenticated', () => db.query(`update public.profiles set designation = 'hacked' where id = $1`, [ADMIN]))).affectedRows;
check('…nor anyone else’s details', others === 0);
const already = await one(`select onboarded_at from public.profiles where id = $1`, [ADMIN]);
check('accounts already in use are not sent through set-up', already.onboarded_at !== null);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
