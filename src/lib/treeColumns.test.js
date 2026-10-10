import { describe, it, expect } from 'vitest';
import { PUBLIC_DASHBOARD_COLUMNS, PUBLIC_MAP_COLUMNS } from './treeColumns.js';

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
  'biodiversity_status', 'species_type', 'tree_category', 'source', 'data_source',
  // The carousel
  'imageUrl', 'photo_url', 'leaves_url', 'bark_url', 'fruits_url',
];

const READ_BY_THE_DASHBOARD = [
  'id', 'species', 'barangay', 'barangay_psgc', 'latitude', 'longitude',
  'dbh', 'merchantable_height', 'biodiversity_status', 'species_type',
];

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
