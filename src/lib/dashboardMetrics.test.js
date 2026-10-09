import { describe, it, expect } from 'vitest';
import {
  ALL_METRICS,
  CARBON_PER_DBH_CM,
  METRIC_PAIRS,
  barangayOf,
  carbonForTree,
  formatFigure,
  groupBy,
  isInvasive,
  pairOfMetric,
  summarise,
} from './dashboardMetrics.js';

const tree = (over = {}) => ({ id: 't', dbh: '10 cm', barangay: 'Bubukal', ...over });

describe('dashboardMetrics carbon', () => {
  it('estimates carbon from the diameter at breast height', () => {
    expect(carbonForTree({ dbh: '10 cm' })).toBe(10 * CARBON_PER_DBH_CM);
    expect(carbonForTree({ dbh: 40 })).toBe(40 * CARBON_PER_DBH_CM);
  });

  it('prefers a measured carbon figure over the proxy', () => {
    expect(carbonForTree({ dbh: '10 cm', carbon: '999' })).toBe(999);
  });

  it('counts a tree with no usable diameter as nothing, not as a guess', () => {
    expect(carbonForTree({ dbh: null })).toBe(0);
    expect(carbonForTree({ dbh: '0 cm' })).toBe(0);
    expect(carbonForTree({ dbh: 'not measured' })).toBe(0);
    expect(carbonForTree({})).toBe(0);
  });
});

describe('dashboardMetrics totals', () => {
  it('counts trees, invasives and carbon together', () => {
    const rows = [
      tree({ id: '1', biodiversity_status: 'Endemic', dbh: '10 cm' }),
      tree({ id: '2', biodiversity_status: 'Invasive', dbh: '20 cm' }),
      tree({ id: '3', species_type: 'Invasive', dbh: '2 cm' }),
    ];

    expect(summarise(rows)).toEqual({ treeCount: 3, invasiveCount: 2, carbonKg: 80 });
  });

  it('reads invasive from either column, and nothing else as invasive', () => {
    expect(isInvasive({ biodiversity_status: 'Invasive' })).toBe(true);
    expect(isInvasive({ species_type: 'invasive' })).toBe(true);
    expect(isInvasive({ species_type: 'Introduced' })).toBe(false);
    expect(isInvasive({})).toBe(false);
  });

  it('survives an empty or missing set', () => {
    expect(summarise([])).toEqual({ treeCount: 0, invasiveCount: 0, carbonKg: 0 });
    expect(summarise(undefined)).toEqual({ treeCount: 0, invasiveCount: 0, carbonKg: 0 });
  });
});

describe('dashboardMetrics grouping', () => {
  it('strips the Brgy. prefix so one place is one bar', () => {
    expect(barangayOf({ barangay: 'Brgy. Bubukal' })).toBe('Bubukal');
    expect(barangayOf({ barangay: 'Barangay V' })).toBe('V');
    expect(barangayOf({ barangay: 'Bubukal' })).toBe('Bubukal');
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

  it('says which figures have a source today, and cites every one', () => {
    const available = ALL_METRICS.filter((m) => m.available).map((m) => m.key);
    // Everything else is waiting on the mapping feature or the emissions feed.
    expect(available.sort()).toEqual(['carbonKg', 'invasiveCount', 'treeCount']);
    for (const metric of ALL_METRICS) {
      expect(metric.source.length).toBeGreaterThan(0);
    }
  });

  it('can find the pair a figure belongs to', () => {
    expect(pairOfMetric('invasiveCount').id).toBe('trees');
    expect(pairOfMetric('carbonEmissionKg').id).toBe('carbon');
    expect(pairOfMetric('nonsense')).toBeUndefined();
  });

  it('shows an em dash where there is no number, and separators where there is', () => {
    expect(formatFigure(16274)).toBe('16,274');
    expect(formatFigure(0)).toBe('0');
    expect(formatFigure(null)).toBe('—');
    expect(formatFigure(undefined)).toBe('—');
  });
});
