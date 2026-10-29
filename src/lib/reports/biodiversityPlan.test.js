import { describe, expect, it } from 'vitest';
import {
  PLAN_ACTIONS,
  areaCoverageTable,
  buildPlanReport,
  dms,
  extentOf,
  faunaListTable,
  faunaTable,
  greenSpacesTable,
  implementationTable,
  planReportFor,
  plantSpeciesTable,
  threatenedTable,
  vegetationTable,
  vegetativeCoverHa,
} from './biodiversityPlan.js';
import { sheetName } from '../workbookLook.js';

const SANTA_CRUZ = { name: 'Santa Cruz', label: 'Santa Cruz', psgc: 403426000, isCity: false };
const CALAMBA = { name: 'Calamba', label: 'Calamba', psgc: 403405000, isCity: true };
const PLACES = [
  { name: 'Alipit', areaHa: 100 },
  { name: 'Bagumbayan', areaHa: 50 },
];
const TREES = [
  { id: 't1', barangay: 'Alipit', species: 'Narra', scientific_name: 'Pterocarpus indicus', species_type: 'Endemic', tree_category: 'Timber', dbh: 32, total_height: 12, latitude: 14.28, longitude: 121.41 },
  { id: 't2', barangay: 'Alipit', species: 'Mango', species_type: 'Introduced', tree_category: 'Fruit', dbh: 18, total_height: 7, latitude: 14.281, longitude: 121.411 },
  { id: 't3', barangay: 'Bagumbayan', species: 'Mahogany', species_type: 'Invasive', tree_category: 'Timber', dbh: 45, total_height: 21, latitude: 14.4, longitude: 121.3 },
];
const square = (lng, lat, d) => ({ type: 'Polygon', coordinates: [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]] });
const FOREST = {
  type: 'Feature',
  geometry: square(121.4, 14.27, 0.005),
  properties: {
    saved: true, kind: 'land-cover', name: 'Alipit Forest', namriaClass: 'closed-forest', municipality: 'Santa Cruz', barangay: 'Alipit',
    designation: 'protected-area', document: { type: 'Proclamation', number: 'No. 1', title: null, url: 'x' },
  },
};
const BUILT = {
  type: 'Feature',
  geometry: square(121.42, 14.27, 0.005),
  properties: { saved: true, kind: 'land-cover', name: 'Poblacion', namriaClass: 'built-up', municipality: 'Santa Cruz', barangay: 'Bagumbayan' },
};

const plan = buildPlanReport({
  place: SANTA_CRUZ,
  places: PLACES,
  trees: TREES,
  features: [FOREST, BUILT],
  populationOf: (name) => ({ Alipit: 6000, Bagumbayan: 500 })[name],
  urbanOf: (name) => (name === 'Alipit' ? 'Urban' : 'Rural'),
  profiles: [{ species: 'Narra', scientific_name: 'Pterocarpus indicus', conservation_status: 'Vulnerable (DAO 2017-11)' }],
  newsPosts: [{ title: 'Tree planting at Alipit', event_date: '2026-08-01', event_kind: 'tree-planting', lgu_psgc: 403426000, partners: 'LSPU, DENR' }],
  boundary: square(121.38, 14.25, 0.1),
  year: 2026,
});
const text = (key) => plan.sections.find((s) => s.key === key).text;

describe('the City or Urban Biodiversity Management Plan', () => {
  it('is the City plan for a city, the Urban plan for a municipality', () => {
    expect(planReportFor(CALAMBA).title).toBe('CITY BIODIVERSITY MANAGEMENT PLAN');
    expect(planReportFor(SANTA_CRUZ).title).toBe('URBAN BIODIVERSITY MANAGEMENT PLAN');
    expect(plan.title).toBe('URBAN BIODIVERSITY MANAGEMENT PLAN');
    expect(buildPlanReport({ place: CALAMBA, places: PLACES, trees: [] }).title).toBe('CITY BIODIVERSITY MANAGEMENT PLAN');
    expect(plan.subtitle).toEqual(['of the Municipality of Santa Cruz', 'In accordance with DENR-BMB Technical Bulletin No. 2021-04']);
  });

  it('follows TB 2021-04, Annex B, heading for heading', () => {
    expect(plan.chapters.map((c) => c.heading)).toEqual([
      null,
      'Foreword',
      'Table of Contents',
      'Executive Summary',
      'List of Acronyms and Abbreviations',
      'I. Introduction',
      'II. Area Profile',
      'III. Past and present initiatives',
      'IV. Vision, Mission, Goals',
      'V. Management strategies and interventions',
      'VI. Financial Plan',
      'VII. Monitoring and Evaluation and Feedback mechanism',
      'VIII. References',
      'IX. Annexes',
    ]);
    expect(plan.chapters[2].contents).toBe(true);
    const headings = (key) => plan.chapters.find((c) => c.key === key).parts.map((p) => p.heading).filter(Boolean);
    expect(headings('introduction')).toEqual([
      'a. Purpose of the Plan',
      'b. Links between resource use and conservation needs',
      'c. Brief description of the planning processes',
    ]);
    const profile = headings('profile').map((h) => h.replace(/ \(.*$/s, '').replace(/:$/, ''));
    expect(profile).toEqual([
      'a. Geographical location',
      'b. Physical features',
      'i. Land resources',
      'ii. Topography',
      'iii. Geology',
      'iv. Coastal resources',
      'v. Freshwater resources',
      'vi. Climatic condition',
      'vii. Hydrology',
      'viii. Climatology and hydrometeorology',
      'ix. Conservation areas and other special interest areas',
      'c. Green spaces/parks',
      'A. List of Green Spaces',
      'B. Image of the Green Space',
      'C. Map of Green Spaces',
      'Area coverage',
      'd. Biological features',
      'i. Flora and fauna – economically important, rare and threatened species, seasonal/migratory species',
      'ii. Vegetative cover',
      'iii. Feeding, nesting, rest areas, and breeding sites',
      'e. Socio-economic features',
      'i. Demographics',
      'ii. Economics',
      'iii. Health and Sanitation',
      'iv. Social services',
      'f. Environmental Issues and Concerns',
      'i. Air Quality and Air Pollution Control',
      'ii. Water Quality and Wastewater Management',
      'iii. Solid Waste Management',
      'Natural and Environmental Hazards and Disaster Risk Area',
      'Disturbance of habitat, Noise pollution control',
      'Soil Erosion',
    ]);
    expect(headings('vision')).toEqual(['a. Vision statement', 'b. Mission statement', 'c. Goals']);
    expect(headings('financial')).toEqual(['a. Cost of plan implementation', 'b. Fund sourcing/revenue generation strategies', 'c. Financial Sustainability Mechanism']);
    expect(headings('annexes')).toEqual([
      'a. Local City’s Biodiversity Index Result',
      'b. Maps, pictures or aerial photos',
      'c. Resolutions adopting the plan (DENR and LGU)',
      'd. Planning process documentation',
    ]);
    // Annex B's i., ii., … sit under the heading before them.
    const parts = plan.chapters.find((c) => c.key === 'profile').parts;
    expect(parts.find((p) => p.key === 'topography').level).toBe(3);
    expect(parts.find((p) => p.key === 'location').level).toBe(2);
  });

  it('sums up the whole plan from what the system holds for the LGU, and nothing else', () => {
    const summary = text('summary');
    expect(summary).toMatch(/^This plan is composed only of the trees tagged within the territorial jurisdiction of the Municipality of Santa Cruz/);
    expect(summary).toMatch(/about 150 ha in 2 barangays, with about 6,500 residents \(PSA 2024\); 1 of the barangays are urban/);
    // The forest is a green space; the built-up area is not.
    expect(summary).toMatch(/1 green space is inventoried/);
    expect(summary).toMatch(/1 area has a legal designation/);
    expect(summary).toMatch(/3 trees of 3 species are tagged, in 2 of the 2 barangays: 1 endemic, 0 native or indigenous, 1 exotic and 1 invasive/);
    expect(summary).toMatch(/1 of the species have a conservation status on record/);
    expect(summary).toMatch(/The office has posted 1 activity on News & Events/);
    // Nothing from the bulletin: no approval, no review cycle, no list of what is left.
    expect(summary).not.toMatch(/Regional Executive Director|ten years|square brackets|TB 2021-04/);
  });

  it('is read-only on screen: the office completes it in Word', () => {
    expect(plan.readOnly).toBe(true);
  });

  it('writes in what the system holds, and leaves the rest in brackets for the office', () => {
    const keys = plan.sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const section of plan.sections) expect(section.text).not.toMatch(/\[object|undefined|NaN|null/);
    // The purpose, the planning process and the monitoring are the office's: nothing written for them from the bulletin.
    for (const key of ['foreword', 'purpose', 'process', 'links-office', 'monitoring', 'vision', 'mission', 'goals', 'cost', 'funding', 'sustainability', 'hydrology', 'habitats', 'green-images', 'green-map']) {
      const section = plan.sections.find((s) => s.key === key);
      expect(section.placeholder).toBe(true);
      expect(section.text).toMatch(/^\[.*\]$/s);
    }
    expect(plan.sections.find((s) => s.key === 'title-page').text).toMatch(/Plan period: \[20__\] to \[20__\]/);
    // The trees, as the Ecological Profile's chapter 3 had them.
    expect(text('origin')).toMatch(/Narra \(1\)/);
    expect(text('origin')).toMatch(/Mahogany \(1\)/);
    expect(text('structure')).toMatch(/^(A mix of ages|Mostly young trees|Mostly mature trees):/);
    expect(text('threatened')).toMatch(/Narra, Vulnerable \(DAO 2017-11\) \(1 tree\)/);
    expect(text('coordinates')).toMatch(/lies between latitudes 14°15′00″ and 14°21′00″ N/);
    expect(text('conservation')).toMatch(/1 area with a legal designation has been mapped in Santa Cruz/);
    expect(text('initiatives')).toMatch(/1 activity on News & Events from 2026 to 2026: 1 tree planting/);
    expect(text('situation')).toMatch(/1 invasive trees \(33% of the inventory\)/);
    expect(text('annex-index')).toMatch(/Urban Biodiversity Index/);
    // II.b.i: the whole municipality's land cover, not only the urban barangays' the UBI counts.
    expect(plan.tables.find((t) => t.key === 'plan-cover-classes').rows.map((r) => r.name).sort()).toEqual(['Built-up', 'Closed forest']);
    expect(text('land')).toMatch(/closed forest, [\d.]+ ha and built-up, [\d.]+ ha/);
    // I.b: only the inventory's figures.
    expect(text('links')).toBe('Of the 3 tagged trees, 1 are fruit trees, 2 timber trees and 0 ornamental. 1 (33%) are endemic or native, and 1 (33%) are of invasive species.');
  });

  it('lists the green spaces as TB 2018-02’s template has them, crops and the built-up left out', () => {
    const sites = {
      type: 'Feature',
      geometry: square(121.44, 14.27, 0.002),
      properties: { saved: true, kind: 'planting-site', name: 'Riverbank', municipality: 'Santa Cruz', barangay: 'Bagumbayan', approval: 'approved' },
    };
    const requested = { ...sites, properties: { ...sites.properties, name: 'Asked for', approval: 'requested' } };
    const crop = { ...BUILT, properties: { ...BUILT.properties, name: 'Rice', namriaClass: 'annual-crop' } };
    const table = greenSpacesTable([FOREST, BUILT, crop, sites, requested], { municipality: 'Santa Cruz' });
    expect(table.columns.map((c) => c.label)).toEqual(['Green space', 'Area (ha)', 'Type of green space', 'Location', 'Coordinates (latitude, longitude)', 'Remarks']);
    expect(table.rows.map((r) => r.name)).toEqual(['Alipit Forest', 'Riverbank']);
    expect(table.rows[0]).toMatchObject({ type: 'Forest (closed)', location: 'Brgy. Alipit', coordinates: '14.27250, 121.40250', remarks: 'Protected area (NIPAS / E-NIPAS)' });
    expect(table.rows[1]).toMatchObject({ type: 'Tree planting site', remarks: null });
    expect(table.totals.name).toBe('Total area of green space in the municipality');
    expect(table.totals.areaHa).toBeCloseTo(table.rows[0].areaHa + table.rows[1].areaHa);
    expect(table.note).toMatch(/^Region: IV-A \(CALABARZON\)\. Municipality: Santa Cruz\./);
    expect(greenSpacesTable([], { municipality: 'Calamba', isCity: true }).totals).toBeNull();
  });

  it('gives the flora as TB 2018-02 asks, and its list of recorded plant species', () => {
    const flora = plan.tables.find((t) => t.key === 'plan-flora');
    const value = (name) => flora.rows.find((r) => r.name.startsWith(name)).value;
    expect(value('Total number of plant species')).toBe('3');
    expect(value('Total number of endemic species')).toBe('1');
    expect(value('Total recorded number of invasive alien species')).toBe('1');
    expect(value('Dominant species')).toMatch(/33%/);
    const list = plantSpeciesTable({ trees: TREES, profiles: [{ species: 'Narra', scientific_name: 'Pterocarpus indicus', conservation_status: 'Vulnerable' }] });
    expect(list.columns.map((c) => c.label)).toEqual(['Scientific name', 'Common name', 'Indigenous, endemic, exotic, invasive', 'Conservation status', 'Remarks']);
    expect(list.rows).toEqual([
      { name: '', common: 'Mahogany', origin: 'Invasive', status: null, remarks: '1 tree tagged' },
      { name: '', common: 'Mango', origin: 'Exotic', status: null, remarks: '1 tree tagged' },
      { name: 'Pterocarpus indicus', common: 'Narra', origin: 'Endemic', status: 'Vulnerable', remarks: '1 tree tagged' },
    ]);
    const fauna = faunaListTable();
    expect(fauna.rows.filter((r) => r.name).map((r) => r.name.replace(/ \(.*$/, ''))).toEqual(['a. Birds', 'b. Volant mammals', 'c. Arthropods', 'd. Herpetofauna']);
  });

  it('draws Annex B’s and Annex C’s tables as they are', () => {
    const tables = new Map(plan.tables.map((t) => [t.key, t]));
    expect(tables.get('plan-area-coverage').rows.map((r) => r.name)).toEqual([
      'a. Total area', 'b. Area planted', 'c. Other functional uses, please specify', 'd. Urban Green Space Facility',
      'e. Ancillary Services', 'f. Pavements/ Walk Trail Facility', 'g. Urban Green Space Uses and Activities',
    ]);
    expect(tables.get('plan-area-coverage').rows.every((r) => r.value === '')).toBe(true);
    expect(tables.get('plan-fauna').rows).toHaveLength(8);
    expect(tables.get('plan-actions').rows.map((r) => r.name)).toEqual(PLAN_ACTIONS);
    expect(tables.get('plan-implementation').columns.map((c) => c.label)).toEqual([
      'Program', 'Activities', 'Outcome', 'Timeframe S', 'M', 'L', 'Lead/responsible agency/ies and partners', 'Resources needed', 'Budget', 'Indicators', 'Means of verification',
    ]);
    expect(tables.get('plan-implementation').rows.map((r) => r.program)).toEqual(['Strategy 1:', 'Objective/s:', '', '', 'Strategy 2:', 'Objective/s:', '', '']);
    // The index's result, in the annex.
    expect(tables.has('index-scorecard')).toBe(true);
    // Every table its own sheet in the Excel file.
    const names = plan.tables.map((t) => sheetName(t.title));
    expect(new Set(names).size).toBe(names.length);
  });

  it('fills the flora structure from the trees and the land cover, the rest left blank', () => {
    const table = vegetationTable({ trees: TREES, vegetatedHa: 12.34 });
    const value = (name) => table.rows.find((r) => r.name.trim() === name).value;
    expect(table.rows[0]).toEqual({ name: 'Total vegetative cover (in hectares)', value: '12.3' });
    expect(value('Total number of trees')).toBe('3');
    expect(table.rows[2].value).toBe('1'); // endemic
    expect(table.rows[4].value).toBe('2 (1 of them invasive)'); // exotic, the invasive among them
    expect(table.rows.slice(5).every((r) => r.value === '')).toBe(true);
    expect(vegetationTable({ trees: [] }).rows[0].value).toBe('');
    expect(areaCoverageTable().columns[1].kind).toBe('entry');
    expect(faunaTable().rows.every((r) => r.value === '')).toBe(true);
    expect(implementationTable().rows).toHaveLength(8);
  });

  it('counts vegetative cover in the vegetated classes only, and says none when nothing is mapped', () => {
    expect(vegetativeCoverHa([FOREST, BUILT], 'Santa Cruz')).toBeGreaterThan(20);
    expect(vegetativeCoverHa([BUILT], 'Santa Cruz')).toBe(0);
    expect(vegetativeCoverHa([], 'Santa Cruz')).toBeNull();
  });

  it('lists only the tagged species with a conservation status', () => {
    const table = threatenedTable({ trees: TREES, profiles: [{ species: 'Narra', conservation_status: 'Vulnerable' }, { species: 'Molave', conservation_status: 'Vulnerable' }] });
    expect(table.rows).toEqual([{ name: 'Narra', scientific: null, status: 'Vulnerable', trees: 1 }]);
  });

  it('gives a boundary’s extent and centre in degrees, minutes and seconds', () => {
    const extent = extentOf(square(121.38, 14.25, 0.1));
    expect(extent).toMatchObject({ south: 14.25, west: 121.38 });
    expect(extent.north).toBeCloseTo(14.35);
    expect(dms(14.2817)).toBe('14°16′54″');
    expect(dms(121.99999)).toBe('122°00′00″');
    expect(extentOf(null)).toBeNull();
  });

  it('keeps each part’s maps with it, every map drawable', () => {
    const keys = new Set(plan.maps.map((m) => m.key));
    const shown = new Set(plan.chapters.flatMap((c) => c.parts.flatMap((p) => p.maps)));
    expect([...shown].every((key) => keys.has(key))).toBe(true);
    expect([...keys].every((key) => shown.has(key))).toBe(true);
    expect(keys).toEqual(new Set(['location', 'plan-areas', 'plan-elevation', 'plan-slope', 'plan-areas-flood', 'plan-areas-landslide', 'green-spaces', 'origin', 'trees', 'trees-flood', 'trees-landslide']));
    // II.b, the physical features, on satellite imagery; the rest on the office's base map.
    for (const key of ['plan-areas', 'plan-elevation', 'plan-slope', 'plan-areas-flood', 'plan-areas-landslide']) {
      expect(plan.maps.find((m) => m.key === key).basemap).toBe('satellite');
    }
    expect(plan.maps.find((m) => m.key === 'plan-elevation')).toMatchObject({ survey: 'elevation', caption: 'Elevation map (Copernicus DEM)' });
    expect(plan.maps.find((m) => m.key === 'location').basemap).toBeUndefined();
  });
});
