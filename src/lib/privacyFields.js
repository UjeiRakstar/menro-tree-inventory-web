/**
 * Personal data out of a map file, before anything else reads it.
 *
 * The files an LGU keeps of its land — the assessor's tax map, a cadastral
 * survey, a CLOA list — carry who owns or tills each parcel: names, addresses,
 * titles, tax declarations, property index numbers. Under the Data Privacy Act
 * (RA 10173) none of that is ours to keep or show, and none of it is needed to
 * map forest or land cover. So every import strips it first: a field is
 * dropped for what its name says it holds, or — whatever it is called — for
 * values that read like people's names. What is dropped is listed, so the
 * office can see it; it is never offered back.
 *
 * The file itself is read in the browser and never uploaded. Only the
 * outlines, and the class the office chooses for them, are saved.
 */

const squash = (field) => String(field).toLowerCase().replace(/[^a-z0-9]/g, '');

/** What a field's name says it holds, most specific first: [pattern on the squashed name, reason]. */
const BY_NAME = [
  [/^(owner|owners|ownr|ownername|ownname|declaredowner|registeredowner)\d*$|owner/, 'a person’s name (owner)'],
  [/claimant|occupant|tenant|lessee|lessor|beneficiar|grantee|awardee|applicant|declarant|administrator|heirs?$|spouse|farmer|tiller|^arbs?$|^arbname/, 'a person’s name'],
  [/^(full|first|last|middle|given|sur|maiden)name$|^[flm]name$|^surname$|^person|^nameof/, 'a person’s name'],
  [/address|^addr|residence|^domicile/, 'an address'],
  [/email|phone|mobile|^cell|^tel(no|ephone)?$|contact/, 'contact details'],
  [/^(tin|sss|gsis|philhealth|pagibig|tinno)$|birth|^dob$|^age$|^sex$|gender|civilstatus|religion|income|salary/, 'a personal detail'],
  [/^title(no|number)?$|^(tct|oct|cloa|ep)(no|number)?$|titleno/, 'a land title'],
  [/taxdec|^td(no|number)?$|^arp(no|number)?$|assessment/, 'a tax declaration'],
  [/^pin$|propertyindex|^lot(no|number)?$|cadlot|cadastrallot|^lotno|^survey(no|number)?$|^(psd|csd|pls|cad)(no|number)?$/, 'a lot, survey or property number'],
];

/** Words that, in a value, mark a person or people. */
const PERSON_MARKS = /\b(M\/T(O)?|SPS\.?|SPOUSES|HEIRS? OF|ET\.? AL\.?|MR\.|MRS\.|MS\.|DR\.|ENGR\.|ATTY\.|HON\.|VDA\.? DE|JR\.?|SR\.?)(?=\s|$|,)/i;
/** "DELA CRUZ, JUAN" — a surname, a comma, a given name. */
const SURNAME_FIRST = /^[A-ZÑ][A-Za-zÑñ.'-]+(?: [A-Za-zÑñ.'-]+){0,2}, [A-ZÑ][A-Za-zÑñ.'-]+(?: [A-Za-zÑñ.'-]+){0,3}$/;
/** "NEDITA & CONCEPCION CADAYONA" — two people on one parcel. */
const TWO_PEOPLE = /^[A-ZÑ][A-Za-zÑñ.'-]+(?: [A-Za-zÑñ.'-]+){0,3} (&|AND) [A-ZÑ][A-Za-zÑñ.'-]+(?: [A-Za-zÑñ.'-]+){1,3}$/;

/**
 * The words assessors and planners write about land — "SECANO, COFFEE",
 * "RESIDENTIAL, COCAL" — which a comma would otherwise make look like
 * "SURNAME, FIRSTNAME".
 */
const LAND_WORDS = new Set(
  (
    'agricultural residential commercial industrial institutional cocal coconut cocos secano riceland rice irrigated irr un ' +
    'unirr non inculto pastureland pasture coffee lanzones lanz market road roads undev undeveloped forest forests protection ' +
    'production timberland timber grassland grasslands grass open river creek lake water underwater mango mangoes banana ' +
    'orchard fishpond vacant idle cultivated upland lowland mixed crop crops plantation swamp marsh mangrove built up school ' +
    'church cemetery park nangka santol kawayan bamboo rambutan durian abaca corn sugarcane vegetable vegetables farm farmland ' +
    'poultry piggery quarry barren brush brushland shrubs shrubland mineral alienable disposable public private land lands ' +
    'special spud zone area areas reserve reservation watershed buffer easement salvage settlement tourism eco and of the ' +
    'sanitary landfill dumpsite dam reservoir canal falls trail urban rural green greenbelt'
  ).split(' ')
);

/** Whether one value reads like a person's name. */
export function looksLikeAPerson(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (text.length < 5 || text.length > 120 || /\d/.test(text)) return false;
  if (!PERSON_MARKS.test(text)) {
    const words = text.toLowerCase().split(/[^a-zñ]+/).filter(Boolean);
    if (words.filter((word) => LAND_WORDS.has(word)).length * 2 >= words.length) return false;
  }
  return PERSON_MARKS.test(text) || SURNAME_FIRST.test(text) || TWO_PEOPLE.test(text);
}

/** Why a field name is personal, or ''. */
export function personalByName(field) {
  const name = squash(field);
  return BY_NAME.find(([pattern]) => pattern.test(name))?.[1] ?? '';
}

/**
 * The fields of a FeatureCollection that hold personal data:
 * [{ field, reason }], in the order the file has them.
 */
export function personalFields(collection) {
  const features = collection?.features ?? [];
  const fields = [];
  const seen = new Set();
  for (const feature of features) {
    for (const field of Object.keys(feature?.properties ?? {})) {
      if (!seen.has(field)) {
        seen.add(field);
        fields.push(field);
      }
    }
  }
  const found = [];
  for (const field of fields) {
    const byName = personalByName(field);
    if (byName) {
      found.push({ field, reason: byName });
      continue;
    }
    // Whatever it is called: a few values that read like people's names are enough.
    let filled = 0;
    let people = 0;
    for (const feature of features) {
      const value = feature?.properties?.[field];
      if (typeof value !== 'string' || !value.trim()) continue;
      filled += 1;
      if (looksLikeAPerson(value)) people += 1;
    }
    if (people > 0 && (people >= 3 || people / filled >= 0.1)) {
      found.push({ field, reason: `values that read like people’s names (${people.toLocaleString('en-US')})` });
    }
  }
  return found;
}

/**
 * The collection with the personal fields taken out of every feature, and
 * what was taken: { collection, dropped: [{ field, reason }] }.
 */
export function withoutPersonalData(collection) {
  const dropped = personalFields(collection);
  const gone = new Set(dropped.map((entry) => entry.field));
  return {
    collection: {
      ...collection,
      features: (collection?.features ?? []).map((feature) => ({
        ...feature,
        properties: Object.fromEntries(Object.entries(feature?.properties ?? {}).filter(([field]) => !gone.has(field))),
      })),
    },
    dropped,
  };
}
