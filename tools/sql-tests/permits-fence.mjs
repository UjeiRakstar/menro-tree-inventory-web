// accounts.sql → lgu_fence.sql → permit_archive.sql → permits_fence.sql, then
// who sees, issues and changes which permits.
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
const FIELD = '00000000-0000-0000-0000-0000000000b1';
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
  insert into public.barangays values
    (403426001, 'Labuin', 'Santa Cruz', 'Santa Cruz', 403426000, false),
    (403409002, 'San Antonio', 'Kalayaan', 'Kalayaan', 403409000, false);
  create table public.profiles (id uuid primary key references auth.users(id), email text, full_name text, role text default 'arborist', is_approved boolean default false,
    municipality text, barangay text, contact_number text, avatar_url text, observer_height numeric, rejected_at timestamptz, rejection_reason text, created_at timestamptz default now());
  alter table public.profiles enable row level security;
  create policy "own read" on public.profiles for select to authenticated using (auth.uid() = id);
  create table public.trees (id text primary key, species text, barangay_psgc bigint, assigned_to text, task_status text, latitude float8, longitude float8);
  alter table public.trees enable row level security;
  create policy "anon reads trees" on public.trees for select to anon, authenticated using (true);
  insert into public.trees values
    ('scz', 'Narra', 403426001, null, null, 14.2800, 121.4100),
    ('kal', 'Molave', 403409002, null, null, 14.3400, 121.5300);
  -- As the dashboard left it: every signed-in account could do anything.
  create table public.permits (id uuid primary key default gen_random_uuid(), tree_id text, client_name text,
    contact_info text, latitude numeric, longitude numeric, created_at timestamptz default now());
  alter table public.permits enable row level security;
  create policy "staff" on public.permits for all to authenticated using (true) with check (true);
  create policy "anyone" on public.permits for select to anon using (true);
  insert into public.permits (tree_id, client_name, latitude, longitude) values
    ('scz', 'Brian', 14.2800, 121.4100),
    (null, 'Zaldy', 14.2810, 121.4105),
    (null, 'Far away', 13.0000, 120.0000);
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  insert into auth.users (id, email) values ('${PG}', 'pgenro@laguna.gov.ph'), ('${SCZ_ADMIN}', 'menro@scz.ph'),
    ('${KAL_ADMIN}', 'menro@kalayaan.ph'), ('${FIELD}', 'fo@scz.ph');
  insert into public.profiles (id, email) values ('${PG}', 'pgenro@laguna.gov.ph'), ('${SCZ_ADMIN}', 'menro@scz.ph'),
    ('${KAL_ADMIN}', 'menro@kalayaan.ph'), ('${FIELD}', 'fo@scz.ph');
  update public.profiles set role = 'admin', is_approved = true where id = '${PG}';
`);

for (const file of ['accounts.sql', 'lgu_fence.sql', 'permit_archive.sql']) {
  const out = await db.exec(SQL(file));
  ok(`${file} runs`, out[out.length - 1].rows.every((r) => r.ok !== false));
}
await db.exec(`
  update public.profiles set role = 'lgu_admin', lgu_psgc = ${SCZ}, status = 'active', is_approved = true where id = '${SCZ_ADMIN}';
  update public.profiles set role = 'lgu_admin', lgu_psgc = ${KAL}, status = 'active', is_approved = true where id = '${KAL_ADMIN}';
  update public.profiles set role = 'field_officer', lgu_psgc = ${SCZ}, status = 'active', is_approved = true where id = '${FIELD}';
`);
for (const run of ['runs', 'runs twice']) {
  const out = await db.exec(SQL('permits_fence.sql'));
  const rows = out[out.length - 1].rows;
  ok(`permits_fence.sql ${run}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}${r.detail ? ' (' + r.detail + ')' : ''}`).join('; '));
}

const lguOf = async (name) => (await db.query(`select lgu_psgc from public.permits where client_name = $1`, [name])).rows[0]?.lgu_psgc;
ok("a tree's permit takes the tree's LGU", Number(await lguOf('Brian')) === SCZ);
ok('a walk-in permit takes the nearest tagged tree\'s LGU', Number(await lguOf('Zaldy')) === SCZ);
ok('one far from every tree is left for PGENRO', (await lguOf('Far away')) === null);

async function as(id, role, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id ?? ''}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
const seen = (id, role = 'authenticated') =>
  as(id, role, async () => (await db.query(`select client_name from public.permits order by client_name`)).rows.map((r) => r.client_name));
const attempt = (id, sql, params = []) =>
  as(id, 'authenticated', async () => {
    try {
      const out = await db.query(sql, params);
      return { error: null, rows: out.affectedRows ?? out.rows.length };
    } catch (e) {
      return { error: e.message };
    }
  });

ok('Santa Cruz sees its own permits', JSON.stringify(await seen(SCZ_ADMIN)) === JSON.stringify(['Brian', 'Zaldy']), JSON.stringify(await seen(SCZ_ADMIN)));
ok('Kalayaan sees none of Santa Cruz\'s', (await seen(KAL_ADMIN)).length === 0, JSON.stringify(await seen(KAL_ADMIN)));
ok('PGENRO sees every permit, placed or not', (await seen(PG)).length === 3);
ok('a field officer sees no permit', (await seen(FIELD)).length === 0);
ok('the public sees no permit', (await seen(null, 'anon')).length === 0);

const issued = await attempt(KAL_ADMIN, `insert into public.permits (client_name, latitude, longitude, lgu_psgc) values ('Walk-in', 14.34, 121.53, ${SCZ})`);
ok('an office issues a walk-in permit', issued.error === null, issued.error ?? '');
ok('…filed under its own LGU, whatever the page sent', Number(await lguOf('Walk-in')) === KAL);
const other = await attempt(KAL_ADMIN, `insert into public.permits (tree_id, client_name) values ('scz', 'Not ours')`);
ok("an office cannot issue a permit for another LGU's tree", other.error !== null, other.error ?? 'ISSUED');
const pgIssue = await attempt(PG, `insert into public.permits (client_name) values ('PGENRO')`);
ok('PGENRO issues no permit', pgIssue.error !== null, pgIssue.error ?? 'ISSUED');
const touched = await attempt(SCZ_ADMIN, `update public.permits set contact_info = 'x' where client_name = 'Walk-in'`);
ok("Santa Cruz cannot change Kalayaan's permit", touched.error !== null || touched.rows === 0, JSON.stringify(touched));
const moved = await attempt(SCZ_ADMIN, `update public.permits set lgu_psgc = ${KAL} where client_name = 'Brian'`);
ok('a permit cannot be moved to another LGU', Number(await lguOf('Brian')) === SCZ, JSON.stringify(moved));
const archived = await attempt(PG, `select public.archive_permit((select id::text from public.permits where client_name = 'Brian'))`);
ok('PGENRO archives no permit: it reads them (18 October)', archived.error !== null, archived.error ?? 'ARCHIVED');

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
