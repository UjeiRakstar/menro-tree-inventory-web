import { describe, it, expect } from 'vitest';
import {
  capturedAt,
  formatDate,
  lastTagged,
  taggedRecently,
  taggingTimeline,
  timeAgo,
  undated,
} from './inventoryFreshness.js';

const NOW = new Date('2026-10-10T09:00:00');
const at = (dateCaptured) => ({ dateCaptured });
const daysBefore = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe('capturedAt', () => {
  it('reads the field app’s ISO string', () => {
    // What the app actually writes: no timezone, read as local time, which is
    // right when the surveyor and the reader are in the same country.
    expect(capturedAt(at('2026-08-25T12:03:01.433'))?.getFullYear()).toBe(2026);
    expect(capturedAt(at('2026-08-25T12:03:01.433'))?.getMonth()).toBe(7);
  });

  it('falls back to created_at when the app did not say', () => {
    expect(capturedAt({ created_at: '2026-01-02T00:00:00Z' })?.getFullYear()).toBe(2026);
  });

  it('refuses anything that is not a date', () => {
    expect(capturedAt(at(null))).toBeNull();
    expect(capturedAt(at(''))).toBeNull();
    expect(capturedAt(at('not a date'))).toBeNull();
    expect(capturedAt({})).toBeNull();
  });
});

describe('lastTagged', () => {
  it('finds the newest tag', () => {
    const trees = [at('2026-01-01'), at('2026-08-25'), at('2026-03-10')];
    expect(formatDate(lastTagged(trees))).toBe('25 August 2026');
  });

  it('has no answer when nothing is dated', () => {
    expect(lastTagged([at(null), {}])).toBeNull();
    expect(lastTagged([])).toBeNull();
    expect(lastTagged(undefined)).toBeNull();
  });
});

describe('taggedRecently', () => {
  it('counts the last thirty days', () => {
    const trees = [at(daysBefore(1)), at(daysBefore(20)), at(daysBefore(45))];
    expect(taggedRecently(trees, 30, NOW)).toBe(2);
  });

  it('is zero when nobody has been out, which is a real answer', () => {
    expect(taggedRecently([at(daysBefore(60))], 30, NOW)).toBe(0);
  });

  it('ignores a date in the future rather than counting it', () => {
    const tomorrow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
    expect(taggedRecently([at(tomorrow)], 30, NOW)).toBe(0);
  });
});

describe('undated', () => {
  it('counts the trees that cannot say when they were tagged', () => {
    expect(undated([at('2026-01-01'), at(null), {}])).toBe(2);
  });
});

describe('timeAgo', () => {
  it('says it in words, roughly, because the survey is not precise either', () => {
    expect(timeAgo(new Date('2026-10-10T08:00:00'), NOW)).toBe('today');
    expect(timeAgo(new Date('2026-10-09T08:00:00'), NOW)).toBe('yesterday');
    expect(timeAgo(new Date('2026-10-05T09:00:00'), NOW)).toBe('5 days ago');
    expect(timeAgo(new Date('2026-09-10T09:00:00'), NOW)).toBe('4 weeks ago');
    expect(timeAgo(new Date('2026-06-10T09:00:00'), NOW)).toBe('about 4 months ago');
    expect(timeAgo(new Date('2025-06-10T09:00:00'), NOW)).toBe('about a year ago');
    expect(timeAgo(new Date('2023-06-10T09:00:00'), NOW)).toBe('about 3 years ago');
  });

  it('does not say a future date was long ago', () => {
    expect(timeAgo(new Date('2026-11-10T09:00:00'), NOW)).toBe('just now');
  });

  it('says nothing about no date', () => {
    expect(timeAgo(null, NOW)).toBe('');
  });
});

describe('taggingTimeline', () => {
  it('runs a total forward month by month', () => {
    const trees = [
      at('2026-06-05'), at('2026-06-20'),
      at('2026-08-01'), at('2026-08-02'), at('2026-08-03'),
    ];
    const months = taggingTimeline(trees);

    expect(months.map((m) => [m.label, m.added, m.total])).toEqual([
      ['Jun 2026', 2, 2],
      // July had none. The flat stretch is part of the story.
      ['Jul 2026', 0, 2],
      ['Aug 2026', 3, 5],
    ]);
  });

  it('keeps the quiet months rather than drawing a survey that never paused', () => {
    const months = taggingTimeline([at('2026-01-15'), at('2026-05-15')]);
    expect(months).toHaveLength(5);
    expect(months.filter((m) => m.added === 0)).toHaveLength(3);
  });

  it('crosses a year end', () => {
    const months = taggingTimeline([at('2025-12-01'), at('2026-01-15')]);
    expect(months.map((m) => m.label)).toEqual(['Dec 2025', 'Jan 2026']);
  });

  it('has nothing to draw when nothing is dated', () => {
    expect(taggingTimeline([at(null), {}])).toEqual([]);
    expect(taggingTimeline([])).toEqual([]);
  });
});
