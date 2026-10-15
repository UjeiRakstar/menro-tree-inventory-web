import { centroidOf } from './areaGeometry.js';
import { containsPoint } from './lagunaBoundaries.js';
import { lengthM, areaM2 } from './drawing.js';
import { maiCoverOf, namriaClassById } from './namriaCover.js';
import { ROLES, roleOf } from './roles.js';
import { elevationTypeOf } from './layers/elevation.js';

/**
 * Saved map areas: between the drawing on the map, the form, the row in
 * public.map_areas (supabase/map_areas.sql) and the feature the map and its
 * panel draw. One file, so the four cannot disagree about a field.
 */

// ---- Geometry ------------------------------------------------------------------

/** The drawn shape — [lat, lng] points — as GeoJSON, longitude first, ring closed. */
export function shapeToGeometry(shape) {
  const ring = (shape?.points ?? []).map(([lat, lng]) => [lng, lat]);
  if (ring.length > 0) ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** A saved polygon back into a closed shape the drawing tools can edit. */
export function geometryToShape(geometry) {
  const rings = geometry?.type === 'MultiPolygon' ? geometry.coordinates?.[0] : geometry?.coordinates;
  const ring = rings?.[0] ?? [];
  const points = ring.map(([lng, lat]) => [lat, lng]);
  const last = points[points.length - 1];
  if (points.length > 1 && last[0] === points[0][0] && last[1] === points[0][1]) points.pop();
  return { points, closed: points.length >= 3 };
}

/** The tagged trees standing inside a geometry. */
export function treesInside(trees, geometry) {
  if (!geometry) return [];
  return (Array.isArray(trees) ? trees : []).filter((tree) => {
    if (!tree || tree.__pending || tree.task_status === 'Cut') return false;
    const lat = Number(tree.latitude);
    const lng = Number(tree.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && containsPoint(geometry, [lat, lng]);
  });
}

/** What the map measured, for the review step and the row. */
export function measure(shape) {
  const geometry = shapeToGeometry(shape);
  return {
    geometry,
    areaM2: areaM2(shape),
    perimeterM: shape?.closed ? lengthM(shape) : null,
    centroid: centroidOf(geometry),
  };
}

// ---- The form ------------------------------------------------------------------

export const AREA_KINDS = Object.freeze([
  { id: 'land-cover', label: 'Land cover' },
  { id: 'planting-site', label: 'Tree planting site' },
]);

export const PLANTING_STATUSES = Object.freeze([
  { id: 'open', label: 'Open for planting' },
  { id: 'full', label: 'Fully planted' },
  { id: 'maintenance', label: 'Under maintenance — not open' },
]);

export function emptyAreaForm(kind = 'land-cover') {
  return {
    kind,
    name: '',
    coverClass: '',
    designation: '',
    docType: '',
    docNumber: '',
    docTitle: '',
    docUrl: '',
    plantingStatus: 'open',
    plantingWindow: '',
    spacingM: '',
    accessNote: '',
    contact: '',
    recommended: '',
    notes: '',
  };
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * What is wrong with the form, field by field; empty when it can be saved.
 * `hasNewDocument` is a PDF chosen but not yet uploaded.
 */
export function areaFormProblems(form, { measurable = true, hasNewDocument = false } = {}) {
  const problems = {};
  if (!measurable) problems.shape = 'Close the shape, without its edges crossing, to save it.';
  if (!text(form.name)) problems.name = 'Give the area a name.';
  if (form.kind === 'land-cover' && !form.coverClass) problems.coverClass = 'Choose its land cover.';
  if (form.designation) {
    if (!text(form.docType)) problems.docType = 'Say what kind of document it is.';
    if (!text(form.docTitle)) problems.docTitle = 'Give the document’s title.';
    if (!form.docUrl && !hasNewDocument) problems.document = 'A legal designation needs its document (PDF).';
  }
  if (form.kind === 'planting-site' && text(form.spacingM)) {
    const spacing = Number(form.spacingM);
    if (!Number.isFinite(spacing) || spacing <= 0) problems.spacingM = 'Spacing is a distance in metres.';
  }
  return problems;
}

/**
 * The row to save. `place` is { barangay, municipality, psgc } from where the
 * area's middle falls; `suggestion` what the page suggested from the trees.
 * `matches` are the species the library suggested for a planting site
 * (speciesMatch.asRecommended): a name typed that is one of them is saved
 * with its scientific name and why it suits the ground; any other name is
 * kept as typed.
 */
export function rowFromForm(form, { shape, place = null, suggestion = null, treesCount = null, docUrl = null, matches = [] }) {
  const { geometry, areaM2: area, perimeterM } = measure(shape);
  const landCover = form.kind === 'land-cover';
  const site = form.kind === 'planting-site';
  const spacing = Number(form.spacingM);
  return {
    kind: form.kind,
    name: text(form.name),
    geometry,
    area_m2: area,
    perimeter_m: perimeterM,
    municipality: place?.municipality ?? null,
    barangay: place?.barangay ?? null,
    barangay_psgc: place?.psgc ?? null,
    cover_class: landCover ? form.coverClass || null : null,
    suggested_class: landCover ? suggestion?.classId ?? null : null,
    suggestion_reason: landCover ? suggestion?.reason ?? null : null,
    trees_inside: treesCount,
    designation: form.designation || null,
    doc_type: form.designation ? text(form.docType) : null,
    doc_number: form.designation ? text(form.docNumber) || null : null,
    doc_title: form.designation ? text(form.docTitle) : null,
    doc_url: form.designation ? docUrl ?? form.docUrl ?? null : null,
    planting_status: site ? form.plantingStatus || 'open' : null,
    planting_window: site ? text(form.plantingWindow) || null : null,
    spacing_m: site && Number.isFinite(spacing) && spacing > 0 ? spacing : null,
    access_note: site ? text(form.accessNote) || null : null,
    contact: site ? text(form.contact) || null : null,
    recommended: site
      ? text(form.recommended)
          .split(/[,\n]/)
          .map((name) => name.trim())
          .filter(Boolean)
          .map((common) => matches.find((m) => m.common.toLowerCase() === common.toLowerCase()) ?? { common })
      : null,
    notes: text(form.notes) || null,
  };
}

/** A saved row back into the form, for editing or proposing. */
export function formFromRow(row) {
  return {
    ...emptyAreaForm(row?.kind ?? 'land-cover'),
    name: row?.name ?? '',
    coverClass: row?.cover_class ?? '',
    designation: row?.designation ?? '',
    docType: row?.doc_type ?? '',
    docNumber: row?.doc_number ?? '',
    docTitle: row?.doc_title ?? '',
    docUrl: row?.doc_url ?? '',
    plantingStatus: row?.planting_status ?? 'open',
    plantingWindow: row?.planting_window ?? '',
    spacingM: row?.spacing_m != null ? String(row.spacing_m) : '',
    accessNote: row?.access_note ?? '',
    contact: row?.contact ?? '',
    recommended: (row?.recommended ?? []).map((tree) => tree?.common).filter(Boolean).join(', '),
    notes: row?.notes ?? '',
  };
}

// ---- Documents -------------------------------------------------------------------

export const DOCUMENT_BUCKET = 'area-documents';

/**
 * The folder an office files its documents in: its LGU's PSGC code, or
 * "pgenro". The database lets an office upload into, and clear out, its own
 * folder only (closing_gaps.sql).
 */
export function documentFolderOf(profile) {
  const role = roleOf(profile);
  if (role === ROLES.PGENRO) return 'pgenro';
  if (role === ROLES.LGU_ADMIN && profile?.lgu_psgc != null) return String(profile.lgu_psgc);
  return null;
}

/** The path inside the bucket of one of our documents' public URLs, or null. */
export function documentPathOf(url) {
  const marker = `/${DOCUMENT_BUCKET}/`;
  const at = typeof url === 'string' ? url.indexOf(marker) : -1;
  if (at < 0) return null;
  return decodeURIComponent(url.slice(at + marker.length).split(/[?#]/)[0]) || null;
}

/**
 * Removing a document no area uses any more. Best effort: a file that cannot
 * be removed (another office filed it, or it is already gone) is left, and
 * saving or deleting the area is not undone over it.
 */
export async function removeDocument(supabase, url) {
  const path = documentPathOf(url);
  if (!path) return;
  try {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
  } catch {
    // Left in place; see above.
  }
}

// ---- On the map ----------------------------------------------------------------

const dateOf = (value) =>
  value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

/** Which office's area it is, in words. */
export function officeOf(row, lguLabel) {
  if (row?.created_by_role === 'pgenro') return 'PGENRO Laguna';
  return lguLabel ? `${lguLabel} MENRO / CENRO` : 'MENRO / CENRO';
}

/**
 * What PGENRO's layers and CLIRAM say about an area, as the panel's fields.
 *
 * `facts` is the area's `layer_facts` (src/lib/layers/measure.js); `climate`
 * its LGU's CLIRAM row. A field nobody has measured is left undefined, and
 * the panel marks it as awaiting data.
 */
export function groundOf(facts, climate) {
  const ground = {};
  const soils = Array.isArray(facts?.soil) ? facts.soil : null;
  if (soils?.length) {
    const named = soils.slice(0, 2).map((s) => s.description || s.series).filter(Boolean);
    ground.soilType =
      soils.length > 1 && soils[0].share < 0.9
        ? soils.slice(0, 2).map((s) => `${s.description || s.series} (${Math.round(s.share * 100)}%)`).join(', ')
        : named[0];
  }
  if (facts?.elevation) {
    const { min, max, mean } = facts.elevation;
    ground.elevationM = mean;
    ground.elevationRange = { min, max };
  }
  // BSWM's own zone for the ground the area mostly stands on, else by height.
  const zone = soils?.[0]?.zone;
  const zoneType = zone ? zone.replace(/s$/, '') : null;
  if (zoneType || facts?.elevation) ground.elevationType = zoneType ?? elevationTypeOf(facts.elevation.mean);
  for (const kind of ['flood', 'landslide']) {
    if (facts?.[kind]) {
      ground.hazards ??= {};
      ground.hazards[kind] = { areaM2: facts[kind].total, levels: facts[kind] };
    }
  }
  if (climate?.rainfall?.annualMm != null) ground.rainfallMmPerYear = climate.rainfall.annualMm;
  if (climate?.temperature?.meanC != null) ground.temperatureC = climate.temperature.meanC;
  if (climate) ground.climateSource = { scenario: climate.scenario, place: climate.place };
  return ground;
}

/**
 * A sample area with PGENRO's layers laid under it. Its boundary sits in the
 * real barangay, so what the layers say about that ground is real even though
 * the area is not: each fact a layer gives replaces the invented one, and
 * `measured` lists which those are so the panel drops their amber marks.
 *
 * The invented hazard figures go as soon as any layer is live — a measured
 * flood figure beside a made-up landslide one would read as the same kind of
 * fact. A hazard no layer covers then shows as not assessed.
 */
export function sampleWithGround(feature, facts, climate) {
  const ground = groundOf(facts, climate);
  const measured = Object.keys(ground).filter((key) => key !== 'hazards' && key !== 'climateSource');
  for (const kind of Object.keys(ground.hazards ?? {})) measured.push(`hazards.${kind}`);
  if (measured.length === 0) return feature;
  const properties = { ...feature.properties };
  delete properties.hazards;
  // A height from the elevation layer, never an invented one beside a real type.
  if (!measured.includes('elevationM')) delete properties.elevationM;
  return { ...feature, properties: { ...properties, ...ground, measured } };
}

/**
 * A saved row as the feature the map and the area panel draw — the same shape
 * as the sample areas (src/data/mockMapSites.js), so the panel needs nothing
 * new to show one.
 */
export function rowToFeature(row, { lguLabel = '', climate = null } = {}) {
  const namria = namriaClassById(row.cover_class);
  return {
    type: 'Feature',
    geometry: row.geometry,
    properties: {
      id: row.id,
      saved: true,
      kind: row.kind,
      name: row.name,
      namriaClass: row.cover_class ?? null,
      coverId: namria ? maiCoverOf(row.cover_class)?.id ?? null : null,
      coverLabel: namria?.label ?? null,
      barangay: row.barangay ?? null,
      municipality: row.municipality ?? null,
      province: 'Laguna',
      lguPsgc: row.lgu_psgc != null ? Number(row.lgu_psgc) : null,
      createdByRole: row.created_by_role ?? null,
      // A planting site an office asked for: 'requested' or 'declined' until
      // PGENRO approves it (planting_requests.sql). Land cover is 'approved'.
      approval: row.approval ?? 'approved',
      reviewNote: row.review_note ?? null,
      designation: row.designation ?? null,
      document: row.doc_url
        ? { type: row.doc_type, number: row.doc_number, title: row.doc_title, url: row.doc_url }
        : null,
      notes: row.notes ?? null,
      suggestion: row.suggested_class ? { classId: row.suggested_class, reason: row.suggestion_reason } : null,
      treesInside: row.trees_inside ?? null,
      verifiedBy: officeOf(row, lguLabel),
      status: row.planting_status ?? undefined,
      plantingWindow: row.planting_window ?? null,
      spacingM: row.spacing_m ?? null,
      accessNote: row.access_note ?? null,
      contact: row.contact ?? null,
      recommended: row.recommended ?? [],
      updatedAt: dateOf(row.updated_at),
      // The exact time, for redrawing the layer when the area changes.
      version: row.updated_at ?? null,
      ...groundOf(row.layer_facts, climate),
    },
  };
}

/**
 * What the signed-in account may do to an area:
 *   'edit'     change and delete it
 *   'propose'  PGENRO, on an office's area: a change the MENRO decides on
 *   null       nothing
 * The database decides in the end (map_areas.sql); this only chooses which
 * buttons to show.
 */
export function areaPermission(profile, feature) {
  const props = feature?.properties;
  if (!props?.saved) return null;
  const role = roleOf(profile);
  const plantingSite = props.kind === 'planting-site';
  const approval = props.approval ?? 'approved';
  if (role === ROLES.PGENRO) {
    // Planting sites are PGENRO's: it decides a request, and keeps the
    // approved ones whoever asked for them (planting_requests.sql).
    if (plantingSite) return approval === 'requested' ? 'review' : approval === 'approved' ? 'edit' : null;
    return props.createdByRole === 'pgenro' ? 'edit' : 'propose';
  }
  if (role === ROLES.LGU_ADMIN) {
    const own = props.createdByRole === 'lgu_admin' && Number(profile?.lgu_psgc) === props.lguPsgc;
    if (plantingSite && approval === 'approved') return null;
    return own ? 'edit' : null;
  }
  return null;
}

/** The fields a proposal changes, in words, for the MENRO deciding on it. */
const PROPOSAL_FIELDS = [
  ['name', 'Name'],
  ['kind', 'Kind'],
  ['cover_class', 'Land cover'],
  ['designation', 'Legal designation'],
  ['doc_title', 'Document'],
  ['planting_status', 'Planting status'],
  ['planting_window', 'Planting window'],
  ['spacing_m', 'Spacing'],
  ['access_note', 'Getting there'],
  ['contact', 'Contact'],
  ['notes', 'Notes'],
];

const shown = (key, value) => {
  if (value == null || value === '') return '—';
  if (key === 'cover_class') return namriaClassById(value)?.label ?? value;
  return String(value);
};

export function proposalChanges(row, changes) {
  const out = [];
  for (const [key, label] of PROPOSAL_FIELDS) {
    if (!(key in (changes ?? {}))) continue;
    const before = row?.[key] ?? null;
    const after = changes[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      out.push({ key, label, before: shown(key, before), after: shown(key, after) });
    }
  }
  if (changes?.geometry && JSON.stringify(changes.geometry) !== JSON.stringify(row?.geometry)) {
    out.push({ key: 'geometry', label: 'Boundary', before: 'as drawn', after: 'redrawn' });
  }
  return out;
}
