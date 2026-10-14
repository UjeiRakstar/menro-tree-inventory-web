import { describe, it, expect } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_REASONS,
  codeProblem,
  formatCode,
  normalizeCode,
} from './accountCodes.js';

describe('normalizeCode', () => {
  it('forgives everything that does not change which code it is', () => {
    // The database hashes the normalised form, so every way of typing one
    // code has to come out the same.
    for (const typed of ['SCZ-7K2P-9QXM', 'scz-7k2p-9qxm', 'scz 7k2p 9qxm', ' SCZ7K2P9QXM ', 'SCZ.7K2P.9QXM']) {
      expect(normalizeCode(typed)).toBe('SCZ7K2P9QXM');
    }
  });

  it('survives nothing at all', () => {
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('formatCode', () => {
  it('lays a code out the way it was issued, as far as it has been typed', () => {
    expect(formatCode('s')).toBe('S');
    expect(formatCode('scz')).toBe('SCZ');
    expect(formatCode('scz7k')).toBe('SCZ-7K');
    expect(formatCode('scz7k2p9')).toBe('SCZ-7K2P-9');
    expect(formatCode('scz7k2p9qxm')).toBe('SCZ-7K2P-9QXM');
  });

  it('stops at the length of a code', () => {
    expect(formatCode('scz7k2p9qxmEXTRA')).toBe('SCZ-7K2P-9QXM');
  });
});

describe('codeProblem', () => {
  it('passes a well-formed code', () => {
    expect(codeProblem('SCZ-7K2P-9QXM')).toBeNull();
    expect(codeProblem('scz 7k2p 9qxm')).toBeNull();
  });

  it('asks for a code when there is none', () => {
    expect(codeProblem('')).toMatch(/Enter the code/);
  });

  it('catches a confusable character before the database sees it', () => {
    // 0/O and 1/I/L are left out of codes precisely because they are misread.
    // Typing one is always a mistake, and saying which saves a round trip.
    expect(codeProblem('SCZ-7K2P-9QX0')).toMatch(/"0" is a misread/);
    expect(codeProblem('SCZ-7K2P-9QXO')).toMatch(/"O" is a misread/);
    expect(codeProblem('SCZ-1K2P-9QXM')).toMatch(/"1" is a misread/);
  });

  it('does not treat the LGU prefix as confusable', () => {
    // Prefixes are LGU names — LLW, PIL, ALM — and do contain L and I.
    expect(codeProblem('LLW-7K2P-9QXM')).toBeNull();
    expect(codeProblem('PIL-7K2P-9QXM')).toBeNull();
  });

  it('says how far along a short code is', () => {
    expect(codeProblem('SCZ-7K2P')).toMatch(`7 of ${CODE_LENGTH}`);
  });

  it('wants three letters first', () => {
    expect(codeProblem('123-7K2P-9QXM')).toMatch(/three letters/);
  });
});

describe('the alphabet', () => {
  it('leaves out every character people misread', () => {
    for (const ch of '0O1IL') expect(CODE_ALPHABET).not.toContain(ch);
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });

  it('is the alphabet the database draws from', () => {
    // supabase/accounts.sql, issue_account_code(). If one changes, so must
    // the other, or codes would be issued that the page calls malformed.
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  });
});

describe('CODE_REASONS', () => {
  it('has something to say for every reason the database gives', () => {
    for (const reason of ['not_found', 'used', 'revoked', 'expired']) {
      expect(CODE_REASONS[reason].length).toBeGreaterThan(0);
    }
  });
});
