// map_areas.sql in real Postgres, after the files the live database has:
// accounts, lgu_fence, training_sandbox, municipal_halls, tag_routing.
import { readFileSync, readdirSync } from 'node:fs';
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

// The training seed comes in parts — the SQL editor refuses a query of about
// a megabyte — run one after another: training_seed.sql, training_seed_2.sql, …
const SEED_PARTS = readdirSync(new URL('../../supabase/', import.meta.url))
  .filter((file) => /^training_seed(_\d+)?\.sql$/.test(file))
  .sort((a, b) => Number(a.match(/_(\d+)\.sql$/)?.[1] ?? 1) - Number(b.match(/_(\d+)\.sql$/)?.[1] ?? 1));
async function seedAll() {
  const outs = [];
  for (const file of SEED_PARTS) outs.push(await asEditor(SQL(file)));
  return outs;
}

const PGENRO = '00000000-0000-0000-0000-00000000000a';
const FIELD = '00000000-0000-0000-0000-0000000000b1';
const SCZ = 403426000;
const CLB = 403405000;
const PILA = 403422000;

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema extensions; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
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
  grant usage on schema public, auth, extensions, storage to anon, authenticated;
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

const SQUARE = JSON.stringify({ type: 'Polygon', coordinates: [[[121.41, 14.28], [121.42, 14.28], [121.42, 14.29], [121.41, 14.28]]] });
const insertArea = (fields = {}) => {
  const row = { kind: 'land-cover', name: 'Test forest', geometry: SQUARE, cover_class: 'open-forest', municipality: 'Santa Cruz', ...fields };
  const cols = Object.keys(row);
  return db.query(
    `insert into public.map_areas (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
    Object.values(row)
  );
};

// ---- Saving ----------------------------------------------------------------------
const menroArea = (await as(MENRO_SCZ, 'authenticated', () => insertArea({ municipality: 'Calamba', lgu_psgc: CLB, created_by_role: 'pgenro' }))).rows[0];
check('a MENRO saves an area, filed under its own LGU whatever it claims',
  Number(menroArea.lgu_psgc) === SCZ && menroArea.created_by === MENRO_SCZ && menroArea.created_by_role === 'lgu_admin',
  JSON.stringify({ lgu: menroArea.lgu_psgc, role: menroArea.created_by_role }));

const pgArea = (await as(PGENRO, 'authenticated', () => insertArea({ name: 'Pila forest', municipality: 'Pila' }))).rows[0];
check('PGENRO saves anywhere, filed under the town it names', Number(pgArea.lgu_psgc) === PILA, String(pgArea.lgu_psgc));
const pgInScz = (await as(PGENRO, 'authenticated', () => insertArea({ name: 'PGENRO in Santa Cruz' }))).rows[0];

const fieldTry = await as(FIELD, 'authenticated', () => fails(() => insertArea()));
check('a field officer saves no area', fieldTry !== null, fieldTry ?? 'SAVED');
const anonTry = await as(null, 'anon', () => fails(() => insertArea()));
check('nor does the public', anonTry !== null, anonTry ?? 'SAVED');

const noClass = await as(MENRO_SCZ, 'authenticated', () => fails(() => insertArea({ cover_class: null })));
check('land cover needs its class', noClass !== null, noClass ?? 'SAVED');
const badClass = await as(MENRO_SCZ, 'authenticated', () => fails(() => insertArea({ cover_class: 'jungle' })));
check('…one of NAMRIA\u2019s', badClass !== null, badClass ?? 'SAVED');
const noDoc = await as(MENRO_SCZ, 'authenticated', () => fails(() => insertArea({ designation: 'protected-area' })));
check('a legal designation needs its document', noDoc !== null, noDoc ?? 'SAVED');
const withDoc = await as(MENRO_SCZ, 'authenticated', () => fails(() => insertArea({
  designation: 'zoning', doc_type: 'Municipal Ordinance', doc_number: '2019-012',
  doc_title: 'Zoning Ordinance of Santa Cruz', doc_url: 'https://x/area-documents/a.pdf' })));
check('…and with it, saves', withDoc === null, withDoc ?? '');
const site = await as(MENRO_SCZ, 'authenticated', () => fails(() => insertArea({
  kind: 'planting-site', cover_class: null, planting_status: 'open', spacing_m: 4 })));
check('a planting site needs no land cover class', site === null, site ?? '');
const badShape = await as(MENRO_SCZ, 'authenticated', () => fails(() => insertArea({ geometry: '{"type":"Point","coordinates":[1,2]}' })));
check('an area is a polygon', badShape !== null, badShape ?? 'SAVED');

check('anyone sees the areas', (await as(null, 'anon', () => count(`select count(*) n from public.map_areas`))) >= 5);

// ---- Changing ----------------------------------------------------------------------
const own = await as(MENRO_SCZ, 'authenticated', () => db.query(`update public.map_areas set name = 'Renamed' where id = $1`, [menroArea.id]));
check('a MENRO edits its LGU\u2019s area', own.affectedRows === 1);
const moved = await as(MENRO_SCZ, 'authenticated', () => db.query(`update public.map_areas set lgu_psgc = ${CLB}, created_by_role = 'pgenro' where id = $1`, [menroArea.id]));
const after = await one(`select lgu_psgc, created_by_role from public.map_areas where id = $1`, [menroArea.id]);
check('…but cannot move it to another LGU or change who drew it',
  Number(after.lgu_psgc) === SCZ && after.created_by_role === 'lgu_admin', `${moved.affectedRows} row, ${JSON.stringify(after)}`);
const other = await as(MENRO_CLB, 'authenticated', () => db.query(`update public.map_areas set name = 'Hijack' where id = $1`, [menroArea.id]));
check('another LGU\u2019s MENRO cannot touch it', other.affectedRows === 0);
const pgOnOffice = await as(MENRO_SCZ, 'authenticated', () => db.query(`update public.map_areas set name = 'Mine now' where id = $1`, [pgInScz.id]));
check('a MENRO cannot edit what PGENRO drew in its LGU', pgOnOffice.affectedRows === 0);
const pgDirect = await as(PGENRO, 'authenticated', () => db.query(`update public.map_areas set name = 'Direct' where id = $1`, [menroArea.id]));
check('PGENRO cannot change a MENRO\u2019s area directly', pgDirect.affectedRows === 0);
const pgOwn = await as(PGENRO, 'authenticated', () => db.query(`update public.map_areas set name = 'Pila forest, edited' where id = $1`, [pgArea.id]));
check('PGENRO edits what PGENRO drew', pgOwn.affectedRows === 1);

// ---- Proposals --------------------------------------------------------------------------
const changes = JSON.stringify({ name: 'Labuin Forest (PGENRO)', cover_class: 'closed-forest', lgu_psgc: CLB, created_by: PGENRO });
const proposal = (await as(PGENRO, 'authenticated', () => db.query(
  `insert into public.map_area_proposals (area_id, changes, note) values ($1, $2, 'Canopy is closed') returning *`,
  [menroArea.id, changes]))).rows[0];
check('PGENRO proposes a change to a MENRO\u2019s area', proposal?.status === 'pending' && proposal.proposed_by === PGENRO);
const ownProposal = await as(PGENRO, 'authenticated', () => fails(() => db.query(
  `insert into public.map_area_proposals (area_id, changes) values ($1, '{}')`, [pgArea.id])));
check('…but not to its own, which it simply edits', ownProposal !== null, ownProposal ?? 'PROPOSED');
const menroProposes = await as(MENRO_SCZ, 'authenticated', () => fails(() => db.query(
  `insert into public.map_area_proposals (area_id, changes) values ($1, '{}')`, [menroArea.id])));
check('a MENRO makes no proposals', menroProposes !== null, menroProposes ?? 'PROPOSED');
check('the MENRO sees it', (await as(MENRO_SCZ, 'authenticated', () => count(`select count(*) n from public.map_area_proposals`))) === 1);
check('another LGU does not', (await as(MENRO_CLB, 'authenticated', () => count(`select count(*) n from public.map_area_proposals`))) === 0);
const selfApprove = await as(PGENRO, 'authenticated', () => fails(() => db.query(`update public.map_area_proposals set status = 'approved' where id = $1`, [proposal.id])));
check('PGENRO cannot approve its own proposal', selfApprove !== null || (await one(`select status from public.map_area_proposals where id = $1`, [proposal.id])).status === 'pending', selfApprove ?? '');
const clbApprove = await as(MENRO_CLB, 'authenticated', () => fails(() => db.query(`select public.approve_area_proposal($1)`, [proposal.id])));
check('nor can another LGU\u2019s MENRO', clbApprove !== null, clbApprove ?? 'APPROVED');
const approve = await as(MENRO_SCZ, 'authenticated', () => fails(() => db.query(`select public.approve_area_proposal($1, 'Agreed')`, [proposal.id])));
const applied = await one(`select name, cover_class, lgu_psgc, created_by from public.map_areas where id = $1`, [menroArea.id]);
check('the MENRO approves, and the change is applied',
  approve === null && applied.name === 'Labuin Forest (PGENRO)' && applied.cover_class === 'closed-forest', approve ?? JSON.stringify(applied));
check('…but never who drew it, or its LGU', Number(applied.lgu_psgc) === SCZ && applied.created_by === MENRO_SCZ);
const twice = await as(MENRO_SCZ, 'authenticated', () => fails(() => db.query(`select public.approve_area_proposal($1)`, [proposal.id])));
check('a proposal is decided once', twice !== null, twice ?? 'AGAIN');
const second = (await as(PGENRO, 'authenticated', () => db.query(
  `insert into public.map_area_proposals (area_id, changes) values ($1, '{"name":"Nope"}') returning id`, [menroArea.id]))).rows[0];
await as(MENRO_SCZ, 'authenticated', () => db.query(`select public.decline_area_proposal($1, 'Not this')`, [second.id]));
const declined = await one(`select p.status, p.decision_note, a.name from public.map_area_proposals p join public.map_areas a on a.id = p.area_id where p.id = $1`, [second.id]);
check('the MENRO declines, and nothing changes', declined.status === 'declined' && declined.name === 'Labuin Forest (PGENRO)' && declined.decision_note === 'Not this');

// ---- Training -----------------------------------------------------------------------------
const tArea = (await as(TRAINEE, 'authenticated', () => insertArea({ name: 'Practice' }))).rows[0];
check('a trainee\u2019s area is a training area', tArea.is_training === true);
check('…the public never sees it', (await as(null, 'anon', () => count(`select count(*) n from public.map_areas where name = 'Practice'`))) === 0);
check('…nor the real MENRO of the same town', (await as(MENRO_SCZ, 'authenticated', () => count(`select count(*) n from public.map_areas where name = 'Practice'`))) === 0);
check('…and the trainee sees only training areas', (await as(TRAINEE, 'authenticated', () => count(`select count(*) n from public.map_areas`))) === 1);

// ---- Locked, deleting, the log -----------------------------------------------------------
await as(PGENRO, 'authenticated', () => db.query(`select public.set_account_status($1, 'locked')`, [MENRO_CLB]));
const locked = await as(MENRO_CLB, 'authenticated', () => fails(() => insertArea({ municipality: 'Calamba' })));
check('a locked account saves nothing', locked !== null, locked ?? 'SAVED');
const del = await as(MENRO_SCZ, 'authenticated', () => db.query(`delete from public.map_areas where id = $1`, [menroArea.id]));
check('a MENRO deletes its LGU\u2019s area, and its proposals go with it',
  del.affectedRows === 1 && (await count(`select count(*) n from public.map_area_proposals where area_id = $1`, [menroArea.id])) === 0);
const pgDel = await as(PGENRO, 'authenticated', () => db.query(`delete from public.map_areas where id = $1`, [pgInScz.id]));
check('PGENRO deletes what PGENRO drew', pgDel.affectedRows === 1);
const actions = (await db.query(`select distinct action from public.activity_log where entity = 'map_area' order by 1`)).rows.map((r) => r.action);
check('every step is in the activity log',
  ['area.delete', 'area.insert', 'area.proposal_approved', 'area.proposal_declined', 'area.proposed', 'area.update'].every((a) => actions.includes(a)),
  actions.join(', '));

// ---- Documents ----------------------------------------------------------------------------
const bucket = await one(`select public, allowed_mime_types from storage.buckets where id = 'area-documents'`);
check('the documents bucket is public and takes PDFs only', bucket?.public === true && bucket.allowed_mime_types.join() === 'application/pdf');
const upload = await as(MENRO_SCZ, 'authenticated', () => fails(() => db.query(
  `insert into storage.objects (bucket_id, name, owner) values ('area-documents', '403426000/a.pdf', $1)`, [MENRO_SCZ])));
check('an office uploads a document', upload === null, upload ?? '');
const fieldUpload = await as(FIELD, 'authenticated', () => fails(() => db.query(
  `insert into storage.objects (bucket_id, name, owner) values ('area-documents', 'x.pdf', $1)`, [FIELD])));
check('a field officer does not', fieldUpload !== null, fieldUpload ?? 'UPLOADED');

// closing_gaps.sql: documents are filed by office.
const upload2 = (who, path) => as(who, 'authenticated', () => fails(() => db.query(
  `insert into storage.objects (bucket_id, name, owner) values ('area-documents', $1, $2)`, [path, who])));
const wrongFolder = await upload2(MENRO_SCZ, '403405000/b.pdf');
check('an office uploads only into its own LGU’s folder', wrongFolder !== null, wrongFolder ?? 'UPLOADED');
const pgUpload = await upload2(PGENRO, 'pgenro/p.pdf');
const pgWrong = await upload2(PGENRO, '403426000/p.pdf');
check('PGENRO uploads into its own folder', pgUpload === null && pgWrong !== null, pgUpload ?? pgWrong ?? 'UPLOADED');
const removeOwn = await as(MENRO_SCZ, 'authenticated', () => db.query(
  `delete from storage.objects where bucket_id = 'area-documents' and name = '403426000/a.pdf'`));
check('an office removes its LGU’s old document', removeOwn.affectedRows === 1);
const removePg = await as(MENRO_SCZ, 'authenticated', () => db.query(
  `delete from storage.objects where bucket_id = 'area-documents' and name = 'pgenro/p.pdf'`));
check('…but not PGENRO’s', removePg.affectedRows === 0);
const pgRemoves = await as(PGENRO, 'authenticated', () => db.query(
  `delete from storage.objects where bucket_id = 'area-documents' and name = 'pgenro/p.pdf'`));
check('PGENRO removes any', pgRemoves.affectedRows === 1);

// ---- Live updates ----------------------------------------------------------------------------
for (const label of ['runs', 'runs twice']) {
  const out = await asEditor(SQL('live_updates.sql'));
  const rows = out[out.length - 1].rows;
  check(`live_updates.sql ${label}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
}

// ---- PGENRO's map layers (map_layers.sql) -------------------------------------------------------
for (const label of ['runs', 'runs twice']) {
  const out = await asEditor(SQL('map_layers.sql'));
  const rows = out[out.length - 1].rows;
  check(`map_layers.sql ${label}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
}
const addLayer = (who, kind, file) => as(who, 'authenticated', () => fails(() => db.query(
  `insert into public.map_layers (kind, file_name, grid_path, meta) values ($1, $2, 'x.bin.gz', '{}')`, [kind, file])));
check('PGENRO uploads a layer', (await addLayer(PGENRO, 'flood', 'noah-v1.geojson')) === null);
await addLayer(PGENRO, 'flood', 'noah-v2.geojson');
const live = (await db.query(`select file_name from public.map_layers where kind = 'flood' and active`)).rows;
check('…a new one retires the one before, which is kept', live.length === 1 && live[0].file_name === 'noah-v2.geojson' &&
  (await count(`select count(*) n from public.map_layers where kind = 'flood'`)) === 2);
const menroLayer = await addLayer(MENRO_SCZ, 'soil', 'mine.geojson');
check('an office uploads no layer', menroLayer !== null, menroLayer ?? 'UPLOADED');
check('the public sees the live layers', (await as(null, 'anon', () => count(`select count(*) n from public.map_layers where active`))) === 1);

const climate = (who, lgu) => as(who, 'authenticated', () => fails(() => db.query(
  `insert into public.lgu_climate (lgu_psgc, temperature, rainfall, scenario) values ($1, '{"meanC":26.6}', '{"annualMm":2765}', 'SSP2-4.5')
   on conflict (lgu_psgc) do update set temperature = excluded.temperature`, [lgu])));
check('PGENRO keeps each LGU’s climate', (await climate(PGENRO, SCZ)) === null && (await climate(PGENRO, SCZ)) === null);
check('…an office does not', (await climate(MENRO_SCZ, SCZ)) !== null);
check('the public reads it', (await as(null, 'anon', () => count(`select count(*) n from public.lgu_climate`))) === 1);

const officeArea = (await one(`select id from public.map_areas where created_by = $1 and not is_training limit 1`, [MENRO_SCZ])).id;
const logBefore = await count(`select count(*) n from public.activity_log where entity = 'map_area' and action = 'area.update'`);
const pgFacts = await as(PGENRO, 'authenticated', () => fails(() => db.query(
  `select public.set_area_layer_facts($1, '{"flood":{"total":120}}')`, [officeArea])));
const stored = await one(`select layer_facts, name from public.map_areas where id = $1`, [officeArea]);
check('PGENRO refreshes the facts of an office’s area, and nothing else of it',
  pgFacts === null && stored.layer_facts?.flood?.total === 120, pgFacts ?? JSON.stringify(stored));
check('…without it showing in the activity log as an edit',
  (await count(`select count(*) n from public.activity_log where entity = 'map_area' and action = 'area.update'`)) === logBefore);
const fieldFacts = await as(FIELD, 'authenticated', () => fails(() => db.query(`select public.set_area_layer_facts($1, '{}')`, [officeArea])));
check('a field officer cannot', fieldFacts !== null, fieldFacts ?? 'SET');
const traineeFacts = await as(TRAINEE, 'authenticated', () => fails(() => db.query(`select public.set_area_layer_facts($1, '{}')`, [officeArea])));
check('nor can a trainee, on a real area', traineeFacts !== null, traineeFacts ?? 'SET');
const ownFacts = await as(MENRO_SCZ, 'authenticated', () => db.query(`update public.map_areas set layer_facts = '{"soil":[]}' where id = $1`, [officeArea]));
check('an office saves its own area’s facts with the area', ownFacts.affectedRows === 1);

const layerFile = (who, bucket) => as(who, 'authenticated', () => fails(() => db.query(
  `insert into storage.objects (bucket_id, name, owner) values ($1, 'flood/1/grid.bin.gz', $2)`, [bucket, who])));
check('PGENRO stores layer files', (await layerFile(PGENRO, 'map-layers')) === null);
check('…an office does not', (await layerFile(MENRO_SCZ, 'map-layers')) !== null);

// ---- The purge takes training areas --------------------------------------------------------
await asEditor(SQL('training_purge.sql'));
check('the training purge clears training areas, and only those',
  (await count(`select count(*) n from public.map_areas where is_training`)) === 0 &&
  (await count(`select count(*) n from public.map_areas`)) > 0);

// ---- Planting site requests (planting_requests.sql) -----------------------------------------------
for (const label of ['runs', 'runs twice']) {
  const out = await asEditor(SQL('planting_requests.sql'));
  const rows = out[out.length - 1].rows;
  check(`planting_requests.sql ${label}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
}
const plantingSite = (fields = {}) => insertArea({ kind: 'planting-site', cover_class: null, planting_status: 'open', ...fields });
const asked = (await as(MENRO_SCZ, 'authenticated', () => plantingSite({ name: 'Riverbank request', approval: 'approved' }))).rows[0];
check('a MENRO’s planting site is a request, whatever the page claims', asked.approval === 'requested', asked.approval);
const pgSite = (await as(PGENRO, 'authenticated', () => plantingSite({ name: 'PGENRO site' }))).rows[0];
check('PGENRO’s is on the map at once', pgSite.approval === 'approved', pgSite.approval);
const cover = (await as(MENRO_SCZ, 'authenticated', () => insertArea({ name: 'Plain cover' }))).rows[0];
check('land cover needs no approval', cover.approval === 'approved');

const seesRequest = (who, role = 'authenticated') =>
  as(who, role, () => count(`select count(*) n from public.map_areas where id = $1`, [asked.id]));
check('the public does not see a request', (await seesRequest(null, 'anon')) === 0);
check('another LGU does not', (await seesRequest(MENRO_CLB)) === 0);
check('a field officer does not', (await seesRequest(FIELD)) === 0);
check('the office that asked does, and PGENRO does', (await seesRequest(MENRO_SCZ)) === 1 && (await seesRequest(PGENRO)) === 1);

const selfApproveSite = await as(MENRO_SCZ, 'authenticated', () =>
  db.query(`update public.map_areas set approval = 'approved' where id = $1 returning approval`, [asked.id]));
check('an office cannot approve its own request', selfApproveSite.rows[0]?.approval !== 'approved', JSON.stringify(selfApproveSite.rows));
const menroDecides = await as(MENRO_SCZ, 'authenticated', () => fails(() => db.query(`select public.decide_planting_request($1, true)`, [asked.id])));
check('nor decide it', menroDecides !== null, menroDecides ?? 'DECIDED');
const pgEditsRequest = await as(PGENRO, 'authenticated', () => db.query(`update public.map_areas set name = 'Mine' where id = $1`, [asked.id]));
check('PGENRO does not edit a request — it decides it', pgEditsRequest.affectedRows === 0);

await as(PGENRO, 'authenticated', () => db.query(`select public.decide_planting_request($1, false, 'Too close to the river')`, [asked.id]));
const turnedDown = await one(`select approval, review_note, reviewed_by from public.map_areas where id = $1`, [asked.id]);
check('PGENRO declines, with a note the office sees',
  turnedDown.approval === 'declined' && turnedDown.review_note === 'Too close to the river' && turnedDown.reviewed_by === PGENRO);
check('a declined request is still not public', (await seesRequest(null, 'anon')) === 0);
const factsOnly = await as(MENRO_SCZ, 'authenticated', () => db.query(`update public.map_areas set layer_facts = '{}' where id = $1 returning approval`, [asked.id]));
check('refreshing its facts does not ask again', factsOnly.rows[0]?.approval === 'declined', JSON.stringify(factsOnly.rows));
const fixed = await as(MENRO_SCZ, 'authenticated', () => db.query(`update public.map_areas set name = 'Riverbank, set back' where id = $1 returning approval, review_note`, [asked.id]));
check('the office corrects it, and it is asked again — the note kept',
  fixed.rows[0]?.approval === 'requested' && fixed.rows[0]?.review_note === 'Too close to the river', JSON.stringify(fixed.rows));

const decidedOk = await as(PGENRO, 'authenticated', () => fails(() => db.query(`select public.decide_planting_request($1, true, 'Good')`, [asked.id])));
check('PGENRO approves it', decidedOk === null && (await one(`select approval from public.map_areas where id = $1`, [asked.id])).approval === 'approved', decidedOk ?? '');
check('…and the public sees it', (await seesRequest(null, 'anon')) === 1);
const again = await as(PGENRO, 'authenticated', () => fails(() => db.query(`select public.decide_planting_request($1, true)`, [asked.id])));
check('a request is decided once', again !== null, again ?? 'AGAIN');
const officeEdits = await as(MENRO_SCZ, 'authenticated', () => db.query(`update public.map_areas set name = 'Back to me' where id = $1`, [asked.id]));
const officeDeletes = await as(MENRO_SCZ, 'authenticated', () => db.query(`delete from public.map_areas where id = $1`, [asked.id]));
check('once approved, the office neither edits nor deletes it', officeEdits.affectedRows === 0 && officeDeletes.affectedRows === 0);
const pgKeeps = await as(PGENRO, 'authenticated', () => db.query(`update public.map_areas set planting_status = 'full' where id = $1 returning approval`, [asked.id]));
check('PGENRO looks after it from then on, and it stays approved', pgKeeps.rows[0]?.approval === 'approved', JSON.stringify(pgKeeps.rows));
const pgNoCover = await as(PGENRO, 'authenticated', () => db.query(`update public.map_areas set name = 'x' where id = $1`, [cover.id]));
check('…which gives PGENRO nothing over an office’s land cover', pgNoCover.affectedRows === 0);

const traineeSite = (await as(TRAINEE, 'authenticated', () => plantingSite({ name: 'Practice site' }))).rows[0];
const realDecidesTraining = await as(PGENRO, 'authenticated', () => fails(() => db.query(`select public.decide_planting_request($1, true)`, [traineeSite.id])));
check('a real PGENRO account does not decide a trainee’s request', realDecidesTraining !== null, realDecidesTraining ?? 'DECIDED');
const withdrawn = await as(MENRO_SCZ, 'authenticated', async () => {
  const fresh = (await plantingSite({ name: 'Second thoughts' })).rows[0];
  return db.query(`delete from public.map_areas where id = $1`, [fresh.id]);
});
check('an office withdraws a request it has not had decided', withdrawn.affectedRows === 1);

// ---- A bamboo stand (bamboo_stands.sql) ---------------------------------------------------------------
for (const label of ['runs', 'runs twice']) {
  const out = await asEditor(SQL('bamboo_stands.sql'));
  const rows = out[out.length - 1].rows;
  check(`bamboo_stands.sql ${label}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
}
const bamboo = await as(MENRO_SCZ, 'authenticated', () => fails(() => insertArea({ name: 'Riverbank kawayan', cover_class: 'bamboo-stand' })));
check('an office draws a bamboo stand', bamboo === null, bamboo ?? '');
const madeUp = await as(MENRO_SCZ, 'authenticated', () => fails(() => insertArea({ name: 'x', cover_class: 'jungle' })));
check('…and still no class that is not on the list', madeUp !== null, madeUp ?? 'SAVED');

// ---- A PGENRO training account (pgenro_training.sql) ------------------------------------------------
const PG_TRAINEE = '00000000-0000-0000-0000-0000000000f1';
await db.query(`insert into auth.users (id, email) values ($1, 'pg.trainee@training.invalid')`, [PG_TRAINEE]);
for (const label of ['runs', 'runs twice']) {
  const text = SQL('pgenro_training.sql').replace('PUT-THE-TRAINING-ACCOUNT-EMAIL-HERE', 'pg.trainee@training.invalid');
  const out = await asEditor(text);
  const rows = out[out.length - 1].rows;
  check(`pgenro_training.sql ${label}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok} ${r.detail ?? ''}`).join('; '));
}
const realRequest = (await as(MENRO_SCZ, 'authenticated', () => plantingSite({ name: 'A real request' }))).rows[0];
const pgtSees = async (id) => as(PG_TRAINEE, 'authenticated', () => count(`select count(*) n from public.map_areas where id = $1`, [id]));
check('a training PGENRO sees a trainee office’s request', (await pgtSees(traineeSite.id)) === 1);
check('…and no real request', (await pgtSees(realRequest.id)) === 0);
const pgtOnReal = await as(PG_TRAINEE, 'authenticated', () => fails(() => db.query(`select public.decide_planting_request($1, true)`, [realRequest.id])));
check('…nor decides one', pgtOnReal !== null, pgtOnReal ?? 'DECIDED');
const pgtDecides = await as(PG_TRAINEE, 'authenticated', () => fails(() => db.query(`select public.decide_planting_request($1, true, 'Practice')`, [traineeSite.id])));
check('it decides the trainee’s request',
  pgtDecides === null && (await one(`select approval from public.map_areas where id = $1`, [traineeSite.id])).approval === 'approved', pgtDecides ?? '');
const realStillDecides = await as(PGENRO, 'authenticated', () => fails(() => db.query(`select public.decide_planting_request($1, false, 'No')`, [realRequest.id])));
check('the real PGENRO still decides the real ones', realStillDecides === null, realStillDecides ?? '');
check('is_pgenro() is the real PGENRO only',
  (await as(PGENRO, 'authenticated', () => one(`select public.is_pgenro() v`))).v === true &&
  (await as(PG_TRAINEE, 'authenticated', () => one(`select public.is_pgenro() v`))).v === false);

// ---- The training seed's areas (23 October) ----------------------------------------------------------
const realLogBefore = await count(`select count(*) n from public.activity_log where not is_training`);
const seedOuts = await seedAll();
const seedRows = seedOuts[seedOuts.length - 1][seedOuts[seedOuts.length - 1].length - 1].rows;
const seededAreas = Number(SQL('training_seed.sql').match(/--\s+(\d+) areas on the map/)[1]);
check('the training seed puts every town’s areas on the map — every one within the rules on areas',
  seedRows.find((r) => r.check === 'training areas')?.ok === true && seededAreas > 200 &&
  (await count(`select count(*) n from public.map_areas where is_training and notes = 'Practice data for training.'`)) === seededAreas,
  seedRows.map((r) => `${r.check}=${r.ok} (${r.detail})`).join('; ').slice(0, 400));
check('…without a line in the real activity log', (await count(`select count(*) n from public.activity_log where not is_training`)) === realLogBefore);
const kinds = await one(`select count(*) filter (where kind = 'planting-site' and approval = 'requested') requested,
  count(*) filter (where designation = 'protected-area') protected, count(*) filter (where cover_class = 'bamboo-stand') bamboo,
  count(distinct lgu_psgc) towns from public.map_areas where is_training and notes = 'Practice data for training.'`);
check('…planting sites to decide, protected forest, bamboo stands, in 23 towns (Nagcarlan since 28 October)',
  Number(kinds.requested) === 23 && Number(kinds.protected) === 23 && Number(kinds.bamboo) === 17 && Number(kinds.towns) === 23, JSON.stringify(kinds));
check('the public and the real PGENRO see none of them',
  (await as(null, 'anon', () => count(`select count(*) n from public.map_areas where notes = 'Practice data for training.'`))) === 0 &&
  (await as(PGENRO, 'authenticated', () => count(`select count(*) n from public.map_areas where notes = 'Practice data for training.'`))) === 0);
const seededRequest = await one(`select id from public.map_areas where is_training and approval = 'requested' and notes = 'Practice data for training.' limit 1`);
check('a training PGENRO sees every town’s, and decides a seeded request',
  (await as(PG_TRAINEE, 'authenticated', () => count(`select count(*) n from public.map_areas where notes = 'Practice data for training.'`))) === seededAreas &&
  (await as(PG_TRAINEE, 'authenticated', () => fails(() => db.query(`select public.decide_planting_request($1, true)`, [seededRequest.id])))) === null);

const reMap = await asEditor(SQL('map_areas.sql'));
check('running map_areas.sql again does not make requests public',
  reMap[reMap.length - 1].rows.every((r) => r.ok !== false) &&
  (await as(null, 'anon', () => count(`select count(*) n from public.map_areas where approval <> 'approved'`))) === 0 &&
  (await count(`select count(*) n from public.map_areas where approval <> 'approved'`)) > 0);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
