// accounts.sql → lgu_fence.sql → municipal_halls.sql → tag_routing.sql, in
// real Postgres, then what each must allow and refuse.
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
const SCZ = 403426000;
const CLB = 403405000;

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
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
    (403426002, 'Barangay I', 'Santa Cruz', 'Santa Cruz', 403426000, false),
    (403401003, 'Barangay I', 'Alaminos', 'Alaminos', 403401000, false),
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
  -- pending_trees as it stands: RLS off, plus a hand-made catch-all policy.
  create table public.pending_trees (id uuid primary key default gen_random_uuid(), latitude float8, longitude float8,
    barangay text, species text, status text default 'pending', assigned_to text, submitted_at timestamptz default now());
  create policy "staff review submissions" on public.pending_trees for all to authenticated using (true) with check (true);
  insert into public.pending_trees (barangay, species) values ('Brgy. Labuin', 'old-labuin'), ('Barangay I', 'old-ambiguous');
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  grant insert on public.pending_trees to anon;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  alter default privileges in schema public grant select on tables to anon;
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ADMIN}', 'admin@laguna.gov.ph', '{}'),
    ('${FIELD_SCZ}', 'field@scz.ph', '{"municipality":"Santa Cruz"}');
  update public.profiles set role = 'admin', is_approved = true where id = '${ADMIN}';
`);

for (const file of ['accounts.sql', 'lgu_fence.sql', 'municipal_halls.sql', 'tag_routing.sql']) {
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
for (const file of ['municipal_halls.sql', 'tag_routing.sql']) {
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

// ---- Halls -------------------------------------------------------------------
const issued = (await as(ADMIN, 'authenticated', () => db.query(`select * from public.issue_account_code(${SCZ})`))).rows[0].code;
const seen = await as(null, 'anon', () => one(`select * from public.check_account_code($1)`, [issued]));
check('activation learns the LGU by name, and that its hall is not pinned',
  seen.lgu_name === 'Santa Cruz' && seen.hall_lat === null, JSON.stringify(seen));

const MENRO = '00000000-0000-0000-0000-0000000000c1';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'menro@scz.gov.ph', $2)`,
  [MENRO, JSON.stringify({ account_code: issued, hall_lat: 14.2794, hall_lng: 121.4157 })]);
const hall = await one(`select hall_lat, hall_lng from public.lgus where psgc = ${SCZ}`);
check('the hall pinned at activation is saved with the account', hall.hall_lat === 14.2794, JSON.stringify(hall));

const second = (await as(ADMIN, 'authenticated', () => db.query(`select * from public.issue_account_code(${SCZ})`))).rows[0].code;
await db.query(`insert into auth.users (email, raw_user_meta_data) values ('second@scz.gov.ph', $1)`,
  [JSON.stringify({ account_code: second, hall_lat: 14.3, hall_lng: 121.42 })]);
const kept = await one(`select hall_lat from public.lgus where psgc = ${SCZ}`);
check('a second officer activating does not move the first one\u2019s pin', kept.hall_lat === 14.2794);

const moved = await as(MENRO, 'authenticated', () => fails(() => db.query(`select public.set_lgu_hall(14.2800, 121.4160)`)));
check('a MENRO moves their own hall pin', moved === null, moved ?? '');
const otherLgu = await as(MENRO, 'authenticated', () => fails(() => db.query(`select public.set_lgu_hall(14.2, 121.15, ${CLB})`)));
check('…but not another LGU\u2019s', otherLgu !== null, otherLgu ?? 'MOVED');
const nowhere = await as(MENRO, 'authenticated', () => fails(() => db.query(`select public.set_lgu_hall(10.3, 123.9)`)));
check('…and not to somewhere outside Laguna', nowhere !== null, nowhere ?? 'MOVED');
const field = await as(FIELD_SCZ, 'authenticated', () => fails(() => db.query(`select public.set_lgu_hall(14.28, 121.41)`)));
check('a field officer pins no hall', field !== null);

// ---- Routing -------------------------------------------------------------------
const old = (await db.query(`select species, lgu_psgc from public.pending_trees order by species`)).rows;
const bySpecies = Object.fromEntries(old.map((r) => [r.species, r.lgu_psgc === null ? null : Number(r.lgu_psgc)]));
check('a waiting tag with a unique barangay is routed', bySpecies['old-labuin'] === SCZ);
check('…one whose barangay name several towns share is left for PGENRO', bySpecies['old-ambiguous'] === null);

const anonInsert = await as(null, 'anon', () => fails(() => db.query(
  `insert into public.pending_trees (barangay, species, municipality) values ('Bucal', 'calamba-tag', 'Calamba City')`)));
check('a resident submits a tag', anonInsert === null, anonInsert ?? '');
const spoof = await as(null, 'anon', () => fails(() => db.query(
  `insert into public.pending_trees (barangay, species, municipality, lgu_psgc) values ('Labuin', 'spoof', 'Santa Cruz', ${CLB})`)));
check('…and cannot route it by saying so', spoof === null &&
  Number((await one(`select lgu_psgc from public.pending_trees where species = 'spoof'`)).lgu_psgc) === SCZ);
const anonRead = await as(null, 'anon', () => db.query(`select count(*)::int as n from public.pending_trees`));
check('the public reads no tags', anonRead.rows[0].n === 0, `${anonRead.rows[0].n} visible`);

const menroSees = (await as(MENRO, 'authenticated', () => db.query(`select species from public.pending_trees order by species`))).rows.map((r) => r.species);
check('a MENRO sees their own LGU\u2019s tags only', menroSees.includes('old-labuin') && !menroSees.includes('calamba-tag'), menroSees.join(', '));
const pgenroSees = (await as(ADMIN, 'authenticated', () => db.query(`select count(*)::int as n from public.pending_trees`))).rows[0].n;
check('PGENRO sees every tag, the unrouted one included', pgenroSees === 4, `${pgenroSees}`);

const dispatchOwn = (await as(MENRO, 'authenticated', () => db.query(
  `update public.pending_trees set status = 'dispatched', assigned_to = 'Field@scz.ph' where species = 'old-labuin'`))).affectedRows;
check('a MENRO dispatches their own LGU\u2019s tag', dispatchOwn === 1);
const dispatchOther = (await as(MENRO, 'authenticated', () => db.query(
  `update public.pending_trees set status = 'dispatched' where species = 'calamba-tag'`))).affectedRows;
check('…but not another LGU\u2019s', dispatchOther === 0);

// The field app's own query: dispatched, assigned to me.
await db.query(`update public.pending_trees set status = 'dispatched', assigned_to = 'field@scz.ph' where species = 'calamba-tag'`);
const appQuery = (await as(FIELD_SCZ, 'authenticated', () => db.query(
  `select species from public.pending_trees where status = 'dispatched' and assigned_to = 'field@scz.ph'`))).rows.map((r) => r.species);
check('the field app still gets every tag dispatched to its officer, wherever it is',
  appQuery.includes('calamba-tag'), appQuery.join(', '));
const fieldUpdate = (await as(FIELD_SCZ, 'authenticated', () => db.query(
  `update public.pending_trees set status = 'pending' where species = 'old-labuin'`))).affectedRows;
check('a field officer does not re-dispatch tags', fieldUpdate === 0);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
