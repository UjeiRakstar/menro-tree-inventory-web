// accounts.sql → satellite.sql: PGENRO takes the satellite snapshots and keeps
// the Copernicus instance ID; everyone sees the snapshots, nobody else the ID.
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
const ID = '0b9c2f1e-1111-4222-8333-944455556666';

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function extensions.digest(data text, type text) returns bytea language sql immutable as $$ select sha256(convert_to(data, 'UTF8')) $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$ select decode(string_agg(lpad(to_hex((random()*255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create table public.barangays (psgc bigint primary key, name text, municipality text, municipality_label text, municipality_psgc bigint, is_city boolean);
  create table public.profiles (id uuid primary key references auth.users(id), email text, full_name text, role text default 'arborist', is_approved boolean default false,
    municipality text, barangay text, contact_number text, avatar_url text, observer_height numeric, rejected_at timestamptz, rejection_reason text, created_at timestamptz default now());
  alter table public.profiles enable row level security;
  create policy "own read" on public.profiles for select to authenticated using (auth.uid() = id);
  create table public.trees (id text primary key, species text, scientific_name text, barangay text, municipality text,
    latitude float8, longitude float8, barangay_psgc bigint, is_training boolean not null default false);
  grant usage on schema public, auth, extensions, storage to anon, authenticated;
  grant all on storage.objects to anon, authenticated;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  alter default privileges in schema public grant select on tables to anon;
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
    const out = await db.exec(SQL('satellite.sql'));
    const rows = out[out.length - 1].rows;
    ok(`satellite.sql ${run}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
  } catch (error) {
    ok(`satellite.sql ${run}`, false, error.message);
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

// ---- The instance ID ---------------------------------------------------------------
const SAVE = `insert into public.satellite_settings (instance_id, cadence_days) values ($1, $2)
  on conflict (id) do update set instance_id = excluded.instance_id, cadence_days = excluded.cadence_days returning id`;

const officeSaves = await run(SCZ_ADMIN, SAVE, [ID, 7]);
ok('a MENRO / CENRO cannot set the instance ID', Boolean(officeSaves.error), officeSaves.error ?? 'saved');
const saved = await run(PG, SAVE, [ID, 7]);
ok('PGENRO saves it', !saved.error, saved.error ?? '');
const again = await run(PG, SAVE, [ID, 15]);
ok('and changes it to twice a month: still one row', !again.error && (await db.query(`select count(*)::int as n from public.satellite_settings`)).rows[0].n === 1, again.error ?? '');
const odd = await run(PG, SAVE, [ID, 3]);
ok('only every week or twice a month', Boolean(odd.error), odd.error ?? 'saved');
const junk = await run(PG, SAVE, ['https://example.com/?key=1', 7]);
ok('an instance ID that is not one is refused', Boolean(junk.error), junk.error ?? 'saved');

const pgenroReads = await run(PG, `select instance_id from public.satellite_settings`);
ok('PGENRO reads it back', pgenroReads.rows?.[0]?.instance_id === ID, pgenroReads.error ?? '');
const officeReads = await run(SCZ_ADMIN, `select instance_id from public.satellite_settings`);
ok('a MENRO / CENRO reads none', Boolean(officeReads.error) || officeReads.rows.length === 0);
const visitorReads = await run(null, `select instance_id from public.satellite_settings`, [], 'anon');
ok('a visitor reads none', Boolean(visitorReads.error) || visitorReads.rows.length === 0);

// ---- The snapshots -------------------------------------------------------------------
const TAKE = `insert into public.satellite_snapshots (imagery_from, imagery_to, tile_count, status)
  values ('2026-08-22', '2026-10-21', 600, 'live') returning id, status, taken_by`;

const officeTakes = await run(SCZ_ADMIN, TAKE);
ok('a MENRO / CENRO cannot take a snapshot', Boolean(officeTakes.error), officeTakes.error ?? 'taken');
const first = await run(PG, TAKE);
ok('PGENRO takes one: it starts as building, whatever was sent, stamped with who',
  !first.error && first.rows[0].status === 'building' && first.rows[0].taken_by === PG, first.error ?? JSON.stringify(first.rows));
const firstId = first.rows[0].id;

const progress = await run(PG, `update public.satellite_snapshots set tiles_done = 300, requests = 305 where id = $1`, [firstId]);
ok('it records its progress', !progress.error, progress.error ?? '');
const visitorWhileBuilding = await run(null, `select id from public.satellite_snapshots where status = 'live'`, [], 'anon');
ok('nothing is on the maps while it builds', visitorWhileBuilding.rows?.length === 0);

await run(PG, `update public.satellite_snapshots set status = 'live' where id = $1`, [firstId]);
const second = await run(PG, TAKE);
await run(PG, `update public.satellite_snapshots set status = 'live' where id = $1`, [second.rows[0].id]);
const statuses = (await db.query(`select id, status, finished_at from public.satellite_snapshots order by taken_at, status`)).rows;
const byId = Object.fromEntries(statuses.map((r) => [r.id, r]));
ok('a new one going live retires the one before',
  byId[firstId].status === 'retired' && byId[second.rows[0].id].status === 'live' && byId[second.rows[0].id].finished_at,
  JSON.stringify(statuses.map((r) => r.status)));

const visitorSees = await run(null, `select id, imagery_to from public.satellite_snapshots where status = 'live'`, [], 'anon');
ok('a visitor sees the live snapshot', visitorSees.rows?.length === 1 && visitorSees.rows[0].id === second.rows[0].id, visitorSees.error ?? '');
const officeEdits = await run(SCZ_ADMIN, `update public.satellite_snapshots set status = 'failed' returning id`);
ok('a MENRO / CENRO cannot change one', Boolean(officeEdits.error) || officeEdits.rows.length === 0);

const removeLive = await run(PG, `delete from public.satellite_snapshots where id = $1 returning id`, [second.rows[0].id]);
ok('the live one cannot be deleted', Boolean(removeLive.error) || removeLive.rows.length === 0);
const removeOld = await run(PG, `delete from public.satellite_snapshots where id = $1 returning id`, [firstId]);
ok('PGENRO deletes an old one', !removeOld.error && removeOld.rows.length === 1, removeOld.error ?? '');

// ---- The tiles -------------------------------------------------------------------
const bucket = (await db.query(`select public, allowed_mime_types, file_size_limit from storage.buckets where id = 'satellite-tiles'`)).rows[0];
ok('the tiles bucket is public, JPEG only', bucket?.public === true && bucket.allowed_mime_types.join() === 'image/jpeg', JSON.stringify(bucket));
const UPLOAD = `insert into storage.objects (bucket_id, name, owner) values ('satellite-tiles', $1, auth.uid()) returning id`;
const officeUploads = await run(SCZ_ADMIN, UPLOAD, ['x/14/1/1.jpg']);
ok('a MENRO / CENRO cannot upload a tile', Boolean(officeUploads.error), officeUploads.error ?? 'uploaded');
const pgenroUploads = await run(PG, UPLOAD, ['x/14/1/1.jpg']);
ok('PGENRO uploads one', !pgenroUploads.error, pgenroUploads.error ?? '');
const visitorTile = await run(null, `select name from storage.objects where bucket_id = 'satellite-tiles'`, [], 'anon');
ok('a visitor reads it', visitorTile.rows?.length === 1, visitorTile.error ?? '');
const officeDeletes = await run(SCZ_ADMIN, `delete from storage.objects where bucket_id = 'satellite-tiles' returning id`);
ok('a MENRO / CENRO cannot remove it', Boolean(officeDeletes.error) || officeDeletes.rows.length === 0);
const pgenroDeletes = await run(PG, `delete from storage.objects where bucket_id = 'satellite-tiles' returning id`);
ok('PGENRO removes it', !pgenroDeletes.error && pgenroDeletes.rows.length === 1, pgenroDeletes.error ?? '');

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
