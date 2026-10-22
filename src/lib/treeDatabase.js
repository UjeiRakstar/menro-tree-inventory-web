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

/**
 * Each species among `trees`, once: { name, scientific, count, profile },
 * by name. A species matches a write-up by its common name or its
 * scientific name, either way round in case, as the inbox's "not in the
 * species library" notice matches them (inbox.sql).
 */
export function speciesInInventory(trees = [], profiles = []) {
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
    const entry = species.get(name.toLowerCase()) ?? { name, scientific: '', count: 0, profile: null };
    entry.count += 1;
    if (!entry.scientific && clean(tree.scientific_name)) entry.scientific = clean(tree.scientific_name);
    species.set(name.toLowerCase(), entry);
  }

  return [...species.values()]
    .map((entry) => {
      const profile = byName.get(key(entry.name)) ?? (entry.scientific ? byScientific.get(key(entry.scientific)) : null) ?? null;
      return { ...entry, scientific: clean(profile?.scientific_name) || entry.scientific, profile };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
