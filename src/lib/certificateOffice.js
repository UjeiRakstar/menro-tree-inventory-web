import { MUNICIPALITY_LIST, municipalityAt } from './lagunaBoundaries.js';
import { logoFor } from './lguLogos.js';
import santaCruzEnroSeal from '../assets/MENRO Santa Cruz logo.png';

/**
 * Whose certificate it is: the city or municipality the tree stands in.
 *
 * The Certificate of No Objection was written for Santa Cruz and said so on
 * every copy — seal, letterhead, mayor — wherever the tree was. It now comes
 * from the LGU the tree's point falls in, worded for a city or a
 * municipality as that LGU is.
 *
 * Seals: every LGU's own seal is in the app. Only Santa Cruz's environment
 * office seal is, so other LGUs' certificates carry their LGU seal alone
 * rather than borrow another office's.
 */
const ENRO_SEALS = { 'Santa Cruz': santaCruzEnroSeal };

const finite = (value) => Number.isFinite(Number(value)) && Number(value) !== 0;

/**
 * The office behind a certificate, from a point — { latitude, longitude } —
 * or, failing that, a town's name. Null when neither places it in Laguna.
 */
export function certificateOffice({ latitude, longitude, municipality } = {}) {
  let name = null;
  if (finite(latitude) && finite(longitude)) name = municipalityAt([Number(latitude), Number(longitude)]);
  if (!name && municipality) {
    const wanted = String(municipality).trim().toLowerCase();
    name = MUNICIPALITY_LIST.find((lgu) => lgu.name.toLowerCase() === wanted || lgu.label.toLowerCase() === wanted)?.name ?? null;
  }
  const lgu = MUNICIPALITY_LIST.find((entry) => entry.name === name);
  if (!lgu) return null;

  const city = Boolean(lgu.isCity);
  return {
    name: lgu.name,
    label: lgu.label,
    isCity: city,
    // "City of Calamba", "Municipality of Santa Cruz" — as each styles itself.
    government: city ? `City of ${lgu.name}` : `Municipality of ${lgu.name}`,
    mayorOffice: city ? 'Office of the City Mayor' : 'Office of the Municipal Mayor',
    mayorTitle: city ? 'City Mayor' : 'Municipal Mayor',
    environmentOffice: city
      ? 'City Environment and Natural Resources Office'
      : 'Municipal Environment and Natural Resources Office',
    seal: logoFor(lgu.name),
    environmentSeal: ENRO_SEALS[lgu.name] ?? null,
  };
}
