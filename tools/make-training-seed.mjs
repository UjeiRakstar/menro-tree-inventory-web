/**
 * Writes supabase/training_seed.sql: dummy Siniloan data for LGU training.
 *
 *   node tools/make-training-seed.mjs
 *
 * Every tree stands inside a real Siniloan barangay (from the same PSA
 * boundaries the map uses), so the training map looks like the real one: pins
 * in the town centre, fewer up in the forest barangays. The mix is made to
 * give a trainee something to do — hazards nobody has been sent to, hazards
 * already dispatched, permits issued, Code 2 and Code 3 stems, tags from the
 * public waiting for a field check.
 *
 * The random numbers are seeded, so running this twice writes the same file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SINILOAN = 403429000;
const TREE_COUNT = 150;
const TAG_COUNT = 12;

// ---- Seeded randomness -------------------------------------------------------
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(2026);
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (low, high, places = 1) => Number((low + random() * (high - low)).toFixed(places));
const chance = (p) => random() < p;
const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// ---- Where -------------------------------------------------------------------
const { barangays } = JSON.parse(readFileSync(join(root, 'src/data/barangay-index.json'), 'utf8'));
const siniloan = barangays.filter((b) => Math.floor(b.p / 1000) * 1000 === SINILOAN);
if (siniloan.length === 0) throw new Error('No Siniloan barangays in the index.');

/** Even-odd test against every ring of a polygon; rings are flat [x, y, x, y, …]. */
function insidePolygon(lng, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function pointIn(barangay) {
  const [west, south, east, north] = barangay.b;
  for (let tries = 0; tries < 5000; tries += 1) {
    const lng = west + random() * (east - west);
    const lat = south + random() * (north - south);
    if (barangay.g.some((polygon) => insidePolygon(lng, lat, polygon))) {
      return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
    }
  }
  throw new Error(`Could not place a point in ${barangay.n}.`);
}

// Town-centre barangays are small and full of tagged trees; the big upland
// ones have a few. Weighting by the inverse of the bounding box does that.
const weights = siniloan.map((b) => 1 / Math.sqrt((b.b[2] - b.b[0]) * (b.b[3] - b.b[1])));
const totalWeight = weights.reduce((a, b) => a + b, 0);
function pickBarangay() {
  let r = random() * totalWeight;
  for (let i = 0; i < siniloan.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return siniloan[i];
  }
  return siniloan[siniloan.length - 1];
}

// ---- What --------------------------------------------------------------------
// The mobile app's own presets, plus a few common in Laguna towns.
const SPECIES = [
  { species: 'Narra', scientific_name: 'Pterocarpus indicus', species_type: 'Endemic', tree_category: 'Timber', weight: 5 },
  { species: 'Mahogany', scientific_name: 'Swietenia macrophylla', species_type: 'Invasive', tree_category: 'Timber', weight: 6 },
  { species: 'Mango', scientific_name: 'Mangifera indica', species_type: 'Introduced', tree_category: 'Fruit', weight: 6 },
  { species: 'Acacia', scientific_name: 'Samanea saman', species_type: 'Introduced', tree_category: 'Timber', weight: 5 },
  { species: 'Coconut', scientific_name: 'Cocos nucifera', species_type: 'Endemic', tree_category: 'Fruit', weight: 4 },
  { species: 'Gmelina', scientific_name: 'Gmelina arborea', species_type: 'Invasive', tree_category: 'Timber', weight: 3 },
  { species: 'Balete', scientific_name: 'Ficus balete', species_type: 'Endemic', tree_category: 'Ornamental', weight: 2 },
  { species: 'Santol', scientific_name: 'Sandoricum koetjape', species_type: 'Introduced', tree_category: 'Fruit', weight: 3 },
  { species: 'Banaba', scientific_name: 'Lagerstroemia speciosa', species_type: 'Endemic', tree_category: 'Ornamental', weight: 3 },
  { species: 'Molave', scientific_name: 'Vitex parviflora', species_type: 'Endemic', tree_category: 'Timber', weight: 2 },
  { species: 'Kalachuchi', scientific_name: 'Plumeria rubra', species_type: 'Introduced', tree_category: 'Ornamental', weight: 2 },
  { species: 'Duhat', scientific_name: 'Syzygium cumini', species_type: 'Introduced', tree_category: 'Fruit', weight: 2 },
];
const speciesBag = SPECIES.flatMap((s) => Array(s.weight).fill(s));

const STEM = {
  1: 'Code 1 (Straight/No Defects)',
  2: 'Code 2 (Little Defects)',
  3: 'Code 3 (Several Defects)',
};

const ARBORISTS = [
  { name: 'Trainee Arborist — Ana', email: 'ana.arborist@training.greentag.invalid' },
  { name: 'Trainee Arborist — Ben', email: 'ben.arborist@training.greentag.invalid' },
  { name: 'Trainee Arborist — Carla', email: 'carla.arborist@training.greentag.invalid' },
];

const CLIENTS = ['Maria Santos', 'Jose Reyes', 'Liza Mendoza', 'Ramon Cruz', 'Grace Villanueva', 'Paolo Garcia'];
const REASONS = [
  'Road widening along the national highway',
  'Tree leaning over a residence',
  'Construction of a barangay multi-purpose hall',
  'Branches touching the power lines',
];

const NOW = Date.parse('2026-10-14T08:00:00+08:00');
const daysAgo = (days) => new Date(NOW - days * 86400000).toISOString();

const heightClassOf = (height) => (height < 6 ? 'Short' : height < 12 ? 'Medium' : 'Tall');

// ---- The trees ---------------------------------------------------------------
const trees = [];
for (let i = 0; i < TREE_COUNT; i += 1) {
  const barangay = pickBarangay();
  const [latitude, longitude] = pointIn(barangay);
  const kind = pick(speciesBag);

  // About one in six has a hazard; a third of those already have somebody on
  // them. A tree with a hazard is far more likely to have a poor stem.
  const hazard = chance(0.17);
  const hazardType = hazard ? pick(['isLeaning', 'hasPowerlineConflict', 'isRootProblem', 'isDecayed']) : null;
  const dispatched = hazard && chance(0.35);
  const permitted = !hazard && chance(0.06);
  const stem = hazard ? pick([1, 2, 2, 2, 3, 3]) : pick([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 3]);

  const total = between(3, 22);
  const id = uuid();
  trees.push({
    id,
    tree_id: `TRN-${String(i + 1).padStart(4, '0')}`,
    latitude,
    longitude,
    barangay: barangay.n,
    barangay_psgc: barangay.p,
    municipality: 'Siniloan',
    species: kind.species,
    scientific_name: kind.scientific_name,
    species_type: kind.species_type,
    biodiversity_status: kind.species_type,
    tree_category: kind.tree_category,
    dbh: between(8, 110),
    merchantable_height: Number((total * between(0.4, 0.7, 2)).toFixed(1)),
    total_height: total,
    heightClass: heightClassOf(total),
    height_class: heightClassOf(total),
    stem_quality: STEM[stem],
    isLeaning: hazardType === 'isLeaning',
    hasPowerlineConflict: hazardType === 'hasPowerlineConflict',
    isRootProblem: hazardType === 'isRootProblem',
    isDecayed: hazardType === 'isDecayed',
    assigned_to: dispatched ? pick(ARBORISTS).email : null,
    has_cutting_permit: permitted,
    task_status: 'Pending',
    source: 'field',
    is_tagged: true,
    dateCaptured: daysAgo(Math.floor(random() * 180)),
    is_training: true,
  });
}

// ---- Permits, for the trees that have one --------------------------------------
const permits = trees
  .filter((tree) => tree.has_cutting_permit)
  .map((tree) => ({
    tree_id: tree.id,
    client_name: pick(CLIENTS),
    contact_info: `09${Math.floor(100000000 + random() * 899999999)}`,
    reason: pick(REASONS),
    requirements_urls: [],
    species: tree.species,
    number_of_trees: 1,
    address: `${tree.barangay}, Siniloan, Laguna`,
    latitude: tree.latitude,
    longitude: tree.longitude,
    created_at: daysAgo(Math.floor(random() * 60)),
    is_training: true,
  }));

// ---- Tags from the public, waiting for a field check ----------------------------
const pendingTags = [];
for (let i = 0; i < TAG_COUNT; i += 1) {
  const barangay = pickBarangay();
  const [latitude, longitude] = pointIn(barangay);
  const dispatched = i < 4;
  pendingTags.push({
    species: pick(speciesBag).species,
    barangay: barangay.n,
    municipality: 'Siniloan',
    lgu_psgc: SINILOAN,
    latitude,
    longitude,
    status: dispatched ? 'dispatched' : 'pending',
    assigned_to: dispatched ? pick(ARBORISTS).email : null,
    submitted_at: daysAgo(Math.floor(random() * 21)),
    is_training: true,
  });
}

const arborists = ARBORISTS.map((a) => ({ ...a, status: 'Active', is_training: true }));

// ---- The SQL -------------------------------------------------------------------
// Dollar-quoted, so nothing in the data needs escaping.
const json = (rows) => `$seed$${JSON.stringify(rows)}$seed$::jsonb`;

const sql = `-- Green Tag: dummy Siniloan data for LGU training. GENERATED — do not edit;
-- change tools/make-training-seed.mjs and run it again.
--
-- Run in the SQL editor, after training_sandbox.sql. Safe to run again: it
-- clears the training rows first, so running it is also "reset the training
-- data to how it started". Real rows are never touched.
--
-- Everything here is behind the training wall: only training accounts see it.
--
--   ${trees.length} trees across ${new Set(trees.map((t) => t.barangay)).size} Siniloan barangays
--   ${trees.filter((t) => (t.isLeaning || t.hasPowerlineConflict || t.isRootProblem || t.isDecayed) && !t.assigned_to).length} hazards nobody has been sent to (red), ${trees.filter((t) => t.assigned_to).length} already dispatched (orange)
--   ${permits.length} cutting permits issued (yellow)
--   ${trees.filter((t) => t.stem_quality.startsWith('Code 2')).length} Code 2 stems, ${trees.filter((t) => t.stem_quality.startsWith('Code 3')).length} Code 3
--   ${pendingTags.length} tags from the public, ${pendingTags.filter((t) => t.status === 'dispatched').length} out for field checking
--   ${arborists.length} trainee arborists to dispatch
--
-- Columns are matched by name: a key with no column of that name is left out
-- rather than failing, and listed in the check at the end.

-- Inserting a tree normally writes "tree created" to PGENRO's activity log.
-- Paused while seeding, so 150 dummy trees do not land in the real log.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'log_tree_changes') then
    alter table public.trees disable trigger log_tree_changes;
  end if;
end $$;

-- Start clean.
do $$
declare t text;
begin
  foreach t in array array['permits', 'phenology_records', 'pending_trees', 'trees', 'arborists']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I where is_training', t);
    end if;
  end loop;
end $$;

-- Insert the keys that are columns; return the ones that are not.
create or replace function pg_temp.seed_into(p_table text, p_rows jsonb)
returns text language plpgsql as $$
declare
  v_cols    text;
  v_missing text;
begin
  select string_agg(quote_ident(k), ', ') into v_cols
  from (select distinct jsonb_object_keys(r) k from jsonb_array_elements(p_rows) r) keys
  where exists (select 1 from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = p_table and c.column_name = keys.k);

  select string_agg(k, ', ') into v_missing
  from (select distinct jsonb_object_keys(r) k from jsonb_array_elements(p_rows) r) keys
  where not exists (select 1 from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = p_table and c.column_name = keys.k);

  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
    p_table, v_cols, v_cols, p_table) using p_rows;

  return coalesce(v_missing, '');
end $$;

drop table if exists pg_temp.seed_report;
create temp table seed_report (tbl text, skipped text);

insert into seed_report select 'arborists', pg_temp.seed_into('arborists', ${json(arborists)});

insert into seed_report select 'trees', pg_temp.seed_into('trees', ${json(trees)});

insert into seed_report select 'permits', pg_temp.seed_into('permits', ${json(permits)});

insert into seed_report select 'pending_trees', pg_temp.seed_into('pending_trees', ${json(pendingTags)});

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'log_tree_changes') then
    alter table public.trees enable trigger log_tree_changes;
  end if;
end $$;

-- ===========================================================================
-- Did it take?
-- ===========================================================================
select 'training trees' as check,
       (select count(*) from public.trees where is_training) = ${trees.length} as ok,
       (select count(*) from public.trees where is_training)::text as detail
union all
select 'training permits', (select count(*) from public.permits where is_training) = ${permits.length},
       (select count(*) from public.permits where is_training)::text
union all
select 'training tags', (select count(*) from public.pending_trees where is_training) = ${pendingTags.length},
       (select count(*) from public.pending_trees where is_training)::text
union all
select 'training arborists', (select count(*) from public.arborists where is_training) = ${arborists.length},
       (select count(*) from public.arborists where is_training)::text
union all
select 'the activity log is paused no longer',
       not exists (select 1 from pg_trigger where tgname = 'log_tree_changes' and tgenabled = 'D'), ''
union all
select 'READ: left out of ' || tbl || ' (no such column)', null, skipped
from seed_report where skipped <> '';
`;

writeFileSync(join(root, 'supabase/training_seed.sql'), sql);
console.log(
  `Wrote supabase/training_seed.sql: ${trees.length} trees, ${permits.length} permits, ` +
    `${pendingTags.length} tags, ${arborists.length} arborists.`
);
