import { describe, it, expect } from 'vitest';
import {
  BIOMASS_EXPANSION_FACTOR,
  CARBON_FRACTION,
  CO2_PER_CARBON,
  VOLUME_COEFFICIENT,
  WOOD_DENSITY,
  biomassKg,
  carbonDioxideKg,
  dbhCm,
  isDipterocarp,
  measuredCoverage,
  merchantableHeightM,
  volumeOf,
  diameterClassOf,
  diameterClassRange,
  diameterDistribution,
  readDiameterShape,
} from './treeVolume.js';

describe('the DENR volume equation', () => {
  it('reproduces the worked examples in the bulletin', () => {
    // FMB Technical Bulletin No. 3, page 6. The examples are from other
    // regions, so they are recomputed here with those regions' coefficients to
    // check the shape of the equation — V = c × D² × H.
    //   Isabela, Region 2, Amugis, non-dipterocarp, DBH 41, MH 10 → 0.859 m³
    expect(0.00005109 * 41 * 41 * 10).toBeCloseTo(0.859, 3);
    //   Catanduanes, Region 5, Apitong, dipterocarp, DBH 37, MH 9 → 0.637 m³
    expect(0.00005171 * 37 * 37 * 9).toBeCloseTo(0.637, 3);
    //   Surigao del Sur, Region 13, Toog, non-dipterocarp, DBH 78, MH 17
    expect(0.00004961 * 78 * 78 * 17).toBeCloseTo(5.131, 3);
  });

  it('uses the Southern Luzon coefficients, because Laguna is Region IV-A', () => {
    expect(VOLUME_COEFFICIENT.dipterocarp).toBe(0.00005171);
    expect(VOLUME_COEFFICIENT.nonDipterocarp).toBe(0.00005204);
  });

  it('computes a volume from a diameter and a merchantable height', () => {
    // A non-dipterocarp, the same shape as the Catanduanes example.
    const tree = { species: 'Narra', dbh: '37 cm', merchantable_height: 9 };
    expect(volumeOf(tree)).toBeCloseTo(0.00005204 * 37 * 37 * 9, 6);
  });

  it('puts a dipterocarp in the dipterocarp column', () => {
    const apitong = { species: 'Apitong', dbh: 37, merchantable_height: 9 };
    const narra = { species: 'Narra', dbh: 37, merchantable_height: 9 };
    expect(volumeOf(apitong)).toBeCloseTo(0.00005171 * 37 * 37 * 9, 8);
    expect(volumeOf(narra)).toBeCloseTo(0.00005204 * 37 * 37 * 9, 8);
    expect(volumeOf(apitong)).not.toBe(volumeOf(narra));
  });
});

describe('isDipterocarp', () => {
  it('knows the lauans and their kin', () => {
    expect(isDipterocarp('Apitong')).toBe(true);
    expect(isDipterocarp('Red Lauan')).toBe(true);
    expect(isDipterocarp('white lauan')).toBe(true);
    expect(isDipterocarp('Yakal')).toBe(true);
    expect(isDipterocarp('Bagtikan')).toBe(true);
  });

  it('does not mistake the rest of the inventory for one', () => {
    for (const species of ['Narra', 'Mahogany', 'Mango', 'Acacia', 'Talisay', '']) {
      expect(isDipterocarp(species)).toBe(false);
    }
    expect(isDipterocarp(null)).toBe(false);
  });
});

describe('the measurements the equation needs', () => {
  it('rounds the diameter DOWN, as the bulletin says to', () => {
    // "DBH is adjusted in a decreasing sense (e.g. 24.5cm is recorded as
    // 24cm DBH)" — page 2. Rounding to nearest would overstate the volume.
    expect(dbhCm({ dbh: 24.5 })).toBe(24);
    expect(dbhCm({ dbh: '24.9 cm' })).toBe(24);
    expect(dbhCm({ dbh: 24 })).toBe(24);
  });

  it('records the merchantable height to the nearest metre', () => {
    expect(merchantableHeightM({ merchantable_height: 9.4 })).toBe(9);
    expect(merchantableHeightM({ merchantable_height: '9.6' })).toBe(10);
    expect(merchantableHeightM({ merchantableHeight: 9 })).toBe(9);
  });

  it('refuses a height too short to be a merchantable bole', () => {
    // A real record: a 17 cm Mahogany carrying 0.61. The bole is measured from
    // a stump about 0.5 m up, so 0.61 would be a trunk shorter than the stump
    // it starts from. Rounding it to 1 would quietly turn it into a volume.
    expect(merchantableHeightM({ merchantable_height: 0.61 })).toBeNull();
    expect(volumeOf({ species: 'Mahogany', dbh: '17 cm', merchantable_height: 0.61 })).toBeNull();
    // A metre is the shortest thing the bulletin can be recording.
    expect(merchantableHeightM({ merchantable_height: 1 })).toBe(1);
  });

  it('refuses a measurement that is not one', () => {
    expect(dbhCm({ dbh: 'not measured' })).toBeNull();
    expect(dbhCm({ dbh: 0 })).toBeNull();
    expect(dbhCm({})).toBeNull();
    expect(merchantableHeightM({ merchantable_height: null })).toBeNull();
  });

  it('will not stand in total height for merchantable height', () => {
    // Total height includes the crown. Feeding it to a bole-volume equation
    // overstates every tree, so a tree with only a total height has no volume.
    expect(volumeOf({ species: 'Narra', dbh: 37, total_height: 20 })).toBeNull();
  });
});

describe('an unmeasured tree', () => {
  it('has no volume rather than a volume of zero', () => {
    // Zero would be added into a total as if the tree were measured and found
    // to contain nothing. Null says the figure is unknown.
    expect(volumeOf({ species: 'Narra', dbh: 37 })).toBeNull();
    expect(volumeOf({ species: 'Narra', merchantable_height: 9 })).toBeNull();
    expect(biomassKg({ dbh: 37 })).toBeNull();
    expect(carbonDioxideKg({ dbh: 37 })).toBeNull();
  });
});

describe('carbon', () => {
  const tree = { species: 'Narra', dbh: 37, merchantable_height: 9 };

  it('follows volume → biomass → carbon → carbon dioxide', () => {
    const volume = volumeOf(tree);
    expect(biomassKg(tree)).toBeCloseTo(volume * WOOD_DENSITY * 1000 * BIOMASS_EXPANSION_FACTOR, 6);
    expect(carbonDioxideKg(tree)).toBeCloseTo(
      biomassKg(tree) * CARBON_FRACTION * CO2_PER_CARBON,
      6
    );
  });

  it('keeps the settled constants settled', () => {
    expect(CARBON_FRACTION).toBe(0.47);
    expect(CO2_PER_CARBON).toBeCloseTo(3.6667, 4);
  });
});

describe('measuredCoverage', () => {
  it('says how much of the inventory the figure speaks for', () => {
    const trees = [
      { species: 'Narra', dbh: 37, merchantable_height: 9 },
      { species: 'Mango', dbh: 20, merchantable_height: 5 },
      { species: 'Acacia', dbh: 30 },
      { species: 'Mahogany' },
    ];
    expect(measuredCoverage(trees)).toEqual({ measured: 2, total: 4 });
  });

  it('survives an empty or missing set', () => {
    expect(measuredCoverage([])).toEqual({ measured: 0, total: 0 });
    expect(measuredCoverage(undefined)).toEqual({ measured: 0, total: 0 });
  });
});

describe('diameter classes', () => {
  const at = (dbh) => diameterClassOf({ dbh });

  it('bands diameters the way the bulletin does', () => {
    // Page 7: class 10 is 5–14, class 20 is 15–24, class 30 is 25–34.
    expect(at(5)).toBe(10);
    expect(at(14)).toBe(10);
    expect(at(15)).toBe(20);
    expect(at(24)).toBe(20);
    expect(at(25)).toBe(30);
    expect(at(34)).toBe(30);
    expect(at(115)).toBe(120);
    expect(at(124)).toBe(120);
  });

  it('keeps going past the end of the printed table', () => {
    // The table stops at 120; the bulletin says the classes continue in tens.
    expect(at(125)).toBe(130);
    expect(at(210)).toBe(210);
  });

  it('names the band a class covers', () => {
    expect(diameterClassRange(10)).toBe('5 to 14 cm');
    expect(diameterClassRange(30)).toBe('25 to 34 cm');
  });

  it('has no class for a tree below the smallest one', () => {
    // Under 5 cm is a seedling, which the bulletin does not inventory.
    expect(at(4)).toBeNull();
    expect(at(0)).toBeNull();
    expect(at(null)).toBeNull();
  });

  it('uses the floored diameter, as the bulletin records it', () => {
    // 14.9 is recorded as 14, which is class 10 — not 15, which would be 20.
    expect(at(14.9)).toBe(10);
  });
});

describe('diameterDistribution', () => {
  const tree = (dbh) => ({ dbh });
  const many = (n, dbh) => Array.from({ length: n }, () => tree(dbh));

  it('counts the trees in each class', () => {
    const result = diameterDistribution([...many(3, 10), ...many(2, 20), tree(31)]);

    expect(result.classes.map((c) => [c.class, c.count])).toEqual([
      [10, 3],
      [20, 2],
      [30, 1],
    ]);
    expect(result.measured).toBe(6);
    expect(result.classes[0].share).toBeCloseTo(0.5, 5);
  });

  it('keeps an empty class in the middle, because the gap is the finding', () => {
    // Nothing between 15 and 24 cm means a cohort never planted, or lost.
    const result = diameterDistribution([...many(2, 10), ...many(2, 30)]);

    expect(result.classes.map((c) => [c.class, c.count])).toEqual([
      [10, 2],
      [20, 0],
      [30, 2],
    ]);
  });

  it('tells a seedling from a tree nobody measured', () => {
    const result = diameterDistribution([tree(10), tree(3), tree(null), {}]);

    expect(result.belowSmallest).toBe(1);
    expect(result.unmeasured).toBe(2);
    expect(result.measured).toBe(1);
    expect(result.total).toBe(4);
  });

  it('survives an empty or missing set', () => {
    expect(diameterDistribution([]).classes).toEqual([]);
    expect(diameterDistribution(undefined).total).toBe(0);
  });
});

describe('readDiameterShape', () => {
  const sized = (n, dbh) => Array.from({ length: n }, () => ({ dbh }));

  it('calls a stand of small trees young', () => {
    const shape = readDiameterShape(diameterDistribution([...sized(8, 12), ...sized(2, 40)]));
    expect(shape.key).toBe('young');
    expect(shape.headline).toBe('Mostly young trees');
  });

  it('calls a stand of big trees mature', () => {
    const shape = readDiameterShape(diameterDistribution([...sized(6, 70), ...sized(4, 20)]));
    expect(shape.key).toBe('mature');
  });

  it('calls a spread a mix', () => {
    const shape = readDiameterShape(
      diameterDistribution([...sized(3, 12), ...sized(3, 30), ...sized(2, 45), ...sized(2, 60)])
    );
    expect(shape.key).toBe('mixed');
  });

  it('says nothing about a set nobody measured', () => {
    expect(readDiameterShape(diameterDistribution([{}, {}]))).toBeNull();
  });
});
