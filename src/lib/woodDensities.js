/**
 * Each species' own wood density, for its trees' carbon (21 October).
 *
 * Chave et al. (2014) needs a tree's wood density (treeCarbon.js). The PGENRO
 * forester records a species' own in the Species (RISE) tab, with where it
 * comes from (supabase/species_wood_density.sql); a tree of that species is
 * then worked out at it, and every other tree at the tropical Asian mean.
 *
 * A tree finds its species by common name, as the rest of the system does,
 * or by scientific name when the common name is one the library lacks.
 */

/** The densest and lightest woods there are, in g/cm³. */
export const WOOD_DENSITY_RANGE = Object.freeze({ min: 0.1, max: 1.5 });

/** The form's two fields, from a profile row. */
export function woodDensityForm(row) {
  return {
    wood_density: row?.wood_density === null || row?.wood_density === undefined ? '' : String(row.wood_density),
    wood_density_source: typeof row?.wood_density_source === 'string' ? row.wood_density_source : '',
    // Whether the database has the columns yet: a row read after
    // species_wood_density.sql has run carries them, even when empty.
    woodDensityStored: Boolean(row && 'wood_density' in row),
  };
}

/** What is wrong with what was typed, or ''. */
export function woodDensityProblem(form) {
  const text = String(form?.wood_density ?? '').trim();
  if (!text) return form?.wood_density_source?.trim() ? 'Give the density the source states, or clear the source.' : '';
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value)) return 'A wood density is a number, in g/cm³.';
  if (value < WOOD_DENSITY_RANGE.min || value > WOOD_DENSITY_RANGE.max) {
    return value > 100
      ? 'That looks like kg/m³. Divide by 1,000 for g/cm³ (550 kg/m³ is 0.55).'
      : `A wood density is between ${WOOD_DENSITY_RANGE.min} and ${WOOD_DENSITY_RANGE.max} g/cm³.`;
  }
  if (!String(form?.wood_density_source ?? '').trim()) return 'Say where the figure comes from.';
  return '';
}

/**
 * The two columns to save — or nothing at all, before the database has them
 * and nothing was typed, so a species still saves until the SQL step is run.
 */
export function woodDensityRow(form) {
  const text = String(form?.wood_density ?? '').trim();
  if (!text && !form?.woodDensityStored) return {};
  const value = Number(text.replace(',', '.'));
  return {
    wood_density: text && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null,
    wood_density_source: text ? String(form.wood_density_source ?? '').trim() || null : null,
  };
}

/** species (lower case) → g/cm³, from the species library's rows. */
export function woodDensityIndex(profiles) {
  const index = new Map();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const density = Number(profile?.wood_density);
    if (!Number.isFinite(density) || density < WOOD_DENSITY_RANGE.min || density > WOOD_DENSITY_RANGE.max) continue;
    for (const name of [profile.species, profile.scientific_name]) {
      const key = String(name ?? '').trim().toLowerCase();
      if (key && !index.has(key)) index.set(key, density);
    }
  }
  return index;
}

/** The trees, each carrying its species' density where the library has one. */
export function withWoodDensities(trees, index) {
  if (!index || index.size === 0) return trees;
  return (Array.isArray(trees) ? trees : []).map((tree) => {
    if (tree?.wood_density) return tree;
    const density =
      index.get(String(tree?.species ?? '').trim().toLowerCase()) ??
      index.get(String(tree?.scientific_name ?? '').trim().toLowerCase());
    return density ? { ...tree, wood_density: density } : tree;
  });
}

/**
 * The library's densities, read once per page. Before the SQL step has run
 * the column is not there; the trees then keep the mean, as before.
 */
let loading = null;
export function loadWoodDensities(supabase) {
  if (!loading) {
    loading = (async () => {
      try {
        // A few dozen species: all of them, the empty ones left out here.
        const { data, error } = await supabase.from('species_profiles').select('species, scientific_name, wood_density');
        return error ? new Map() : woodDensityIndex(data);
      } catch {
        return new Map();
      }
    })();
  }
  return loading;
}

/** For tests: forget what was read. */
export function forgetWoodDensities() {
  loading = null;
}
