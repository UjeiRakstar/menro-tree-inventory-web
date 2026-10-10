/**
 * NOT LISTED, DELIBERATELY: data_source and photo_url.
 *
 * Both are read in the code as fallbacks — `tree.source || tree.data_source`,
 * `tree.photo_url || tree.imageUrl` — but neither is a column of public.trees.
 * They are written to public.pending_trees, and the reads were defensive
 * guesses at a schema.
 *
 * Asking for all columns hid that: a column that is not there simply never
 * appeared, and the `||` moved on. Naming the columns made PostgREST answer
 * "column trees.data_source does not exist" and the public map showed an error
 * instead of trees. Anything added to these lists has to be a column that
 * really exists — tools/show-tree-columns.mjs prints the real set.
 *
 * What the public side asks the database for.
 *
 * Both public pages used to select every column of every tree. public.trees is
 * a field-survey table: besides the measurements it carries the task status,
 * the assigned arborist, the cutting permit, the stem quality, and three
 * ARRAYS of photo URLs for leaning trees, powerline conflicts and root
 * problems. None of that is shown to the public, and all of it travelled down
 * a phone connection on every visit.
 *
 * Naming the columns costs a line and saves the rest. It also makes the
 * dependency visible: if a public screen starts showing something new, the
 * column has to be added here, which is a better failure than a field quietly
 * arriving as undefined.
 */

/**
 * The map: everything the pins, the panel and the barangay lookup read.
 *
 * "imageUrl" is camelCase because public.trees was created by the mobile
 * app's upsert. PostgREST matches column names exactly, so it goes in as
 * written. photo_url is kept alongside it because the panel reads either.
 */
export const PUBLIC_MAP_COLUMNS = [
  'id',
  'species',
  'scientific_name',
  'barangay',
  'barangay_psgc',
  'latitude',
  'longitude',
  'dbh',
  'merchantable_height',
  'total_height',
  'biodiversity_status',
  'species_type',
  'tree_category',
  'source',
  'imageUrl',
  'leaves_url',
  'bark_url',
  'fruits_url',
].join(',');

/**
 * The analytics page: no photographs at all.
 *
 * It counts trees, picks out the invasive ones, works out carbon and groups by
 * place. Nothing on it shows a picture, so none of the four photo columns is
 * asked for.
 */
export const PUBLIC_DASHBOARD_COLUMNS = [
  'id',
  'species',
  'barangay',
  'barangay_psgc',
  'latitude',
  'longitude',
  'dbh',
  'merchantable_height',
  'biodiversity_status',
  'species_type',
].join(',');

/** PostgreSQL's code for "there is no column by that name". */
const UNDEFINED_COLUMN = '42703';

function isMissingColumn(error) {
  if (!error) return false;
  if (error.code === UNDEFINED_COLUMN) return true;
  return /column .* does not exist/i.test(error.message || '');
}

/**
 * Read the trees, and do not let a wrong column list take the map down.
 *
 * Naming columns is worth real bytes on a phone connection, but it introduces
 * a way to be wrong that selecting everything did not have: name a column the
 * table has not got and PostgREST refuses the whole query. A visitor then sees
 * "The tagged trees could not be loaded" where the map should be — which is a
 * bad trade for saving a few kilobytes.
 *
 * So a missing column falls back to asking for everything. The page is slower
 * than it should be and completely correct, which is the right way round, and
 * the console says which column to fix.
 */
export async function selectPublicTrees(supabase, columns) {
  const narrow = await supabase.from('trees').select(columns);
  if (!isMissingColumn(narrow.error)) return narrow;

  console.warn(
    `[trees] ${narrow.error.message} — falling back to every column. ` +
      'Fix the list in src/lib/treeColumns.js; tools/show-tree-columns.mjs prints the real one.'
  );
  return supabase.from('trees').select('*');
}
