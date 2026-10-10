import { describe, it, expect } from 'vitest';
import {
  barangayLabel,
  canonicalBarangay,
  isBarangayOf,
  isOfficialBarangay,
} from './barangayNames.js';

describe('canonicalBarangay', () => {
  it('drops the Brgy. abbreviation, which is never part of a real name', () => {
    expect(canonicalBarangay('Brgy. Bubukal')).toBe('Bubukal');
    expect(canonicalBarangay('brgy Bubukal')).toBe('Bubukal');
    expect(canonicalBarangay('Bubukal')).toBe('Bubukal');
  });

  it('keeps the word Barangay where it is part of the name', () => {
    // Santa Cruz really does have a Barangay I through Barangay V.
    expect(canonicalBarangay('Barangay V')).toBe('Barangay V');
    expect(canonicalBarangay('Barangay Uno')).toBe('Barangay Uno');
    expect(canonicalBarangay('Barangay Zone I')).toBe('Barangay Zone I');
    expect(canonicalBarangay('Barangay I-A')).toBe('Barangay I-A');
  });

  it('rescues the names an earlier normalisation stripped bare', () => {
    // These are what was left in the database by a regular expression that did
    // not know the word was part of the name.
    expect(canonicalBarangay('V')).toBe('Barangay V');
    expect(canonicalBarangay('I')).toBe('Barangay I');
    expect(canonicalBarangay('III')).toBe('Barangay III');
    expect(canonicalBarangay('Uno')).toBe('Barangay Uno');
    expect(canonicalBarangay('Zone I')).toBe('Barangay Zone I');
    // And the abbreviation in front of one of them lands in the same place.
    expect(canonicalBarangay('Brgy. V')).toBe('Barangay V');
  });

  it('corrects the casing to how the PSA writes it', () => {
    expect(canonicalBarangay('bubukal')).toBe('Bubukal');
    expect(canonicalBarangay('SANTO ANGEL NORTE')).toBe('Santo Angel Norte');
    expect(canonicalBarangay('barangay v')).toBe('Barangay V');
  });

  it('tidies spacing without changing the name', () => {
    expect(canonicalBarangay('  Brgy.   San   Jose ')).toBe('San Jose');
  });

  it('leaves a name it does not recognise exactly as written', () => {
    // A subdivision is not a barangay, but it is what the field team wrote and
    // inventing a barangay for it would be worse than showing it.
    expect(canonicalBarangay('Villa Silangan Subdivision')).toBe('Villa Silangan Subdivision');
    expect(canonicalBarangay('Dolor Subdivision')).toBe('Dolor Subdivision');
  });

  it('says nothing rather than something, where the record says nothing', () => {
    expect(canonicalBarangay('Unknown Barangay')).toBeNull();
    expect(canonicalBarangay('unknown')).toBeNull();
    expect(canonicalBarangay('')).toBeNull();
    expect(canonicalBarangay('   ')).toBeNull();
    expect(canonicalBarangay(null)).toBeNull();
    expect(canonicalBarangay(undefined)).toBeNull();
  });
});

describe('isOfficialBarangay', () => {
  it('knows a real barangay from something else written in the box', () => {
    expect(isOfficialBarangay('Bubukal')).toBe(true);
    expect(isOfficialBarangay('Barangay V')).toBe(true);
    expect(isOfficialBarangay('bubukal')).toBe(true);
    expect(isOfficialBarangay('Villa Silangan Subdivision')).toBe(false);
    expect(isOfficialBarangay('V')).toBe(false);
    expect(isOfficialBarangay('')).toBe(false);
  });
});

describe('isBarangayOf', () => {
  it('checks the barangay belongs to that city or municipality', () => {
    expect(isBarangayOf('Bubukal', 'Santa Cruz')).toBe(true);
    expect(isBarangayOf('Barangay V', 'Santa Cruz')).toBe(true);
    // Pila has no Bubukal.
    expect(isBarangayOf('Bubukal', 'Pila')).toBe(false);
    expect(isBarangayOf('Bubukal', 'Nowhere')).toBe(false);
  });
});

describe('barangayLabel', () => {
  it('says Brgy. once, and never twice', () => {
    expect(barangayLabel('Bubukal')).toBe('Brgy. Bubukal');
    expect(barangayLabel('Brgy. Bubukal')).toBe('Brgy. Bubukal');
    expect(barangayLabel('Barangay V')).toBe('Barangay V');
    expect(barangayLabel('V')).toBe('Barangay V');
    expect(barangayLabel('Unknown Barangay')).toBe('');
  });
});
