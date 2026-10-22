/**
 * The Tree Database (22 October): the species an LGU has tagged, each with
 * the RISE write-up PGENRO keeps (public.species_profiles), for the MENRO /
 * CENRO to read. It is the LGU's own trees that decide what is listed — a
 * species appears the moment a tree of it is tagged there — and PGENRO's
 * library that decides what is said of it.
 */

const UNNAMED = new Set(['', 'unknown', 'miscellaneous', 'n/a', 'none']);
const clean = (value) => String(value ?? '').trim();
const key = (value) => clean(value).toLowerCase();

/** How species_photo_choices keys a species: its name in lower case. */
export const photoKey = key;

/**
 * The photos a tree has, as the map's panel reads them. Only a field
 * officer's or an office's: a resident's tag (source crowdsource or
 * community) is never what illustrates a species.
 */
const PHOTO_FIELDS = [
  ['Main', ['photo_url', 'imageUrl']],
  ['Leaves', ['leaves_url', 'leavesUrl']],
  ['Bark', ['bark_url', 'barkUrl']],
  ['Fruits', ['fruits_url', 'fruitsUrl']],
];
const UNTRUSTED = new Set(['crowdsource', 'community']);

function photosOf(tree) {
  if (UNTRUSTED.has(key(tree?.source))) return [];
  return PHOTO_FIELDS.flatMap(([kind, fields]) => {
    const url = fields.map((field) => clean(tree?.[field])).find(Boolean);
    return url && /^https?:\/\//.test(url) ? [{ url, kind }] : [];
  });
}

/**
 * Each species among `trees`, once: { name, scientific, count, profile, places, photos },
 * by name. A species matches a write-up by its common name or its
 * scientific name, either way round in case, as the inbox's "not in the
 * species library" notice matches them (inbox.sql).
 *
 * `placeOf(tree)` names where a tree stands — its LGU for the public, its
 * barangay for an office (22 October); `places` is then [{ name, count }],
 * most trees first. Trees with no place are left out of it, not of the count.
 *
 * `photos` is every photo of its trees, [{ url, kind }], once each — see
 * brochureOf() for what is shown of them.
 */
export function speciesInInventory(trees = [], profiles = [], { placeOf = null } = {}) {
  const byName = new Map();
  const byScientific = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (clean(profile?.species)) byName.set(key(profile.species), profile);
    if (clean(profile?.scientific_name)) byScientific.set(key(profile.scientific_name), profile);
  }

  const species = new Map();
  for (const tree of Array.isArray(trees) ? trees : []) {
    const name = clean(tree?.species);
    if (UNNAMED.has(name.toLowerCase())) continue;
    const entry = species.get(name.toLowerCase()) ?? { name, scientific: '', count: 0, profile: null, where: new Map(), seen: new Map() };
    entry.count += 1;
    for (const photo of photosOf(tree)) if (!entry.seen.has(photo.url)) entry.seen.set(photo.url, photo);
    const place = placeOf ? clean(placeOf(tree)) : '';
    if (place) entry.where.set(place, (entry.where.get(place) ?? 0) + 1);
    // 'Unknown' and the like are no scientific name.
    if (!entry.scientific && !UNNAMED.has(key(tree.scientific_name))) entry.scientific = clean(tree.scientific_name);
    species.set(name.toLowerCase(), entry);
  }

  return [...species.values()]
    .map((entry) => {
      const profile = byName.get(key(entry.name)) ?? (entry.scientific ? byScientific.get(key(entry.scientific)) : null) ?? null;
      const places = [...entry.where.entries()]
        .map(([placeName, count]) => ({ name: placeName, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
      const { where, seen, ...rest } = entry;
      return { ...rest, scientific: clean(profile?.scientific_name) || entry.scientific, profile, places, photos: [...seen.values()] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** How many of each close-up the species' card shows. */
const PER_KIND = 2;

/**
 * What the Tree Database shows of a species' photos (22 October), given
 * PGENRO's choice for it (species_photo_choices: cover_url, hidden_urls):
 *
 *   cover   PGENRO's cover; or else the first main photo; or else any photo
 *   strip   up to two each of leaves, bark and fruits — not the cover
 *   shown   every photo not hidden, for PGENRO to choose from
 *   hidden  the photos PGENRO hid, to show again
 */
export function brochureOf(species, choice = null) {
  const photos = Array.isArray(species?.photos) ? species.photos : [];
  const hiddenUrls = new Set(Array.isArray(choice?.hidden_urls) ? choice.hidden_urls : []);
  const shown = photos.filter((photo) => !hiddenUrls.has(photo.url));
  const cover =
    shown.find((photo) => photo.url === choice?.cover_url) ?? shown.find((photo) => photo.kind === 'Main') ?? shown[0] ?? null;
  const strip = ['Leaves', 'Bark', 'Fruits'].flatMap((kind) =>
    shown.filter((photo) => photo.kind === kind && photo.url !== cover?.url).slice(0, PER_KIND)
  );
  return { cover, strip, shown, hidden: photos.filter((photo) => hiddenUrls.has(photo.url)) };
}
