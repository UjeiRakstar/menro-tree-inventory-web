import { describe, expect, it } from 'vitest';

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { cbiEventCounts, eventDays, newsProblems, whenAndWhere } from './news.js';
import { cbiPoints } from './cbiPoints.js';

describe('an event’s days, as the line under its title', () => {
  it('a day, a few days, across months and across years', () => {
    expect(eventDays({ event_date: '2026-11-08' })).toBe('8 November 2026');
    expect(eventDays({ event_date: '2026-11-23', event_end_date: '2026-11-25' })).toBe('23–25 November 2026');
    expect(eventDays({ event_date: '2026-11-30', event_end_date: '2026-12-02' })).toBe('30 November – 2 December 2026');
    expect(eventDays({ event_date: '2026-12-30', event_end_date: '2027-01-02' })).toBe('30 December 2026 – 2 January 2027');
    expect(whenAndWhere({ event_date: '2026-11-23', event_end_date: '2026-11-25', venue: 'Capitol' })).toBe('23–25 November 2026 · Capitol');
  });

  it('wants a first day before a last, and the last not before the first', () => {
    expect(newsProblems({ title: 'X', event_end_date: '2026-11-25' })).toEqual({ event_date: 'Give the first day too.' });
    expect(newsProblems({ title: 'X', event_date: '2026-11-25', event_end_date: '2026-11-23' })).toEqual({ event_end_date: 'The last day cannot be before the first.' });
  });
});

describe('the CBI’s projects, policies, partnerships and outreach', () => {
  const POSTS = [
    { title: 'CBI Training', event_date: '2026-11-23', cbi_credit: 'outreach', lgu_psgc: 403426000 },
    { title: 'Arbor Day', event_date: '2026-06-25', cbi_credit: 'outreach', lgu_psgc: null },
    { title: 'MOA with UPLB', event_date: '2026-03-01', cbi_credit: 'partnership', lgu_psgc: 403426000 },
    { title: 'Last year', event_date: '2025-03-01', cbi_credit: 'project', lgu_psgc: 403426000 },
    { title: 'No credit', event_date: '2026-03-01', lgu_psgc: 403426000 },
  ];

  it('counts a city’s own events in the year, and every one for Laguna', () => {
    const city = cbiEventCounts(POSTS, { lgu: 403426000, year: 2026 });
    expect(city.outreach.map((p) => p.title)).toEqual(['CBI Training']);
    expect(city.partnership).toHaveLength(1);
    expect(city.project).toHaveLength(0);
    expect(cbiEventCounts(POSTS, { lgu: null, year: 2026 }).outreach).toHaveLength(2);
  });

  it('scores the governance indicators from them, the budget left to the office', () => {
    const cbi = cbiPoints({ events: cbiEventCounts(POSTS, { lgu: 403426000, year: 2026 }), population: 1000000 });
    const no = (n) => cbi.indicators.find((i) => i.no === n);
    expect(no(27)).toMatchObject({ count: 1, value: 1, points: 0, source: 'system' });
    // No partner named on the MOA: the partnership event stands in, and says so.
    expect(no(24)).toMatchObject({ value: 1, points: 1, proxy: 'events' });
    expect(no(25)).toMatchObject({ count: 0, value: 0, points: 0 });
    expect(no(16)).toMatchObject({ points: null, source: null });
  });

});
