import { officialName } from './psgc.js';

/**
 * The written report behind a map sheet (decided 17 October, option C): the
 * system writes it from the figures, in fixed sentences, so it always says
 * what the tables say; the office edits it, and may ask Gemini to improve the
 * wording (supabase/functions/improve-report), which keeps every figure.
 *
 * It is written to support the LGU's plans — the Forest Land Use Plan, the
 * Comprehensive Land Use Plan and the Comprehensive Development Plan.
 *
 * Returns [{ key, heading, text }], one paragraph or more per section.
 */

const n = (value) => Number(value || 0).toLocaleString('en-US');
const hectares = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%');
const tonnes = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 2 : 1 });

/** "A, B and C" */
export function listOf(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** The most common values of a list, as [name, count], most first. */
function mostCommon(values, limit = 3) {
  const counts = new Map();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

/** What the tagged trees hold and take up, from the carbon table's totals. */
function carbonSentence(totals) {
  if (!totals?.trees) return '';
  if (!totals.measured) return 'None has a diameter and total height recorded yet, so their carbon cannot be estimated.';
  return `${totals.measured === totals.trees ? 'All of them have' : `${n(totals.measured)} of them have`} a diameter and total height recorded: ` +
    `together they hold an estimated ${tonnes(totals.carbonT)} t of carbon (${tonnes(totals.co2T)} t CO₂) and take up about ` +
    `${tonnes(totals.sequestrationT)} t of CO₂ a year.`;
}

/** The places with the most of their ground in a hazard's high and medium levels — up to three. */
function mostExposed(table, kind) {
  return (table?.rows ?? [])
    .filter((row) => row.areaHa && (row[`${kind}High`] ?? 0) + (row[`${kind}Medium`] ?? 0) > 0)
    .map((row) => ({ ...row, serious: ((row[`${kind}High`] ?? 0) + (row[`${kind}Medium`] ?? 0)) / row.areaHa }))
    .filter((row) => row.serious >= 0.1)
    .sort((a, b) => b.serious - a.serious)
    .slice(0, 3);
}

function hazardSentences(table, short) {
  const totals = table?.totals;
  if (!table?.rows?.length || !totals) return '';
  const sentences = [];
  for (const [kind, words] of [
    ['flood', 'the flood hazard extent'],
    ['landslide', 'the rain-induced landslide extent'],
  ]) {
    if (totals[`${kind}Ha`] === null) continue;
    const ranked = [...table.rows]
      .filter((row) => (row[`${kind}Share`] ?? 0) > 0)
      .sort((a, b) => b[`${kind}Share`] - a[`${kind}Share`])
      .slice(0, 3);
    sentences.push(
      totals[`${kind}Ha`] > 0
        ? `${hectares(totals[`${kind}Ha`])} ha (${percent(totals[`${kind}Ha`], totals.areaHa)}) of ${short} lies within ${words}, ` +
            `${totals[`${kind}High`] > 0 ? `${hectares(totals[`${kind}High`])} ha of it` : 'none of it'} at the high level. The largest shares are in ${listOf(
              ranked.map((row) => `${row.name} (${percent(row[`${kind}Share`], 1)})`)
            )}.`
        : `None of ${short} lies within ${words}.`
    );
  }
  if (sentences.length === 0) return '';
  return sentences.join(' ');
}

/**
 *   place        { label, isCity } — or null for the province
 *   tables       { barangays, hazards, carbon, landCover, plantingSites } (attributeTables.js)
 *   trees        the inventory rows in scope, each with `barangay`
 *   climate      the LGU's CLIRAM row, or null
 *   date         when it is written
 */
export function writeReport({ place = null, tables, trees = [], climate = null, date = new Date() }) {
  const where = officialName(place);
  const short = place ? place.label : 'Laguna';
  const when = date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const sections = [];

  sections.push({
    key: 'purpose',
    heading: 'Purpose',
    text:
      `This report describes the tree inventory, the land cover and the tree planting sites of the ${where}, Laguna, ` +
      `as recorded in the Green Tag Tree Inventory System on ${when}, together with the maps and tables prepared with it. ` +
      `It is prepared to support the Forest Land Use Plan (FLUP), the Comprehensive Land Use Plan (CLUP) and the ` +
      `Comprehensive Development Plan (CDP). Its figures are for planning purposes only: they are not a land title, ` +
      `a survey plan or proof of ownership.`,
  });

  // The inventory.
  const brgy = tables.barangays;
  const totals = brgy?.totals ?? {};
  const treeCount = trees.length;
  const species = new Set(trees.map((tree) => tree.species).filter(Boolean)).size;
  if (treeCount === 0) {
    sections.push({ key: 'inventory', heading: 'The tree inventory', text: `No tree has been tagged in ${short} yet.` });
  } else {
    const common = mostCommon(trees.map((tree) => tree.species));
    const native = totals.native ?? 0;
    const invasive = totals.invasive ?? 0;
    const invasiveSpecies = mostCommon(trees.filter((tree) => tree.origin === 'invasive').map((tree) => tree.species), 2);
    const surveyed = (brgy?.rows ?? []).filter((row) => row.trees > 0).length;
    sections.push({
      key: 'inventory',
      heading: 'The tree inventory',
      text: [
        `${n(treeCount)} trees of ${n(species)} species have been tagged${
          brgy?.rows?.length ? ` in ${n(surveyed)} of the ${n(brgy.rows.length)} barangays` : ''
        }. The most common are ${listOf(common.map(([name, count]) => `${name} (${n(count)})`))}.`,
        `By origin, ${n(native)} (${percent(native, treeCount)}) are endemic or native and ${n(invasive)} (${percent(
          invasive,
          treeCount
        )}) invasive; the rest have no origin recorded.${
          invasiveSpecies.length ? ` The invasive trees are mostly ${listOf(invasiveSpecies.map(([name, count]) => `${name} (${n(count)})`))}.` : ''
        }`,
        `By use, ${n(totals.fruit)} are fruit trees, ${n(totals.timber)} timber trees and ${n(totals.ornamental)} ornamental.`,
        carbonSentence(tables.carbon?.totals),
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  // By barangay.
  if (brgy?.rows?.length) {
    const ranked = [...brgy.rows].filter((row) => row.trees > 0).sort((a, b) => b.trees - a.trees);
    const empty = brgy.rows.filter((row) => row.trees === 0).map((row) => row.name);
    const withPeople = brgy.rows.filter((row) => row.population);
    const people = withPeople.reduce((total, row) => total + row.population, 0);
    const treesThere = withPeople.reduce((total, row) => total + row.trees, 0);
    sections.push({
      key: 'barangays',
      heading: 'By barangay',
      text: [
        ranked.length
          ? `Most trees stand in ${listOf(ranked.slice(0, 3).map((row) => `${row.name} (${n(row.trees)})`))}.`
          : 'No barangay has a tagged tree yet.',
        empty.length
          ? `${n(empty.length)} ${empty.length === 1 ? 'barangay has' : 'barangays have'} no tagged tree yet: ${listOf(empty.slice(0, 12))}${
              empty.length > 12 ? ', among others' : ''
            }.`
          : 'Every barangay has at least one tagged tree.',
        people
          ? `Where population is recorded, there are about ${n(Math.round((treesThere / people) * 1000))} tagged trees for every 1,000 residents.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  // Exposure to hazards, over each barangay (or city and municipality) whole.
  const hazards = tables.hazards;
  const exposed = hazardSentences(hazards, short);
  if (exposed) sections.push({ key: 'hazards', heading: 'Exposure to hazards', text: exposed });

  // Land cover.
  const cover = tables.landCover;
  if (!cover?.rows?.length) {
    sections.push({ key: 'land-cover', heading: 'Land cover', text: `No land cover has been mapped in ${short} yet.` });
  } else {
    const byClass = new Map();
    for (const row of cover.rows) byClass.set(row.cover ?? 'Unclassified', (byClass.get(row.cover ?? 'Unclassified') ?? 0) + row.areaHa);
    const flood = cover.rows.reduce((t, r) => t + (r.floodHa ?? 0), 0);
    const landslide = cover.rows.reduce((t, r) => t + (r.landslideHa ?? 0), 0);
    sections.push({
      key: 'land-cover',
      heading: 'Land cover',
      text: [
        `${n(cover.rows.length)} land cover ${cover.rows.length === 1 ? 'area' : 'areas'} covering ${hectares(cover.totals.areaHa)} ha have been mapped: ${listOf(
          [...byClass].map(([name, area]) => `${name.toLowerCase()} ${hectares(area)} ha`)
        )}.`,
        flood ? `${hectares(flood)} ha of it lies within the flood hazard extent.` : 'None of it lies within the mapped flood hazard extent.',
        landslide ? `${hectares(landslide)} ha lies within the rain-induced landslide extent.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  // Planting sites.
  const sites = tables.plantingSites;
  if (!sites?.rows?.length) {
    sections.push({ key: 'planting', heading: 'Tree planting sites', text: `No tree planting site has been set in ${short} yet.` });
  } else {
    const flooding = sites.rows.filter((row) => (row.floodShare ?? 0) >= 0.3).map((row) => row.name);
    const recommended = mostCommon(sites.rows.flatMap((row) => (row.recommended ?? '').split(', ')), 6).map(([name]) => name);
    sections.push({
      key: 'planting',
      heading: 'Tree planting sites',
      text: [
        `${n(sites.rows.length)} tree planting ${sites.rows.length === 1 ? 'site covers' : 'sites cover'} ${hectares(sites.totals.areaHa)} ha${
          sites.totals.seedlings ? `, with room for about ${n(sites.totals.seedlings)} seedlings at the spacing set for each` : ''
        }.`,
        flooding.length ? `${listOf(flooding)} ${flooding.length === 1 ? 'has' : 'have'} more than 30% of the area within the flood hazard extent.` : '',
        recommended.length ? `The species recommended for them include ${listOf(recommended)}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  // Climate.
  if (climate?.rainfall?.annualMm != null || climate?.temperature?.meanC != null) {
    sections.push({
      key: 'climate',
      heading: 'Climate',
      text: `Under the DOST-PAGASA CLIRAM observed baseline for ${climate.place ?? short}, annual rainfall is about ${n(
        climate.rainfall?.annualMm
      )} mm and the mean temperature about ${climate.temperature?.meanC} °C${climate.scenario ? `; the projections used are for ${climate.scenario}` : ''}.`,
    });
  }

  // What follows from it.
  const recommendations = [];
  const invasiveTop = mostCommon(trees.filter((tree) => tree.origin === 'invasive').map((tree) => tree.species), 2).map(([name]) => name);
  if (invasiveTop.length) recommendations.push(`Replace invasive ${listOf(invasiveTop)} with endemic or native species as they are removed or come down.`);
  const over = mostCommon(trees.map((tree) => tree.species), 10).filter(([, count]) => treeCount && count / treeCount > 0.1).map(([name]) => name);
  if (over.length) recommendations.push(`Diversify new planting: ${listOf(over)} ${over.length === 1 ? 'is' : 'are each'} more than 10% of the inventory.`);
  const empty = (brgy?.rows ?? []).filter((row) => row.trees === 0).length;
  if (empty) recommendations.push(`Extend the inventory to the ${n(empty)} ${empty === 1 ? 'barangay' : 'barangays'} not yet surveyed.`);
  const flooded = (sites?.rows ?? []).filter((row) => (row.floodShare ?? 0) >= 0.3).map((row) => row.name);
  if (flooded.length) recommendations.push(`Choose flood-tolerant species for ${listOf(flooded)}.`);
  const floodFirst = mostExposed(hazards, 'flood');
  if (floodFirst.length) {
    recommendations.push(`Give priority to riverbank and flood-tolerant planting in ${listOf(floodFirst.map((row) => row.name))}, the most exposed to flooding.`);
  }
  const slopeFirst = mostExposed(hazards, 'landslide');
  if (slopeFirst.length) {
    recommendations.push(`Keep and restore deep-rooted tree cover on the slopes of ${listOf(slopeFirst.map((row) => row.name))}, the most exposed to landslides.`);
  }
  const carbon = tables.carbon?.totals;
  if (carbon?.trees && carbon.measured < carbon.trees) {
    recommendations.push(
      `Record the diameter and total height of the ${n(carbon.trees - carbon.measured)} trees without them, so that the carbon of the whole inventory can be estimated.`
    );
  }
  if (!cover?.rows?.length) recommendations.push('Map the land cover, so that tree cover can be measured and planned for.');
  sections.push({
    key: 'recommendations',
    heading: 'Recommendations',
    text: recommendations.length ? recommendations.join(' ') : 'No recommendation follows from the figures alone.',
  });

  sections.push({
    key: 'sources',
    heading: 'Data and limitations',
    text:
      'Trees: the Green Tag field inventory, tagged by the field officers and verified by the office. Boundaries: PSA and NAMRIA. ' +
      'Hazards: UP NOAH, measured over each barangay on a grid of about 60 m. Elevation: Copernicus DEM. Soils: DA–BSWM. ' +
      'Climate: DOST-PAGASA CLIRAM. Carbon: Chave et al. (2014) on diameter and total height, as Pansit (2019) applies it ' +
      'to city trees, with the tropical Asian mean wood density (0.57 g/cm³, Reyes et al. 1992), the carbon content of ' +
      'Philippine wood (Lasco & Pulhin 2000) and a year\'s growth of 1.19 cm in diameter (Schneider et al. 2013) — ' +
      'estimates of what stands above ground, from the trees with a diameter and total height recorded. Land cover and tree planting sites are as the offices drew them on the map. The inventory ' +
      'counts only the trees tagged so far, not every tree standing.',
  });

  return sections;
}
