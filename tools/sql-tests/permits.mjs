// accounts.sql → permit_archive.sql, and who may archive: nobody, until the super admin.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const SQL = (f) => readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8');
const db = new PGlite();
const PG = '00000000-0000-0000-0000-00000000000a', FO = '00000000-0000-0000-0000-0000000000b1';
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function extensions.digest(data text, type text) returns bytea language sql immutable as $$ select sha256(convert_to(data, 'UTF8')) $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$ select decode(string_agg(lpad(to_hex((random()*255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
  create table public.barangays (psgc bigint primary key, name text, municipality text, municipality_label text, municipality_psgc bigint, is_city boolean);
  insert into public.barangays values (403426001, 'Labuin', 'Santa Cruz', 'Santa Cruz', 403426000, false);
  create table public.profiles (id uuid primary key references auth.users(id), email text, full_name text, role text default 'arborist', is_approved boolean default false,
    municipality text, barangay text, contact_number text, avatar_url text, observer_height numeric, rejected_at timestamptz, rejection_reason text, created_at timestamptz default now());
  alter table public.profiles enable row level security;
  create policy "own read" on public.profiles for select to authenticated using (auth.uid() = id);
  create table public.trees (id text primary key, species text, barangay_psgc bigint);
  alter table public.trees enable row level security;
  create table public.permits (id uuid primary key default gen_random_uuid(), tree_id text, client_name text, created_at timestamptz default now());
  alter table public.permits enable row level security;
  create policy "staff" on public.permits for all to authenticated using (true) with check (true);
  insert into public.permits (id, client_name) values ('11111111-1111-1111-1111-111111111111', 'Maria');
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  insert into auth.users (id, email) values ('${PG}', 'pgenro@laguna.gov.ph'), ('${FO}', 'fo@scz.ph');
  create table public.x (y int);
  update public.profiles set role = 'admin', is_approved = true;
`);
await db.query(`insert into public.profiles (id, email, role, is_approved) values ($1, 'pgenro@laguna.gov.ph', 'admin', true), ($2, 'fo@scz.ph', 'arborist', true)`, [PG, FO]);
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
await db.exec(SQL('accounts.sql'));
for (const run of ['runs', 'runs twice']) {
  const out = await db.exec(SQL('permit_archive.sql'));
  ok(`permit_archive.sql ${run}`, out[out.length - 1].rows.every((r) => r.ok !== false));
}
async function as(id, fn) { await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false); set role authenticated;`); try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); } }
const P = '11111111-1111-1111-1111-111111111111';
// Decided 18 October: a permit is its LGU's record; PGENRO reads it and
// archives nothing. The super admin will (super_admin.sql).
const e1 = await as(PG, async () => { try { await db.query(`select public.archive_permit($1)`, [P]); return null; } catch (e) { return e.message; } });
const row = (await db.query(`select archived_at from public.permits`)).rows[0];
ok('PGENRO archives no permit', e1 !== null && row.archived_at === null, e1 ?? 'ARCHIVED');
const e3 = await as(FO, async () => { try { await db.query(`select public.archive_permit($1)`, [P]); return null; } catch (e) { return e.message; } });
ok('…nor anyone else, until there is a super admin', e3 !== null, e3 ?? 'ARCHIVED');
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
