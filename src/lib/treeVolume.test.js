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
