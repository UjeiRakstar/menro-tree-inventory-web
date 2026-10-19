// Runs supabase/accounts.sql against real Postgres (PGlite), with stand-ins for
// the parts of Supabase it depends on, then checks the behaviour that matters.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const OFFICER_SCZ = '00000000-0000-0000-0000-0000000000b1';
const OFFICER_CLB = '00000000-0000-0000-0000-0000000000b2';
const OFFICER_LOST = '00000000-0000-0000-0000-0000000000b3';

// ---- Supabase stand-ins --------------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  -- pgcrypto stand-ins, with Supabase's signatures.
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
  create policy "Arborists read their own profile" on public.profiles for select to authenticated using (auth.uid() = id);
  create policy "Arborists update their own profile" on public.profiles for update to authenticated
    using (auth.uid() = id) with check (auth.uid() = id);

  -- The mobile repo's sign-up trigger, in essence.
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
  insert into public.trees values ('t-scz', 'Narra', 403426001, null), ('t-clb', 'Mango', 403405001, null);

  create table public.arborists (id serial primary key, name text, email text);
  alter table public.arborists enable row level security;
  create policy "staff manage arborists" on public.arborists for all to authenticated using (true) with check (true);

  grant usage on schema public, auth, extensions to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  grant usage on all sequences in schema public to authenticated;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  alter default privileges in schema public grant select on tables to anon;
`);

// Accounts as they stand today.
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ADMIN}', 'admin@laguna.gov.ph', '{}'),
    ('${OFFICER_SCZ}', 'scz@field.ph', '{"municipality":"Sta. Cruz"}'),
    ('${OFFICER_CLB}', 'clb@field.ph', '{"municipality":"Calamba City"}'),
    ('${OFFICER_LOST}', 'lost@field.ph', '{"municipality":"Atlantis"}');
  update public.profiles set role = 'admin', is_approved = true where id = '${ADMIN}';
`);

// ---- Run the migration ---------------------------------------------------
const migration = readFileSync(new URL('../../supabase/accounts.sql', import.meta.url), 'utf8');
try {
  const out = await db.exec(migration);
  const final = out[out.length - 1].rows;
  console.log('\nThe file’s own check:');
  for (const row of final) {
    const mark = row.ok === null ? 'READ' : row.ok ? 'ok  ' : 'NOT ';
    console.log(`  ${mark} ${row.check}: ${row.detail}`);
  }
  console.log('');
  check('migration ran to the end', true);
  // "every barangay LGU is known" is about the real barangays table; the
  // stand-in here only has two rows, which are both known.
  check('its own checks all pass', final.filter((r) => r.ok !== null).every((r) => r.ok === true));
} catch (error) {
  check('migration ran to the end', false, error.message);
  process.exit(1);
}

try {
  await db.exec(migration);
  check('runs a second time without error', true);
} catch (error) {
  check('runs a second time without error', false, error.message);
}

// ---- Acting as somebody ----------------------------------------------------
async function as(userId, role, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
async function fails(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return e.message;
  }
}
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

// ---- Roles migrated --------------------------------------------------------
const roles = (await db.query(`select id, role, lgu_psgc from public.profiles`)).rows;
const byId = Object.fromEntries(roles.map((r) => [r.id, r]));
check('admin became pgenro', byId[ADMIN].role === 'pgenro');
check('arborists became field officers', byId[OFFICER_SCZ].role === 'field_officer');
check('"Sta. Cruz" placed in Santa Cruz', String(byId[OFFICER_SCZ].lgu_psgc) === '403426000');
check('"Calamba City" placed in Calamba', String(byId[OFFICER_CLB].lgu_psgc) === '403405000');
check('an unplaceable municipality stays null, not guessed', byId[OFFICER_LOST].lgu_psgc === null);

// ---- The hole that exists today --------------------------------------------
const selfPromote = await as(OFFICER_SCZ, 'authenticated', () =>
  fails(() => db.exec(`update public.profiles set role = 'pgenro' where id = '${OFFICER_SCZ}'`)));
check('a field officer cannot promote themselves', selfPromote !== null, selfPromote ?? 'IT WENT THROUGH');
const selfApprove = await as(OFFICER_LOST, 'authenticated', () =>
  fails(() => db.exec(`update public.profiles set is_approved = true where id = '${OFFICER_LOST}'`)));
check('a field officer cannot approve themselves', selfApprove !== null, selfApprove ?? 'IT WENT THROUGH');
const ownName = await as(OFFICER_SCZ, 'authenticated', () =>
  fails(() => db.exec(`update public.profiles set full_name = 'New Name' where id = '${OFFICER_SCZ}'`)));
check('…but can still edit their own name', ownName === null, ownName ?? '');

// ---- Codes -------------------------------------------------------------------
const notPgenro = await as(OFFICER_SCZ, 'authenticated', () =>
  fails(() => db.query(`select * from public.issue_account_code(403426000, 'x')`)));
check('only PGENRO issues codes', notPgenro !== null);

const issued = await as(ADMIN, 'authenticated', () =>
  one(`select * from public.issue_account_code(403426000, 'For Juan')`));
check('PGENRO issues a code', /^SCZ-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/.test(issued.code), issued.code);

const stored = await one(`select code_hash from public.account_codes limit 1`);
check('only the hash is stored', !stored.code_hash.toUpperCase().includes(issued.code.replace(/-/g, '')));

const typedLoosely = issued.code.toLowerCase().replace(/-/g, ' ');
const checked = await as(null, 'anon', () => one(`select * from public.check_account_code($1)`, [typedLoosely]));
check('anyone can check a code, typed loosely', checked.ok === true && checked.lgu_label === 'Santa Cruz', JSON.stringify(checked));
const bogus = await as(null, 'anon', () => one(`select * from public.check_account_code('SCZ-AAAA-AAAA')`));
check('a made-up code is not found', bogus.ok === false && bogus.reason === 'not_found');

// Redeem: GoTrue inserts the user, with the code in the metadata.
const MENRO = '00000000-0000-0000-0000-0000000000c1';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'juan@scz.gov.ph', $2)`, [
  MENRO,
  JSON.stringify({ full_name: 'Juan', account_code: typedLoosely }),
]);
const menro = await one(`select role, lgu_psgc, is_approved, status from public.profiles where id = $1`, [MENRO]);
check(
  'the code makes an approved Santa Cruz admin',
  menro.role === 'lgu_admin' && String(menro.lgu_psgc) === '403426000' && menro.is_approved === true,
  JSON.stringify(menro)
);

const reuse = await fails(() =>
  db.query(`insert into auth.users (email, raw_user_meta_data) values ('twice@x.ph', $1)`, [
    JSON.stringify({ account_code: issued.code }),
  ]));
check('a code works once', reuse !== null, reuse ?? 'SECOND ACCOUNT CREATED');
const afterUse = await as(null, 'anon', () => one(`select * from public.check_account_code($1)`, [issued.code]));
check('…and then says it was used', afterUse.reason === 'used');

const badCode = await fails(() =>
  db.query(`insert into auth.users (email, raw_user_meta_data) values ('bad@x.ph', $1)`, [
    JSON.stringify({ account_code: 'SCZ-AAAA-AAAA' }),
  ]));
check('a bad code fails the whole sign-up', badCode !== null);
const orphan = await one(`select count(*)::int as n from auth.users where email in ('twice@x.ph', 'bad@x.ph')`);
check('…leaving no half-made account behind', orphan.n === 0);

await db.query(`insert into auth.users (email, raw_user_meta_data) values ('newfield@x.ph', $1)`, [
  JSON.stringify({ municipality: 'Santa Cruz' }),
]);
const newField = await one(`select role, lgu_psgc, is_approved from public.profiles where email = 'newfield@x.ph'`);
check(
  'a sign-up with no code is a field officer awaiting approval',
  newField.role === 'field_officer' && newField.is_approved === false && String(newField.lgu_psgc) === '403426000',
  JSON.stringify(newField)
);

// ---- Seats -------------------------------------------------------------------
for (let i = 0; i < 4; i += 1) {
  await as(ADMIN, 'authenticated', () => db.query(`select * from public.issue_account_code(403426000)`));
}
const sixth = await as(ADMIN, 'authenticated', () =>
  fails(() => db.query(`select * from public.issue_account_code(403426000)`)));
check('the sixth seat is refused', sixth !== null && /seats taken/.test(sixth), sixth ?? 'ISSUED');

// ---- What an LGU admin sees and may do ----------------------------------------
const visible = await as(MENRO, 'authenticated', () => db.query(`select email from public.profiles order by email`));
const emails = visible.rows.map((r) => r.email);
check(
  'an LGU admin sees their own LGU only',
  emails.includes('scz@field.ph') && !emails.includes('clb@field.ph') && !emails.includes('admin@laguna.gov.ph'),
  emails.join(', ')
);

// ---- field_team_fence.sql: the old field team list, by LGU ----------------------
await db.exec(`insert into public.arborists (name, email) values ('Scz', 'scz@field.ph'), ('Clb', 'clb@field.ph'), ('Nobody', 'orphan@x.ph')`);
try {
  const fence = await db.exec(readFileSync(new URL('../../supabase/field_team_fence.sql', import.meta.url), 'utf8'));
  check('field_team_fence.sql runs', fence[fence.length - 1].rows[0].ok === true);
  await db.exec(readFileSync(new URL('../../supabase/field_team_fence.sql', import.meta.url), 'utf8'));
} catch (error) {
  check('field_team_fence.sql runs', false, error.message);
}
const team = (await as(MENRO, 'authenticated', () => db.query(`select email from public.arborists order by email`))).rows.map((r) => r.email);
check('an office sees its own field team on the old list, not every LGU’s', team.join(',') === 'scz@field.ph', team.join(', '));
const dropOther = await as(MENRO, 'authenticated', () => db.query(`delete from public.arborists where email = 'clb@field.ph'`));
check('…and cannot remove another LGU’s officer from it', dropOther.affectedRows === 0);
const addOther = await as(MENRO, 'authenticated', () => fails(() => db.query(`insert into public.arborists (name, email) values ('x', 'clb@field.ph')`)));
check('…nor add one to it', addOther !== null);
const pgTeam = (await as(ADMIN, 'authenticated', () => db.query(`select count(*)::int n from public.arborists`))).rows[0].n;
check('PGENRO sees the whole list', pgTeam === 3, String(pgTeam));
const anonTeam = await as(null, 'anon', () => db.query(`select count(*)::int n from public.arborists`));
check('the public sees none of it', anonTeam.rows[0].n === 0);

const approveOwn = await as(MENRO, 'authenticated', () =>
  db.query(`update public.profiles set is_approved = true where email = 'newfield@x.ph'`));
check('an LGU admin approves their own field officer', approveOwn.affectedRows === 1);
const approveOther = await as(MENRO, 'authenticated', () =>
  db.query(`update public.profiles set is_approved = true where email = 'clb@field.ph'`));
check('…but not another LGU’s', approveOther.affectedRows === 0);
const promoteOther = await as(MENRO, 'authenticated', () =>
  fails(() => db.exec(`update public.profiles set role = 'lgu_admin' where email = 'newfield@x.ph'`)));
check('…and cannot make a field officer an admin', promoteOther !== null);

// ---- Locking -------------------------------------------------------------------
const treeBefore = await as(MENRO, 'authenticated', () =>
  db.query(`update public.trees set assigned_to = 'someone' where id = 't-scz'`));
check('an active admin can dispatch', treeBefore.affectedRows === 1);

const selfLock = await as(ADMIN, 'authenticated', () =>
  fails(() => db.query(`select public.set_account_status($1, 'locked')`, [ADMIN])));
check('PGENRO cannot lock itself out', selfLock !== null);
await as(ADMIN, 'authenticated', () => db.query(`select public.set_account_status($1, 'locked')`, [MENRO]));
const treeLocked = await as(MENRO, 'authenticated', () =>
  db.query(`update public.trees set assigned_to = 'someone else' where id = 't-scz'`));
check('a locked admin changes nothing', treeLocked.affectedRows === 0);
const insertLocked = await as(MENRO, 'authenticated', () =>
  fails(() => db.query(`insert into public.trees values ('t-new', 'Acacia', 403426001, null)`)));
check('…and adds nothing', insertLocked !== null);
const ownWhileLocked = await as(MENRO, 'authenticated', () =>
  one(`select status from public.profiles where id = $1`, [MENRO]));
check('…but can still read that it is locked', ownWhileLocked?.status === 'locked');

await as(ADMIN, 'authenticated', () => db.query(`select public.set_account_status($1, 'archived')`, [MENRO]));
const seatFreed = await as(ADMIN, 'authenticated', () =>
  fails(() => db.query(`select * from public.issue_account_code(403426000)`)));
check('archiving frees the seat', seatFreed === null, seatFreed ?? '');
const restoreFull = await as(ADMIN, 'authenticated', () =>
  fails(() => db.query(`select public.set_account_status($1, 'active')`, [MENRO])));
check('restoring into a full LGU is refused', restoreFull !== null && /no free admin seat/.test(restoreFull), restoreFull ?? 'RESTORED');

// ---- The log -------------------------------------------------------------------
const actions = (await db.query(`select action from public.activity_log order by id`)).rows.map((r) => r.action);
for (const expected of ['code.issued', 'code.redeemed', 'field_officer.approved', 'tree.update', 'account.locked', 'account.archived']) {
  check(`logged: ${expected}`, actions.includes(expected));
}
const treeEntry = await one(`select details from public.activity_log where action = 'tree.update' limit 1`);
check('a tree change logs which columns changed', JSON.stringify(treeEntry.details) === '{"changed":["assigned_to"]}', JSON.stringify(treeEntry.details));
const forged = await as(OFFICER_SCZ, 'authenticated', () =>
  fails(() => db.query(`insert into public.activity_log (action) values ('forged')`)));
check('nobody writes to the log by hand', forged !== null);

// ---- lgu_named -------------------------------------------------------------------
const names = (
  await db.query(`select n, public.lgu_named(n) as p from unnest(array[
    'Santa Cruz','Sta. Cruz','santa cruz, laguna','Calamba City','City of Calamba','Los Banos','Los Baños','Nowhere','']) as n`)
).rows;
const want = {
  'Santa Cruz': 403426000, 'Sta. Cruz': 403426000, 'santa cruz, laguna': 403426000,
  'Calamba City': 403405000, 'City of Calamba': 403405000, 'Los Banos': 403411000,
  'Los Baños': 403411000, Nowhere: null, '': null,
};
check(
  'lgu_named reads the spellings the app sends',
  names.every((r) => (r.p === null ? null : Number(r.p)) === want[r.n]),
  names.map((r) => `${r.n || '(blank)'}→${r.p}`).join(', ')
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
