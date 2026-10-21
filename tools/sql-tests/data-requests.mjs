// accounts.sql → data_requests.sql: the public records who downloads the
// inventory and what for; PGENRO alone reads it.
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
const SCZ = 403426000;

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
  grant usage on schema public, auth, extensions to anon, authenticated;
  insert into auth.users (id, email) values ('${PG}', 'pgenro@laguna.gov.ph'), ('${SCZ_ADMIN}', 'menro@scz.ph');
  insert into public.profiles (id, email) values ('${PG}', 'pgenro@laguna.gov.ph'), ('${SCZ_ADMIN}', 'menro@scz.ph');
  update public.profiles set role = 'admin', is_approved = true where id = '${PG}';
`);
await db.exec(SQL('accounts.sql'));
await db.exec(`
  update public.profiles set role = 'lgu_admin', lgu_psgc = ${SCZ}, status = 'active', is_approved = true where id = '${SCZ_ADMIN}';
`);

for (const run of ['runs', 'runs twice']) {
  try {
    const out = await db.exec(SQL('data_requests.sql'));
    const rows = out[out.length - 1].rows;
    ok(`data_requests.sql ${run}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
  } catch (error) {
    ok(`data_requests.sql ${run}`, false, error.message);
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
      return { error: null, rows: out.rows };
    } catch (e) {
      return { error: e.message };
    }
  });

const LOG = `select public.log_data_request($1, $2, $3, $4, $5, $6, $7) as id`;
const ana = ['Ana', 'Reyes', 'Ana@UPLB.edu.ph', 'UPLB', 'Thesis on urban trees', 'Santa Cruz', '{xlsx,geojson}'];

const logged = await run(null, LOG, ana, 'anon');
ok('a visitor with no account records a request', !logged.error && logged.rows[0].id, logged.error ?? '');
const kept = (await db.query(`select email, place, formats from public.data_requests`)).rows[0];
ok('it is kept as given, the email in lower case', kept.email === 'ana@uplb.edu.ph' && kept.place === 'Santa Cruz' && kept.formats.join() === 'xlsx,geojson');

for (const [what, args] of [
  ['an email that is not one', ['Ana', 'Reyes', 'not-an-email', 'UPLB', 'Thesis', 'Laguna', '{}']],
  ['no purpose', ['Ana', 'Reyes', 'ana@uplb.edu.ph', 'UPLB', '  ', 'Laguna', '{}']],
  ['no name', ['', 'Reyes', 'ana@uplb.edu.ph', 'UPLB', 'Thesis', 'Laguna', '{}']],
]) {
  const refused = await run(null, LOG, args, 'anon');
  ok(`${what} is refused`, Boolean(refused.error), refused.error ?? 'accepted');
}

const direct = await run(null, `insert into public.data_requests (first_name, last_name, email, affiliation, purpose) values ('X', 'Y', 'x@y.ph', 'Z', 'W')`, [], 'anon');
ok('nobody writes one directly', Boolean(direct.error), direct.error ?? 'accepted');

const visitorReads = await run(null, `select * from public.data_requests`, [], 'anon');
ok('a visitor reads none', Boolean(visitorReads.error) || visitorReads.rows.length === 0);
const officeReads = await run(SCZ_ADMIN, `select * from public.data_requests`);
ok('a MENRO / CENRO reads none', Boolean(officeReads.error) || officeReads.rows.length === 0, officeReads.error ?? `${officeReads.rows?.length} rows`);
const pgenroReads = await run(PG, `select * from public.data_requests`);
ok('PGENRO reads them', !pgenroReads.error && pgenroReads.rows.length === 1, pgenroReads.error ?? '');
const pgenroDeletes = await run(PG, `delete from public.data_requests returning id`);
ok('PGENRO removes one', !pgenroDeletes.error && pgenroDeletes.rows.length === 1, pgenroDeletes.error ?? '');

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
