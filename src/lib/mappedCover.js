import { geometryAreaM2, toHectares } from './areaGeometry.js';
import { maiCoverOf, namriaClassById } from './namriaCover.js';

/**
 * What the offices' saved land cover areas add up to — the BioDashboard's
 * "Forest / Tree Cover Area", which waited on the mapping feature.
 *
 * It is MAPPED tree cover: the land cover areas an office has drawn and
 * classified as a tree cover class. It is not the tree cover of Laguna, and
 * the page says so — a town that has mapped nothing has none to show, which
 * is not the same as having no trees.
 *
 * The growth figure is each area's hectares × its class's published MAI
 * (src/lib/namriaCover.js), summed — rates measured elsewhere, so the page
 * marks it as borrowed. Tree cover with no published rate (mangrove) is
 * counted in the hectares and named, not given a growth of zero.
 *
 * Deliberately NOT computed: the tagged trees' growth divided by these
 * hectares. The tagged trees are a sample of wherever somebody tagged; the
 * mapped areas are ground somebody drew. Dividing one by the other mixes the
 * two into a figure that describes neither.
 *
 * `features` are saved areas as the map has them (rowToFeature); samples
 * carry no `saved` flag and are left out.
 */
export function summariseMappedCover(features, { municipality = '' } = {}) {
  const byClass = new Map();
  let areas = 0;
  let hectares = 0;
  let biomassTPerYear = 0;
  let unratedHa = 0;

  for (const feature of Array.isArray(features) ? features : []) {
    const props = feature?.properties;
    if (!props?.saved || props.kind !== 'land-cover') continue;
    if (municipality && props.municipality !== municipality) continue;
    const cls = namriaClassById(props.namriaClass);
    if (!cls?.treeCover) continue;

    const ha = toHectares(geometryAreaM2(feature.geometry));
    areas += 1;
    hectares += ha;
    const rate = maiCoverOf(cls.id)?.maiTPerHaYear;
    if (Number.isFinite(rate)) biomassTPerYear += ha * rate;
    else unratedHa += ha;

    const entry = byClass.get(cls.id) ?? { classId: cls.id, label: cls.label, hectares: 0, areas: 0 };
    entry.hectares += ha;
    entry.areas += 1;
    byClass.set(cls.id, entry);
  }

  return {
    areas,
    hectares,
    biomassTPerYear: areas > 0 ? biomassTPerYear : null,
    unratedHa,
    byClass: [...byClass.values()].sort((a, b) => b.hectares - a.hectares),
  };
}
