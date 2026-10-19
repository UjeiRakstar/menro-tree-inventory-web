// The training wall, in real Postgres: every SQL file in the order the live
// database got them, then training_sandbox.sql, the seed and the purge, and
// what each account can and cannot see and do.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const SQL = (file) => readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8');
const db = new PGlite();

// The Supabase SQL editor runs a script's final query on its own, apart from
// the rest — so anything temporary the script made is gone by then. Run the
// files the same way: everything up to the last check, discard temp, then the
// check by itself.
async function asEditor(text) {
  const at = text.lastIndexOf('-- Did it take?');
  if (at < 0) return db.exec(text);
  const cut = text.lastIndexOf('\n-- ====', at);
  await db.exec(text.slice(0, cut));
  await db.exec('discard temp');
  return db.exec(text.slice(cut));
}
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const PGENRO = '00000000-0000-0000-0000-00000000000a';
const FIELD_SCZ = '00000000-0000-0000-0000-0000000000b1';
const SCZ = 403426000;
const SNL = 403429000;

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
    ${readFileSync(new URL('./siniloan_brgys.sql', import.meta.url), 'utf8')};
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

  -- public.trees as the live one has it, less height_class so the seed has a
  -- key to leave out.
  create table public.trees (
    id text primary key, tree_id text, latitude float8, longitude float8, barangay text,
    barangay_psgc bigint, municipality text, species text, scientific_name text,
    species_type text, biodiversity_status text, tree_category text, dbh numeric,
    merchantable_height numeric, total_height numeric, "heightClass" text, stem_quality text,
    "isLeaning" boolean, "hasPowerlineConflict" boolean, "isRootProblem" boolean, "isDecayed" boolean,
    assigned_to text, has_cutting_permit boolean, task_status text, source text, is_tagged boolean,
    "dateCaptured" timestamptz, "imageUrl" text, photo_url text, leaves_url text, bark_url text,
    fruits_url text, created_at timestamptz default now());
  alter table public.trees enable row level security;
  create policy "authenticated users full access" on public.trees for all to authenticated using (true) with check (true);
  create policy "anon reads trees" on public.trees for select to anon using (true);
  insert into public.trees (id, species, barangay_psgc, municipality) values
    ('real-scz', 'Narra', 403426001, 'Santa Cruz'),
    ('real-snl', 'Mango', 403429010, 'Siniloan');

  create table public.pending_trees (id uuid primary key default gen_random_uuid(), latitude float8, longitude float8,
    barangay text, species text, status text default 'pending', assigned_to text, submitted_at timestamptz default now(),
    photo_url text, leaves_url text, bark_url text, fruits_url text);
  create policy "staff review submissions" on public.pending_trees for all to authenticated using (true) with check (true);
  insert into public.pending_trees (barangay, species) values ('Labuin', 'real-tag');

  create table public.permits (id uuid primary key default gen_random_uuid(), tree_id text, client_name text,
    contact_info text, reason text, requirements_urls text[], species text, number_of_trees int,
    address text, latitude float8, longitude float8, created_at timestamptz default now());
  alter table public.permits enable row level security;
  create policy "staff manage permits" on public.permits for all to authenticated using (true) with check (true);
  insert into public.permits (tree_id, client_name) values ('real-scz', 'Real Client');

  create table public.arborists (id bigint generated always as identity primary key, name text,
    email text unique, contact_number bigint, status text);
  alter table public.arborists enable row level security;
  create policy "staff manage arborists" on public.arborists for all to authenticated using (true) with check (true);
  insert into public.arborists (name, email, status) values ('Real Arborist', 'real@field.ph', 'Active');

  grant usage on schema public, auth, extensions to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select on all tables in schema public to anon;
  grant insert on public.pending_trees to anon;
  alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
  alter default privileges in schema public grant select on tables to anon;
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${PGENRO}', 'pgenro@laguna.gov.ph', '{}'),
    ('${FIELD_SCZ}', 'field@scz.ph', '{"municipality":"Santa Cruz"}');
  update public.profiles set role = 'admin', is_approved = true where id = '${PGENRO}';
  update public.profiles set is_approved = true where id = '${FIELD_SCZ}';
`);

// The live table already had row security on when the sandbox reached it
// (the public sees none of its tags); the older order starts without it.
if (process.env.LIVE_ORDER) await db.exec('alter table public.pending_trees enable row level security');

const runAll = async (files, label = 'runs') => {
  for (const file of files) {
    try {
      const out = await asEditor(SQL(file));
      const rows = out[out.length - 1].rows;
      const bad = rows.filter((r) => r.ok === false);
      check(`${file} ${label}`, bad.length === 0,
        rows.map((r) => `${r.check}=${r.ok}${r.detail ? ' (' + r.detail + ')' : ''}`).join('; '));
    } catch (error) {
      check(`${file} ${label}`, false, error.message);
      process.exit(1);
    }
  }
};

// LIVE_ORDER=1: the order the live database actually got them in — the
// sandbox before the halls and tag routing.
if (process.env.LIVE_ORDER) {
  await runAll(['crowdsource_promotion.sql', 'accounts.sql', 'lgu_fence.sql', 'training_sandbox.sql',
    'municipal_halls.sql', 'tag_routing.sql']);
} else {
  await runAll(['crowdsource_promotion.sql', 'accounts.sql', 'lgu_fence.sql', 'municipal_halls.sql', 'tag_routing.sql']);
}
await runAll(['training_sandbox.sql'], 'runs');
await runAll(['training_sandbox.sql'], 'runs twice');
await runAll(['closing_gaps.sql']);

async function as(userId, role, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function fails(fn) { try { await fn(); return null; } catch (e) { return e.message; } }
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const count = async (sql, params) => Number((await one(sql, params)).n);

// ---- The seed ----------------------------------------------------------------------
const realLogBefore = await count(`select count(*) n from public.activity_log where not is_training`);
const seedOut = await asEditor(SQL('training_seed.sql'));
const seedRows = seedOut[seedOut.length - 1].rows;
check('the seed runs and every count matches', seedRows.filter((r) => r.ok === false).length === 0,
  seedRows.map((r) => `${r.check}=${r.ok} (${r.detail})`).join('; '));
check('…and says which keys had no column', seedRows.some((r) => /left out of trees/.test(r.check) && /height_class/.test(r.detail)),
  seedRows.filter((r) => r.ok === null).map((r) => `${r.check}: ${r.detail}`).join('; '));
check('seeding writes nothing to the real activity log',
  (await count(`select count(*) n from public.activity_log where not is_training`)) === realLogBefore);
const reseed = await fails(() => asEditor(SQL('training_seed.sql')));
check('the seed runs again (a reset), without doubling up',
  reseed === null && (await count(`select count(*) n from public.trees where is_training`)) === 150, reseed ?? '');

// ---- Outside the wall --------------------------------------------------------------
const anonTrees = await as(null, 'anon', () => db.query(`select id from public.trees`));
check('the public sees the real trees and no training ones',
  anonTrees.rows.length === 2, anonTrees.rows.map((r) => r.id).join(', '));
const pgTrees = await as(PGENRO, 'authenticated', () => count(`select count(*) n from public.trees`));
check('PGENRO sees no training trees', pgTrees === 2, String(pgTrees));
const pgPermits = await as(PGENRO, 'authenticated', () => count(`select count(*) n from public.permits`));
check('…no training tags', (await as(null, 'anon', () => count('select count(*) n from public.pending_trees where is_training'))) === 0 && (await as(PGENRO, 'authenticated', () => count('select count(*) n from public.pending_trees where is_training'))) === 0);
check('…no training permits', pgPermits === 1, String(pgPermits));
const pgArb = await as(PGENRO, 'authenticated', () => count(`select count(*) n from public.arborists`));
check('…and no trainee arborists', pgArb === 1, String(pgArb));

// ---- A training code ---------------------------------------------------------------
const seatsBefore = await count(`select public.lgu_seats_taken(${SNL}) n`);
const trainingCode = (await as(PGENRO, 'authenticated', () => db.query(`select * from public.issue_training_code(${SNL})`))).rows[0].code;
check('PGENRO issues a training code', /^SNL-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(trainingCode), trainingCode);
check('…which does not take one of the five seats', (await count(`select public.lgu_seats_taken(${SNL}) n`)) === seatsBefore);
const lguIssue = await as(FIELD_SCZ, 'authenticated', () => fails(() => db.query(`select * from public.issue_training_code(${SNL})`)));
check('nobody else issues one', lguIssue !== null, lguIssue ?? 'ISSUED');

const TRAINEE = '00000000-0000-0000-0000-0000000000d1';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'trainee@snl.gov.ph', $2)`,
  [TRAINEE, JSON.stringify({ account_code: trainingCode, hall_lat: 14.42, hall_lng: 121.45 })]);
const trainee = await one(`select role, lgu_psgc, is_training from public.profiles where id = $1`, [TRAINEE]);
check('activating with it makes a trainee MENRO of that LGU',
  trainee.role === 'lgu_admin' && Number(trainee.lgu_psgc) === SNL && trainee.is_training === true, JSON.stringify(trainee));
const snlHall = await one(`select hall_lat from public.lgus where psgc = ${SNL}`);
check('…whose hall pin at sign-up is not kept: the hall is the real one', snlHall.hall_lat === null, JSON.stringify(snlHall));
const redeemedLog = await one(`select is_training from public.activity_log where actor = $1 and action = 'code.redeemed'`, [TRAINEE]);
check('…and whose activation is logged behind the wall', redeemedLog?.is_training === true);

// ---- Inside the wall ---------------------------------------------------------------
const tTrees = await as(TRAINEE, 'authenticated', () => db.query(`select id from public.trees`));
check('a trainee sees the 150 training trees and no real ones',
  tTrees.rows.length === 150 && !tTrees.rows.some((r) => r.id.startsWith('real')), String(tTrees.rows.length));
const tTags = await as(TRAINEE, 'authenticated', () => count(`select count(*) n from public.pending_trees`));
check('…the 12 training tags', tTags === 12, String(tTags));
const tArb = await as(TRAINEE, 'authenticated', () => db.query(`select email from public.arborists`));
check('…and only the trainee arborists to dispatch', tArb.rows.length === 3 && tArb.rows.every((r) => /training/.test(r.email)));

const touchReal = await as(TRAINEE, 'authenticated', () => db.query(`update public.trees set species = 'X' where id = 'real-snl'`));
check('a trainee cannot change a real tree in their own town', touchReal.affectedRows === 0);
const sneak = await as(TRAINEE, 'authenticated', () => fails(() => db.query(
  `insert into public.trees (id, species, barangay_psgc, is_training) values ('t-new', 'Banaba', 403429010, false)`)));
const tNew = await one(`select is_training from public.trees where id = 't-new'`);
check('a trainee\u2019s new tree is a training tree, whatever it claims', sneak === null && tNew?.is_training === true, sneak ?? JSON.stringify(tNew));
check('…and the public never sees it',
  (await as(null, 'anon', () => count(`select count(*) n from public.trees where id = 't-new'`))) === 0);

const dispatchT = await as(TRAINEE, 'authenticated', () => db.query(
  `update public.trees set assigned_to = 'ana.arborist@training.greentag.invalid' where id = 't-new'`));
check('a trainee dispatches to a training tree', dispatchT.affectedRows === 1);
const crossT = await as(TRAINEE, 'authenticated', () => fails(() => db.query(`update public.trees set is_training = false where id = 't-new'`)));
const stillT = await one(`select is_training from public.trees where id = 't-new'`);
check('…but cannot move it out of training', stillT.is_training === true, crossT ?? 'no error, flag kept');

const tPermit = await as(TRAINEE, 'authenticated', () => fails(() => db.query(
  `insert into public.permits (tree_id, client_name) values ('t-new', 'Practice')`)));
check('a trainee issues a practice permit', tPermit === null, tPermit ?? '');
check('…which PGENRO never sees',
  (await as(PGENRO, 'authenticated', () => count(`select count(*) n from public.permits where client_name = 'Practice'`))) === 0);

const realClaim = await as(PGENRO, 'authenticated', () => fails(() => db.query(
  `insert into public.trees (id, species, is_training) values ('r-new', 'Molave', true)`)));
const rNew = await one(`select is_training from public.trees where id = 'r-new'`);
check('a real account cannot make a training row', realClaim === null && rNew?.is_training === false, realClaim ?? JSON.stringify(rNew));

const hallT = await as(TRAINEE, 'authenticated', () => fails(() => db.query(`select public.set_lgu_hall(14.42, 121.45)`)));
check('a trainee cannot pin the municipal hall', hallT !== null, hallT ?? 'PINNED');

const selfOut = await as(TRAINEE, 'authenticated', () => fails(() => db.query(
  `update public.profiles set is_training = false where id = '${TRAINEE}'`)));
check('a trainee cannot take themselves out of training', selfOut !== null, selfOut ?? 'LEFT');

// ---- A trainee field officer ---------------------------------------------------------
const FO = '00000000-0000-0000-0000-0000000000e1';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'fo@snl.ph', '{"municipality":"Siniloan"}')`, [FO]);
const seesPending = await as(TRAINEE, 'authenticated', () => count(`select count(*) n from public.profiles where id = '${FO}'`));
check('a trainee sees a field officer waiting for approval in their town', seesPending === 1);
const approve = await as(TRAINEE, 'authenticated', () => fails(() => db.query(
  `update public.profiles set is_approved = true where id = '${FO}'`)));
const fo = await one(`select is_approved, is_training from public.profiles where id = $1`, [FO]);
check('…and approving them makes them a trainee too', approve === null && fo.is_approved && fo.is_training, approve ?? JSON.stringify(fo));
const foTree = await as(FO, 'authenticated', () => fails(() => db.query(
  `insert into public.trees (id, species, barangay_psgc) values ('fo-tree', 'Duhat', 403429010)`)));
const foRow = await one(`select is_training from public.trees where id = 'fo-tree'`);
check('a trainee field officer\u2019s synced tree is a training tree', foTree === null && foRow?.is_training === true, foTree ?? '');
const foSeesReal = await as(FO, 'authenticated', () => count(`select count(*) n from public.trees where id like 'real%'`));
check('…and they see no real trees in the app', foSeesReal === 0);

// ---- Promotion, the one way past RLS --------------------------------------------------
const tag = await one(`select id from public.pending_trees where is_training and status = 'pending' limit 1`);
const promoted = await as(TRAINEE, 'authenticated', () => db.query(`select public.promote_pending_tree($1) as id`, [tag.id]));
const promotedRow = await one(`select is_training from public.trees where id = $1`, [promoted.rows[0].id]);
check('a trainee publishing a training tag makes a training tree', promotedRow?.is_training === true);
const nextTag = await one(`select id from public.pending_trees where is_training and status = 'pending' limit 1`);
const adopt = await as(TRAINEE, 'authenticated', () => fails(() => db.query(
  `select public.promote_pending_tree($1, 'real-snl')`, [nextTag.id])));
const realStill = await one(`select is_training, source from public.trees where id = 'real-snl'`);
check('…and cannot pull a real tree behind the wall by adopting it, nor change it',
  adopt !== null && realStill.is_training === false && realStill.source === null, adopt ?? JSON.stringify(realStill));

// closing_gaps.sql: publishing checks whose tag it is.
const realTag = await one(`select id from public.pending_trees where species = 'real-tag'`);
const pgOnTraining = await as(PGENRO, 'authenticated', () => fails(() => db.query(`select public.promote_pending_tree($1)`, [nextTag.id])));
check('PGENRO cannot publish a training tag', pgOnTraining !== null, pgOnTraining ?? 'PUBLISHED');
const traineeOnReal = await as(TRAINEE, 'authenticated', () => fails(() => db.query(`select public.promote_pending_tree($1)`, [realTag.id])));
check('a trainee cannot publish a real tag', traineeOnReal !== null, traineeOnReal ?? 'PUBLISHED');

const FIELD_CLB = '00000000-0000-0000-0000-0000000000b2';
await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'fo@clb.ph', '{"municipality":"Calamba"}')`, [FIELD_CLB]);
await db.query(`update public.profiles set is_approved = true where id = $1`, [FIELD_CLB]);
const otherLgu = await as(FIELD_CLB, 'authenticated', () => fails(() => db.query(`select public.promote_pending_tree($1)`, [realTag.id])));
check('a field officer cannot publish another LGU’s tag', otherLgu !== null, otherLgu ?? 'PUBLISHED');
const rejectOther = await as(FIELD_CLB, 'authenticated', () => fails(() => db.query(`select public.reject_pending_tree($1, 'no')`, [realTag.id])));
check('…nor turn it down', rejectOther !== null, rejectOther ?? 'REJECTED');

// Sent across the border: a Calamba officer dispatched to a Santa Cruz tag
// records the tree there, then publishes the tag with it — the app's path.
const sentTag = (await db.query(
  `insert into public.pending_trees (barangay, species, municipality, status, assigned_to)
   values ('Labuin', 'sent-tag', 'Santa Cruz', 'dispatched', 'fo@clb.ph') returning id`)).rows[0];
const recorded = await as(FIELD_CLB, 'authenticated', () => fails(() => db.query(
  `insert into public.trees (id, species, barangay_psgc) values ('clb-recorded', 'Duhat', 403426001)`)));
const sent = await as(FIELD_CLB, 'authenticated', () => fails(() => db.query(
  `select public.promote_pending_tree($1, 'clb-recorded')`, [sentTag.id])));
check('the officer a tag was dispatched to publishes it with the tree they recorded, in another LGU',
  recorded === null && sent === null && (await one(`select source from public.trees where id = 'clb-recorded'`)).source === 'crowdsource',
  recorded ?? sent ?? '');
const ownPath = await as(FIELD_SCZ, 'authenticated', () => fails(() => db.query(`select public.promote_pending_tree($1)`, [realTag.id])));
check('a field officer publishes a tag in their own LGU, as before', ownPath === null, ownPath ?? '');

// A tree from the office's inventory spreadsheet (community.sql), verified:
// the office's inventory, not a resident's tag, with what the sheet gave.
await db.exec(`alter table public.pending_trees add column if not exists source text not null default 'community',
                                                add column if not exists details jsonb`);
const imported = (await db.query(
  `insert into public.pending_trees (barangay, species, municipality, status, source, details)
   values ('Labuin', 'Kaimito', 'Santa Cruz', 'dispatched', 'import',
           '{"tree_no": "65", "scientific_name": "Chrysophyllum cainito", "dbh_cm": 34.3, "height_class": "16-20"}') returning id`)).rows[0];
const importedId = await as(FIELD_SCZ, 'authenticated', () => db.query(`select public.promote_pending_tree($1) as id`, [imported.id]));
const importedTree = await one(`select source, tree_id, scientific_name, dbh, "heightClass" from public.trees where id = $1`, [importedId.rows[0].id]);
check('a verified inventory tree is the office’s, and keeps the spreadsheet’s details',
  importedTree.source === 'inventory' && importedTree.tree_id === '65' && Number(importedTree.dbh) === 34.3 && importedTree.heightClass === '16-20 m',
  JSON.stringify(importedTree));
const importedTag = (await db.query(
  `insert into public.pending_trees (barangay, species, municipality, status, source, details)
   values ('Labuin', 'Narra', 'Santa Cruz', 'dispatched', 'import', '{"scientific_name": "Pterocarpus indicus", "dbh_cm": 50}') returning id`)).rows[0];
await as(FIELD_SCZ, 'authenticated', () => db.query(
  `insert into public.trees (id, species, barangay_psgc, dbh) values ('scz-measured', 'Narra', 403426001, 41)`));
await as(FIELD_SCZ, 'authenticated', () => db.query(`select public.promote_pending_tree($1, 'scz-measured')`, [importedTag.id]));
const measured = await one(`select source, dbh, scientific_name from public.trees where id = 'scz-measured'`);
check('…and the officer’s own measurement stands over the sheet’s',
  measured.source === 'inventory' && Number(measured.dbh) === 41 && measured.scientific_name === 'Pterocarpus indicus', JSON.stringify(measured));

// ---- The log -----------------------------------------------------------------------------
const pgLog = await as(PGENRO, 'authenticated', () => count(`select count(*) n from public.activity_log where is_training`));
check('PGENRO\u2019s activity log shows no training entries', pgLog === 0);
const tLog = await as(TRAINEE, 'authenticated', () => count(`select count(*) n from public.activity_log`));
check('…and the trainee sees their own practice in theirs', tLog > 0, String(tLog));

// ---- PGENRO's switch ----------------------------------------------------------------------
const toggled = await as(PGENRO, 'authenticated', () => fails(() => db.query(`select public.set_account_training($1, false)`, [FO])));
check('PGENRO moves an account out of training', toggled === null && (await one(`select is_training from public.profiles where id = $1`, [FO])).is_training === false, toggled ?? '');
const pgSelf = await as(PGENRO, 'authenticated', () => fails(() => db.query(`select public.set_account_training($1, true)`, [PGENRO])));
check('…but not itself into it', pgSelf !== null);
const pgSeesTrainee = await as(PGENRO, 'authenticated', () => count(`select count(*) n from public.profiles where id = '${TRAINEE}'`));
check('PGENRO still sees every training account, to manage it', pgSeesTrainee === 1);
const sczSeesTrainee = await as(FIELD_SCZ, 'authenticated', () => count(`select count(*) n from public.profiles where is_training`));
check('a real account sees no training accounts', sczSeesTrainee === 0);

// ---- Purge ----------------------------------------------------------------------------------
const realBefore = {
  trees: await count(`select count(*) n from public.trees where not is_training`),
  permits: await count(`select count(*) n from public.permits where not is_training`),
  tags: await count(`select count(*) n from public.pending_trees where not is_training`),
};
const purgeOut = await asEditor(SQL('training_purge.sql'));
const purgeRows = purgeOut[purgeOut.length - 1].rows;
check('the purge runs', purgeRows.filter((r) => r.ok === false).length === 0,
  purgeRows.map((r) => `${r.check}=${r.ok} (${r.detail})`).join('; '));
const realLeft = await count(`select count(*) n from public.trees where not is_training`);
check('…every real tree is still there', realLeft === realBefore.trees && realLeft > 0, `${realLeft} of ${realBefore.trees}`);
check('…the real permit and real tag too',
  (await count(`select count(*) n from public.permits`)) === realBefore.permits && (await count(`select count(*) n from public.pending_trees where not is_training`)) === realBefore.tags);
const reseedAfter = await fails(() => asEditor(SQL('training_seed.sql')));
check('…and the next batch can be seeded', reseedAfter === null, reseedAfter ?? '');

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
