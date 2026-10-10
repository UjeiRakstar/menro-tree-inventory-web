import { describe, it, expect } from 'vitest';
import { PUBLIC_DASHBOARD_COLUMNS, PUBLIC_MAP_COLUMNS, selectPublicTrees } from './treeColumns.js';

const mapColumns = PUBLIC_MAP_COLUMNS.split(',');
const dashboardColumns = PUBLIC_DASHBOARD_COLUMNS.split(',');

/**
 * Every column the public side reads out of a tree.
 *
 * This list is the point of the file. The page tests mock Supabase, so they
 * hand back whatever fixture they like and would never notice a column missing
 * from the query — the field would simply arrive as undefined and the panel
 * would show a blank where a measurement used to be.
 *
 * So when a public screen starts reading a new field, it goes here, and this
 * test says which query is missing it.
 */
const READ_BY_THE_MAP = [
  // Identity and place
  'id', 'species', 'scientific_name', 'barangay', 'barangay_psgc', 'latitude', 'longitude',
  // Measurements, for the Tree Details tab and the carbon figure
  'dbh', 'merchantable_height', 'total_height',
  // The three badges: endemic/invasive, fruit/ornamental/timber, how it was tagged
  'biodiversity_status', 'species_type', 'tree_category', 'source',
  // The carousel
  'imageUrl', 'photo_url', 'leaves_url', 'bark_url', 'fruits_url',
];

const READ_BY_THE_DASHBOARD = [
  'id', 'species', 'barangay', 'barangay_psgc', 'latitude', 'longitude',
  'dbh', 'merchantable_height', 'biodiversity_status', 'species_type',
  // The species layer
  'scientific_name', 'tree_category',
  // Freshness
  'dateCaptured',
];

/**
 * Read in the code, but NOT a column of public.trees.
 *
 * It appears only as a fallback — `tree.source || tree.data_source`. Selecting
 * every column hid that, because a column that is not there simply never
 * arrived and the `||` moved on. Naming it made PostgREST refuse the whole
 * query, and the public map showed "The tagged trees could not be loaded"
 * where the trees should be.
 *
 * photo_url was removed alongside it on the same suspicion and turned out to
 * be real, which is why the column list is now checked against the database
 * rather than reasoned about: tools/show-tree-columns.mjs.
 */
const NOT_COLUMNS_OF_TREES = ['data_source'];

describe('what the public side asks for', () => {
  it('asks for everything the map reads', () => {
    for (const column of READ_BY_THE_MAP) expect(mapColumns).toContain(column);
  });

  it('asks for everything the analytics page reads', () => {
    for (const column of READ_BY_THE_DASHBOARD) expect(dashboardColumns).toContain(column);
  });

  it('asks for nothing else', () => {
    // A column nobody reads is bytes down a phone connection for nothing.
    expect(mapColumns.sort()).toEqual([...READ_BY_THE_MAP].sort());
    expect(dashboardColumns.sort()).toEqual([...READ_BY_THE_DASHBOARD].sort());
  });

  it('never asks the public for the survey working columns', () => {
    // public.trees is a field-survey table. These are staff business, and two
    // of them are arrays of photo URLs.
    const notPublic = [
      'assigned_to', 'task_status', 'has_cutting_permit', 'stem_quality',
      'leaning_photos', 'powerline_photos', 'root_photos',
      'isLeaning', 'hasPowerlineConflict', 'isRootProblem',
    ];
    for (const column of notPublic) {
      expect(mapColumns).not.toContain(column);
      expect(dashboardColumns).not.toContain(column);
    }
  });

  it('keeps the analytics query free of photographs', () => {
    // Nothing on that page shows a picture.
    for (const column of ['imageUrl', 'photo_url', 'leaves_url', 'bark_url', 'fruits_url']) {
      expect(dashboardColumns).not.toContain(column);
    }
  });

  it('spells the camelCase columns the way the table has them', () => {
    // public.trees was created by the mobile app's upsert, so PostgREST will
    // only match "imageUrl" exactly — "imageurl" finds nothing.
    expect(mapColumns).toContain('imageUrl');
    expect(mapColumns).not.toContain('imageurl');
  });
});

describe('columns that are not columns', () => {
  it('never asks for a field the table has not got', () => {
    for (const column of NOT_COLUMNS_OF_TREES) {
      expect(mapColumns).not.toContain(column);
      expect(dashboardColumns).not.toContain(column);
    }
  });
});

describe('selectPublicTrees', () => {
  const rows = [{ id: '1', species: 'Narra' }];

  it('asks for the narrow list and hands it back', async () => {
    const select = vi.fn().mockResolvedValue({ data: rows, error: null });
    const supabase = { from: vi.fn(() => ({ select })) };

    const result = await selectPublicTrees(supabase, 'id,species');

    expect(select).toHaveBeenCalledWith('id,species');
    expect(select).toHaveBeenCalledTimes(1);
    expect(result.data).toBe(rows);
  });

  it('falls back to every column rather than showing an empty map', async () => {
    // The real failure: "column trees.data_source does not exist".
    const select = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42703', message: 'column trees.data_source does not exist' },
      })
      .mockResolvedValueOnce({ data: rows, error: null });
    const supabase = { from: vi.fn(() => ({ select })) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await selectPublicTrees(supabase, 'id,data_source');

    expect(select).toHaveBeenNthCalledWith(2, '*');
    expect(result.data).toBe(rows);
    expect(result.error).toBeNull();
    // And it says which column to go and fix.
    expect(warn.mock.calls[0][0]).toMatch(/data_source/);
    warn.mockRestore();
  });

  it('lets a real failure through instead of asking twice', async () => {
    // A network or permission error is not a column problem, and retrying it
    // with every column would only be slower before failing the same way.
    const error = { code: 'PGRST301', message: 'JWT expired' };
    const select = vi.fn().mockResolvedValue({ data: null, error });
    const supabase = { from: vi.fn(() => ({ select })) };

    const result = await selectPublicTrees(supabase, 'id,species');

    expect(select).toHaveBeenCalledTimes(1);
    expect(result.error).toBe(error);
  });
});
