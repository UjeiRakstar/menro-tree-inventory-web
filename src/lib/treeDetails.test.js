import { describe, it, expect } from 'vitest';
import {
  dbhOf,
  flowerPhase,
  fruitPhase,
  heightOf,
  leafPhase,
  observedOn,
  phenologyOf,
} from './treeDetails.js';

describe('treeDetails measurements', () => {
  it('reads the height the mobile app stores as a string of metres', () => {
    expect(heightOf({ total_height: '11.1' })).toEqual({ value: '11.1', unit: 'm', caption: 'height' });
    expect(heightOf({ total_height: 5 })).toEqual({ value: '5', unit: 'm', caption: 'height' });
  });

  it('drops a trailing zero rather than printing "5.0 m"', () => {
    expect(heightOf({ total_height: '5.0' }).value).toBe('5');
  });

  it('shows no height at all rather than the height class instead of one', () => {
    // "Medium" in a slot that says metres reads as a measurement it is not.
    expect(heightOf({ total_height: null, heightClass: 'Medium' })).toBeNull();
    expect(heightOf({ total_height: null, height_class: 'Large' })).toBeNull();
    expect(heightOf({})).toBeNull();
  });

  it('pulls the number out of a dbh like "37.35 cm"', () => {
    expect(dbhOf({ dbh: '37.35 cm' })).toEqual({
      value: '37.4',
      unit: 'cm',
      caption: 'Diameter at Breast Height',
    });
    expect(dbhOf({ dbh: 140 }).value).toBe('140');
  });

  it('shows no measurement rather than a zero or a blank one', () => {
    expect(dbhOf({ dbh: '0 cm' })).toBeNull();
    expect(dbhOf({ dbh: 'not measured' })).toBeNull();
    expect(dbhOf({})).toBeNull();
    expect(heightOf({ total_height: '0' })).toBeNull();
  });
});

describe('treeDetails phenology', () => {
  it('matches a status however it is punctuated or capitalised', () => {
    expect(leafPhase({ leaf_status: 'peak' }).label).toBe('Full Canopy');
    expect(leafPhase({ leaf_status: 'Full Canopy' }).label).toBe('Full Canopy');
    expect(leafPhase({ leaf_status: 'color_change' }).label).toBe('Color Change');
    expect(leafPhase({ leaf_status: 'Colour Change' }).label).toBe('Color Change');
    expect(leafPhase({ leaf_status: 'shedding' }).label).toBe('Shedding');
    expect(leafPhase({ leaf_status: 'Flushing' }).label).toBe('Budding');
  });

  it('reads flower and fruit statuses the same way', () => {
    expect(flowerPhase({ flower_status: 'full_bloom' }).label).toBe('Full Bloom');
    expect(flowerPhase({ flower_status: 'Fading/Dropping' }).label).toBe('Fading');
    expect(fruitPhase({ fruit_status: 'unripe' }).label).toBe('Unripe');
    expect(fruitPhase({ fruit_status: 'Dispersing/Splitting' }).label).toBe('Dispersing');
    expect(fruitPhase({ fruit_status: 'Ripe/Mature' }).label).toBe('Ripe');
  });

  it('draws nothing for "none", for a blank, or for a value it does not know', () => {
    // 'none' is a real observation — the tree carries no fruit — and an unknown
    // value is not worth guessing at. Neither earns an icon.
    expect(fruitPhase({ fruit_status: 'none' })).toBeNull();
    expect(flowerPhase({ flower_status: '' })).toBeNull();
    expect(flowerPhase({})).toBeNull();
    expect(leafPhase({ leaf_status: 'sprouting sideways' })).toBeNull();
  });

  it('gives every phase an icon, a label, a kind and an explanation', () => {
    const phases = phenologyOf({ leaf_status: 'peak', flower_status: 'budding', fruit_status: 'ripe' });
    expect(phases.map((p) => p.kind)).toEqual(['Leaf', 'Flower', 'Fruit']);
    for (const phase of phases) {
      expect(phase.icon).toBeTruthy();
      expect(phase.label.length).toBeGreaterThan(0);
      expect(phase.description.length).toBeGreaterThan(0);
    }
  });

  it('keeps leaf-flower-fruit order while skipping what was not observed', () => {
    expect(phenologyOf({ leaf_status: 'shedding', fruit_status: 'dispersing' }).map((p) => p.kind)).toEqual([
      'Leaf',
      'Fruit',
    ]);
    expect(phenologyOf({})).toEqual([]);
  });
});

describe('treeDetails observations', () => {
  // What the mobile app writes to phenology_records, verbatim.
  const VISIT = {
    tree_id: 'tree-1',
    foliage_status: 'Peak / Full Canopy',
    flowering_status: 'Full Bloom',
    fruiting_status: 'Unripe / Developing',
    observed_at: '2026-03-12T01:30:00.000Z',
    observed_by: 'arb@menro.gov.ph',
  };

  it('reads a field visit, not just the columns on the tree', () => {
    expect(phenologyOf(VISIT).map((p) => p.label)).toEqual(['Full Canopy', 'Full Bloom', 'Unripe']);
  });

  it('still understands the same statuses stored on a tree row', () => {
    expect(leafPhase({ leaf_status: 'peak' }).label).toBe('Full Canopy');
    expect(flowerPhase({ flower_status: 'full_bloom' }).label).toBe('Full Bloom');
    expect(fruitPhase({ fruit_status: 'ripe' }).label).toBe('Ripe');
  });

  it('skips a phase the visit recorded as None', () => {
    expect(phenologyOf({ ...VISIT, flowering_status: 'None' }).map((p) => p.kind)).toEqual([
      'Leaf',
      'Fruit',
    ]);
  });

  it('dates an observation, and says nothing when it cannot', () => {
    expect(observedOn(VISIT)).toMatch(/2026/);
    expect(observedOn({ observed_at: 'not a date' })).toBeNull();
    expect(observedOn({})).toBeNull();
    expect(observedOn(null)).toBeNull();
  });
});
