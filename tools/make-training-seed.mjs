/**
 * Writes supabase/training_seed.sql, and the parts after it (training_seed_2.sql,
 * …): dummy data for training the offices.
 *
 *   node tools/make-training-seed.mjs
 *
 * Siniloan, as from the start (150 trees, the same ones), and since 22 October
 * the six cities and the rest of the 4th district — so every trainee office
 * has its own town's mock data, and a PGENRO training account
 * (pgenro_training.sql) the whole of it.
 *
 * Every tree stands inside a real barangay of its town (from the same PSA
 * boundaries the map uses), so the training map looks like the real one: pins
 * in the town centre, fewer up in the forest barangays. The mix is made to
 * give a trainee something to do — hazards nobody has been sent to, hazards
 * already dispatched, permits issued, Code 2 and Code 3 stems, tags from the
 * public waiting for a field check. Since 23 October every town also has its
 * areas on the map: planting sites, and the land cover its City Biodiversity
 * Index (a city) or its Forest Land Use Plan (a municipality) works with.
 *
 * The random numbers are seeded, so running this twice writes the same file.
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ringAreaM2 } from '../src/lib/areaGeometry.js';
import { suggestCover } from '../src/lib/coverSuggestion.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Which towns, and how many trees and tags each. Siniloan comes first, so its
// trees come out of the random numbers exactly as before.
const SINILOAN = { name: 'Siniloan', trees: 150, tags: 12 };
const CITIES = ['Biñan', 'Cabuyao', 'Calamba', 'San Pablo', 'San Pedro', 'Santa Rosa'];
// The 4th district, Siniloan aside.
const DISTRICT_4 = [
  'Cavinti', 'Famy', 'Kalayaan', 'Luisiana', 'Lumban', 'Mabitac', 'Magdalena', 'Majayjay',
  'Paete', 'Pagsanjan', 'Pakil', 'Pangil', 'Pila', 'Santa Cruz', 'Santa Maria',
];
const TOWNS = [
  SINILOAN,
  ...CITIES.map((name) => ({ name, trees: 60, tags: 4 })),
  ...DISTRICT_4.map((name) => ({ name, trees: 40, tags: 3 })),
];

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
const LGUS = JSON.parse(readFileSync(join(root, 'src/data/Laguna-LGUs.json'), 'utf8'));

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
function barangayPicker(inTown) {
  const weights = inTown.map((b) => 1 / Math.sqrt((b.b[2] - b.b[0]) * (b.b[3] - b.b[1])));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  return () => {
    let r = random() * totalWeight;
    for (let i = 0; i < inTown.length; i += 1) {
      r -= weights[i];
      if (r <= 0) return inTown[i];
    }
    return inTown[inTown.length - 1];
  };
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

// ---- One town: its trees, the permits for some, and tags from the public -----
// In this order, town by town: Siniloan's come out as they always have.
function seedTown(town) {
  const lgu = LGUS.find((entry) => entry.name === town.name);
  if (!lgu) throw new Error(`No LGU named ${town.name}.`);
  const inTown = barangays.filter((b) => Math.floor(b.p / 1000) * 1000 === lgu.psgc);
  if (inTown.length === 0) throw new Error(`No ${town.name} barangays in the index.`);
  const pickBarangay = barangayPicker(inTown);
  // TRN-29-0001: the town's number in its PSGC (Siniloan is 29), then the tree's.
  const prefix = `TRN-${String(Math.floor(lgu.psgc / 1000) % 100).padStart(2, '0')}`;

  const trees = [];
  for (let i = 0; i < town.trees; i += 1) {
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
      tree_id: `${prefix}-${String(i + 1).padStart(4, '0')}`,
      latitude,
      longitude,
      barangay: barangay.n,
      barangay_psgc: barangay.p,
      municipality: lgu.name,
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

  const permits = trees
    .filter((tree) => tree.has_cutting_permit)
    .map((tree) => ({
      tree_id: tree.id,
      // Written here: from the SQL editor, stamp_permit_lgu() keeps what it is
      // given, and a permit with no LGU is no trainee office's to see.
      lgu_psgc: lgu.psgc,
      client_name: pick(CLIENTS),
      contact_info: `09${Math.floor(100000000 + random() * 899999999)}`,
      reason: pick(REASONS),
      requirements_urls: [],
      species: tree.species,
      number_of_trees: 1,
      address: `${tree.barangay}, ${lgu.label}, Laguna`,
      latitude: tree.latitude,
      longitude: tree.longitude,
      created_at: daysAgo(Math.floor(random() * 60)),
      is_training: true,
    }));

  const tags = [];
  for (let i = 0; i < town.tags; i += 1) {
    const barangay = pickBarangay();
    const [latitude, longitude] = pointIn(barangay);
    const dispatched = i < Math.ceil(town.tags / 3);
    tags.push({
      species: pick(speciesBag).species,
      barangay: barangay.n,
      municipality: lgu.name,
      lgu_psgc: lgu.psgc,
      latitude,
      longitude,
      status: dispatched ? 'dispatched' : 'pending',
      assigned_to: dispatched ? pick(ARBORISTS).email : null,
      submitted_at: daysAgo(Math.floor(random() * 21)),
      is_training: true,
    });
  }

  return { town: lgu.label, trees, permits, tags };
}

const seeded = TOWNS.map(seedTown);
const trees = seeded.flatMap((t) => t.trees);
const permits = seeded.flatMap((t) => t.permits);
const pendingTags = seeded.flatMap((t) => t.tags);

const arborists = ARBORISTS.map((a) => ({ ...a, status: 'Active', is_training: true }));

// ---- The areas: planting sites and land cover, town by town (23 October) -----
// After the trees and tags, so they come out of the random numbers as before.
//
// A city gets what its City Biodiversity Index reads from the map: natural
// areas (forest, brush, grassland, marsh, water — Indicator 1), a protected
// one with its document (Indicator 8), tree canopy (Indicator 11), and its
// planting sites. A municipality gets what its Forest Land Use Plan works
// with: protected forest, forest land, brush and grassland to reforest,
// agroforest in the production zone, a bamboo stand on the riverbank, the
// farms and the town centre, and its planting sites. Each town has one
// planting site PGENRO set, one more, and one its office has asked for, for a
// trainee PGENRO to decide.
//
// The sizes are shares of the town's land, as far as its barangays allow:
// big areas go in the big upland barangays, the town centre in a small one.

/** The practice document behind every designation: public/training/practice-document.html. */
const PRACTICE_DOCUMENT = '/training/practice-document.html';

const RECOMMENDED = {
  upland: [
    { common: 'Narra', scientific: 'Pterocarpus indicus', why: 'Native hardwood; the national tree' },
    { common: 'Molave', scientific: 'Vitex parviflora', why: 'Native, takes the drier slopes' },
    { common: 'Kalumpit', scientific: 'Terminalia microcarpa', why: 'Native fruit tree for wildlife' },
    { common: 'Ipil', scientific: 'Intsia bijuga', why: 'Native hardwood, deep-rooted on slopes' },
  ],
  riverbank: [
    { common: 'Bani', scientific: 'Pongamia pinnata', why: 'Riverbank native, holds the bank and takes flooding' },
    { common: 'Banaba', scientific: 'Lagerstroemia speciosa', why: 'Native, takes wet ground' },
    { common: 'Kawayan tinik', scientific: 'Bambusa blumeana', why: 'Binds a bank that floods' },
  ],
  urban: [
    { common: 'Banaba', scientific: 'Lagerstroemia speciosa', why: 'Native shade tree with flowers' },
    { common: 'Narra', scientific: 'Pterocarpus indicus', why: 'Native shade and street tree' },
    { common: 'Dao', scientific: 'Dracontomelon dao', why: 'Native, a large shade tree for parks' },
  ],
};

const DOCUMENTS = {
  'protected-area': { doc_type: 'Presidential Proclamation', doc_title: 'Practice document — not a real proclamation' },
  'forest-land': { doc_type: 'DENR Land Classification Map', doc_title: 'Practice document — not a real land classification map' },
  flup: { doc_type: 'Forest Land Use Plan', doc_title: 'Practice document — not a real Forest Land Use Plan' },
};

// What each kind of town gets: [what, share of the town's land, where].
// "upland" picks among the town's biggest barangays, "centre" its smallest.
const CITY_AREAS = [
  { kind: 'land-cover', cover: 'closed-forest', share: 0.04, where: 'upland', name: 'Forest Reserve', designation: 'protected-area' },
  { kind: 'land-cover', cover: 'open-forest', share: 0.03, where: 'upland', name: 'Urban Forest' },
  { kind: 'land-cover', cover: 'brush-shrubs', share: 0.02, where: 'upland', name: 'Brushland' },
  { kind: 'land-cover', cover: 'grassland', share: 0.015, where: 'any', name: 'Grassland' },
  { kind: 'land-cover', cover: 'marshland-swamp', share: 0.005, where: 'any', name: 'Marsh' },
  { kind: 'land-cover', cover: 'inland-water', share: 0.008, where: 'any', name: 'Creek and Pond' },
  { kind: 'land-cover', cover: 'perennial-crop', share: 0.03, where: 'any', name: 'Orchards' },
  { kind: 'land-cover', cover: 'built-up', share: 0.03, where: 'centre', name: 'City Centre' },
  { kind: 'planting-site', share: 0.002, where: 'any', name: 'Greening Site', site: 'urban', by: 'pgenro' },
  { kind: 'planting-site', share: 0.002, where: 'any', name: 'Riverbank Planting Site', site: 'riverbank', by: 'pgenro' },
  { kind: 'planting-site', share: 0.001, where: 'centre', name: 'School Grounds Planting Site', site: 'urban', by: 'office' },
];

const MUNICIPALITY_AREAS = [
  { kind: 'land-cover', cover: 'closed-forest', share: 0.06, where: 'upland', name: 'Protected Forest', designation: 'protected-area' },
  { kind: 'land-cover', cover: 'open-forest', share: 0.05, where: 'upland', name: 'Forest Land', designation: 'forest-land' },
  { kind: 'land-cover', cover: 'brush-shrubs', share: 0.03, where: 'upland', name: 'Regenerating Brush' },
  { kind: 'land-cover', cover: 'grassland', share: 0.02, where: 'upland', name: 'Cogonal Grassland' },
  { kind: 'land-cover', cover: 'perennial-crop', share: 0.04, where: 'any', name: 'Agroforest', designation: 'flup' },
  { kind: 'land-cover', cover: 'bamboo-stand', share: 0.003, where: 'any', name: 'Riverbank Kawayan', clumps: 4 },
  { kind: 'land-cover', cover: 'annual-crop', share: 0.04, where: 'any', name: 'Ricefields' },
  { kind: 'land-cover', cover: 'inland-water', share: 0.004, where: 'any', name: 'Creek' },
  { kind: 'land-cover', cover: 'built-up', share: 0.015, where: 'centre', name: 'Poblacion' },
  { kind: 'planting-site', share: 0.003, where: 'upland', name: 'Reforestation Site', site: 'upland', by: 'pgenro' },
  { kind: 'planting-site', share: 0.002, where: 'any', name: 'Riverbank Planting Site', site: 'riverbank', by: 'pgenro' },
  { kind: 'planting-site', share: 0.002, where: 'upland', name: 'Watershed Planting Site', site: 'upland', by: 'office' },
];

const ringOf = (flat) => {
  const ring = [];
  for (let i = 0; i < flat.length; i += 2) ring.push([flat[i], flat[i + 1]]);
  return ring;
};
const landOf = (barangay) => barangay.g.reduce((sum, polygon) => sum + ringAreaM2(ringOf(polygon[0])), 0);
const M_PER_DEG = 111320;
const metresBetween = ([lng1, lat1], [lng2, lat2]) =>
  Math.hypot((lng2 - lng1) * M_PER_DEG * Math.cos((lat1 * Math.PI) / 180), (lat2 - lat1) * M_PER_DEG);

/**
 * An outline of about `hectares` in one of the `pool` of barangays, wholly
 * inside it and clear of `taken` (circles already placed): ten points round
 * a centre, each at its own distance, so no two look alike. Every barangay is
 * tried at a size before a smaller one is, so a big area finds the barangay
 * big enough for it. Returns { ring, barangay }, or null.
 */
function outlineIn(pool, hectares, taken) {
  let radius = Math.sqrt((hectares * 10000) / Math.PI);
  while (radius >= 40) {
    for (let attempt = 0; attempt < 40 + pool.length * 10; attempt += 1) {
      const barangay = pool[attempt % pool.length];
      const [lat, lng] = pointIn(barangay);
      if (taken.some((c) => metresBetween(c.centre, [lng, lat]) < c.radius + radius * 1.2)) continue;
      const ring = [];
      for (let k = 0; k < 10; k += 1) {
        const angle = (k / 10) * 2 * Math.PI + random() * 0.3;
        const r = radius * (0.75 + random() * 0.45);
        ring.push([
          Number((lng + (r * Math.cos(angle)) / (M_PER_DEG * Math.cos((lat * Math.PI) / 180))).toFixed(6)),
          Number((lat + (r * Math.sin(angle)) / M_PER_DEG).toFixed(6)),
        ]);
      }
      if (!ring.every(([x, y]) => barangay.g.some((polygon) => insidePolygon(x, y, polygon)))) continue;
      taken.push({ centre: [lng, lat], radius: radius * 1.2 });
      ring.push(ring[0]);
      return { ring, barangay };
    }
    radius *= 0.8;
  }
  return null;
}

function perimeterOf(ring) {
  let total = 0;
  for (let i = 1; i < ring.length; i += 1) total += metresBetween(ring[i - 1], ring[i]);
  return total;
}

function areasOfTown(town, lgu, townTrees, extraTrees) {
  const inTown = barangays.filter((b) => Math.floor(b.p / 1000) * 1000 === lgu.psgc);
  const bySize = [...inTown].sort((a, b) => landOf(b) - landOf(a));
  const landM2 = inTown.reduce((sum, b) => sum + landOf(b), 0);
  const upland = bySize.slice(0, Math.max(1, Math.ceil(bySize.length * 0.35)));
  // The town centre: the smaller half, though not the very smallest, which
  // hold no more than a few streets.
  const centre = bySize.slice(Math.floor(bySize.length * 0.5), Math.max(Math.floor(bySize.length * 0.5) + 1, bySize.length - 2));
  const plan = lgu.isCity ? CITY_AREAS : MUNICIPALITY_AREAS;
  const taken = [];
  const code = String(Math.floor(lgu.psgc / 1000) % 100).padStart(2, '0');
  const areas = [];

  plan.forEach((what, index) => {
    const pool = what.where === 'upland' ? upland : what.where === 'centre' ? centre : inTown;
    const hectares = Math.max(1, (landM2 / 10000) * what.share);
    const placed = outlineIn(pool, hectares, taken);
    if (!placed) return;
    const { ring, barangay } = placed;
    const geometry = { type: 'Polygon', coordinates: [ring] };
    const name = what.cover === 'built-up' ? `${lgu.label} ${what.name}` : `${barangay.n} ${what.name}`;

    // A bamboo stand has the clumps the field officers tagged in it, so the
    // form's suggestion has something to go on.
    if (what.clumps) {
      for (let k = 0; k < what.clumps; k += 1) {
        const [x, y] = ring[Math.floor(random() * (ring.length - 1))];
        const [cx, cy] = ring.reduce(([sx, sy], [px, py]) => [sx + px / ring.length, sy + py / ring.length], [0, 0]);
        const t = 0.2 + random() * 0.5;
        extraTrees.push({
          id: uuid(),
          tree_id: `TRN-${code}-B${String(k + 1).padStart(2, '0')}`,
          latitude: Number((cy + (y - cy) * t).toFixed(6)),
          longitude: Number((cx + (x - cx) * t).toFixed(6)),
          barangay: barangay.n,
          barangay_psgc: barangay.p,
          municipality: lgu.name,
          species: 'Kawayan tinik',
          scientific_name: 'Bambusa blumeana',
          species_type: 'Native',
          biodiversity_status: 'Native',
          total_height: between(8, 15),
          task_status: 'Pending',
          source: 'field',
          is_tagged: true,
          dateCaptured: daysAgo(Math.floor(random() * 120)),
          is_training: true,
        });
      }
    }

    const inside = [...townTrees, ...extraTrees].filter((tree) => insidePolygon(tree.longitude, tree.latitude, [ring.flat()]));
    const landCover = what.kind === 'land-cover';
    const suggestion = landCover ? suggestCover(inside) : null;
    const document = what.designation ? DOCUMENTS[what.designation] : null;
    const office = what.by === 'office';
    areas.push({
      kind: what.kind,
      name,
      geometry,
      area_m2: Math.round(ringAreaM2(ring)),
      perimeter_m: Math.round(perimeterOf(ring)),
      lgu_psgc: lgu.psgc,
      municipality: lgu.name,
      barangay: barangay.n,
      barangay_psgc: barangay.p,
      cover_class: landCover ? what.cover : null,
      suggested_class: suggestion?.classId ?? null,
      suggestion_reason: suggestion?.reason ?? null,
      trees_inside: inside.length,
      designation: what.designation ?? null,
      doc_type: document?.doc_type ?? null,
      doc_number: document ? `PRACTICE-${code}-${String(index + 1).padStart(2, '0')}` : null,
      doc_title: document?.doc_title ?? null,
      doc_url: document ? PRACTICE_DOCUMENT : null,
      planting_status: landCover ? null : 'open',
      planting_window: landCover ? null : 'June to September, with the rains',
      spacing_m: landCover ? null : what.site === 'urban' ? 5 : 4,
      access_note: landCover ? null : `From the ${barangay.n} barangay hall; practice data.`,
      contact: landCover ? null : office ? `MENRO / CENRO of ${lgu.label} (training)` : 'PGENRO Forestry Division (training)',
      recommended: landCover ? null : RECOMMENDED[what.site],
      approval: office ? 'requested' : 'approved',
      notes: 'Practice data for training.',
      created_by_role: office || landCover ? 'lgu_admin' : 'pgenro',
      created_at: daysAgo(30 + Math.floor(random() * 150)),
      is_training: true,
    });
  });
  return areas;
}

const bambooClumps = [];
const areas = TOWNS.flatMap((town, i) => {
  const lgu = LGUS.find((entry) => entry.name === town.name);
  return areasOfTown(town, lgu, seeded[i].trees, bambooClumps);
});
trees.push(...bambooClumps);

// ---- The SQL -------------------------------------------------------------------
// Every key each table is given, for the final check to compare with the
// columns that exist — computed there, not remembered from earlier in the
// script.
const keysOf = (rows) => [...new Set(rows.flatMap((row) => Object.keys(row)))];
const seededKeys = Object.entries({ arborists, trees, permits, pending_trees: pendingTags, map_areas: areas })
  .flatMap(([table, rows]) => keysOf(rows).map((key) => `  ('${table}', '${key}')`))
  .join(',\n');

// Dollar-quoted, so nothing in the data needs escaping.
const json = (rows) => `$seed$${JSON.stringify(rows)}$seed$::jsonb`;

// ---- In parts ------------------------------------------------------------------
// The Supabase SQL editor refuses a query of about a megabyte ("Query is too
// large to be run via the SQL Editor"), and every town's areas took the seed
// past that on 23 October. So the rows go out in parts of well under it, run
// one after another: training_seed.sql, then training_seed_2.sql, and so on.
// Each part stands on its own — it pauses and restarts the loggers, and makes
// and drops its own helper — so stopping between two leaves nothing off.
const PART_LIMIT = 400_000; // characters of data in one part

// The tables in the order they go in, and what each insert waits for: a table
// that is there (and, for the areas, walled — map_areas.sql has run).
const TABLES = [
  { table: 'arborists', rows: arborists, guard: `where to_regclass('public.arborists') is not null` },
  { table: 'trees', rows: trees, guard: '' },
  { table: 'permits', rows: permits, guard: `where to_regclass('public.permits') is not null` },
  { table: 'pending_trees', rows: pendingTags, guard: `where to_regclass('public.pending_trees') is not null` },
  {
    table: 'map_areas',
    rows: areas,
    guard: `where exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'map_areas' and column_name = 'is_training')`,
  },
];

// Filled in order, a table split wherever a part is full.
const parts = [[]];
let used = 0;
for (const { table, rows, guard } of TABLES) {
  let chunk = [];
  for (const row of rows) {
    const size = JSON.stringify(row).length + 1;
    if (used + size > PART_LIMIT && used > 0) {
      if (chunk.length) parts.at(-1).push({ table, rows: chunk, guard });
      parts.push([]);
      chunk = [];
      used = 0;
    }
    chunk.push(row);
    used += size;
  }
  if (chunk.length) parts.at(-1).push({ table, rows: chunk, guard });
}
const fileOf = (n) => (n === 1 ? 'training_seed.sql' : `training_seed_${n}.sql`);
const runOrder = parts.map((_, i) => fileOf(i + 1)).join(', ');

// How many of a table's rows are in once part `n` has run.
const seededBy = (n, table) =>
  parts
    .slice(0, n)
    .flat()
    .filter((batch) => batch.table === table)
    .reduce((sum, batch) => sum + batch.rows.length, 0);

const loggers = (verb) => `do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'log_tree_changes') then
    alter table public.trees ${verb} trigger log_tree_changes;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'log_map_area_changes') then
    alter table public.map_areas ${verb} trigger log_map_area_changes;
  end if;
end $$;`;

const firstHeader = `-- Green Tag: dummy data for training the offices, part 1 of ${parts.length}. GENERATED —
-- do not edit; change tools/make-training-seed.mjs and run it again.
--
-- Run in the SQL editor, after training_sandbox.sql, in ${parts.length} parts one after
-- another (the editor refuses one query this big):
--   ${runOrder}
-- Safe to run again from this first part: it clears the training rows first,
-- so running the parts is also "reset the training data to how it started".
-- Real rows are never touched.
--
-- Everything here is behind the training wall: only training accounts see it.
--
--   ${trees.length} trees across ${new Set(trees.map((t) => t.barangay_psgc)).size} barangays of ${seeded.length} towns:
${seeded.map((t) => `--     ${t.town}: ${t.trees.length} trees, ${t.tags.length} tags`).join('\n')}
--   ${trees.filter((t) => (t.isLeaning || t.hasPowerlineConflict || t.isRootProblem || t.isDecayed) && !t.assigned_to).length} hazards nobody has been sent to (red), ${trees.filter((t) => t.assigned_to).length} already dispatched (orange)
--   ${permits.length} cutting permits issued (yellow)
--   ${trees.filter((t) => String(t.stem_quality).startsWith('Code 2')).length} Code 2 stems, ${trees.filter((t) => String(t.stem_quality).startsWith('Code 3')).length} Code 3
--   ${pendingTags.length} tags from the public, ${pendingTags.filter((t) => t.status === 'dispatched').length} out for field checking
--   ${arborists.length} trainee arborists to dispatch
--   ${areas.length} areas on the map: ${areas.filter((a) => a.kind === 'planting-site').length} planting sites (${areas.filter((a) => a.approval === 'requested').length} asked for by an office, for PGENRO to decide),
--     ${areas.filter((a) => a.kind === 'land-cover').length} of land cover, ${areas.filter((a) => a.designation).length} with a (practice) designation document;
--     ${bambooClumps.length} bamboo clumps tagged in the bamboo stands
--
-- Columns are matched by name: a key with no column of that name is left out
-- rather than failing, and listed in the check at the end of the last part.`;

const laterHeader = (n) => `-- Green Tag: dummy data for training the offices, part ${n} of ${parts.length}. GENERATED —
-- do not edit; change tools/make-training-seed.mjs and run it again.
--
-- Run in the SQL editor just after ${fileOf(n - 1)}${n < parts.length ? `, and before ${fileOf(n + 1)}` : ''}.
-- The whole run:
--   ${runOrder}
-- It checks that the part before it has run, and stops before changing
-- anything if not.`;

// Parts 2 on: the part before has run, and nothing since. A part run out of
// turn stops here with a message, rather than at a duplicate key halfway in.
const orderCheck = (n) => `-- The part before this one has run, and nothing after it: otherwise stop
-- here, before anything is changed.
do $$
declare
  r record;
  v_have bigint;
begin
  for r in select * from (values
    ${TABLES.map(({ table }) => `('${table}', ${seededBy(n - 1, table)})`).join(',\n    ')}
  ) want(tbl, n) loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = r.tbl and column_name = 'is_training') then
      execute format('select count(*) from public.%I where is_training', r.tbl) into v_have;
      if v_have <> r.n then
        raise exception 'This is part ${n} of the training seed: run ${fileOf(n - 1)} just before it (the whole run: ${runOrder}). There are % training rows in %, where the part before leaves %.',
          v_have, r.tbl, r.n;
      end if;
    end if;
  end loop;
end $$;`;

const startClean = `-- Start clean.
do $$
declare t text;
begin
  foreach t in array array['permits', 'phenology_records', 'pending_trees', 'trees', 'arborists', 'map_areas']
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'is_training') then
      execute format('delete from public.%I where is_training', t);
    end if;
  end loop;
end $$;`;

const inserts = (n) =>
  parts[n - 1]
    .map(
      ({ table, rows, guard }) =>
        (table === 'map_areas' ? '-- The areas: only where map_areas.sql has made the table and walled it.\n' : '') +
        `select public.training_seed_into('${table}', ${json(rows)})${guard ? ` ${guard}` : ''};`
    )
    .join('\n\n');

// The counts once this part has run: every part ends with them, the last with
// the whole seed's.
const finalCheck = (n) => {
  const last = n === parts.length;
  const want = (table) => seededBy(n, table);
  return `-- ===========================================================================
-- Did it take? Self-contained: it reads only the tables themselves.
-- ===========================================================================
select 'part ${n} of ${parts.length}' as check, true as ok,
       ${last ? `'the last: the training data is all in'` : `'next: ${fileOf(n + 1)}'`} as detail
union all
select 'training trees', (select count(*) from public.trees where is_training) = ${want('trees')},
       (select count(*) from public.trees where is_training)::text
union all
select 'training permits', (select count(*) from public.permits where is_training) = ${want('permits')},
       (select count(*) from public.permits where is_training)::text
union all
select 'training tags', (select count(*) from public.pending_trees where is_training) = ${want('pending_trees')},
       (select count(*) from public.pending_trees where is_training)::text
union all
select 'training arborists', (select count(*) from public.arborists where is_training) = ${want('arborists')},
       (select count(*) from public.arborists where is_training)::text
union all
select 'the activity log is paused no longer',
       not exists (select 1 from pg_trigger where tgname in ('log_tree_changes', 'log_map_area_changes') and tgenabled = 'D'), ''
union all
-- Read through query_to_xml, and only once there is a table to read: a
-- database without map_areas still gets an answer.
select 'training areas',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'map_areas' and column_name = 'is_training')
            then (xpath('/row/n/text()', query_to_xml(
                   'select count(*) n from public.map_areas where is_training', false, true, '')))[1]::text::int = ${want('map_areas')}
            else true end,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'map_areas' and column_name = 'is_training')
            then (xpath('/row/n/text()', query_to_xml(
                   'select count(*) n from public.map_areas where is_training', false, true, '')))[1]::text
            else 'map_areas.sql not run: no areas seeded' end${
              last
                ? `
union all
select 'READ: left out of ' || seeded.tbl || ' (no such column)', null, string_agg(seeded.k, ', ' order by seeded.k)
from (values
${seededKeys}
) seeded(tbl, k)
where not exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = seeded.tbl and c.column_name = seeded.k)
group by seeded.tbl`
                : ''
            };`;
};

const partSql = (n) => `${n === 1 ? firstHeader : laterHeader(n)}
${n === 1 ? '' : `\n${orderCheck(n)}\n`}
-- Inserting a tree or an area normally writes to PGENRO's activity log.
-- Paused while seeding, so ${trees.length} dummy trees and ${areas.length} areas do not
-- land in the real log.
${loggers('disable')}
${n === 1 ? `\n${startClean}\n` : ''}
-- Insert the keys that are columns, and skip the ones that are not.
--
-- A plain function, created here and dropped again below — not a temporary
-- one. The Supabase SQL editor runs the final query on its own, apart from the
-- rest of the script, so nothing temporary made up here is there for it.
create or replace function public.training_seed_into(p_table text, p_rows jsonb)
returns void language plpgsql as $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(k), ', ') into v_cols
  from (select distinct jsonb_object_keys(r) k from jsonb_array_elements(p_rows) r) keys
  where exists (select 1 from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = p_table and c.column_name = keys.k);

  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
    p_table, v_cols, v_cols, p_table) using p_rows;
end $$;

revoke all on function public.training_seed_into(text, jsonb) from public, anon, authenticated;

${inserts(n)}

drop function public.training_seed_into(text, jsonb);

${loggers('enable')}

${finalCheck(n)}
`;

// A part left over from a bigger seed would be run by mistake: gone.
for (const name of readdirSync(join(root, 'supabase'))) {
  const match = name.match(/^training_seed_(\d+)\.sql$/);
  if (match && Number(match[1]) > parts.length) unlinkSync(join(root, 'supabase', name));
}
parts.forEach((_, i) => writeFileSync(join(root, 'supabase', fileOf(i + 1)), partSql(i + 1)));
console.log(
  `Wrote ${runOrder} (in supabase/): ${trees.length} trees, ${permits.length} permits, ` +
    `${pendingTags.length} tags, ${arborists.length} arborists, ${areas.length} areas.`
);
