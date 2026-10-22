// accounts.sql, lgu_fence.sql, then tree_records.sql (22 October): who captured a
// tree, and archiving one instead of deleting it.
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
const rows = async (who, role, sql, params = []) => (await as(who, role, () => db.query(sql, params))).rows;

// A Santa Cruz MENRO, made the real way: a code from PGENRO.
await db.query(`update public.profiles set is_approved = true where id = $1`, [FIELD_SCZ]);
const code = (await as(ADMIN, 'authenticated', () => db.query(`select * from public.issue_account_code(${SCZ})`))).rows[0].code;
const MENRO = '00000000-0000-0000-0000-0000000000c1';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'menro@scz.gov.ph', $2)`,
  [MENRO, JSON.stringify({ account_code: code })]);

// A tree the field officer saved BEFORE tree_records.sql: the activity log has it.
await as(FIELD_SCZ, 'authenticated', () => db.query(`insert into public.trees (id, species, barangay_psgc) values ('before', 'Molave', 403426001)`));

// ---- tree_records.sql ------------------------------------------------------------
for (const run of ['runs', 'runs twice']) {
  try {
    const out = await db.exec(readFileSync(new URL('../../supabase/tree_records.sql', import.meta.url), 'utf8'));
    const result = out[out.length - 1].rows;
    check(`tree_records.sql ${run}`, result.filter((r) => r.ok !== null).every((r) => r.ok === true),
      result.map((r) => `${r.check}=${r.ok}${r.detail ? ' (' + r.detail + ')' : ''}`).join('; '));
  } catch (error) {
    check(`tree_records.sql ${run}`, false, error.message);
    process.exit(1);
  }
}

// ---- Who captured it ---------------------------------------------------------------
const captured = async (id) => (await db.query(`select captured_by from public.trees where id = $1`, [id])).rows[0]?.captured_by ?? null;
check('a tree saved before the file gets its capturer from the activity log', (await captured('before')) === FIELD_SCZ);
await as(FIELD_SCZ, 'authenticated', () =>
  db.query(`insert into public.trees (id, species, barangay_psgc, captured_by) values ('new', 'Narra', 403426001, $1)`, [MENRO]));
check('a new tree is stamped with the account that saved it, whatever was sent', (await captured('new')) === FIELD_SCZ);
await as(MENRO, 'authenticated', () => db.query(`update public.trees set captured_by = $1, species = 'Narra (Pterocarpus)' where id = 'new'`, [MENRO]));
check('…and nobody changes it afterwards', (await captured('new')) === FIELD_SCZ);

// ---- Archiving -------------------------------------------------------------------
const ARCHIVE = `select public.archive_tree($1, $2, $3)`;
const noReason = await as(MENRO, 'authenticated', () => fails(() => db.query(ARCHIVE, ['scz', true, '  '])));
check('a tree is not archived without a reason', noReason !== null, noReason ?? 'archived');
const elsewhere = await as(MENRO, 'authenticated', () => fails(() => db.query(ARCHIVE, ['clb', true, 'Duplicate record'])));
check('a MENRO archives no tree of another LGU', elsewhere !== null, elsewhere ?? 'archived');
const officer = await as(FIELD_SCZ, 'authenticated', () => fails(() => db.query(ARCHIVE, ['scz', true, 'Died'])));
check('a field officer archives none', officer !== null, officer ?? 'archived');
const visitor = await as(null, 'anon', () => fails(() => db.query(ARCHIVE, ['scz', true, 'Died'])));
check('nor a visitor', visitor !== null, visitor ?? 'archived');

const archived = await as(MENRO, 'authenticated', () => fails(() => db.query(ARCHIVE, ['scz', true, 'Cut under permit 2026-14'])));
check('the MENRO archives its own LGU’s tree, with a reason', archived === null, archived ?? '');
const seenBy = async (who, role) => (await rows(who, role, `select id from public.trees`)).map((r) => r.id);
check('…which leaves the public map', !(await seenBy(null, 'anon')).includes('scz'));
check('…and every office page', !(await seenBy(MENRO, 'authenticated')).includes('scz') && !(await seenBy(ADMIN, 'authenticated')).includes('scz'));
const list = await rows(MENRO, 'authenticated', `select id, archive_reason, archived_by from public.archived_trees()`);
check('…and is listed for its office, with why and by whom',
  list.length === 1 && list[0].id === 'scz' && list[0].archive_reason === 'Cut under permit 2026-14' && list[0].archived_by === MENRO,
  JSON.stringify(list));
check('…for its office only', (await rows(ADMIN, 'authenticated', `select id from public.archived_trees()`)).length === 0);
check('it is still in the database, not deleted', (await db.query(`select count(*)::int n from public.trees where id = 'scz'`)).rows[0].n === 1);

await as(MENRO, 'authenticated', () => db.query(`update public.trees set archived_at = null where id = 'scz'`));
check('the archive is not undone by writing to the row', (await db.query(`select archived_at from public.trees where id = 'scz'`)).rows[0].archived_at !== null);
await as(MENRO, 'authenticated', () => db.query(`update public.trees set archived_at = now(), archive_reason = 'x' where id = 'scz-2'`));
check('…nor made by it', (await db.query(`select archived_at from public.trees where id = 'scz-2'`)).rows[0].archived_at === null);

const restored = await as(MENRO, 'authenticated', () => fails(() => db.query(ARCHIVE, ['scz', false, null])));
check('the MENRO puts it back', restored === null && (await seenBy(null, 'anon')).includes('scz'), restored ?? '');
check('…with its reason cleared', (await db.query(`select archive_reason from public.trees where id = 'scz'`)).rows[0].archive_reason === null);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
