import { CBI_COMPONENTS, areaFigures } from '../cbiPoints.js';
import { centroidOf, geometryAreaM2, toHectares } from '../areaGeometry.js';
import { designationById, namriaClassById } from '../namriaCover.js';
import { eventDays, eventKindLabel, partnerList } from '../news.js';
import { lguFacts, officialName } from '../psgc.js';
import { listOf } from '../reportWriter.js';
import { originOf } from '../treeOrigin.js';
import { readDiameterShape } from '../treeVolume.js';
import { speciesTable } from './thematic.js';
import {
  DISCLAIMER,
  PREPARED_WITH,
  buildEcologicalReport,
  densityTable,
  diameterTable,
  diversityTable,
  ecologicalMaps,
  heightTable,
  originByPlaceTable,
  originSpeciesTable,
  phenologyTable,
  treeSummaryTable,
  treesByPlaceTable,
} from './ecological.js';
import { buildIndexReport, componentTable, indexAreasTable, scorecardTable } from './biodiversityIndex.js';

/**
 * The Urban Biodiversity Management Plan (29 October) — the City
 * Biodiversity Management Plan, for a city — in the outline of DENR-BMB
 * Technical Bulletin No. 2021-04, Annex B, heading for heading, its tables
 * as Annex B draws them, and the implementation plan of its Annex C.
 *
 * The biodiversity of the trees, which was chapter 3 of the Ecological
 * Profile, lives here now, under the plan's biological features.
 *
 * Where TB 2018-02 has a template for a section (BMB's orientation, 2026),
 * the section uses it: the Green Spaces Inventory Report Template (A. List of
 * Green Spaces, B. images, C. map) under II.c, and the Profiling and
 * Assessment Report Template's flora summary, List of Recorded Plant Species
 * and fauna list under II.d.
 *
 * What Green Tag holds is written in — the place, its terrain and climate,
 * the tagged trees, the land cover, the green spaces, the events. What it
 * does not hold — the foreword, the purpose, the planning process, the
 * vision and goals, the strategies, the budget, the monitoring, the fauna —
 * is a placeholder in square brackets (`placeholder: true`): nothing is
 * written for it from the bulletin, lest it be taken for the office's own.
 *
 * The plan is read-only on screen (`readOnly`) and completed in Word, where
 * the office adds the sections the system cannot cover. It speaks only for
 * the trees tagged within the LGU's jurisdiction, and its executive summary
 * says so, summing up only what the system holds.
 */

export const CBMP_REPORT = Object.freeze({ id: 'plan', label: 'City Biodiversity Management Plan', title: 'CITY BIODIVERSITY MANAGEMENT PLAN' });
export const UBMP_REPORT = Object.freeze({ id: 'plan', label: 'Urban Biodiversity Management Plan', title: 'URBAN BIODIVERSITY MANAGEMENT PLAN' });
export const planReportFor = (place) => (place?.isCity ? CBMP_REPORT : UBMP_REPORT);

const n = (value) => Number(value || 0).toLocaleString('en-US');
const hectares = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });
const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
const speciesKey = (value) => String(value ?? '').trim().toLowerCase();
/** An em space: the indent of a sub-row in Annex B's tables. */
const INDENT = ' ';

/** A section the office writes: the bracketed guidance stays until it does. */
const todo = (key, heading, guidance) => ({ key, heading, text: `[${guidance}]`, placeholder: true });

// ---- Annex B's tables ------------------------------------------------------------------

/** A two-column form, as Annex B draws its tables: the item, and its entry. */
function formTable(key, title, note, label, rows) {
  return {
    key,
    title,
    note,
    columns: [
      { key: 'name', label, kind: 'text' },
      { key: 'value', label: 'Entry', kind: 'entry' },
    ],
    rows: rows.map(([name, value = '']) => ({ name, value })),
  };
}

/** II.c: AREA COVERAGE, as Annex B has it; the office fills it for each green space or park. */
export function areaCoverageTable() {
  return formTable(
    'plan-area-coverage',
    'Area coverage',
    'Contains data on the land occupied by the green space expressed in square meters. This category identifies the actual uses and activities in the area. It also enumerates the ancillary services provided to the visitors (in hectares). One table for each green space or park.',
    'Area coverage',
    [
      ['a. Total area'],
      ['b. Area planted'],
      ['c. Other functional uses, please specify'],
      ['d. Urban Green Space Facility'],
      ['e. Ancillary Services'],
      ['f. Pavements/ Walk Trail Facility'],
      ['g. Urban Green Space Uses and Activities'],
    ]
  );
}

/** The NAMRIA classes that are vegetation: all but the built-up, barren and open water. */
const VEGETATED = new Set(['closed-forest', 'open-forest', 'brush-shrubs', 'perennial-crop', 'grassland', 'bamboo-stand', 'mangrove-forest', 'annual-crop', 'marshland-swamp']);

/** The land cover mapped in vegetated classes, in hectares; null when none is mapped. */
export function vegetativeCoverHa(features = [], municipality = '') {
  let mapped = false;
  let ha = 0;
  for (const feature of Array.isArray(features) ? features : []) {
    const props = feature?.properties;
    if (!props?.saved || props.kind !== 'land-cover' || (municipality && props.municipality !== municipality)) continue;
    mapped = true;
    if (VEGETATED.has(props.namriaClass)) ha += toHectares(geometryAreaM2(feature.geometry));
  }
  return mapped ? ha : null;
}

/**
 * II.d: VEGETATION/FLORA STRUCTURE, as Annex B has it. The trees are the
 * tagged trees; an invasive tree is an exotic one, and is counted there.
 * Other vegetation is not inventoried, so it is left for the office.
 */
export function vegetationTable({ trees = [], vegetatedHa = null }) {
  const origin = { endemic: 0, native: 0, exotic: 0, invasive: 0, unrecorded: 0 };
  for (const tree of trees) origin[originOf(tree)] += 1;
  const exotic = origin.exotic + origin.invasive;
  return formTable(
    'plan-vegetation',
    'Vegetation / flora structure',
    'Contains data and information on the kinds of flora species found and the levels of species richness and diversity. ' +
      'Vegetative cover: the land cover mapped so far in NAMRIA’s vegetated classes. Trees: the tagged trees' +
      (origin.unrecorded ? `, ${n(origin.unrecorded)} of them with no origin recorded` : '') +
      '. Other vegetation is not part of the tree inventory.',
    'Vegetation / flora structure',
    [
      ['Total vegetative cover (in hectares)', vegetatedHa === null ? '' : hectares(vegetatedHa)],
      ['Total number of trees', n(trees.length)],
      [`${INDENT}Endemic`, n(origin.endemic)],
      [`${INDENT}Native/Indigenous`, n(origin.native)],
      [`${INDENT}Exotic`, origin.invasive ? `${n(exotic)} (${n(origin.invasive)} of them invasive)` : n(exotic)],
      ['Other vegetation'],
      [`${INDENT}Endemic`],
      [`${INDENT}Native/Indigenous`],
      [`${INDENT}Exotic`],
    ]
  );
}

/** II.d: FAUNA STRUCTURE, as Annex B has it — not inventoried by the system, so for the office. */
export function faunaTable() {
  return formTable(
    'plan-fauna',
    'Fauna structure',
    'Contains data and information on the kinds of fauna species found and the levels of species richness and diversity.',
    'Fauna structure',
    [
      ['a. Type of fauna species (list down)'],
      [`${INDENT}- Endemic`],
      [`${INDENT}- Native/Indigenous`],
      [`${INDENT}- Exotic`],
      ['b. Total number of fauna species'],
      [`${INDENT}- Endemic`],
      [`${INDENT}- Native/Indigenous`],
      [`${INDENT}- Exotic`],
    ]
  );
}

/** V.c: the actions Annex B names, each with room for the interventions planned. */
export const PLAN_ACTIONS = Object.freeze([
  'i. Resource Protection and Management',
  'ii. Ecological Restoration',
  'iii. Waste Management',
  'iv. Green spaces/park zoning',
  'v. Sustainable Ecotourism (with possible linkages with other tourism circuit)',
  'vi. Visitor Safety/Management',
  'vii. Social Marketing/IEC Campaign',
  'viii. Human Resources Development/Capacity Building',
  'ix. Livelihood Development',
  'x. Research and development (including area/species assessments)',
  'xi. Local Policy',
  'xii. Gender and development',
  'xiii. Vulnerability Assessment',
  'xiv. Indigenous Peoples Concerns',
  'xv. Adaptation to climate-related hazards',
]);

export function actionsTable() {
  return {
    key: 'plan-actions',
    title: 'Actions (may vary from area to area)',
    note: 'Actions such as but not limited to these. The relationship of goals to strategies and proposed actions can be expressed through a logical framework analysis.',
    columns: [
      { key: 'name', label: 'Action', kind: 'text' },
      { key: 'value', label: 'Interventions planned', kind: 'entry' },
    ],
    rows: PLAN_ACTIONS.map((name) => ({ name, value: '' })),
  };
}

/** Annex C: the Implementation Plan Template, two strategies' rows, for the office to extend. */
export function implementationTable() {
  const blank = { program: '', activities: '', outcome: '', short: '', medium: '', long: '', lead: '', resources: '', budget: '', indicators: '', verification: '' };
  const strategy = (no) => [
    { ...blank, program: `Strategy ${no}:` },
    { ...blank, program: 'Objective/s:' },
    { ...blank },
    { ...blank },
  ];
  return {
    key: 'plan-implementation',
    title: 'Implementation plan (Annex C)',
    note:
      'Implementation plan shall be updated every 3 years. Timeframe: S, short term (3 years — Annual Work and Financial Plan); ' +
      'M, medium term (5 years); L, long term (10 years).',
    columns: [
      { key: 'program', label: 'Program', kind: 'entry' },
      { key: 'activities', label: 'Activities', kind: 'entry' },
      { key: 'outcome', label: 'Outcome', kind: 'entry' },
      { key: 'short', label: 'Timeframe S', kind: 'entry' },
      { key: 'medium', label: 'M', kind: 'entry' },
      { key: 'long', label: 'L', kind: 'entry' },
      { key: 'lead', label: 'Lead/responsible agency/ies and partners', kind: 'entry' },
      { key: 'resources', label: 'Resources needed', kind: 'entry' },
      { key: 'budget', label: 'Budget', kind: 'entry' },
      { key: 'indicators', label: 'Indicators', kind: 'entry' },
      { key: 'verification', label: 'Means of verification', kind: 'entry' },
    ],
    rows: [...strategy(1), ...strategy(2)],
  };
}

/** The acronyms and abbreviations the plan uses. */
export const PLAN_ACRONYMS = Object.freeze([
  ['A&D', 'Alienable and disposable (land)'],
  ['BMB', 'Biodiversity Management Bureau'],
  ['CBD', 'Convention on Biological Diversity'],
  ['CBI', 'City Biodiversity Index (Singapore Index on Cities’ Biodiversity)'],
  ['CDD', 'Conservation and Development Division'],
  ['CDP', 'Comprehensive Development Plan'],
  ['CENRO', 'City Environment and Natural Resources Office'],
  ['CEPA', 'Communication, Education and Public Awareness'],
  ['CLIRAM', 'Climate Information and Risk Analysis Matrix'],
  ['CLUP', 'Comprehensive Land Use Plan'],
  ['CPDO', 'City Planning and Development Office'],
  ['CSO', 'Civil society organization'],
  ['DBH', 'Diameter at breast height'],
  ['DENR', 'Department of Environment and Natural Resources'],
  ['DOST-PAGASA', 'Philippine Atmospheric, Geophysical and Astronomical Services Administration'],
  ['DRR', 'Disaster risk reduction'],
  ['eLCCAP', 'Enhanced Local Climate Change Action Plan'],
  ['ERDB', 'Ecosystems Research and Development Bureau'],
  ['FLUP', 'Forest Land Use Plan'],
  ['GIS', 'Geographic Information System'],
  ['ha', 'Hectare'],
  ['IEC', 'Information, education and communication'],
  ['LGU', 'Local Government Unit'],
  ['masl', 'Metres above sea level'],
  ['MENRO', 'Municipal Environment and Natural Resources Office'],
  ['NAMRIA', 'National Mapping and Resource Information Authority'],
  ['NGO', 'Non-governmental organization'],
  ['NSCB', 'National Statistical Coordination Board'],
  ['PBSAP', 'Philippine Biodiversity Strategy and Action Plan'],
  ['PENRO', 'Provincial Environment and Natural Resources Office'],
  ['PGENRO', 'Provincial Government Environment and Natural Resources Office'],
  ['PSA', 'Philippine Statistics Authority'],
  ['RED', 'Regional Executive Director'],
  ['RISE', 'ERDB Services and Knowledge Resources Integrated System'],
  ['TB', 'Technical Bulletin'],
  ['UBI', 'Urban Biodiversity Index'],
  ['UP NOAH', 'University of the Philippines Nationwide Operational Assessment of Hazards'],
  ['WFP', 'Work and Financial Plan'],
  ['ZO', 'Zoning Ordinance'],
]);

export function acronymsTable() {
  return {
    key: 'plan-acronyms',
    title: 'List of acronyms and abbreviations',
    columns: [
      { key: 'name', label: 'Acronym', kind: 'text' },
      { key: 'meaning', label: 'Meaning', kind: 'text' },
    ],
    rows: PLAN_ACRONYMS.map(([name, meaning]) => ({ name, meaning })),
  };
}

// ---- What the system knows -----------------------------------------------------------------

/** The tagged species whose profile records a conservation status (DAO, IUCN…). */
export function threatenedTable({ trees = [], profiles = [] }) {
  const statusOf = new Map();
  for (const profile of profiles) {
    const status = String(profile?.conservation_status ?? '').trim();
    if (!status) continue;
    if (profile.species) statusOf.set(speciesKey(profile.species), { status, scientific: profile.scientific_name ?? null });
    if (profile.scientific_name) statusOf.set(speciesKey(profile.scientific_name), { status, scientific: profile.scientific_name });
  }
  const bySpecies = new Map();
  for (const tree of trees) {
    const found = statusOf.get(speciesKey(tree.species)) ?? statusOf.get(speciesKey(tree.scientific_name));
    if (!found) continue;
    const name = String(tree.species ?? '').trim() || found.scientific;
    const entry = bySpecies.get(speciesKey(name)) ?? { name, scientific: found.scientific, status: found.status, trees: 0 };
    entry.trees += 1;
    bySpecies.set(speciesKey(name), entry);
  }
  return {
    key: 'plan-threatened',
    title: 'Tagged species with a conservation status',
    note: 'As each species’ profile states it (DENR-ERDB RISE; the DAO list of threatened plants or the IUCN Red List). Only species with a status on record.',
    columns: [
      { key: 'name', label: 'Species', kind: 'text' },
      { key: 'scientific', label: 'Scientific name', kind: 'text' },
      { key: 'status', label: 'Conservation status', kind: 'text' },
      { key: 'trees', label: 'Trees', kind: 'number' },
    ],
    rows: [...bySpecies.values()].sort((a, b) => b.trees - a.trees || a.name.localeCompare(b.name)),
  };
}

/**
 * The green spaces, in the types of the DHSUD Open Space Development
 * Guidelines the BMB lists (TB 2018-02 orientation, 2026): forests, nature
 * reserves, wetlands and the like. Agricultural lands and plantations are not
 * green spaces for biodiversity unless multi-cropped, so crops, bamboo stands
 * (mostly planted), built-up, barren land and open water are left out.
 */
const GREEN_SPACE_TYPES = Object.freeze({
  'closed-forest': 'Forest (closed)',
  'open-forest': 'Forest (open)',
  'mangrove-forest': 'Forest (mangrove)',
  'brush-shrubs': 'Brushland / shrubland',
  grassland: 'Grassland',
  'marshland-swamp': 'Wetland (marsh / swamp)',
});

/** "14.28123, 121.41234": a site's approximate centre, in decimal degrees. */
const decimalDegrees = (geometry) => {
  const centre = centroidOf(geometry);
  return centre ? `${centre[0].toFixed(5)}, ${centre[1].toFixed(5)}` : null;
};

/**
 * TB 2018-02's Green Spaces Inventory Report Template, A. List of Green
 * Spaces: the land cover of a green space type and the approved tree planting
 * sites, each with its area, type, barangay, centre and remarks.
 */
export function greenSpacesTable(features = [], { municipality = '', isCity = false } = {}) {
  const rows = (Array.isArray(features) ? features : [])
    .filter((f) => {
      const props = f?.properties;
      if (!props?.saved || (municipality && props.municipality !== municipality)) return false;
      if (props.kind === 'planting-site') return !props.approval || props.approval === 'approved';
      return props.kind === 'land-cover' && Boolean(GREEN_SPACE_TYPES[props.namriaClass]);
    })
    .map((f) => {
      const props = f.properties;
      const remarks = [
        props.designation ? designationById(props.designation)?.label ?? props.designation : null,
        props.condition === 'degraded' ? 'Marked degraded' : props.condition === 'restored' ? 'Restored or naturalised' : null,
      ].filter(Boolean);
      return {
        name: props.name,
        areaHa: toHectares(geometryAreaM2(f.geometry)),
        type: props.kind === 'planting-site' ? 'Tree planting site' : GREEN_SPACE_TYPES[props.namriaClass],
        location: props.barangay ? `Brgy. ${props.barangay}` : null,
        coordinates: decimalDegrees(f.geometry),
        remarks: remarks.join('; ') || null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'plan-green-spaces',
    title: 'A. List of green spaces',
    note:
      `Region: IV-A (CALABARZON). ${isCity ? 'City' : 'Municipality'}: ${municipality || '—'}. ` +
      'TB 2018-02 Green Spaces Inventory Report Template. From the land cover and tree planting sites mapped; coordinates are the approximate centre of each site, in decimal degrees.',
    columns: [
      { key: 'name', label: 'Green space', kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'type', label: 'Type of green space', kind: 'text' },
      { key: 'location', label: 'Location', kind: 'text' },
      { key: 'coordinates', label: 'Coordinates (latitude, longitude)', kind: 'text' },
      { key: 'remarks', label: 'Remarks', kind: 'entry' },
    ],
    rows,
    totals: rows.length ? { name: `Total area of green space in the ${isCity ? 'city' : 'municipality'}`, areaHa: rows.reduce((t, r) => t + r.areaHa, 0) } : null,
  };
}

const ORIGIN_WORD = { endemic: 'Endemic', native: 'Indigenous', exotic: 'Exotic', invasive: 'Invasive', unrecorded: null };

/**
 * TB 2018-02's Urban Green Space Profiling and Biodiversity Assessment
 * Report Template, B.1 Flora: the totals it asks for, from the tagged trees.
 */
export function floraTable({ trees = [], diversity, species, threatened }) {
  const origins = { endemic: new Set(), native: new Set(), invasive: new Set() };
  for (const tree of trees) {
    const origin = originOf(tree);
    const name = speciesKey(tree.scientific_name || tree.species);
    if (name && origins[origin]) origins[origin].add(name);
  }
  const d = diversity?.diversity ?? {};
  const top = (species?.rows ?? []).slice(0, 3);
  return formTable(
    'plan-flora',
    '1. Flora',
    'From the tagged trees only; other plants are not part of the tree inventory. Indices as TB 2018-02, Attachment 1.',
    'Flora',
    [
      ['Total number of plant species in the LGU (tree species tagged)', n(species?.rows?.length ?? 0)],
      ['Total number of endemic species', n(origins.endemic.size)],
      ['Total number of native/indigenous species', n(origins.native.size)],
      ['Total recorded number of invasive alien species', n(origins.invasive.size)],
      ['Species with a conservation status on record', n(threatened?.rows?.length ?? 0)],
      ['Dominant species (share of the trees)', top.length ? top.map((row) => `${row.name} (${pct(row.count, trees.length)})`).join(', ') : ''],
      ['Shannon-Wiener diversity index (H′)', d.shannon == null ? '' : d.shannon.toFixed(2)],
      ['Evenness (J)', d.evenness == null ? '' : d.evenness.toFixed(2)],
      ['Simpson’s dominance index (c)', d.simpson == null ? '' : d.simpson.toFixed(3)],
    ]
  );
}

/**
 * TB 2018-02's Table x. List of Recorded Plant Species: every tree species
 * tagged, its scientific name, its origin, its conservation status (from its
 * profile) and, in the remarks, how many trees.
 */
export function plantSpeciesTable({ trees = [], profiles = [] }) {
  const profileOf = new Map();
  for (const profile of profiles) {
    if (profile?.species) profileOf.set(speciesKey(profile.species), profile);
    if (profile?.scientific_name) profileOf.set(speciesKey(profile.scientific_name), profile);
  }
  const bySpecies = new Map();
  for (const tree of trees) {
    const common = String(tree.species ?? '').trim();
    if (!common || /^unknown$/i.test(common)) continue;
    const entry = bySpecies.get(speciesKey(common)) ?? { common, scientific: null, origins: new Map(), trees: 0 };
    entry.trees += 1;
    if (!entry.scientific && tree.scientific_name && !/unknown/i.test(tree.scientific_name)) entry.scientific = tree.scientific_name;
    const origin = originOf(tree);
    entry.origins.set(origin, (entry.origins.get(origin) ?? 0) + 1);
    bySpecies.set(speciesKey(common), entry);
  }
  const rows = [...bySpecies.values()]
    .map((entry) => {
      const profile = profileOf.get(speciesKey(entry.common)) ?? profileOf.get(speciesKey(entry.scientific));
      const origin = [...entry.origins.entries()].filter(([id]) => id !== 'unrecorded').sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unrecorded';
      return {
        name: entry.scientific ?? profile?.scientific_name ?? '',
        common: entry.common,
        origin: ORIGIN_WORD[origin],
        status: String(profile?.conservation_status ?? '').trim() || null,
        remarks: `${n(entry.trees)} ${entry.trees === 1 ? 'tree' : 'trees'} tagged`,
      };
    })
    .sort((a, b) => a.common.localeCompare(b.common));
  return {
    key: 'plan-plant-species',
    title: 'Table x. List of recorded plant species',
    note: 'Origin as recorded on the trees; conservation status as each species’ profile states it (DAO No. 2026-20, the updated national list of threatened plants).',
    columns: [
      { key: 'name', label: 'Scientific name', kind: 'text' },
      { key: 'common', label: 'Common name', kind: 'text' },
      { key: 'origin', label: 'Indigenous, endemic, exotic, invasive', kind: 'text' },
      { key: 'status', label: 'Conservation status', kind: 'entry' },
      { key: 'remarks', label: 'Remarks', kind: 'entry' },
    ],
    rows,
  };
}

/** TB 2018-02's B.2 Fauna list, by the groups it names: for the office to fill. */
export function faunaListTable() {
  const blank = { common: '', origin: '', status: '', remarks: '' };
  const group = (name) => [{ name, ...blank }, { name: '', ...blank }, { name: '', ...blank }];
  return {
    key: 'plan-fauna-species',
    title: 'Table x. List of recorded fauna species',
    note:
      'You may include other taxonomic groups. Conservation status and endemicity: DAO No. 2019-09 (threatened fauna); invasive species: the National Invasive Species Strategy and Action Plan 2016–2026.',
    columns: [
      { key: 'name', label: 'Scientific name', kind: 'entry' },
      { key: 'common', label: 'Common name', kind: 'entry' },
      { key: 'origin', label: 'Indigenous, endemic, exotic, invasive', kind: 'entry' },
      { key: 'status', label: 'Conservation status', kind: 'entry' },
      { key: 'remarks', label: 'Remarks', kind: 'entry' },
    ],
    rows: [...group('a. Birds'), ...group('b. Volant mammals'), ...group('c. Arthropods (butterflies, dragonflies, mayflies…)'), ...group('d. Herpetofauna')],
  };
}

/** II.b.ix: the areas the office mapped with a legal designation, and their documents. */
export function designatedAreasTable(features = [], municipality = '') {
  const rows = (Array.isArray(features) ? features : [])
    .filter((f) => f?.properties?.saved && f.properties.designation && (!municipality || f.properties.municipality === municipality))
    .map((f) => {
      const props = f.properties;
      const doc = props.document;
      return {
        name: props.name,
        designation: designationById(props.designation)?.label ?? props.designation,
        cover: namriaClassById(props.namriaClass)?.label ?? (props.kind === 'planting-site' ? 'Tree planting site' : null),
        barangay: props.barangay ?? null,
        areaHa: toHectares(geometryAreaM2(f.geometry)),
        document: doc ? [doc.type, doc.number, doc.title].filter(Boolean).join(' ') || null : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'plan-designated',
    title: 'Conservation and special interest areas mapped',
    note: 'The areas mapped with a legal designation, each with its document.',
    columns: [
      { key: 'name', label: 'Area', kind: 'text' },
      { key: 'designation', label: 'Designation', kind: 'text' },
      { key: 'cover', label: 'Land cover', kind: 'text' },
      { key: 'barangay', label: 'Barangay', kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'document', label: 'Document', kind: 'text' },
    ],
    rows,
    totals: rows.length ? { name: `${rows.length} ${rows.length === 1 ? 'area' : 'areas'}`, areaHa: rows.reduce((t, r) => t + r.areaHa, 0) } : null,
  };
}

/** III: the activities the office posted on News & Events, oldest first. */
export function initiativesTable(posts = [], lgu = null) {
  const rows = (Array.isArray(posts) ? posts : [])
    .filter((post) => post?.event_date && post.title && (lgu === null || Number(post.lgu_psgc) === Number(lgu)))
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))
    .map((post) => ({
      name: eventDays(post),
      title: post.title,
      kind: eventKindLabel(post.event_kind) || null,
      venue: post.venue || null,
      partners: partnerList(post.partners).join(', ') || null,
    }));
  return {
    key: 'plan-initiatives',
    title: 'Activities posted on News & Events',
    note: 'The office’s own activities, as posted. Initiatives of national agencies, NGOs, CSOs and the private sector are to be added.',
    columns: [
      { key: 'name', label: 'Date', kind: 'text' },
      { key: 'title', label: 'Activity', kind: 'text' },
      { key: 'kind', label: 'Kind', kind: 'text' },
      { key: 'venue', label: 'Venue', kind: 'text' },
      { key: 'partners', label: 'Partners', kind: 'text' },
    ],
    rows,
  };
}

/** The bounding box and centre of a boundary, in degrees: { north, south, east, west, centre: [lat, lng] }. */
export function extentOf(geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  let north = -Infinity;
  let south = Infinity;
  let east = -Infinity;
  let west = Infinity;
  for (const rings of polygons) {
    for (const [lng, lat] of rings?.[0] ?? []) {
      north = Math.max(north, lat);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      west = Math.min(west, lng);
    }
  }
  if (!Number.isFinite(north)) return null;
  return { north, south, east, west, centre: centroidOf(geometry) };
}

/** 14.2817 → "14°16′54″". */
export function dms(value) {
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Math.round(((abs - deg) * 60 - min) * 60);
  if (sec === 60) [sec, min] = [0, min + 1];
  if (min === 60) [min, deg] = [0, deg + 1];
  return `${deg}°${String(min).padStart(2, '0')}′${String(sec).padStart(2, '0')}″`;
}

// ---- The narrative ----------------------------------------------------------------------

/**
 * The whole plan in brief, from what the system holds for the LGU and
 * nothing else: no guidance, no process, nothing it cannot back with a figure.
 */
function summaryText({ where, short, place, places, population, totalHa, urbanPlaces, elevation, slope, climate, trees, speciesCount, placesWithTrees, summary, diversity, species, flora, greenSpaces, designated, exposure, initiatives, cbi }) {
  const paragraphs = [];
  paragraphs.push(
    `This plan is composed only of the trees tagged within the territorial jurisdiction of ${where}, and of the land cover, green spaces, ` +
    `tree planting sites and activities its office has recorded in the system; what the system does not hold is not in it. ` +
    `${short} covers about ${hectares(totalHa)} ha in ${n(places.length)} barangays, with about ${n(population)} residents (PSA 2024)` +
    (place?.isCity ? '.' : urbanPlaces.length ? `; ${n(urbanPlaces.length)} of the barangays are urban by the PSA’s classification.` : '; none of its barangays is urban by the PSA’s classification.')
  );

  const terrain = [];
  const et = elevation?.totals ?? {};
  const elevAll = (et.below500 ?? 0) + (et.from500 ?? 0) + (et.above1000 ?? 0);
  if (elevAll) terrain.push(`${pct(et.below500, elevAll)} of the land lies below 500 m above sea level`);
  const st = slope?.totals ?? {};
  const slopeAll = (st.below18 ?? 0) + (st.from18 ?? 0) + (st.from30 ?? 0) + (st.above50 ?? 0);
  if (slopeAll) terrain.push(`${pct((st.from18 ?? 0) + (st.from30 ?? 0) + (st.above50 ?? 0), slopeAll)} slopes 18% or more`);
  if (climate?.rainfall?.annualMm != null) terrain.push(`about ${n(climate.rainfall.annualMm)} mm of rain falls a year (DOST-PAGASA CLIRAM)`);
  const green = greenSpaces.rows.length
    ? `${n(greenSpaces.rows.length)} green ${greenSpaces.rows.length === 1 ? 'space is' : 'spaces are'} inventoried, ${hectares(greenSpaces.totals.areaHa)} ha in all` +
      (designated.rows.length ? `, and ${n(designated.rows.length)} ${designated.rows.length === 1 ? 'area has' : 'areas have'} a legal designation` : '')
    : '';
  if (terrain.length || green) paragraphs.push(`${[...terrain, green].filter(Boolean).map((s, i) => (i ? s : s.charAt(0).toUpperCase() + s.slice(1))).join('; ')}.`);

  if (trees.length) {
    const d = diversity.diversity;
    const top = (species.rows ?? []).slice(0, 3);
    paragraphs.push(
      `${n(trees.length)} trees of ${n(speciesCount)} species are tagged, in ${n(placesWithTrees)} of the ${n(places.length)} barangays: ` +
      `${n(summary.origin.endemic)} endemic, ${n(summary.origin.native)} native or indigenous, ${n(summary.origin.exotic)} exotic and ${n(summary.origin.invasive)} invasive. ` +
      `The dominant species are ${listOf(top.map((row) => `${row.name} (${pct(row.count, trees.length)})`))}` +
      (d.shannon === null ? '.' : `; Shannon’s diversity index is H′ = ${d.shannon.toFixed(2)}.`) +
      (flora.threatened ? ` ${n(flora.threatened)} of the species have a conservation status on record.` : '') +
      ` ${n(summary.use.fruit)} are fruit trees and ${n(summary.use.timber)} timber trees.`
    );
  } else {
    paragraphs.push(`No tree has been tagged in ${short} yet.`);
  }

  const more = [];
  const xt = exposure?.totals ?? {};
  if (xt.trees && xt.flood !== null && xt.flood !== undefined) {
    more.push(`${pct(xt.flood, xt.trees)} of the tagged trees stand in flood-susceptible areas${xt.landslide !== null && xt.landslide !== undefined ? ` and ${pct(xt.landslide, xt.trees)} in landslide-susceptible areas` : ''} (UP NOAH)`);
  }
  if (initiatives.rows.length) more.push(`the office has posted ${n(initiatives.rows.length)} ${initiatives.rows.length === 1 ? 'activity' : 'activities'} on News & Events`);
  if (cbi?.scored) more.push(`the ${place?.isCity ? 'City' : 'Urban'} Biodiversity Index scores ${n(cbi.points)} of the ${n(cbi.of)} points of the ${n(cbi.scored)} of 28 indicators scored so far (Annex a)`);
  if (more.length) paragraphs.push(`${more.map((s, i) => (i ? s : s.charAt(0).toUpperCase() + s.slice(1))).join('; ')}.`);
  return paragraphs.join('\n\n');
}

/** I.b: what the inventory shows of the trees' uses; the rest is the office's. */
function linksText({ short, summary }) {
  const { origin, use } = summary;
  const total = Object.values(origin).reduce((t, v) => t + v, 0);
  if (total === 0) return `No tree has been tagged in ${short} yet.`;
  return (
    `Of the ${n(total)} tagged trees, ${n(use.fruit)} are fruit trees, ${n(use.timber)} timber trees and ${n(use.ornamental)} ornamental. ` +
    `${n(origin.endemic + origin.native)} (${pct(origin.endemic + origin.native, total)}) are endemic or native, and ${n(origin.invasive)} ` +
    `(${pct(origin.invasive, total)}) are of invasive species.`
  );
}

function coordinatesText({ where, extent, place }) {
  const facts = place ? lguFacts(place.psgc) : null;
  return (
    (extent
      ? `${where.charAt(0).toUpperCase()}${where.slice(1)} lies between latitudes ${dms(extent.south)} and ${dms(extent.north)} N and longitudes ` +
        `${dms(extent.west)} and ${dms(extent.east)} E; its centre is at about ${dms(extent.centre[0])} N, ${dms(extent.centre[1])} E. `
      : '') +
    `Administratively it is ${place?.isCity ? 'a city' : 'a municipality'}${facts?.income ? ` of the ${facts.income} income class` : ''} of the Province of Laguna, ` +
    'Region IV-A (CALABARZON); its boundaries are the PSA and NAMRIA boundaries shown on the location map.'
  );
}

function landResourcesText({ short, areasTable, urbanCount, places }) {
  const rows = areasTable.rows ?? [];
  const urban =
    urbanCount === null ? '' : ` By the PSA’s classification, ${n(urbanCount)} of its ${n(places.length)} barangays are urban and ${n(places.length - urbanCount)} rural.`;
  if (rows.length === 0) return `No land cover has been mapped in ${short} yet.${urban}`;
  const total = rows.reduce((t, r) => t + r.areaHa, 0);
  return (
    `${hectares(total)} ha of land cover have been mapped in ${short}, in NAMRIA’s classes: ` +
    `${listOf(rows.slice(0, 6).map((r) => `${r.name.toLowerCase()}, ${hectares(r.areaHa)} ha`))}` +
    `${rows.length > 6 ? `, and ${n(rows.length - 6)} other classes` : ''}.${urban}`
  );
}

function freshwaterText({ short, features }) {
  const waters = features.filter((f) => f?.properties?.saved && f.properties.kind === 'land-cover' && ['inland-water', 'marshland-swamp', 'fishpond'].includes(f.properties.namriaClass));
  if (waters.length === 0) return null;
  const ha = waters.reduce((t, f) => t + toHectares(geometryAreaM2(f.geometry)), 0);
  return `${n(waters.length)} ${waters.length === 1 ? 'area' : 'areas'} of inland water, marsh and fishpond ${waters.length === 1 ? 'has' : 'have'} been mapped in ${short}, ${hectares(ha)} ha in all: ${listOf(waters.slice(0, 6).map((f) => f.properties.name))}.`;
}

function projectionText({ climate }) {
  const proj = climate?.rainfall?.projected;
  const projT = climate?.temperature?.projected;
  if (proj?.annualMm == null && projT?.meanC == null) return null;
  return (
    `DOST-PAGASA’s CLIRAM projects ${proj?.annualMm != null ? `about ${n(proj.annualMm)} mm of rain a year for ${proj.period}` : ''}` +
    `${proj?.annualMm != null && projT?.meanC != null ? ' and ' : ''}${projT?.meanC != null ? `a mean temperature of about ${projT.meanC} °C for ${projT.period}` : ''}` +
    `${climate.scenario ? `, under ${climate.scenario}` : ''}. Species chosen for planting now should suit the climate they will grow into.`
  );
}

function conservationText({ short, areas, designated }) {
  if (!designated.rows.length && !areas.protectedHa) return `No area with a legal designation has been mapped in ${short} yet.`;
  return (
    `${n(designated.rows.length)} ${designated.rows.length === 1 ? 'area' : 'areas'} with a legal designation ${designated.rows.length === 1 ? 'has' : 'have'} been mapped in ${short}` +
    `${designated.rows.length ? `, ${hectares(designated.totals.areaHa)} ha in all` : ''}. ` +
    `${hectares(areas.protectedHa)} ha of them are protected areas or forest land that are natural — the protected or secured natural areas the biodiversity index counts.`
  );
}

function greenSpacesText({ short, table }) {
  const rows = table.rows ?? [];
  if (rows.length === 0) return `No green space or tree planting site has been mapped in ${short} yet.`;
  const byType = new Map();
  for (const row of rows) byType.set(row.type, (byType.get(row.type) ?? 0) + row.areaHa);
  return (
    `${n(rows.length)} green ${rows.length === 1 ? 'space has' : 'spaces have'} been mapped in ${short}, ${hectares(table.totals.areaHa)} ha in all: ` +
    `${listOf([...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, ha]) => `${type.toLowerCase()}, ${hectares(ha)} ha`))}.`
  );
}

function overviewText({ short, trees, summary, species, vegetatedHa }) {
  if (trees.length === 0) return `No tree has been tagged in ${short} yet.`;
  const top = (species.rows ?? []).slice(0, 5);
  const over = (species.rows ?? []).filter((row) => row.share > 0.1).map((row) => row.name);
  const { origin, use } = summary;
  return (
    (vegetatedHa !== null ? `The land cover mapped so far counts ${hectares(vegetatedHa)} ha of vegetation. ` : '') +
    `${n(trees.length)} trees of ${n(species.rows.length)} species have been tagged in ${short}. The most common are ` +
    `${listOf(top.map((row) => `${row.name} (${n(row.count)})`))}. By origin, ${n(origin.endemic)} are endemic, ${n(origin.native)} native, ` +
    `${n(origin.exotic)} exotic and ${n(origin.invasive)} invasive${origin.unrecorded ? `; ${n(origin.unrecorded)} have no origin recorded` : ''}. ` +
    `By use, ${n(use.fruit)} are fruit trees, ${n(use.timber)} timber and ${n(use.ornamental)} ornamental.` +
    (over.length ? ` ${listOf(over)} ${over.length === 1 ? 'is' : 'are each'} more than 10% of the inventory, above Santamour’s guideline for one species.` : '') +
    '\n\nThese trees are part of the LGU’s natural capital. They store carbon and take more of it up each year; they shade streets and ' +
    'homes and cool the air around them; they hold soil on slopes and riverbanks. A varied inventory, led by native species, is ' +
    'more resilient to pests, disease and a changing climate than one dominated by a few species.'
  );
}

function originText({ short, summary, speciesRows }) {
  const { origin } = summary;
  const total = Object.values(origin).reduce((t, v) => t + v, 0);
  if (total === 0) return `No tree has been tagged in ${short} yet.`;
  const endemic = speciesRows.filter((row) => row.originId === 'endemic');
  const invasive = speciesRows.filter((row) => row.originId === 'invasive');
  return (
    `${n(origin.endemic)} of the ${n(total)} tagged trees (${pct(origin.endemic, total)}) are endemic — found naturally only in the Philippines — ` +
    `and ${n(origin.native)} (${pct(origin.native, total)}) are native.` +
    (endemic.length ? ` The endemic species are ${listOf(endemic.map((row) => `${row.name} (${n(row.count)})`))}.` : ' No endemic species has been tagged yet.') +
    ` ${n(origin.invasive)} trees (${pct(origin.invasive, total)}) are of invasive species` +
    (invasive.length ? `: ${listOf(invasive.map((row) => `${row.name} (${n(row.count)})`))}.` : '.') +
    '\n\nEndemic and native trees carry the local biodiversity and are the species to favour in planting. Invasive trees spread at the expense of ' +
    'native vegetation; their share is one of the biodiversity index’s indicators, and the planting site suggestions never recommend one.'
  );
}

function threatenedText({ table }) {
  if (table.rows.length === 0) return 'None of the tagged species has a conservation status on record in its profile.';
  return (
    `${n(table.rows.length)} tagged ${table.rows.length === 1 ? 'species has' : 'species have'} a conservation status on record: ` +
    `${listOf(table.rows.map((row) => `${row.name}, ${row.status} (${n(row.trees)} ${row.trees === 1 ? 'tree' : 'trees'})`))}. ` +
    'These trees are the first to protect, and their species the first to propagate.'
  );
}

function structureText({ diameter, height, density, diversity }) {
  const d = diversity.diversity;
  const top = density.rows.filter((row) => row.trees > 0).slice(0, 3);
  const shape = readDiameterShape(diameter.distribution);
  return (
    (shape ? `${shape.headline}: ${shape.detail.charAt(0).toLowerCase()}${shape.detail.slice(1)} ` : 'No tree has been measured for its diameter yet. ') +
    (height.mean !== null ? `The measured trees average about ${height.mean.toFixed(1)} m in total height. ` : '') +
    (top.length
      ? `The inventory is densest in ${listOf(top.map((row) => `${row.name} (${row.perHa.toFixed(2)} trees per ha)`))}; over the whole area it averages ${(density.totals.perHa ?? 0).toFixed(2)} tagged trees per hectare. `
      : '') +
    (d.shannon === null
      ? 'Too few species are identified to measure diversity.'
      : `Shannon’s diversity index is H′ = ${d.shannon.toFixed(2)}, with an evenness of J = ${d.evenness === null ? '—' : d.evenness.toFixed(2)}; ` +
        `Simpson’s dominance is c = ${d.simpson.toFixed(3)}, so two trees picked at random are of different species ${pct(1 - d.simpson, 1)} of the time.`) +
    '\n\nThe size and height classes show whether the tree cover is young or mature: many small trees is a planting programme still growing; ' +
    'trees spread across the classes replace themselves. Density shows where the inventory is thick and where it is thin — a barangay with few ' +
    'tagged trees may have few trees, or may simply not have been surveyed yet.'
  );
}

function phenologyText({ table }) {
  const rows = table.rows ?? [];
  if (rows.length === 0) return 'No identified species has been tagged yet.';
  const withMonths = rows.filter((row) => row.flowering || row.fruiting);
  const fruit = rows.filter((row) => row.useId === 'fruit' && row.fruiting);
  const timber = rows.filter((row) => row.useId === 'timber');
  const observed = rows.reduce((t, row) => t + row.observed, 0);
  return (
    'The economically important trees are the fruit trees, for food and income, and the timber trees, for wood under a permit' +
    `${timber.length ? ` — among the timber species, ${listOf(timber.slice(0, 5).map((row) => `${row.name} (${n(row.trees)})`))}` : ''}. ` +
    `Flowering and fruiting months are on record for ${n(withMonths.length)} of the ${n(rows.length)} species tagged.` +
    (fruit.length ? ` The fruit trees are harvested in these months: ${fruit.slice(0, 6).map((row) => `${row.name}, ${row.fruiting}`).join('; ')}.` : '') +
    (observed ? ` The field officers have recorded the phenology of ${n(observed)} trees.` : ' No phenology has been recorded in the field yet.')
  );
}

function demographicsText({ short, population, totalHa, location }) {
  const rows = (location.rows ?? []).filter((row) => row.population);
  const top = [...rows].sort((a, b) => b.population - a.population).slice(0, 3);
  return (
    `${short} has about ${n(population)} residents (PSA 2024)` +
    (totalHa && population ? `, about ${n(Math.round((population / totalHa) * 100))} per square kilometre` : '') +
    '.' +
    (top.length ? ` The most populous barangays are ${listOf(top.map((row) => `${row.name} (${n(row.population)})`))}.` : '')
  );
}

function economicsText({ place }) {
  const facts = place ? lguFacts(place.psgc) : null;
  if (!facts?.income) return null;
  return `${place.label} is of the ${facts.income} income class, under the Department of Finance’s income classification of LGUs.`;
}

function disturbanceText({ short, areas, summary }) {
  const parts = [];
  if (areas.degradedHa) parts.push(`${hectares(areas.degradedHa)} ha of the land cover mapped are marked degraded — disturbed, or being restored`);
  if (areas.restoredHa) parts.push(`${hectares(areas.restoredHa)} ha restored or naturalised`);
  if (summary.origin.invasive) parts.push(`${n(summary.origin.invasive)} tagged trees are of invasive species`);
  return parts.length ? `In ${short}, ${listOf(parts)}.` : null;
}

function erosionText({ slope }) {
  const t = slope.totals ?? {};
  const all = (t.below18 ?? 0) + (t.from18 ?? 0) + (t.from30 ?? 0) + (t.above50 ?? 0);
  if (!all) return null;
  const steep = (t.from18 ?? 0) + (t.from30 ?? 0) + (t.above50 ?? 0);
  return (
    `${hectares(steep)} ha (${pct(steep, all)}) slope 18% or more, ${hectares(t.above50)} ha of it steeper than 50% (II.b.ii). ` +
    'This is where rain runs off fastest and soil erodes most easily, and where tree cover protects the soil and the communities below it.'
  );
}

function initiativesText({ short, table, trees, sites }) {
  const rows = table.rows ?? [];
  const byKind = new Map();
  for (const row of rows) byKind.set(row.kind ?? 'Other', (byKind.get(row.kind ?? 'Other') ?? 0) + 1);
  const years = rows.map((row) => row.name.match(/\d{4}/g)?.at(-1)).filter(Boolean);
  return (
    (rows.length
      ? `The office has posted ${n(rows.length)} ${rows.length === 1 ? 'activity' : 'activities'} on News & Events` +
        `${years.length ? ` from ${years[0]} to ${years.at(-1)}` : ''}: ${listOf([...byKind.entries()].map(([kind, count]) => `${n(count)} ${kind.toLowerCase()}`))}.`
      : `No activity of ${short}’s office has been posted on News & Events yet.`) +
    ` The tree inventory itself is an initiative: ${n(trees.length)} trees tagged so far` +
    `${sites ? `, and ${n(sites)} tree planting ${sites === 1 ? 'site' : 'sites'} approved` : ''}.`
  );
}

function situationText({ short, summary, species, exposure, areas, threatened }) {
  const issues = [];
  const { origin } = summary;
  const total = Object.values(origin).reduce((t, v) => t + v, 0);
  if (origin.invasive) issues.push(`${n(origin.invasive)} invasive trees (${pct(origin.invasive, total)} of the inventory) — resource protection and management, and their control`);
  const over = (species.rows ?? []).filter((row) => row.share > 0.1).map((row) => row.name);
  if (over.length) issues.push(`${listOf(over)} ${over.length === 1 ? 'is' : 'are each'} over 10% of the trees — diversify planting with native species`);
  if (threatened.rows.length) issues.push(`${n(threatened.rows.length)} tagged species with a conservation status — their protection and propagation`);
  const xt = exposure.totals ?? {};
  if (xt.trees && (xt.flood || xt.landslide)) issues.push(`${n(Math.max(xt.flood ?? 0, xt.landslide ?? 0))} or more trees in flood or landslide areas — vulnerability assessment and adaptation to climate-related hazards`);
  if (areas.degradedHa) issues.push(`${hectares(areas.degradedHa)} ha of degraded land cover — ecological restoration`);
  return issues.length
    ? `The situational analysis of ${short}’s tree inventory and land cover points to these issues, for the strategies to address: ${issues.map((issue, i) => `(${i + 1}) ${issue}`).join('; ')}.`
    : `The tree inventory of ${short} does not yet show an issue for the strategies to address; the situational analysis is the office’s.`;
}

const planSources = () =>
  `${PREPARED_WITH}\n\n` +
  'The outline, its tables and the implementation plan template are those of DENR-BMB Technical Bulletin No. 2021-04, Annexes B and C; the list of ' +
  'green spaces and the flora and fauna lists, those of the Green Spaces Inventory and the Urban Green Space Profiling and Biodiversity Assessment ' +
  'report templates of DENR-BMB Technical Bulletin 2018-02 (BMB orientation, 2026). The area profile ' +
  'is drawn from the PSA and NAMRIA boundaries, the PSA 2024 census, the Copernicus DEM, DOST-PAGASA CLIRAM and UP NOAH; the biological features from the ' +
  'tree inventory, its diversity indices as DENR-BMB Technical Bulletin 2018-02, Attachment 1, and its species profiles from DENR-ERDB RISE; the land ' +
  'cover, planting sites and designated areas as the office and PGENRO mapped them; the initiatives from the office’s News & Events.\n\n' +
  'Limitations: the plan speaks only for the trees tagged within the LGU’s jurisdiction, not every tree and not other plants or wildlife; hazard figures ' +
  'are exposure, not risk. Sections in square brackets are for the office to complete. For planning purposes only.\n\n' +
  DISCLAIMER;

export const PLAN_REFERENCES = [
  'DENR Biodiversity Management Bureau. (2021). Technical Bulletin No. 2021-04: Guidelines on urban biodiversity management planning process. https://bmb.gov.ph',
  'DENR Biodiversity Management Bureau. (2018). Technical Bulletin No. 2018-02: Procedures in the conduct of assessment of urban biodiversity. https://bmb.gov.ph',
  'DENR Administrative Order No. 2016-12: Adopting the Philippine Biodiversity Strategy and Action Plan 2015-2028. https://bmb.gov.ph',
  'Republic Act No. 7160, the Local Government Code of 1991. https://lawphil.net/statutes/repacts/ra1991/ra_7160_1991.html',
  'Chan, L., Hillel, O., Werner, P., Holman, N., Coetzee, I., Galt, R., and Elmqvist, T. (2021). Handbook on the Singapore Index on Cities’ Biodiversity (also known as the City Biodiversity Index). Montreal: Secretariat of the Convention on Biological Diversity; Singapore: National Parks Board. https://www.cbd.int/authorities/gettinginvolved/cbi.shtml',
  'National Statistical Coordination Board. (2003). Resolution No. 9, Series of 2003: Adoption of the operational definition of urban areas in the Philippines. https://psa.gov.ph',
  'DENR Administrative Order No. 2026-20: Updated national list of threatened Philippine plants and their categories, as cited by the BMB in its orientation on TB 2018-02 (2026). https://bmb.gov.ph',
  'DENR Administrative Order No. 2019-09: Updated national list of threatened Philippine fauna and their categories. https://bmb.gov.ph',
  'DENR Biodiversity Management Bureau. National Invasive Species Strategy and Action Plan 2016–2026. https://bmb.gov.ph',
  'Department of Human Settlements and Urban Development. Open Space Development Guidelines: the types of green spaces. https://dhsud.gov.ph',
  'Philippine Statistics Authority. (2026). Philippine Standard Geographic Code (PSGC), 3rd quarter 2026; 2024 Census of Population. https://psa.gov.ph/classification/psgc',
  'National Mapping and Resource Information Authority (NAMRIA). Administrative boundaries and land cover classification. https://www.namria.gov.ph',
  'European Space Agency / Copernicus. Copernicus Digital Elevation Model. https://dataspace.copernicus.eu',
  'DOST-PAGASA. Climate Information and Risk Analysis Matrix (CLIRAM). https://www.pagasa.dost.gov.ph',
  'University of the Philippines Resilience Institute, Project NOAH. Flood and rain-induced landslide hazard maps. https://noah.up.edu.ph',
  'DENR Ecosystems Research and Development Bureau. ERDB Services and Knowledge Resources Integrated System (RISE): species profiles. https://erdb.denr.gov.ph',
  'DENR Forest Management Bureau. (2014). Technical Bulletin No. 3: Measurement standards and procedures in the conduct of inventory for standing trees. https://forestry.denr.gov.ph',
  'Santamour, F. S., Jr. (1990). Trees for urban planting: diversity, uniformity, and common sense. Proceedings of the 7th Conference of the Metropolitan Tree Improvement Alliance (METRIA 7), 57–65.',
];

// ---- The plan ---------------------------------------------------------------------------

/**
 * `ctx`: what buildIndexReport() takes (the Ecological Profile's, and the
 * features, newsPosts, climatePlans, communityScientists, self and year of
 * the index), and `boundary`, the LGU's outline, for its coordinates.
 *
 * Returns the report as the others are — { kind, title, maps, chapters,
 * tables, sections } — with `subtitle`, the title page's lines under the
 * title. A chapter may be the title page (`heading: null`) or the table of
 * contents (`contents: true`); a part of `level: 3` is a heading under the
 * one before it (Annex B's i., ii., …).
 */
export function buildPlanReport(ctx) {
  const place = ctx.place;
  const report = planReportFor(place);
  const where = `the ${officialName(place)}`;
  const short = place ? place.label : 'Laguna';
  const places = ctx.places ?? [];
  const trees = ctx.trees ?? [];
  const placeOf = ctx.placeOf ?? ((tree) => tree.barangay);
  const features = ctx.features ?? [];
  const municipality = place?.name ?? '';
  const placeLabel = ctx.placeLabel ?? 'Barangay';
  const byKey = ctx.tables ?? {};

  // The Ecological Profile's figures and narrative, for the area profile.
  const eco = buildEcologicalReport(ctx);
  const ecoTable = (key) => eco.tables.find((table) => table.key === key) ?? null;
  const ecoSection = (key) => eco.sections.find((section) => section.key === key);
  const location = ecoTable('location');
  const elevation = ecoTable('elevation');
  const slope = ecoTable('slope');
  const climate = ecoTable('climate');
  const exposure = ecoTable('tree-exposure');

  // The biodiversity index, for its result (Annex a) and its scope.
  const index = buildIndexReport(ctx);
  // The land cover of the whole LGU: the plan covers all of it, where a
  // municipality's UBI counts only its urban barangays.
  const indexAreas = indexAreasTable(features, { municipality });

  // The trees: what was the Ecological Profile's chapter 3.
  const summary = treeSummaryTable(trees);
  const species = speciesTable(trees);
  const byPlace = treesByPlaceTable({ trees, places, placeOf, placeLabel });
  const originPlaces = originByPlaceTable({ trees, places, placeOf, placeLabel });
  const originSpecies = originSpeciesTable({ trees, placeOf, placeLabel });
  const plantSpecies = plantSpeciesTable({ trees, profiles: ctx.profiles ?? [] });
  const diameter = diameterTable(trees);
  const height = heightTable(trees);
  const density = densityTable({ trees, places, placeOf, placeLabel });
  const diversity = diversityTable(trees);
  const phenology = phenologyTable({ trees, profiles: ctx.profiles ?? [], records: ctx.phenology ?? [] });
  const threatened = threatenedTable({ trees, profiles: ctx.profiles ?? [] });
  const flora = floraTable({ trees, diversity, species, threatened });

  const areas = areaFigures(features, municipality);
  const greenSpaces = greenSpacesTable(features, { municipality, isCity: Boolean(place?.isCity) });
  const vegetatedHa = vegetativeCoverHa(features, municipality);
  const designated = designatedAreasTable(features, municipality);
  const initiatives = initiativesTable(ctx.newsPosts ?? [], place?.psgc ?? null);
  const landCover = byKey.landCover ?? null;
  const hazards = byKey.hazards ?? null;

  const totalHa = places.reduce((t, p) => t + (p.areaHa || 0), 0);
  const population = location?.totals?.population ?? 0;
  const urbanPlaces = places.filter((p) => ctx.urbanOf?.(p.name) === 'Urban');
  const urbanCount = location?.rows?.some((row) => row.urban) ? urbanPlaces.length : null;
  const placesWithTrees = new Set(trees.map(placeOf).filter(Boolean)).size;
  const extent = extentOf(ctx.boundary);
  const freshwater = freshwaterText({ short, features: features.filter((f) => !municipality || f?.properties?.municipality === municipality) });
  const projection = projectionText({ climate: ctx.climate });
  const economics = economicsText({ place });
  const disturbance = disturbanceText({ short, areas, summary });
  const erosion = erosionText({ slope });

  const part = (key, heading, { maps = [], tables = [], sections = [], level = 2 } = {}) => ({ key, heading, level, maps, tables: tables.filter(Boolean), sections: sections.filter(Boolean) });
  const said = (key, heading, text) => (text ? { key, heading, text } : null);
  const chapter = (key, heading, parts, extra = {}) => ({ key, heading, parts, ...extra });

  const chapters = [
    chapter('title', null, [
      part('title', null, {
        sections: [
          {
            key: 'title-page',
            heading: 'Title page',
            center: true,
            placeholder: true,
            text:
              'Plan period: [20__] to [20__] (ten years)\n\n' +
              'Approved by: [the DENR Regional Executive Director, date]\n\n' +
              'Adopted by: [Sangguniang Panlungsod / Bayan, Ordinance or Resolution No. ____, series of ____]',
          },
        ],
      }),
    ]),
    chapter('foreword', 'Foreword', [
      part('foreword', null, {
        sections: [todo('foreword', 'Foreword', 'Foreword — to be written by the Local Chief Executive or the head of the office.')],
      }),
    ]),
    chapter('contents', 'Table of Contents', [part('contents', null)], { contents: true }),
    chapter('summary', 'Executive Summary', [
      part('summary', null, {
        sections: [
          {
            key: 'summary',
            heading: 'Executive summary',
            text: summaryText({
              where, short, place, places, population, totalHa, urbanPlaces, elevation, slope, climate: ctx.climate, trees,
              speciesCount: species.rows.length, placesWithTrees, summary, diversity, species, flora: { threatened: threatened.rows.length },
              greenSpaces, designated, exposure, initiatives, cbi: index.cbi,
            }),
          },
        ],
      }),
    ]),
    chapter('acronyms', 'List of Acronyms and Abbreviations', [part('acronyms', null, { tables: [acronymsTable()] })]),
    chapter('introduction', 'I. Introduction', [
      part('purpose', 'a. Purpose of the Plan', {
        sections: [todo('purpose', 'Purpose of the plan', 'Purpose of the plan — why the LGU is making it, what it covers and for how long, and how it ties into the CLUP, CDP and Zoning Ordinance.')],
      }),
      part('links', 'b. Links between resource use and conservation needs', {
        sections: [
          { key: 'links', heading: 'Links between resource use and conservation needs — the tree inventory', text: linksText({ short, summary }) },
          todo('links-office', 'Links between resource use and conservation needs', 'How the LGU’s natural resources are used — water, fishing, quarrying, tourism, agriculture, the trees — and the conservation needs those uses raise.'),
        ],
      }),
      part('process', 'c. Brief description of the planning processes', {
        sections: [todo('process', 'The planning processes', 'The planning processes followed — the Urban Biodiversity Composite Team, its consultations and visioning workshops, with their dates. Their documentation goes in the annexes (IX.d).')],
      }),
    ]),
    chapter('profile', 'II. Area Profile', [
      part('location', 'a. Geographical location', {
        maps: ['location'],
        tables: [location],
        sections: [
          { key: 'location', heading: 'Geographical location', text: ecoSection('location').text },
          { key: 'coordinates', heading: 'Coordinates and jurisdiction', text: coordinatesText({ where, extent, place }) },
          todo('accessibility', 'Accessibility', 'Accessibility — the main roads into the LGU, its distance and travel time from the provincial capitol and from Metro Manila, and public transport.'),
        ],
      }),
      part('physical', 'b. Physical features (include spatial representations/maps) of the following:'),
      part('land', 'i. Land resources (general land use, land classification, urban land use pattern)', {
        level: 3,
        maps: ['plan-areas'],
        tables: [indexAreas?.rows?.length ? { ...indexAreas, key: 'plan-cover-classes', title: 'Land cover mapped by class' } : null, landCover?.rows?.length ? landCover : null],
        sections: [
          { key: 'land', heading: 'Land resources', text: landResourcesText({ short, areasTable: indexAreas ?? { rows: [] }, urbanCount, places }) },
          todo('land-office', 'Land resources — the office', 'General land use and the urban land use pattern from the CLUP, and the land classification (alienable and disposable, forest land) from the DENR land classification map.'),
        ],
      }),
      part('topography', 'ii. Topography (slope, elevation)', {
        level: 3,
        maps: ['plan-elevation', 'plan-slope'],
        tables: [elevation, slope],
        sections: [
          { key: 'elevation', heading: 'Elevation', text: ecoSection('elevation').text },
          { key: 'slope', heading: 'Slope', text: ecoSection('slope').text },
        ],
      }),
      part('geology', 'iii. Geology (rock formations, landforms, soil profile, land capability classes) including geologic hazards (include areas susceptible to landslides, erosion, subsidence, sinkholes, sea level rise, liquefaction, flooding; fault lines, volcanoes nearby and bedrock formation; show hazard maps, as needed)', {
        level: 3,
        maps: ['plan-areas-flood', 'plan-areas-landslide'],
        tables: [hazards],
        sections: [
          { key: 'area-exposure', heading: 'Geologic hazards', text: ecoSection('area-exposure').text },
          todo('geology-office', 'Geology — the office', 'Rock formations, landforms, soil profile and land capability classes (BSWM soil map; MGB geohazard maps); fault lines, volcanoes nearby, subsidence, sinkholes and liquefaction.'),
        ],
      }),
      part('coastal', 'iv. Coastal resources', {
        level: 3,
        sections: [todo('coastal', 'Coastal resources', 'Coastal resources, or “Not applicable”: the Province of Laguna has no sea coast. Laguna de Bay is a freshwater lake — record it under Freshwater resources.')],
      }),
      part('freshwater', 'v. Freshwater resources', {
        level: 3,
        sections: [
          said('freshwater', 'Freshwater resources', freshwater),
          todo('freshwater-office', 'Freshwater resources — the office', 'Rivers, creeks, springs, lakes and watersheds, and their uses.'),
        ],
      }),
      part('climate', 'vi. Climatic condition', {
        level: 3,
        tables: [climate],
        sections: [{ key: 'climate', heading: 'Climatic condition', text: ecoSection('climate').text }],
      }),
      part('hydrology', 'vii. Hydrology (surface/groundwater source, surface drainage [inflow/s and outflow/s, water quality (including water chemistry and sedimentation load and whether polluted or not)], classification of water bodies, flooding/tidal regime, if applicable)', {
        level: 3,
        sections: [todo('hydrology', 'Hydrology', 'Surface and groundwater sources, drainage (inflows and outflows), water quality, the DENR classification of the water bodies, and the flooding regime.')],
      }),
      part('hydromet', 'viii. Climatology and hydrometeorology (climate type, climate zone, precipitation, mean temperature, wind, tidal patterns [for coastal wetlands] and extreme events; include trends and projections of climate variables, if possible)', {
        level: 3,
        sections: [
          said('hydromet', 'Climatology and hydrometeorology', projection),
          todo('hydromet-office', 'Climatology and hydrometeorology — the office', 'Climate type (Modified Coronas), wind, and the extreme events recorded — typhoons, floods, droughts — with their trends.'),
        ],
      }),
      part('conservation', 'ix. Conservation areas and other special interest areas', {
        level: 3,
        tables: [designated.rows.length ? designated : null],
        sections: [
          { key: 'conservation', heading: 'Conservation areas', text: conservationText({ short, areas, designated }) },
          todo('conservation-office', 'Conservation areas — the office', 'Key biodiversity areas, critical habitats, heritage trees and other special interest areas not yet mapped.'),
        ],
      }),
      // TB 2018-02's Green Spaces Inventory Report Template: A, B and C.
      part('green-spaces', 'c. Green spaces/parks (size per green space/park; total area of all green spaces/parks; include map)', {
        sections: [{ key: 'green-spaces', heading: 'Green spaces and parks', text: greenSpacesText({ short, table: greenSpaces }) }],
      }),
      part('green-list', 'A. List of Green Spaces', {
        level: 3,
        tables: [greenSpaces],
        sections: [
          todo('green-list-office', 'List of green spaces — the office', 'Parks, plazas, community gardens, green corridors and other green spaces not yet mapped, with their area, type, location, coordinates and remarks (adjacent to a protected area, within a key biodiversity area, a local conservation area…).'),
        ],
      }),
      part('green-images', 'B. Image of the Green Space', {
        level: 3,
        sections: [todo('green-images', 'Images of the green spaces', 'High-resolution, geotagged photos of all inventoried green spaces.')],
      }),
      part('green-map', 'C. Map of Green Spaces', {
        level: 3,
        maps: ['green-spaces'],
        sections: [todo('green-map', 'Map of green spaces — shapefiles', 'Include the shapefiles of the green spaces in the submission.')],
      }),
      part('green-coverage', 'Area coverage (one table for each green space or park)', { level: 3, tables: [areaCoverageTable()] }),
      part('biological', 'd. Biological features', { tables: [vegetationTable({ trees, vegetatedHa })] }),
      // TB 2018-02's Profiling and Assessment Report Template, B.1 Flora and B.2 Fauna.
      part('flora-fauna', 'i. Flora and fauna – economically important, rare and threatened species, seasonal/migratory species', {
        level: 3,
        maps: ['origin'],
        tables: [flora, plantSpecies, originPlaces, phenology, faunaListTable()],
        sections: [
          { key: 'origin', heading: 'Endemic, native and invasive trees', text: originText({ short, summary, speciesRows: originSpecies.rows }) },
          { key: 'threatened', heading: 'Rare and threatened species', text: threatenedText({ table: threatened }) },
          { key: 'phenology', heading: 'Economically important species', text: phenologyText({ table: phenology }) },
          todo('fauna-office', 'Flora and fauna — the office', 'The plants other than trees, and the fauna — birds, volant mammals, arthropods, herpetofauna — with their economically important, rare and threatened species (DAO No. 2026-20 for plants, DAO No. 2019-09 for fauna), and the seasonal and migratory species. List them in the tables above.'),
        ],
      }),
      part('vegetative-cover', 'ii. Vegetative cover', {
        level: 3,
        maps: ['trees'],
        tables: [summary, species, byPlace, diameter, height, density, diversity],
        sections: [
          { key: 'overview', heading: 'Vegetative cover', text: overviewText({ short, trees, summary, species, vegetatedHa }) },
          { key: 'structure', heading: 'Vegetation structure and density', text: structureText({ diameter, height, density, diversity }) },
        ],
      }),
      part('habitats', 'iii. Feeding, nesting, rest areas, and breeding sites', {
        level: 3,
        sections: [todo('habitats', 'Feeding, nesting, rest areas and breeding sites', 'The feeding, nesting, resting and breeding sites of wildlife, from the biodiversity assessment (TB 2018-02).')],
      }),
      part('fauna', null, { tables: [faunaTable()] }),
      part('socio-economic', 'e. Socio-economic features'),
      part('demographics', 'i. Demographics (Population [sex-disaggregated], Migration, Resettlement, Age distribution, Roles of men and women, ethnography)', {
        level: 3,
        sections: [
          { key: 'demographics', heading: 'Demographics', text: demographicsText({ short, population, totalHa, location }) },
          todo('demographics-office', 'Demographics — the office', 'Population by sex and age, migration, resettlement, the roles of men and women, and ethnography (CBMS; the Ecological Profile of the CLUP).'),
        ],
      }),
      part('economics', 'ii. Economics (Income and livelihood sources, Work/Employment profile, Rest and recreation patterns [impact on land use], industries, natural-resource use)', {
        level: 3,
        sections: [
          said('economics', 'Economics', economics),
          todo('economics-office', 'Economics — the office', 'Income and livelihood sources, employment, rest and recreation patterns, industries and the use of natural resources.'),
        ],
      }),
      part('health', 'iii. Health and Sanitation', { level: 3, sections: [todo('health', 'Health and sanitation', 'Health and sanitation.')] }),
      part('services', 'iv. Social services (e.g. hospital/health centers, schools, local government centers, police stations, fire stations, military detachments, etc.)', {
        level: 3,
        sections: [todo('services', 'Social services', 'Hospitals and health centres, schools, local government centres, police and fire stations, and military detachments.')],
      }),
      part('issues', 'f. Environmental Issues and Concerns'),
      part('air', 'i. Air Quality and Air Pollution Control', { level: 3, sections: [todo('air', 'Air quality', 'Air quality and air pollution control.')] }),
      part('water', 'ii. Water Quality and Wastewater Management', { level: 3, sections: [todo('water', 'Water quality', 'Water quality and wastewater management.')] }),
      part('waste', 'iii. Solid Waste Management', { level: 3, sections: [todo('waste', 'Solid waste management', 'Solid waste management.')] }),
      part('tree-exposure', 'Natural and Environmental Hazards and Disaster Risk Area', {
        level: 3,
        maps: ['trees-flood', 'trees-landslide'],
        tables: [exposure],
        sections: [
          { key: 'tree-exposure', heading: 'Natural and environmental hazards', text: ecoSection('tree-exposure').text },
          todo('hazards-office', 'Natural hazards — the office', 'The disaster risk areas of the CDRA and the LDRRM Plan.'),
        ],
      }),
      part('disturbance', 'Disturbance of habitat, Noise pollution control', {
        level: 3,
        sections: [said('disturbance', 'Disturbance of habitat', disturbance), todo('disturbance-office', 'Disturbance of habitat — the office', 'Disturbance of habitat, and noise pollution control.')],
      }),
      part('erosion', 'Soil Erosion', {
        level: 3,
        sections: [said('erosion', 'Soil erosion', erosion), todo('erosion-office', 'Soil erosion — the office', 'Areas of soil erosion observed, and the measures taken.')],
      }),
    ]),
    chapter('initiatives', 'III. Past and present initiatives', [
      part('initiatives', null, {
        tables: [initiatives.rows.length ? initiatives : null],
        sections: [
          {
            key: 'initiatives',
            heading: 'Past and present initiatives',
            text: initiativesText({ short, table: initiatives, trees, sites: greenSpaces.rows.filter((row) => row.type === 'Tree planting site').length }),
          },
          todo('initiatives-office', 'Past and present initiatives — the office', 'Past and current activities implemented by the national government, NGOs, CSOs and the private sector, supported with maps, tables and figures, and their documentation.'),
        ],
      }),
    ]),
    chapter('vision', 'IV. Vision, Mission, Goals', [
      part('vision', 'a. Vision statement', { sections: [todo('vision', 'Vision statement', 'Vision statement — a description of the future state the plan wants to attain.')] }),
      part('mission', 'b. Mission statement', { sections: [todo('mission', 'Mission statement', 'Mission statement — the methods, ways and means to attain the vision.')] }),
      part('goals', 'c. Goals', {
        sections: [
          todo('goals', 'Goals', 'Goals — general statements of the problems to be resolved, attainable in ten years: the desired outcome if the critical issues of the situational analysis are addressed. They may be on the development of green spaces, urban biodiversity assessment and monitoring, ecological restoration or rehabilitation, ecotourism, sustainable livelihood and biodiversity-friendly enterprises, CEPA, institutional development, green infrastructure, and the improvement of habitat and ecosystem services.'),
        ],
      }),
    ]),
    chapter('strategies', 'V. Management strategies and interventions', [
      part('spatial', 'a. Include spatial representation; shall apply principles of ecosystems-based management.', {
        sections: [todo('spatial', 'Spatial representation', 'The management zones of the green spaces and the strategies, on a map, following ecosystem-based management.')],
      }),
      part('approaches', 'b. Different approaches that will integrate management activities to address issues identified in the situational analysis are addressed.', {
        sections: [
          { key: 'situation', heading: 'Issues from the situational analysis', text: situationText({ short, summary, species, exposure, areas, threatened }) },
          todo('approaches', 'Approaches — the office', 'The approaches that integrate the management activities to address these issues.'),
        ],
      }),
      part('actions', 'c. Actions such as but not limited to (may vary from area to area):', { tables: [actionsTable(), implementationTable()] }),
    ]),
    chapter('financial', 'VI. Financial Plan', [
      part('cost', 'a. Cost of plan implementation', { sections: [todo('cost', 'Cost of plan implementation', 'The cost of implementing the plan, by program and year.')] }),
      part('funding', 'b. Fund sourcing/revenue generation strategies', { sections: [todo('funding', 'Fund sourcing', 'Fund sourcing and revenue generation strategies.')] }),
      part('sustainability', 'c. Financial Sustainability Mechanism', { sections: [todo('sustainability', 'Financial sustainability mechanism', 'The financial sustainability mechanism.')] }),
    ]),
    chapter('monitoring', 'VII. Monitoring and Evaluation and Feedback mechanism', [
      part('monitoring', null, {
        sections: [
          todo('monitoring', 'Monitoring and evaluation', 'Monitoring and evaluation and the feedback mechanism — who monitors what and when, the indicators of management effectiveness, and how the findings feed back into the implementation.'),
        ],
      }),
    ]),
    chapter('references', 'VIII. References', [
      part('references', null, {
        sections: [
          { key: 'sources', heading: 'Data and limitations', text: planSources() },
          { key: 'references', heading: 'References', text: PLAN_REFERENCES.join('\n\n') },
        ],
      }),
    ]),
    chapter('annexes', 'IX. Annexes', [
      part('annex-index', `a. Local City’s Biodiversity Index Result`, {
        tables: [scorecardTable(index.cbi), ...CBI_COMPONENTS.map((component) => componentTable(index.cbi, component))],
        sections: [{ key: 'annex-index', heading: 'Biodiversity index result', text: index.sections.find((s) => s.key === 'summary').text }],
      }),
      part('annex-maps', 'b. Maps, pictures or aerial photos', {
        sections: [todo('annex-maps', 'Maps, pictures or aerial photos', 'Maps, pictures or aerial photos beyond the figures in this plan.')],
      }),
      part('annex-resolutions', 'c. Resolutions adopting the plan (DENR and LGU)', {
        sections: [todo('annex-resolutions', 'Resolutions adopting the plan', 'The DENR Regional Executive Director’s approval and the LGU’s ordinance or resolution adopting the plan.')],
      }),
      part('annex-process', 'd. Planning process documentation', {
        sections: [todo('annex-process', 'Planning process documentation', 'Attendance, minutes and photos of the consultations and workshops.')],
      }),
    ]),
  ];

  const usedMaps = new Set(chapters.flatMap((c) => c.parts.flatMap((p) => p.maps)));
  const ecoMaps = ecologicalMaps(placeLabel);
  // II.b's maps on satellite imagery, not the grey base: keys of their own,
  // so the Ecological Profile keeps its grey ones.
  const onSatellite = (key) => {
    const map = ecoMaps.find((m) => m.key === key);
    return { ...map, key: `plan-${key}`, basemap: 'satellite' };
  };
  const maps = [
    ...ecoMaps,
    { key: 'plan-areas', survey: null, trees: false, sites: true, basemap: 'satellite', caption: 'Land cover and tree planting sites' },
    ...['elevation', 'slope', 'areas-flood', 'areas-landslide'].map(onSatellite),
    { key: 'green-spaces', survey: null, trees: false, sites: true, caption: 'Map of green spaces — the land cover and tree planting sites mapped' },
  ].filter((map) => usedMaps.has(map.key));
  const parts = chapters.flatMap((c) => c.parts);
  return {
    kind: 'plan',
    // Read on screen, completed in Word: the office adds what the system cannot hold.
    readOnly: true,
    title: report.title,
    subtitle: [`of the ${officialName(place)}`, 'In accordance with DENR-BMB Technical Bulletin No. 2021-04'],
    maps,
    chapters,
    tables: parts.flatMap((p) => p.tables),
    sections: parts.flatMap((p) => p.sections),
    cbi: index.cbi,
  };
}
