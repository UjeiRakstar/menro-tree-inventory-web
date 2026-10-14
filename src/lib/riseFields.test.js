import { describe, it, expect } from 'vitest';
import {
  RISE_FIELDS,
  cleanExtraction,
  cleanMonths,
  emptyRiseForm,
  filledKeys,
  formFromProfile,
  profileFromForm,
} from './riseFields.js';

describe('cleanMonths', () => {
  it('keeps month numbers once each, in calendar order', () => {
    expect(cleanMonths([5, 3, '4', 3])).toEqual([3, 4, 5]);
  });

  it('drops what is not a month', () => {
    expect(cleanMonths([0, 13, 2.5, 'May', null, 12])).toEqual([12]);
    expect(cleanMonths('March')).toEqual([]);
  });
});

describe('cleanExtraction', () => {
  it('keeps only the fields the form has, each as the kind it expects', () => {
    const { species } = cleanExtraction({
      species: [
        {
          species: '  Narra ',
          scientific_name: 'Pterocarpus indicus',
          flowering_months: [3, 4, 13],
          uses: 42, // a number where text was asked for
          invented_field: 'should not survive',
        },
      ],
    });
    expect(species).toHaveLength(1);
    expect(species[0].species).toBe('Narra');
    expect(species[0].flowering_months).toEqual([3, 4]);
    expect(species[0].uses).toBe('');
    expect(species[0]).not.toHaveProperty('invented_field');
    expect(Object.keys(species[0]).sort()).toEqual(RISE_FIELDS.map((f) => f.key).sort());
  });

  it('copies the issue’s citation to each species that has none of its own', () => {
    const { species } = cleanExtraction({
      citation: 'RISE Vol. 21 No. 2 (2019)',
      species: [{ species: 'Narra' }, { species: 'Molave', rise_citation: 'RISE Vol. 3' }],
    });
    expect(species.map((s) => s.rise_citation)).toEqual(['RISE Vol. 21 No. 2 (2019)', 'RISE Vol. 3']);
  });

  it('drops a species with no name, and survives nothing at all', () => {
    expect(cleanExtraction({ species: [{ family: 'Fabaceae' }, null, 'Narra'] }).species).toEqual([]);
    expect(cleanExtraction(null)).toEqual({ citation: '', species: [] });
  });
});

describe('filledKeys', () => {
  it('names the fields that have something in them', () => {
    const form = { ...emptyRiseForm(), species: 'Narra', fruiting_months: [9] };
    expect(filledKeys(form)).toEqual(['species', 'fruiting_months']);
  });
});

describe('saving and loading', () => {
  it('saves blanks as null, so "not stated" stays empty', () => {
    const row = profileFromForm({ ...emptyRiseForm(), species: 'Narra', family: '  ' });
    expect(row.species).toBe('Narra');
    expect(row.family).toBeNull();
    expect(row.flowering_months).toBeNull();
    expect(row.autofilled).toBe(false);
  });

  it('marks a profile that came from the PDF reader', () => {
    expect(profileFromForm({ ...emptyRiseForm(), species: 'Narra' }, { autofilled: true }).autofilled).toBe(true);
  });

  it('reads a saved row back into the form', () => {
    const form = formFromProfile({ species: 'Narra', family: null, flowering_months: [4, 3] });
    expect(form.species).toBe('Narra');
    expect(form.family).toBe('');
    expect(form.flowering_months).toEqual([3, 4]);
  });
});
