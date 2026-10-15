// accounts.sql, then lgu_fence.sql, against real Postgres (PGlite), then every
// write the fence should allow and refuse.
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
    (403405001, 'Bucal', 'Calamba', 'Calamba City', 403405000, true);
  create table public.profiles (
    id uuid primary key references auth.users(id), email text, full_name text,
    role text default 'arborist', is_approved boolean default false,
    municipality text, barangay text, contact_number text, avatar_url text,
    observer_height numeric, rejected_at timestamptz, rejection_reason text,
    created_at timestamptz default now());
  alter table public.profiles enable row level security;
  create policy "own read" on public.profiles for select to authenticated using (auth.uid() = id);
  create policy "own update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
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
  create table public.trees (id text primary key, species text, barangay_psgc bigint, assigned_to text, task_status text);
  alter table public.trees enable row level security;
  create policy "authenticated users full access" on public.trees for all to authenticated using (true) with check (true);
  create policy "anon reads trees" on public.trees for select to anon using (true);
  insert into public.trees values
    ('scz', 'Narra', 403426001, null, null),
    ('scz-2', 'Mango', 403426001, null, null),
    ('clb', 'Acacia', 403405001, null, null),
    ('clb-mine', 'Santol', 403405001, 'field@scz.ph', null),
    ('nowhere', 'Mahogany', null, null, null);
  grant usage on schema public, auth, extensions to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  alter default privileges in schema public grant select on tables to anon;
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ADMIN}', 'admin@laguna.gov.ph', '{}'),
    ('${FIELD_SCZ}', 'Field@scz.ph', '{"municipality":"Santa Cruz"}');
  update public.profiles set role = 'admin', is_approved = true where id = '${ADMIN}';
`);

for (const file of ['accounts.sql', 'lgu_fence.sql']) {
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
try {
  await db.exec(readFileSync(new URL('../../supabase/lgu_fence.sql', import.meta.url), 'utf8'));
  check('lgu_fence.sql runs twice', true);
} catch (error) {
  check('lgu_fence.sql runs twice', false, error.message);
}

async function as(userId, role, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function fails(fn) { try { await fn(); return null; } catch (e) { return e.message; } }
const changed = async (who, role, sql) => (await as(who, role, () => db.query(sql))).affectedRows;

// A Santa Cruz MENRO, made the real way: a code from PGENRO.
await db.exec('approve;').catch(() => {});
await db.query(`update public.profiles set is_approved = true where id = $1`, [FIELD_SCZ]);
const code = (await as(ADMIN, 'authenticated', () => db.query(`select * from public.issue_account_code(${SCZ})`))).rows[0].code;
const MENRO = '00000000-0000-0000-0000-0000000000c1';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'menro@scz.gov.ph', $2)`,
  [MENRO, JSON.stringify({ account_code: code })]);

// ---- The MENRO ------------------------------------------------------------
check('a MENRO changes a tree in their LGU',
  (await changed(MENRO, 'authenticated', `update public.trees set assigned_to = 'x@y.ph' where id = 'scz'`)) === 1);
check('…but not one in another LGU',
  (await changed(MENRO, 'authenticated', `update public.trees set assigned_to = 'x@y.ph' where id = 'clb'`)) === 0);
const moveOut = await as(MENRO, 'authenticated', () =>
  fails(() => db.query(`update public.trees set barangay_psgc = 403405001 where id = 'scz-2'`)));
check('…nor move one of theirs into another LGU', moveOut !== null, moveOut ?? 'MOVED');
check('…nor touch a tree with no barangay',
  (await changed(MENRO, 'authenticated', `update public.trees set species = 'x' where id = 'nowhere'`)) === 0);
check('a MENRO deletes in their own LGU',
  (await changed(MENRO, 'authenticated', `delete from public.trees where id = 'scz-2'`)) === 1);
check('…and not elsewhere',
  (await changed(MENRO, 'authenticated', `delete from public.trees where id = 'clb'`)) === 0);

// ---- The field officer ------------------------------------------------------
check('a field officer changes a tree in their LGU',
  (await changed(FIELD_SCZ, 'authenticated', `update public.trees set task_status = 'Done' where id = 'scz'`)) === 1);
check('…and a tree they were dispatched to, in another LGU (email case ignored)',
  (await changed(FIELD_SCZ, 'authenticated', `update public.trees set task_status = 'Done' where id = 'clb-mine'`)) === 1);
const finish = await as(FIELD_SCZ, 'authenticated', () =>
  fails(() => db.query(`update public.trees set assigned_to = null where id = 'clb-mine'`)));
check('…and can finish that job by clearing the assignment', finish === null, finish ?? '');
check('…but not someone else\u2019s tree in another LGU',
  (await changed(FIELD_SCZ, 'authenticated', `update public.trees set task_status = 'Done' where id = 'clb'`)) === 0);
check('a field officer deletes nothing',
  (await changed(FIELD_SCZ, 'authenticated', `delete from public.trees where id = 'scz'`)) === 0);

// ---- PGENRO, adding, reading, locking -----------------------------------------
check('PGENRO changes any tree',
  (await changed(ADMIN, 'authenticated', `update public.trees set species = 'Acacia mangium' where id = 'clb'`)) === 1);
check('…including one with no barangay',
  (await changed(ADMIN, 'authenticated', `update public.trees set species = 'x' where id = 'nowhere'`)) === 1);
const added = await as(FIELD_SCZ, 'authenticated', () =>
  fails(() => db.query(`insert into public.trees values ('new', 'Banaba', 403405001, null, null)`)));
check('a field officer adds a tree across the town line', added === null, added ?? '');
const publicRead = (await as(null, 'anon', () => db.query(`select count(*)::int as n from public.trees`))).rows[0].n;
check('the public still reads the inventory', publicRead > 0, `${publicRead} trees`);
const anonWrite = await as(null, 'anon', () => fails(() => db.query(`update public.trees set species = 'x'`)));
check('the public writes nothing', anonWrite !== null, anonWrite ?? 'IT WROTE');
await as(ADMIN, 'authenticated', () => db.query(`select public.set_account_status($1, 'locked')`, [MENRO]));
check('a locked MENRO changes nothing, even in their LGU',
  (await changed(MENRO, 'authenticated', `update public.trees set assigned_to = 'z@y.ph' where id = 'scz'`)) === 0);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
