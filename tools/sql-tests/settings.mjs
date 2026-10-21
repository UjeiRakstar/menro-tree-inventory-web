// office_settings.sql in real Postgres, after the files the live database has.
// Supabase Vault is stood in for by a table and its two functions.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const SQL = (file) => readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8');
const db = new PGlite();
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// The SQL editor runs the final query on its own.
async function asEditor(text) {
  const at = text.lastIndexOf('-- Did it take?');
  if (at < 0) return db.exec(text);
  const cut = text.lastIndexOf('\n-- ====', at);
  await db.exec(text.slice(0, cut));
  await db.exec('discard temp');
  return db.exec(text.slice(cut));
}

const PGENRO = '00000000-0000-0000-0000-00000000000a';
const FIELD = '00000000-0000-0000-0000-0000000000b1';
const SCZ = 403426000;
const CLB = 403405000;
const PILA = 403422000;

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions; create schema storage; create schema vault;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text);
  create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
    returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values ($1, $2, $3) returning id $$;
  create function vault.update_secret(secret_id uuid, new_secret text default null)
    returns void language sql as $$ update vault.secrets set secret = coalesce($2, secret) where id = $1 $$;
  create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function extensions.digest(data text, type text) returns bytea language sql immutable as $$
    select sha256(convert_to(data, 'UTF8')) $$;
  create function extensions.gen_random_bytes(n int) returns bytea language sql volatile as $$
    select decode(string_agg(lpad(to_hex((random()*255)::int), 2, '0'), ''), 'hex') from generate_series(1, n) $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  -- Supabase's own: the folders of a path, without the file.
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
  create table public.barangays (psgc bigint primary key, name text, municipality text,
    municipality_label text, municipality_psgc bigint, is_city boolean);
  insert into public.barangays values (403426001, 'Labuin', 'Santa Cruz', 'Santa Cruz', 403426000, false);
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
  create table public.pending_trees (id uuid primary key default gen_random_uuid(), latitude float8, longitude float8,
    barangay text, species text, status text default 'pending', assigned_to text, submitted_at timestamptz default now());
  alter table public.pending_trees enable row level security;
  create table public.permits (id uuid primary key default gen_random_uuid(), tree_id text);
  alter table public.permits enable row level security;
  create table public.arborists (id bigint generated always as identity primary key, email text);
  alter table public.arborists enable row level security;
  grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select, insert, delete on all tables in schema storage to authenticated;
  grant select on all tables in schema public to anon;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  alter default privileges in schema public grant select on tables to anon;
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${PGENRO}', 'pgenro@laguna.gov.ph', '{}'),
    ('${FIELD}', 'field@scz.ph', '{"municipality":"Santa Cruz"}');
  update public.profiles set role = 'admin', is_approved = true where id = '${PGENRO}';
  update public.profiles set is_approved = true where id = '${FIELD}';
`);

for (const file of ['accounts.sql', 'lgu_fence.sql', 'training_sandbox.sql', 'municipal_halls.sql', 'tag_routing.sql']) {
  try {
    await asEditor(SQL(file));
  } catch (error) {
    check(`${file} runs`, false, error.message);
    process.exit(1);
  }
}
for (const label of ['runs', 'runs twice']) {
  try {
    const out = await asEditor(SQL('map_areas.sql'));
    const rows = out[out.length - 1].rows;
    check(`map_areas.sql ${label}`, rows.every((r) => r.ok !== false),
      rows.map((r) => `${r.check}=${r.ok}${r.detail ? ' (' + r.detail + ')' : ''}`).join('; '));
  } catch (error) {
    check(`map_areas.sql ${label}`, false, error.message);
    process.exit(1);
  }
}

try {
  const out = await asEditor(SQL('closing_gaps.sql'));
  const rows = out[out.length - 1].rows;
  check('closing_gaps.sql runs', rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
} catch (error) {
  check('closing_gaps.sql runs', false, error.message);
  process.exit(1);
}

async function as(userId, role, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function fails(fn) { try { await fn(); return null; } catch (e) { return e.message; } }
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const count = async (sql, params) => Number((await one(sql, params)).n);

// Offices, by account code.
async function office(id, email, lgu, training = false) {
  const fnName = training ? 'issue_training_code' : 'issue_account_code';
  const code = (await as(PGENRO, 'authenticated', () => db.query(`select * from public.${fnName}(${lgu})`))).rows[0].code;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, email, JSON.stringify({ account_code: code })]);
  return id;
}
const MENRO_SCZ = await office('00000000-0000-0000-0000-0000000000c1', 'menro@scz.gov.ph', SCZ);
const MENRO_CLB = await office('00000000-0000-0000-0000-0000000000c2', 'cenro@calamba.gov.ph', CLB);
const TRAINEE = await office('00000000-0000-0000-0000-0000000000d1', 'trainee@scz.gov.ph', SCZ, true);


// ---- office_settings.sql ------------------------------------------------------------------
for (const label of ['runs', 'runs twice']) {
  try {
    const out = await asEditor(SQL('office_settings.sql'));
    const rows = out[out.length - 1].rows;
    check(`office_settings.sql ${label}`, rows.every((r) => r.ok !== false),
      rows.map((r) => `${r.check}=${r.ok}${r.detail ? ' (' + r.detail + ')' : ''}`).join('; '));
  } catch (error) {
    check(`office_settings.sql ${label}`, false, error.message);
    process.exit(1);
  }
}

// The profile.
const saveProfile = (who, officeId, head) => as(who, 'authenticated', () => fails(() => db.query(
  `insert into public.office_profiles (office, office_head, email) values ($1, $2, 'menro@scz.gov.ph')
   on conflict (office) do update set office_head = excluded.office_head`, [officeId, head])));
check('an office keeps its own profile', (await saveProfile(MENRO_SCZ, String(SCZ), 'Zaldy B. Ybardolaza II')) === null);
const stamped = await one(`select updated_by, office_head from public.office_profiles where office = $1`, [String(SCZ)]);
check('…stamped with who saved it', stamped.updated_by === MENRO_SCZ && stamped.office_head === 'Zaldy B. Ybardolaza II');
check('…and nobody else’s', (await saveProfile(MENRO_CLB, String(SCZ), 'Hijack')) !== null);
check('PGENRO keeps its own, not an LGU’s',
  (await saveProfile(PGENRO, 'pgenro', 'PENRO')) === null && (await saveProfile(PGENRO, String(SCZ), 'Override')) !== null);
check('a trainee changes nothing of the real office', (await saveProfile(TRAINEE, String(SCZ), 'Practice')) !== null);
check('the public reads the profiles, as on a letterhead',
  (await as(null, 'anon', () => count(`select count(*) n from public.office_profiles`))) === 2);

// The barangays' figures.
const saveStats = (who, psgc, population) => as(who, 'authenticated', () => fails(() => db.query(
  `insert into public.barangay_stats (barangay_psgc, lgu_psgc, population, households) values ($1, ${CLB}, $2, 414)
   on conflict (barangay_psgc) do update set population = excluded.population`, [psgc, population])));
check('an LGU keeps its barangays’ figures', (await saveStats(MENRO_SCZ, 403426001, 1659)) === null);
check('…filed under the barangay’s own LGU, whatever was sent',
  Number((await one(`select lgu_psgc from public.barangay_stats where barangay_psgc = 403426001`)).lgu_psgc) === SCZ);
check('another LGU cannot', (await saveStats(MENRO_CLB, 403426001, 1)) !== null);
check('a field officer cannot', (await saveStats(FIELD, 403426001, 1)) !== null);
check('no figures for a barangay that is not there', (await saveStats(MENRO_SCZ, 999999999, 1)) !== null);
check('a population is not negative', (await saveStats(MENRO_SCZ, 403426001, -5)) !== null);

// The AI key.
const KEY = 'AIzaSyD-test-key-0123456789abcdefghijkl';
const setKey = (who, key = KEY) => as(who, 'authenticated', () => db.query(`select public.set_office_ai_key($1) as hint`, [key]));
const hint = (await setKey(MENRO_SCZ)).rows[0].hint;
check('an office sets its own AI key, and is shown only its last four', hint === 'ijkl', hint);
const seen = await as(MENRO_SCZ, 'authenticated', () => one(`select office, key_hint, enabled from public.office_ai_settings`));
check('…which it sees, switched on', seen.office === String(SCZ) && seen.key_hint === 'ijkl' && seen.enabled === true);
const secretColumn = await as(MENRO_SCZ, 'authenticated', () => fails(() => db.query(`select secret_id from public.office_ai_settings`)));
check('…but not where the key is kept', secretColumn !== null, secretColumn ?? 'READ');
const readKey = await as(MENRO_SCZ, 'authenticated', () => fails(() => db.query(`select public.office_ai_key($1)`, [String(SCZ)])));
check('no page can read a key back, its own office’s included', readKey !== null, readKey ?? 'READ');
check('the key is kept in Vault', (await count(`select count(*) n from vault.secrets where secret = $1`, [KEY])) === 1);
check('another LGU does not see that it has one',
  (await as(MENRO_CLB, 'authenticated', () => count(`select count(*) n from public.office_ai_settings`))) === 0);
check('PGENRO sees which offices have one', (await as(PGENRO, 'authenticated', () => count(`select count(*) n from public.office_ai_settings`))) === 1);
const serverKey = await as(null, 'service_role', () => one(`select public.office_ai_key($1) as key`, [String(SCZ)]));
check('the server functions read it, with the service key', serverKey.key === KEY);
await setKey(MENRO_SCZ, 'AIzaSyD-second-key-0123456789abcdefghWXYZ');
check('replacing it keeps one secret, not two',
  (await count(`select count(*) n from vault.secrets where name = 'ai-key-${SCZ}'`)) === 1 &&
  (await as(null, 'service_role', () => one(`select public.office_ai_key($1) as key`, [String(SCZ)]))).key.endsWith('WXYZ'));
const notAKey = await as(MENRO_SCZ, 'authenticated', () => fails(() => setKey(MENRO_SCZ, 'short')));
check('something that is not a key is refused', notAKey !== null, notAKey ?? 'SET');
const traineeKey = await fails(() => setKey(TRAINEE));
check('a trainee sets no key', traineeKey !== null, traineeKey ?? 'SET');
const fieldKey = await fails(() => setKey(FIELD));
check('nor does a field officer', fieldKey !== null, fieldKey ?? 'SET');
await as(MENRO_SCZ, 'authenticated', () => db.query(`select public.set_office_ai_enabled(false)`));
const off = await as(null, 'service_role', () => one(
  `select public.office_ai_key($1) as key, public.office_ai_enabled($1) as enabled`, [String(SCZ)]));
check('switched off, the servers get no key, and know AI is off', off.key === null && off.enabled === false);
check('an office that never set anything has AI on, with no key of its own',
  (await as(null, 'service_role', () => one(`select public.office_ai_enabled($1) as enabled`, [String(CLB)]))).enabled === true);
await as(MENRO_SCZ, 'authenticated', () => db.query(`select public.clear_office_ai_key()`));
check('removing the key takes it out of Vault',
  (await count(`select count(*) n from vault.secrets where name = 'ai-key-${SCZ}'`)) === 0 &&
  (await one(`select key_hint, secret_id from public.office_ai_settings where office = $1`, [String(SCZ)])).secret_id === null);

// The field team's last sign-in.
await db.query(`update public.profiles set role = 'field_officer', lgu_psgc = ${SCZ}, status = 'active' where id = $1`, [FIELD]);
await db.query(`update auth.users set last_sign_in_at = '2026-10-15T08:00:00Z' where id = $1`, [FIELD]);
const team = await as(MENRO_SCZ, 'authenticated', () => db.query(`select * from public.team_last_sign_in()`));
check('an office sees when its field team last signed in',
  team.rows.length === 1 && team.rows[0].id === FIELD && team.rows[0].last_sign_in_at !== null, JSON.stringify(team.rows));
check('another LGU does not', (await as(MENRO_CLB, 'authenticated', () => db.query(`select * from public.team_last_sign_in()`))).rows.length === 0);

// The logos.
const logo = (who, path) => as(who, 'authenticated', () => fails(() => db.query(
  `insert into storage.objects (bucket_id, name, owner) values ('office-logos', $1, $2)`, [path, who])));
check('an office uploads its logo into its own folder', (await logo(MENRO_SCZ, `${SCZ}/lgu.png`)) === null);
check('…not into another’s', (await logo(MENRO_SCZ, `${CLB}/lgu.png`)) !== null);
check('PGENRO into its own', (await logo(PGENRO, 'pgenro/office.png')) === null);

// ---- super_admin.sql: the super admin works in an LGU's settings (21 October) ------------
{
  const out = await asEditor(SQL('super_admin.sql').replace('PUT-YOUR-PGENRO-ACCOUNT-EMAIL-HERE', 'pgenro@laguna.gov.ph'));
  const rows = out[out.length - 1].rows;
  check('super_admin.sql runs after office_settings.sql', rows.every((r) => r.ok !== false),
    rows.map((r) => `${r.check}=${r.ok}${r.detail ? ' (' + r.detail + ')' : ''}`).join('; '));
}
check('the super admin keeps an LGU office’s profile', (await saveProfile(PGENRO, String(PILA), 'For Pila')) === null);
check('…and its barangays’ figures, through the same rule',
  (await as(PGENRO, 'authenticated', () => one(`select public.keeps_office($1) as ok`, [String(CLB)]))).ok === true);
check('…and still its own PGENRO profile', (await saveProfile(PGENRO, 'pgenro', 'PENRO')) === null);
check('an LGU office still keeps only its own', (await saveProfile(MENRO_CLB, String(SCZ), 'Hijack')) !== null);
check('nobody keeps an office that is not one', (await as(PGENRO, 'authenticated', () => one(`select public.keeps_office('not-an-office') as ok`))).ok === false);

const failed = results.filter((r) => !r.ok);
console.log(`
${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
