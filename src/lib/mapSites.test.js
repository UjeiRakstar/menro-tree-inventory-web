import { describe, it, expect } from 'vitest';
import barangayData from '../data/Laguna-Barangays.geojson';
import { centroidOf } from './areaGeometry.js';
import { landCoverById } from './landCover.js';
import {
  MAP_SITES,
  hazardAreaM2,
  hazardShare,
  landCoverSites,
  placeLine,
  plantingSites,
  seedlingCapacity,
  siteAreaHa,
  siteAreaM2,
  siteById,
  siteTitle,
  statusOf,
} from './mapSites.js';

const ringsOf = (geometry) =>
  geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();

/** Ray casting, the same as src/lib/lagunaBoundaries.js does it. */
function ringContains(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const barangayNamed = (barangay, municipality) =>
  barangayData.features.find(
    (f) => f.properties.barangay === barangay && f.properties.municipality === municipality
  );

describe('the sample areas', () => {
  it('holds both kinds, and only those two', () => {
    expect(landCoverSites().length).toBeGreaterThan(0);
    expect(plantingSites().length).toBeGreaterThan(0);
    expect(landCoverSites().length + plantingSites().length).toBe(MAP_SITES.features.length);
  });

  it('gives every area an id of its own', () => {
    const ids = MAP_SITES.features.map((f) => f.properties.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(siteById(ids[0])).toBeTruthy();
    expect(siteById('nothing')).toBeNull();
  });

  /**
   * The figures attached to these polygons are invented and the panel says so.
   * Where they SIT is not invented, and this is what keeps it that way: a
   * placeholder that quietly drifts into the next barangay would put a soil
   * series and a flood figure against the wrong people's land.
   */
  it('draws every area inside the barangay it claims to be in', () => {
    for (const feature of MAP_SITES.features) {
      const { barangay, municipality, id } = feature.properties;
      const boundary = barangayNamed(barangay, municipality);
      expect(boundary, `${id} names a barangay that does not exist`).toBeTruthy();

      const rings = ringsOf(boundary.geometry);
      for (const [lng, lat] of ringsOf(feature.geometry)[0]) {
        expect(
          rings.some((ring) => ringContains(ring, lng, lat)),
          `${id} has a corner outside Brgy. ${barangay}`
        ).toBe(true);
      }
    }
  });

  it('names a land cover the table actually has', () => {
    for (const feature of landCoverSites()) {
      const cover = landCoverById(feature.properties.coverId);
      expect(cover, `${feature.properties.id} names an unknown land cover`).toBeTruthy();
      // Only the four common in Laguna are shown to the public.
      expect(cover.publicVisible).toBe(true);
    }
  });

  it('sits in Laguna, at a plausible size', () => {
    for (const feature of MAP_SITES.features) {
      const [lat, lng] = centroidOf(feature.geometry);
      expect(lat).toBeGreaterThan(14);
      expect(lat).toBeLessThan(14.6);
      expect(lng).toBeGreaterThan(121);
      expect(lng).toBeLessThan(121.9);
      // Between a basketball court and a barangay.
      expect(siteAreaHa(feature)).toBeGreaterThan(0.5);
      expect(siteAreaHa(feature)).toBeLessThan(50);
    }
  });
});

describe('siteTitle', () => {
  it('supplies "Tree Planting Site" whoever named the record', () => {
    expect(siteTitle(siteById('ps-labuin'))).toBe('Labuin Tree Planting Site');
  });

  it('does not say it twice', () => {
    const feature = { properties: { kind: 'planting-site', name: 'Labuin Tree Planting Site' } };
    expect(siteTitle(feature)).toBe('Labuin Tree Planting Site');
  });

  it('leaves a land cover name alone', () => {
    expect(siteTitle(siteById('lc-labuin-secondary-forest'))).toBe('Labuin Secondary Forest');
  });
});

describe('placeLine', () => {
  it('reads barangay, municipality, province', () => {
    expect(placeLine(siteById('ps-labuin'))).toBe('Brgy. Labuin, Santa Cruz, Laguna');
  });

  it('leaves out what is missing rather than printing a gap', () => {
    expect(placeLine({ properties: { municipality: 'Santa Cruz', province: 'Laguna' } })).toBe(
      'Santa Cruz, Laguna'
    );
  });
});

describe('area and hazards', () => {
  it('measures the area from the polygon, not from a stored field', () => {
    const feature = siteById('lc-labuin-secondary-forest');
    expect(feature.properties.areaM2).toBeUndefined();
    expect(siteAreaM2(feature)).toBeGreaterThan(0);
  });

  it('turns a share of the area into square metres', () => {
    const feature = siteById('lc-labuin-secondary-forest');
    const share = feature.properties.hazards.flood.share;
    expect(hazardAreaM2(feature, 'flood')).toBeCloseTo(siteAreaM2(feature) * share, 3);
    expect(hazardShare(feature, 'flood')).toBeCloseTo(share, 6);
  });

  it('reads an absolute figure when the real layer supplies one', () => {
    // A share keeps a placeholder consistent with the polygon above it; the
    // UPRI NOAH layer, once cut, will hand over square metres outright.
    const feature = {
      geometry: siteById('lc-labuin-secondary-forest').geometry,
      properties: { hazards: { landslide: { areaM2: 800 } } },
    };
    expect(hazardAreaM2(feature, 'landslide')).toBe(800);
  });

  it('tells "none here" apart from "nobody looked"', () => {
    const feature = { properties: { hazards: { flood: { share: 0 } } }, geometry: null };
    expect(hazardAreaM2(feature, 'flood')).toBe(0);
    expect(hazardAreaM2(feature, 'landslide')).toBeNull();
    expect(hazardAreaM2({ properties: {} }, 'flood')).toBeNull();
  });
});

describe('seedlingCapacity', () => {
  it('turns an area into something a barangay can plan around', () => {
    // A 3 m lattice is one seedling for every 9 m².
    expect(seedlingCapacity(90000, 3)).toBe(10000);
    expect(seedlingCapacity(4500, 3)).toBe(500);
  });

  it('rounds down, so nobody reads it as an order', () => {
    expect(seedlingCapacity(9999, 3)).toBeLessThanOrEqual(9999 / 9);
    expect(seedlingCapacity(901, 3)).toBe(100);
  });

  it('declines nonsense rather than dividing by zero', () => {
    expect(seedlingCapacity(9000, 0)).toBeNull();
    expect(seedlingCapacity(0, 3)).toBeNull();
    expect(seedlingCapacity(9000, undefined)).toBeNull();
  });
});

describe('statusOf', () => {
  it('reads the status, and assumes open when none is set', () => {
    expect(statusOf(siteById('ps-labuin')).label).toBe('Open for planting');
    expect(statusOf({ properties: { status: 'maintenance' } }).label).toContain('maintenance');
    expect(statusOf({ properties: {} }).label).toBe('Open for planting');
  });
});

describe('planting sites carry what someone needs to act', () => {
  it('says who set them, when to plant, and what to plant', () => {
    for (const feature of plantingSites()) {
      const props = feature.properties;
      expect(props.verifiedBy).toBe('PGENRO Forestry Division');
      expect(props.plantingWindow.length).toBeGreaterThan(0);
      expect(props.contact.length).toBeGreaterThan(0);
      expect(props.recommended.length).toBeGreaterThan(0);
      for (const tree of props.recommended) {
        // A common name alone names different trees in different provinces.
        expect(tree.scientific.length).toBeGreaterThan(0);
        expect(tree.why.length).toBeGreaterThan(0);
      }
    }
  });
});
