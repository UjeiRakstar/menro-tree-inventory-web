import { describe, it, expect } from 'vitest';
import {
  ROLES,
  SEAT_LIMIT,
  STATUS,
  accessFor,
  canUseWeb,
  codeState,
  isPgenro,
  roleLabel,
  roleOf,
  seatsTaken,
} from './roles.js';

const NOW = new Date('2026-10-14T00:00:00Z');
const FUTURE = '2026-10-20T00:00:00Z';
const PAST = '2026-10-01T00:00:00Z';

describe('roleOf', () => {
  it('reads the old names until accounts.sql has run', () => {
    // The only admin today is still called 'admin'. Refusing them would lock
    // out the one person who can run the migration.
    expect(roleOf({ role: 'admin' })).toBe(ROLES.PGENRO);
    expect(roleOf({ role: 'arborist' })).toBe(ROLES.FIELD_OFFICER);
    expect(roleOf({ role: 'lgu_admin' })).toBe(ROLES.LGU_ADMIN);
    expect(roleOf(null)).toBeNull();
  });
});

describe('roleLabel', () => {
  it('never lets a City ENRO be read as DENR’s CENRO', () => {
    expect(roleLabel('lgu_admin', { isCity: true })).toBe('City ENRO (CENRO)');
    expect(roleLabel('lgu_admin', { isCity: false })).toBe('Municipal ENRO (MENRO)');
    expect(roleLabel('lgu_admin', { isCity: true, short: true })).toBe('CENRO');
    expect(roleLabel('pgenro')).toBe('PGENRO');
    expect(roleLabel('field_officer')).toBe('Field officer');
  });
});

describe('accessFor', () => {
  it('lets PGENRO and the LGU admins in', () => {
    expect(accessFor({ role: 'pgenro', status: 'active' }).kind).toBe('web');
    expect(accessFor({ role: 'lgu_admin', status: 'active' }).kind).toBe('web');
    expect(accessFor({ role: 'admin' }).kind).toBe('web');
  });

  it('sends a field officer to the app, and says why', () => {
    const access = accessFor({ role: 'field_officer', status: 'active', is_approved: true });
    expect(access.kind).toBe('mobile_only');
    expect(access.message).toMatch(/mobile app/);
  });

  it('tells a field officer still waiting that they are waiting', () => {
    expect(accessFor({ role: 'field_officer', is_approved: false }).kind).toBe('pending');
  });

  it('puts lock and archive ahead of everything, PGENRO included', () => {
    // A locked PGENRO account is still locked.
    expect(accessFor({ role: 'pgenro', status: STATUS.LOCKED }).kind).toBe('locked');
    expect(accessFor({ role: 'lgu_admin', status: STATUS.ARCHIVED }).kind).toBe('archived');
  });

  it('refuses an account it cannot place, rather than guessing', () => {
    expect(accessFor(null).kind).toBe('no_profile');
    expect(accessFor({ role: 'something' }).kind).toBe('no_profile');
  });

  it('always has something to tell the person it refuses', () => {
    for (const profile of [null, { role: 'field_officer' }, { role: 'pgenro', status: 'locked' }]) {
      const access = accessFor(profile);
      expect(access.title.length).toBeGreaterThan(0);
      expect(access.message.length).toBeGreaterThan(0);
    }
  });
});

describe('canUseWeb and isPgenro', () => {
  it('agree with accessFor', () => {
    expect(canUseWeb({ role: 'lgu_admin', status: 'active' })).toBe(true);
    expect(canUseWeb({ role: 'field_officer', status: 'active' })).toBe(false);
    expect(isPgenro({ role: 'pgenro', status: 'active' })).toBe(true);
    expect(isPgenro({ role: 'pgenro', status: 'locked' })).toBe(false);
    expect(isPgenro({ role: 'lgu_admin', status: 'active' })).toBe(false);
  });
});

describe('codeState', () => {
  it('reads a code the way the database does', () => {
    expect(codeState({ expires_at: FUTURE }, NOW)).toBe('outstanding');
    expect(codeState({ expires_at: PAST }, NOW)).toBe('expired');
    expect(codeState({ expires_at: FUTURE, redeemed_at: PAST }, NOW)).toBe('used');
    expect(codeState({ expires_at: FUTURE, revoked_at: PAST }, NOW)).toBe('revoked');
  });

  it('calls a used code used even after it would have expired', () => {
    expect(codeState({ expires_at: PAST, redeemed_at: PAST }, NOW)).toBe('used');
  });
});

describe('seatsTaken', () => {
  it('counts admins who are not archived, and codes that could still be used', () => {
    const taken = seatsTaken(
      {
        admins: [
          { role: 'lgu_admin', status: 'active' },
          { role: 'lgu_admin', status: 'locked' }, // locking is reversible: keeps the seat
          { role: 'lgu_admin', status: 'archived' }, // archiving frees it
          { role: 'field_officer', status: 'active' }, // not a seat at all
        ],
        codes: [
          { expires_at: FUTURE }, // outstanding
          { expires_at: PAST }, // expired: frees its seat
          { expires_at: FUTURE, redeemed_at: PAST }, // became the active admin above
          { expires_at: FUTURE, revoked_at: PAST },
        ],
      },
      NOW
    );
    expect(taken).toBe(3);
  });

  it('uses the same limit as the database', () => {
    expect(SEAT_LIMIT).toBe(5);
  });
});
