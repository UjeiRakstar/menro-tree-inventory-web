import { describe, it, expect } from 'vitest';
import { looksLikeAPerson, personalByName, personalFields, withoutPersonalData } from './privacyFields.js';

// As an assessor's tax map has them (Kalayaan's protection forest file, names changed).
const parcel = (properties) => ({ type: 'Feature', geometry: null, properties });
const TAX_MAP = {
  type: 'FeatureCollection',
  features: [
    parcel({ ID: 1, BRGY: 'SAN JUAN', PIN: '023-09-0001-036-04', OWNER: 'JUAN DELA CRUZ M/TO MARIA SANTOS', ADDRESS: 'SAN JUAN, KALAYAAN, LAGUNA',
      LOT_NO: '2113', TITLE: 'T-529', TAXDEC: '09-0001-03008', KINDLAND: 'AGRICULTURAL', IMPROVEMEN: 'SECANO, COFFEE', CLASSIFICA: 'PROTECTION FOREST' }),
    parcel({ ID: 2, BRGY: 'SAN ANTONIO', PIN: '023-09-0003-014-03', OWNER: 'PEDRO & ROSA REYES', ADDRESS: 'PAETE, LAGUNA',
      LOT_NO: '4154', TITLE: '', TAXDEC: '09-0003-00272', KINDLAND: 'RESIDENTIAL, COCAL', IMPROVEMEN: '40 COCOS', CLASSIFICA: 'RESIDENTIAL' }),
  ],
};

describe('personal data in a map file', () => {
  it('drops owners, addresses, titles, tax declarations and lot numbers by what the field is called', () => {
    expect(personalFields(TAX_MAP).map((entry) => entry.field)).toEqual(['PIN', 'OWNER', 'ADDRESS', 'LOT_NO', 'TITLE', 'TAXDEC']);
    expect(personalByName('Owner_Name')).toMatch(/name/);
    expect(personalByName('CONTACT_NO')).toMatch(/contact/);
    expect(personalByName('CLASSIFICA')).toBe('');
  });

  it('keeps what the land is, even where a comma makes it look like "SURNAME, FIRSTNAME"', () => {
    const { collection } = withoutPersonalData(TAX_MAP);
    expect(Object.keys(collection.features[0].properties)).toEqual(['ID', 'BRGY', 'KINDLAND', 'IMPROVEMEN', 'CLASSIFICA']);
    expect(looksLikeAPerson('SECANO, COFFEE')).toBe(false);
    expect(looksLikeAPerson('RESIDENTIAL, COCAL')).toBe(false);
    expect(looksLikeAPerson('PROTECTION FOREST')).toBe(false);
  });

  it('drops a field of people’s names whatever it is called', () => {
    const renamed = {
      type: 'FeatureCollection',
      features: ['DELA CRUZ, JUAN', 'HEIRS OF PEDRO REYES', 'SPS. ANA AND JOSE SANTOS', 'Riverbank'].map((Name, i) => parcel({ Name, ID: i })),
    };
    expect(personalFields(renamed)).toEqual([{ field: 'Name', reason: expect.stringMatching(/people’s names \(3\)/) }]);
  });

  it('leaves a file without personal data as it is', () => {
    const sites = { type: 'FeatureCollection', features: [parcel({ Name: 'Alipit Riverbank', AREA: 1.2 })] };
    expect(withoutPersonalData(sites)).toEqual({ collection: sites, dropped: [] });
  });
});
