import { treeClassOf } from './mapSheet.js';
import { hazardAreaM2, seedlingCapacity, siteAreaM2 } from './mapSites.js';
import { annualCo2Kg, carbonDioxideKg, CO2_PER_CARBON } from './treeCarbon.js';
import { addTableSheet, createWorkbook, officeOf, workbookBlob } from './workbookLook.js';
import { barangayFacts, PSGC_EDITION } from './psgc.js';
import { namriaClassById } from './namriaCover.js';

/**
 * The attribute tables behind a map sheet (decided 17 October) — what the
 * Tables tab shows, the Excel and PDF carry, and the report is written from:
 *
 *   barangays      each barangay: its area, people and households, the land
 *                  cover mapped in it, and its trees by origin and by use
 *   hazards        each barangay (each city and municipality, for the
 *                  province): the ground in it exposed to flood and landslide
 *                  by level, its main soil and its elevation — measured from
 *                  PGENRO's layers over the whole barangay, so it needs no
 *                  land cover drawn
 *   carbon         the same places: the carbon the tagged trees hold, and
 *                  take up each year
 *   land cover     each land cover area: its class, area, exposure to flood
 *                  and landslide, soil and elevation
 *   planting sites each planting site: the same, with what to plant there and
 *                  how many seedlings fit
 *
 * Each table is { key, title, columns: [{ key, label, align, kind }], rows,
 * totals } — `kind` 'number' | 'ha' | 'percent' | 'tonnes' | 'decimal' | 'text' says how a
 * value is written.
 */

const ha = (m2) => (Number(m2) || 0) / 10000;

/** A hazard's reach in an area: hectares and share, or null when not assessed. */
function exposure(feature, kind) {
  const m2 = hazardAreaM2(feature, kind);
  if (m2 === null) return null;
  const area = siteAreaM2(feature);
  return { ha: ha(m2), share: area ? m2 / area : 0 };
}

const elevationOf = (props) =>
  props.elevationRange
    ? `${props.elevationRange.min}–${props.elevationRange.max} m`
    : props.elevationM != null
      ? `${props.elevationM} m`
      : null;

/**
 * Each barangay, with what the inventory and the map say of it.
 *
 *   barangays  PSA features: { barangay, barangay_psgc, area_km2 }
 *   stats      Map(barangay psgc → { population, households }) the office keeps;
 *              a barangay without the office's population takes PSA's 2024 count
 *   trees      inventory rows, each with its \`barangay\` (where it stands)
 *   areas      saved area features
 */
export function barangayTable({ barangays = [], stats = new Map(), trees = [], areas = [] }) {
  const rows = barangays
    .map((feature) => {
      const name = feature.properties.barangay;
      const here = trees.filter((tree) => tree.barangay === name);
      const covers = areas.filter((area) => area.properties.kind === 'land-cover' && area.properties.barangay === name);
      const classes = [...new Set(covers.map((area) => area.properties.coverLabel).filter(Boolean))];
      const count = (colouring, id) => here.filter((tree) => treeClassOf(tree, colouring) === id).length;
      const figures = stats.get(Number(feature.properties.barangay_psgc)) ?? {};
      const psa = barangayFacts(feature.properties.barangay_psgc);
      return {
        name,
        areaHa: (Number(feature.properties.area_km2) || 0) * 100,
        urban: psa?.urban == null ? null : psa.urban ? 'Urban' : 'Rural',
        population: figures.population ?? psa?.population2024 ?? null,
        households: figures.households ?? null,
        landCoverHa: covers.reduce((total, area) => total + ha(siteAreaM2(area)), 0),
        landCover: classes.join(', ') || null,
        trees: here.length,
        species: new Set(here.map((tree) => tree.species).filter(Boolean)).size,
        native: count('origin', 'native'),
        invasive: count('origin', 'invasive'),
        fruit: count('use', 'fruit'),
        timber: count('use', 'timber'),
        ornamental: count('use', 'ornamental'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const sum = (key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  return {
    key: 'barangays',
    title: 'Barangays',
    note:
      `Urban / rural and, where the office has not recorded its own, population: ${PSGC_EDITION.populationSource}, ` +
      `PSGC ${PSGC_EDITION.edition}.`,
    columns: [
      { key: 'name', label: 'Barangay', kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'urban', label: 'Urban / rural', kind: 'text' },
      { key: 'population', label: 'Population', kind: 'number' },
      { key: 'households', label: 'Households', kind: 'number' },
      { key: 'landCoverHa', label: 'Land cover mapped (ha)', kind: 'ha' },
      { key: 'landCover', label: 'Land cover', kind: 'text' },
      { key: 'trees', label: 'Tagged trees', kind: 'number' },
      { key: 'species', label: 'Species', kind: 'number' },
      { key: 'native', label: 'Endemic / native', kind: 'number' },
      { key: 'invasive', label: 'Invasive', kind: 'number' },
      { key: 'fruit', label: 'Fruit', kind: 'number' },
      { key: 'timber', label: 'Timber', kind: 'number' },
      { key: 'ornamental', label: 'Ornamental', kind: 'number' },
    ],
    rows,
    totals: {
      name: `${rows.length} barangays`,
      urban: `${rows.filter((row) => row.urban === 'Urban').length} urban`,
      areaHa: sum('areaHa'),
      population: sum('population') || null,
      households: sum('households') || null,
      landCoverHa: sum('landCoverHa'),
      trees: sum('trees'),
      species: new Set(trees.map((tree) => tree.species).filter(Boolean)).size,
      native: sum('native'),
      invasive: sum('invasive'),
      fruit: sum('fruit'),
      timber: sum('timber'),
      ornamental: sum('ornamental'),
    },
  };
}

/**
 * Each place's exposure to flood and landslide, as CLIRAM's exposure tables
 * give it: hectares at each level, and the share of the place exposed at all.
 *
 *   places     [{ name, areaHa }] — the barangays, or the cities and municipalities
 *   measured   Map(name → measure.js areaFacts), or null while not measured;
 *              a hazard whose layer is not uploaded is left blank, not zero
 *   placeLabel the first column's heading
 */
export function hazardTable({ places = [], measured = null, placeLabel = 'Barangay' }) {
  const levels = (facts, kind) => {
    const hazard = facts?.[kind];
    return {
      [`${kind}Low`]: hazard ? ha(hazard.low) : null,
      [`${kind}Medium`]: hazard ? ha(hazard.medium) : null,
      [`${kind}High`]: hazard ? ha(hazard.high) : null,
      [`${kind}Ha`]: hazard ? ha(hazard.total) : null,
    };
  };
  const rows = places
    .map(({ name, areaHa }) => {
      const facts = measured?.get(name) ?? null;
      const row = { name, areaHa, ...levels(facts, 'flood'), ...levels(facts, 'landslide') };
      row.floodShare = row.floodHa === null || !areaHa ? null : row.floodHa / areaHa;
      row.landslideShare = row.landslideHa === null || !areaHa ? null : row.landslideHa / areaHa;
      row.soil = facts?.soil?.[0]?.series ?? null;
      row.elevation = facts?.elevation ? `${facts.elevation.min}–${facts.elevation.max} m` : null;
      return row;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const sum = (key) => (rows.some((row) => row[key] !== null) ? rows.reduce((total, row) => total + (row[key] ?? 0), 0) : null);
  const areaHa = sum('areaHa');
  const totals = { name: `${rows.length} ${placeLabel === 'Barangay' ? 'barangays' : 'cities and municipalities'}`, areaHa };
  for (const key of ['floodLow', 'floodMedium', 'floodHigh', 'floodHa', 'landslideLow', 'landslideMedium', 'landslideHigh', 'landslideHa']) totals[key] = sum(key);
  totals.floodShare = totals.floodHa === null || !areaHa ? null : totals.floodHa / areaHa;
  totals.landslideShare = totals.landslideHa === null || !areaHa ? null : totals.landslideHa / areaHa;
  return {
    key: 'hazards',
    title: `Exposure to hazards by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}`,
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      { key: 'floodLow', label: 'Flood, low (ha)', kind: 'ha' },
      { key: 'floodMedium', label: 'Flood, medium (ha)', kind: 'ha' },
      { key: 'floodHigh', label: 'Flood, high (ha)', kind: 'ha' },
      { key: 'floodShare', label: 'Flood (% of area)', kind: 'percent' },
      { key: 'landslideLow', label: 'Landslide, low (ha)', kind: 'ha' },
      { key: 'landslideMedium', label: 'Landslide, medium (ha)', kind: 'ha' },
      { key: 'landslideHigh', label: 'Landslide, high (ha)', kind: 'ha' },
      { key: 'landslideShare', label: 'Landslide (% of area)', kind: 'percent' },
      { key: 'soil', label: 'Main soil', kind: 'text' },
      { key: 'elevation', label: 'Elevation', kind: 'text' },
    ],
    rows,
    totals,
  };
}

/**
 * The carbon in the tagged trees, by place: the stock they hold above ground
 * now and what they take up in a year, from Chave et al. 2014 (treeCarbon.js).
 * Only trees with a diameter and a total height count; the table says how
 * many those are, and leaves a place blank rather than call it zero.
 *
 *   places     [{ name }]
 *   trees      inventory rows
 *   placeOf    which place a tree stands in, by name
 */
export function carbonTable({ places = [], trees = [], placeOf = (tree) => tree.barangay, placeLabel = 'Barangay' }) {
  const byPlace = new Map(places.map(({ name }) => [name, []]));
  for (const tree of trees) byPlace.get(placeOf(tree))?.push(tree);
  const figures = (list) => {
    const measured = list.filter((tree) => carbonDioxideKg(tree) !== null);
    if (measured.length === 0) return { trees: list.length, measured: 0, carbonT: null, co2T: null, sequestrationT: null };
    const co2 = measured.reduce((total, tree) => total + carbonDioxideKg(tree), 0) / 1000;
    return {
      trees: list.length,
      measured: measured.length,
      carbonT: co2 / CO2_PER_CARBON,
      co2T: co2,
      sequestrationT: measured.reduce((total, tree) => total + (annualCo2Kg(tree) ?? 0), 0) / 1000,
    };
  };
  const rows = [...byPlace].map(([name, list]) => ({ name, ...figures(list) })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'carbon',
    title: `Carbon in the tagged trees by ${placeLabel === 'Barangay' ? 'barangay' : 'city and municipality'}`,
    columns: [
      { key: 'name', label: placeLabel, kind: 'text' },
      { key: 'trees', label: 'Tagged trees', kind: 'number' },
      { key: 'measured', label: 'Measured (DBH and total height)', kind: 'number' },
      { key: 'carbonT', label: 'Carbon stock (t C)', kind: 'tonnes' },
      { key: 'co2T', label: 'CO₂ stored (t)', kind: 'tonnes' },
      { key: 'sequestrationT', label: 'CO₂ taken up a year (t)', kind: 'tonnes' },
    ],
    rows,
    totals: {
      name: `${rows.length} ${placeLabel === 'Barangay' ? 'barangays' : 'cities and municipalities'}`,
      ...figures([...byPlace.values()].flat()),
    },
    notes: [
      'Carbon above ground: Chave et al. (2014), AGB = 0.0673 × (ρD²H)^0.976, on each tree’s diameter at breast height and total height, ' +
        'with the tropical Asian mean wood density of 0.57 g/cm³ (Reyes et al. 1992); carbon 45% of biomass (Lasco & Pulhin 2000); CO₂ = C × 44/12.',
      'A year’s uptake: the same equation after 1.19 cm of diameter growth (Schneider et al. 2013, as applied to city trees by Pansit 2019).',
      'A blank is a place with no tree measured, not a place with no carbon.',
    ],
  };
}

const exposureColumns = [
  { key: 'floodHa', label: 'Exposed to flooding (ha)', kind: 'ha' },
  { key: 'floodShare', label: 'Flooding (%)', kind: 'percent' },
  { key: 'landslideHa', label: 'Exposed to landslide (ha)', kind: 'ha' },
  { key: 'landslideShare', label: 'Landslide (%)', kind: 'percent' },
  { key: 'soil', label: 'Soil', kind: 'text' },
  { key: 'elevation', label: 'Elevation', kind: 'text' },
];

function groundRow(feature) {
  const props = feature.properties;
  const flood = exposure(feature, 'flood');
  const landslide = exposure(feature, 'landslide');
  return {
    name: props.name,
    barangay: props.barangay ?? null,
    areaHa: ha(siteAreaM2(feature)),
    floodHa: flood?.ha ?? null,
    floodShare: flood?.share ?? null,
    landslideHa: landslide?.ha ?? null,
    landslideShare: landslide?.share ?? null,
    soil: props.soilType ?? null,
    elevation: elevationOf(props),
  };
}

/** Each land cover area. */
export function landCoverTable(areas = []) {
  const rows = areas
    .filter((area) => area.properties.kind === 'land-cover')
    .map((area) => ({
      ...groundRow(area),
      cover: area.properties.coverLabel ?? null,
      // Not a column: whether the class is tree cover, for the CBI's natural areas.
      treeCover: Boolean(namriaClassById(area.properties.namriaClass)?.treeCover),
      designated: Boolean(area.properties.designation),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'land-cover',
    title: 'Land cover',
    columns: [
      { key: 'name', label: 'Land cover', kind: 'text' },
      { key: 'barangay', label: 'Barangay', kind: 'text' },
      { key: 'cover', label: 'Class (NAMRIA)', kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      ...exposureColumns,
    ],
    rows,
    totals: { name: `${rows.length} areas`, areaHa: rows.reduce((t, r) => t + r.areaHa, 0) },
  };
}

/** Each tree planting site. */
export function plantingSiteTable(areas = []) {
  const rows = areas
    .filter((area) => area.properties.kind === 'planting-site' && (!area.properties.approval || area.properties.approval === 'approved'))
    .map((area) => {
      const props = area.properties;
      return {
        ...groundRow(area),
        recommended: (props.recommended ?? []).map((tree) => tree.common).filter(Boolean).join(', ') || null,
        seedlings: seedlingCapacity(siteAreaM2(area), props.spacingM),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    key: 'planting-sites',
    title: 'Tree planting sites',
    columns: [
      { key: 'name', label: 'Tree planting site', kind: 'text' },
      { key: 'barangay', label: 'Barangay', kind: 'text' },
      { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
      ...exposureColumns,
      { key: 'recommended', label: 'Recommended trees', kind: 'text' },
      { key: 'seedlings', label: 'Seedlings that fit', kind: 'number' },
    ],
    rows,
    totals: {
      name: `${rows.length} sites`,
      areaHa: rows.reduce((t, r) => t + r.areaHa, 0),
      seedlings: rows.reduce((t, r) => t + (Number(r.seedlings) || 0), 0) || null,
    },
  };
}

/** A value as the tables write it. */
export function formatCell(value, kind) {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'ha') return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (kind === 'tonnes') return Number(value).toLocaleString('en-US', { maximumFractionDigits: Number(value) < 10 ? 2 : 1 });
  if (kind === 'decimal') return Number(value).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (kind === 'percent') return `${Math.round(Number(value) * 100)}%`;
  if (kind === 'number') return Number(value).toLocaleString('en-US');
  return String(value);
}

/**
 * The tables as an Excel workbook, in the standard look (workbookLook.js):
 * one sheet each, under the LGU's letterhead, with its totals and notes.
 * Returns a Blob.
 *
 *   lgu   the sheet's LGU, or null for the province
 */
export async function tablesWorkbook(tables, { lgu = null, preparedBy, date = new Date() }) {
  const workbook = await createWorkbook();
  for (const table of tables) {
    await addTableSheet(workbook, {
      name: table.title,
      lgu,
      title: table.title.toUpperCase(),
      subtitle: officeOf(lgu).place,
      preparedBy,
      date,
      columns: table.columns.map((column) => ({
        label: column.label,
        kind: column.kind,
        width: column.kind === 'text' || !column.kind ? Math.min(36, Math.max(14, column.label.length + 2)) : Math.max(11, Math.min(18, column.label.length + 2)),
      })),
      rows: table.rows.map((row) => table.columns.map((column) => row[column.key] ?? null)),
      totals: table.totals ? table.columns.map((column) => table.totals[column.key] ?? null) : null,
      notes: table.notes ?? [],
      landscape: table.columns.length > 6,
    });
  }
  return workbookBlob(workbook);
}
