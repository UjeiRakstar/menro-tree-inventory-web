import {
  countBySpeciesType,
  countByTreeCategory,
  parseDbh,
  computeCarbon,
  groupByBarangay,
  computePercentage,
} from './analyticsEngine.js';

const baseTree = {
  id: 'row-1',
  tree_id: 'T-1',
  latitude: 14.5995,
  longitude: 120.9842,
  dbh: '25',
  species: 'Narra',
  scientific_name: 'Pterocarpus indicus',
  species_type: 'Endemic',
  is_leaning: false,
  has_powerline_conflict: false,
  is_decayed: false,
  is_root_problem: false,
  dateCaptured: '2024-01-01T00:00:00.000Z',
  assigned_to: null,
  has_cutting_permit: false,
  task_status: 'Pending',
  photo_url: null,
};

describe('countBySpeciesType', () => {
  it('returns zero counts for an empty array', () => {
    expect(countBySpeciesType([])).toEqual({ Endemic: 0, Invasive: 0 });
  });

  it('counts Endemic and Invasive trees correctly', () => {
    const trees = [
      { ...baseTree, species_type: 'Endemic' },
      { ...baseTree, species_type: 'Invasive' },
      { ...baseTree, species_type: 'Endemic' },
    ];
    expect(countBySpeciesType(trees)).toEqual({ Endemic: 2, Invasive: 1 });
  });

  it('counts non-Endemic trees as Invasive', () => {
    const trees = [
      { ...baseTree, species_type: 'Invasive' },
      { ...baseTree, species_type: 'Invasive' },
    ];
    expect(countBySpeciesType(trees)).toEqual({ Endemic: 0, Invasive: 2 });
  });
});

describe('countByTreeCategory', () => {
  it('returns zero counts for an empty array', () => {
    expect(countByTreeCategory([])).toEqual({
      Fruit: 0,
      Timber: 0,
      Ornamental: 0,
      Other: 0,
    });
  });

  it('counts recognized categories correctly', () => {
    const trees = [
      { ...baseTree, tree_category: 'Fruit' },
      { ...baseTree, tree_category: 'Timber' },
      { ...baseTree, tree_category: 'Ornamental' },
      { ...baseTree, tree_category: 'Fruit' },
    ];
    expect(countByTreeCategory(trees)).toEqual({
      Fruit: 2,
      Timber: 1,
      Ornamental: 1,
      Other: 0,
    });
  });

  it('counts undefined/null/unrecognized categories as Other', () => {
    const trees = [
      { ...baseTree, tree_category: undefined },
      { ...baseTree, tree_category: null },
      { ...baseTree, tree_category: 'Medicinal' },
    ];
    expect(countByTreeCategory(trees)).toEqual({
      Fruit: 0,
      Timber: 0,
      Ornamental: 0,
      Other: 3,
    });
  });
});

describe('parseDbh', () => {
  it('parses a valid numeric string', () => {
    expect(parseDbh('25.5')).toBe(25.5);
  });

  it('returns 0 for non-numeric string', () => {
    expect(parseDbh('abc')).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(parseDbh(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(parseDbh(undefined)).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseDbh('')).toBe(0);
  });
});

describe('computeCarbon', () => {
  it('returns dbhFloat * 1.5', () => {
    expect(computeCarbon(10)).toBe(15);
  });

  it('returns 0 for 0 input', () => {
    expect(computeCarbon(0)).toBe(0);
  });

  it('handles decimal values', () => {
    expect(computeCarbon(3.2)).toBeCloseTo(4.8);
  });
});

describe('groupByBarangay', () => {
  it('returns empty array for empty input', () => {
    expect(groupByBarangay([])).toEqual([]);
  });

  it('groups records by barangay with correct carbon totals', () => {
    const trees = [
      { ...baseTree, barangay: 'Brgy A', dbh: '10', species: 'Narra' },
      { ...baseTree, barangay: 'Brgy A', dbh: '20', species: 'Molave' },
      { ...baseTree, barangay: 'Brgy B', dbh: '30', species: 'Acacia' },
    ];
    const result = groupByBarangay(trees);
    expect(result).toHaveLength(2);

    const brgyA = result.find((g) => g.barangay === 'Brgy A');
    expect(brgyA.totalCarbon).toBe(10 * 1.5 + 20 * 1.5);
    expect(brgyA.records).toHaveLength(2);

    const brgyB = result.find((g) => g.barangay === 'Brgy B');
    expect(brgyB.totalCarbon).toBe(30 * 1.5);
    expect(brgyB.records).toHaveLength(1);
  });

  it('groups null/undefined barangay under Unknown', () => {
    const trees = [
      { ...baseTree, barangay: null, dbh: '5', species: 'Narra' },
      { ...baseTree, barangay: undefined, dbh: '10', species: 'Molave' },
    ];
    const result = groupByBarangay(trees);
    expect(result).toHaveLength(1);
    expect(result[0].barangay).toBe('Unknown');
    expect(result[0].records).toHaveLength(2);
    expect(result[0].totalCarbon).toBe(5 * 1.5 + 10 * 1.5);
  });
});

describe('computePercentage', () => {
  it('returns correct percentage', () => {
    expect(computePercentage(25, 100)).toBe(25);
  });

  it('returns 0 when total is 0', () => {
    expect(computePercentage(5, 0)).toBe(0);
  });

  it('handles fractional percentages', () => {
    expect(computePercentage(1, 3)).toBeCloseTo(33.333);
  });
});
