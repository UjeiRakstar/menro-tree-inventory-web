/**
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
  'data_source',
  'imageUrl',
  'photo_url',
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
