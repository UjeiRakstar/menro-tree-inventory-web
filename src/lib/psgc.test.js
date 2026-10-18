import { describe, it, expect } from 'vitest';
import { barangayFacts, lguFacts, officialName, provinceFacts } from './psgc.js';
import { MUNICIPALITY_LIST } from './lagunaBoundaries.js';
import barangays from '../data/Laguna-Barangays.geojson';

describe('the PSGC, 3rd quarter 2026', () => {
  it('names every LGU as plans write it — never "City of Biñan City"', () => {
    const named = (name) => officialName(MUNICIPALITY_LIST.find((lgu) => lgu.name === name));
    expect(named('Biñan')).toBe('City of Biñan');
    expect(named('Santa Cruz')).toBe('Municipality of Santa Cruz');
    expect(named('Los Baños')).toBe('Municipality of Los Baños');
    expect(officialName(null)).toBe('Province of Laguna');
    // Without the PSGC row, the label's own "City" is not said twice.
    expect(officialName({ label: 'Nowhere City', isCity: true })).toBe('City of Nowhere');
  });

  it('has a row for every LGU and barangay the map draws, with its 2024 population', () => {
    for (const lgu of MUNICIPALITY_LIST) expect(lguFacts(lgu.psgc)?.population2024).toBeGreaterThan(0);
    for (const feature of barangays.features) {
      const facts = barangayFacts(feature.properties.barangay_psgc);
      expect(facts?.name).toBe(feature.properties.barangay);
      expect(typeof facts.urban).toBe('boolean');
    }
    expect(provinceFacts()).toMatchObject({ name: 'Laguna', population2024: 3687345 });
  });
});
