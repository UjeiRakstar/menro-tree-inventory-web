import { describe, it, expect } from 'vitest';
import {
  ALL_METRICS,
  METRIC_PAIRS,
  FORESTRY_PAIR,
  PENDING_METRICS,
  barangayOf,
  carbonForTree,
  formatFigure,
  groupBy,
  isInvasive,
  pairOfMetric,
  summarise,
} from './dashboardMetrics.js';
import { carbonDioxideKg } from './treeVolume.js';

const tree = (over = {}) => ({ id: 't', dbh: '10 cm', barangay: 'Bubukal', ...over });

describe('dashboardMetrics carbon', () => {
  it('comes from the DENR volume equation, not a proxy', () => {
    const tree = { species: 'Narra', dbh: '37 cm', merchantable_height: 9 };
    expect(carbonForTree(tree)).toBe(carbonDioxideKg(tree));
    expect(carbonForTree(tree)).toBeGreaterThan(0);
  });

  it('says nothing for a tree it cannot measure, rather than zero', () => {
    // Zero would be added into a total as though the tree were measured and
    // found to hold no carbon.
    expect(carbonForTree({ dbh: '10 cm' })).toBeNull();
    expect(carbonForTree({ merchantable_height: 9 })).toBeNull();
    expect(carbonForTree({ dbh: 'not measured', merchantable_height: 9 })).toBeNull();
    expect(carbonForTree({})).toBeNull();
  });
});

describe('dashboardMetrics totals', () => {
  it('counts trees, invasives and carbon together', () => {
    const rows = [
      tree({ id: '1', species: 'Narra', biodiversity_status: 'Endemic', dbh: '37 cm', merchantable_height: 9 }),
      tree({ id: '2', species: 'Mango', biodiversity_status: 'Invasive', dbh: '20 cm', merchantable_height: 5 }),
      // No merchantable height: counted as a tree, left out of the carbon.
      tree({ id: '3', species: 'Acacia', species_type: 'Invasive', dbh: '2 cm' }),
    ];

    const totals = summarise(rows);
    expect(totals.treeCount).toBe(3);
    expect(totals.invasiveCount).toBe(2);
    expect(totals.carbonMeasured).toBe(2);
    expect(totals.carbonKg).toBe(
      Math.round(carbonDioxideKg(rows[0]) + carbonDioxideKg(rows[1]))
    );
  });

  it('reads invasive from either column, and nothing else as invasive', () => {
    expect(isInvasive({ biodiversity_status: 'Invasive' })).toBe(true);
    expect(isInvasive({ species_type: 'invasive' })).toBe(true);
    expect(isInvasive({ species_type: 'Introduced' })).toBe(false);
    expect(isInvasive({})).toBe(false);
  });

  it('survives an empty or missing set', () => {
    const empty = {
      treeCount: 0,
      speciesCount: 0,
      endemicCount: 0,
      invasiveCount: 0,
      carbonKg: 0,
      carbonPerYearKg: 0,
      timberVolumeM3: 0,
      maiAgbMg: 0,
      carbonMeasured: 0,
    };
    expect(summarise([])).toEqual(empty);
    expect(summarise(undefined)).toEqual(empty);
  });
});

describe('dashboardMetrics grouping', () => {
  it('strips the Brgy. prefix so one place is one bar', () => {
    expect(barangayOf({ barangay: 'Brgy. Bubukal' })).toBe('Bubukal');
    expect(barangayOf({ barangay: 'Bubukal' })).toBe('Bubukal');
  });

  it('keeps the word Barangay where it is part of the name', () => {
    // Santa Cruz really has a Barangay I through Barangay V, and an earlier
    // version of this stripped them down to "I" and "V", which name nothing.
    expect(barangayOf({ barangay: 'Barangay V' })).toBe('Barangay V');
    expect(barangayOf({ barangay: 'V' })).toBe('Barangay V');
  });

  it('leaves out places the record cannot name', () => {
    // A bar labelled "Unknown Barangay" tells a reader nothing they can act on.
    expect(barangayOf({ barangay: 'Unknown Barangay' })).toBeNull();
    expect(barangayOf({ barangay: '' })).toBeNull();
    expect(barangayOf({})).toBeNull();

    const rows = groupBy(
      [tree({ id: '1', barangay: 'Bubukal' }), tree({ id: '2', barangay: 'Unknown Barangay' })],
      barangayOf
    );
    expect(rows.map((r) => r.name)).toEqual(['Bubukal']);
  });

  it('orders the bars by how much is in them', () => {
    const rows = groupBy(
      [
        tree({ id: '1', barangay: 'Pagsawitan' }),
        tree({ id: '2', barangay: 'Bubukal' }),
        tree({ id: '3', barangay: 'Bubukal' }),
      ],
      barangayOf
    );
    expect(rows.map((r) => [r.name, r.treeCount])).toEqual([
      ['Bubukal', 2],
      ['Pagsawitan', 1],
    ]);
  });
});

describe('dashboardMetrics definitions', () => {
  it('describes three pairs of two', () => {
    expect(METRIC_PAIRS).toHaveLength(3);
    for (const pair of METRIC_PAIRS) {
      expect(pair.metrics).toHaveLength(2);
    }
  });

  it('says which figures have a source today, and explains every one', () => {
    const available = ALL_METRICS.filter((m) => m.available).map((m) => m.key);
    // The six a public page leads with. Standing volume and mean annual
    // increment moved to FORESTRY_PAIR: inventory terms for the people who
    // report them, not a headline a resident is owed.
    expect(available.sort()).toEqual([
      'carbonKg',
      'carbonPerYearKg',
      'endemicCount',
      'invasiveCount',
      'speciesCount',
      'treeCount',
    ]);
    // There is no footnote any more, so the hint is the only explanation a
    // reader gets: every figure needs one.
    for (const metric of ALL_METRICS) {
      expect(metric.hint.length).toBeGreaterThan(0);
    }
  });

  it('spells out Mean Annual Increment of Above Ground Biomass', () => {
    const mai = FORESTRY_PAIR.metrics.find((m) => m.key === 'maiAgbMg');
    expect(mai.label).toBe('Mean Annual Increment of Above Ground Biomass');
  });

  it('can find the pair a figure belongs to', () => {
    expect(pairOfMetric('speciesCount').id).toBe('inventory');
    expect(pairOfMetric('invasiveCount').id).toBe('origin');
    expect(pairOfMetric('carbonPerYearKg').id).toBe('carbon');
    // Forestry is not one of the headline pairs any more.
    expect(pairOfMetric('maiAgbMg')).toBeUndefined();
    // Nor are the two still waiting on another system.
    expect(pairOfMetric('carbonEmissionKg')).toBeUndefined();
    expect(pairOfMetric('nonsense')).toBeUndefined();
  });

  it('shows an em dash where there is no number, and separators where there is', () => {
    expect(formatFigure(16274)).toBe('16,274');
    expect(formatFigure(0)).toBe('0');
    expect(formatFigure(null)).toBe('—');
    expect(formatFigure(undefined)).toBe('—');
  });
});

describe('the figures still waiting on another system', () => {
  it('keeps them out of the headline but does not forget them', () => {
    // The public looks for these, so they are shown — small, at the foot.
    // An empty figure should not hold a quarter of the page.
    expect(PENDING_METRICS.map((m) => m.key)).toEqual(['forestCoverHa', 'carbonEmissionKg']);
    for (const metric of PENDING_METRICS) {
      expect(metric.waitingOn.length).toBeGreaterThan(0);
      expect(ALL_METRICS.map((m) => m.key)).not.toContain(metric.key);
    }
  });
});

describe('a rate is not a stock', () => {
  it('counts what the trees hold and what they add as different figures', () => {
    const rows = [
      { species: 'Narra', dbh: '37 cm', merchantable_height: 9 },
      { species: 'Mango', dbh: '20 cm', merchantable_height: 5 },
    ];
    const totals = summarise(rows);

    // A year's uptake is a small fraction of the standing stock. If these ever
    // came out equal, the growth step would have been skipped.
    expect(totals.carbonPerYearKg).toBeGreaterThan(0);
    expect(totals.carbonPerYearKg).toBeLessThan(totals.carbonKg);
    expect(totals.timberVolumeM3).toBeGreaterThan(0);
    expect(totals.maiAgbMg).toBeGreaterThan(0);
  });

  it('leaves an unmeasured tree out of all four, not just the carbon', () => {
    const totals = summarise([
      { species: 'Narra', dbh: '37 cm', merchantable_height: 9 },
      { species: 'Acacia', dbh: '30 cm' },
    ]);

    expect(totals.treeCount).toBe(2);
    expect(totals.carbonMeasured).toBe(1);
  });
});
