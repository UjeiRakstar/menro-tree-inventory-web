import { describe, it, expect } from 'vitest';
import { folderById, linkOf, receivedAt, replyMailto } from './inbox.js';
import { newsProblems, photoPaths, whenAndWhere } from './news.js';

describe('the inbox', () => {
  const message = {
    kind: 'contact',
    sender_name: 'Juan Dela Cruz',
    sender_email: 'juan@example.com',
    body: 'May a tree be cut?\nIt leans over our roof.',
    created_at: '2026-10-18T09:30:00+08:00',
  };

  it('replies by email to the sender, with what they wrote quoted', () => {
    const href = replyMailto(message, { officeName: 'Municipality of Santa Cruz MENRO / CENRO' });
    expect(href.startsWith('mailto:juan%40example.com?subject=')).toBe(true);
    const body = decodeURIComponent(href.split('&body=')[1]);
    expect(body).toMatch(/^Dear Juan Dela Cruz,/);
    expect(body).toMatch(/Municipality of Santa Cruz MENRO \/ CENRO/);
    expect(body).toMatch(/> May a tree be cut\?\n> It leans over our roof\.$/);
    expect(decodeURIComponent(href.split('subject=')[1].split('&')[0])).toBe('Re: your message to Municipality of Santa Cruz MENRO / CENRO');
  });

  it('links a notice to the map, and news to the home page', () => {
    expect(linkOf({ link: { kind: 'area', id: 'a1' } })).toEqual({ to: '/map?area=a1', label: 'View on map' });
    expect(linkOf({ link: { kind: 'tree', id: 't1', lat: 14.28, lng: 121.41 } }).to).toBe('/map?lat=14.28&lng=121.41&tree=t1');
    expect(linkOf({ link: { kind: 'news', id: 'n1' } }).to).toBe('/about#news-n1');
    expect(linkOf({ link: null })).toBeNull();
  });

  it('files each kind of message where it belongs', () => {
    expect(folderById('notice').holds({ kind: 'rise' })).toBe(true);
    expect(folderById('contact').holds({ kind: 'news' })).toBe(false);
    expect(folderById('all').holds({ kind: 'news', archived_at: '2026-10-18' })).toBe(false);
    expect(folderById('archived').holds({ kind: 'news', archived_at: '2026-10-18' })).toBe(true);
  });

  it('shows the time for today, the date for before', () => {
    const now = new Date('2026-10-18T15:00:00');
    expect(receivedAt('2026-10-18T09:30:00', now)).toMatch(/9:30/);
    expect(receivedAt('2026-10-02T09:30:00', now)).toMatch(/Oct/);
  });
});

describe('News & Events', () => {
  it('needs a title, and photos the website can show', () => {
    expect(newsProblems({ title: ' ' })).toEqual({ title: 'Give it a title.' });
    // A 6 MB photo is fine now: it is resized before it is uploaded (19 October).
    const six = { name: 'six.jpg', type: 'image/jpeg', size: 6 * 1024 * 1024 };
    expect(newsProblems({ title: 'Planting Day' }, [six])).toEqual({});
    const huge = { name: 'huge.jpg', type: 'image/jpeg', size: 30 * 1024 * 1024 };
    expect(newsProblems({ title: 'Planting Day' }, [huge]).photos).toMatch(/under 25 MB/);
    expect(newsProblems({ title: 'Planting Day' }, [{ name: 'a.png', type: 'image/png', size: 1000 }])).toEqual({});
  });

  it('writes when and where as one line', () => {
    expect(whenAndWhere({ event_date: '2026-11-08', venue: 'Labuin' })).toBe('8 November 2026 · Labuin');
    expect(whenAndWhere({ venue: 'Labuin' })).toBe('Labuin');
  });

  it('finds a photo in storage from its public URL, to remove it with the post', () => {
    expect(photoPaths(['https://x.supabase.co/storage/v1/object/public/news-photos/abc.jpg'])).toEqual(['abc.jpg']);
  });
});

describe('scheduled News & Events (19 October)', () => {
  it('says where a post stands', async () => {
    const { newsStatus } = await import('./news.js');
    const now = Date.parse('2026-10-20T00:00:00Z');
    expect(newsStatus({ publish_at: '2026-10-21T00:00:00Z' }, now)).toBe('scheduled');
    expect(newsStatus({ publish_at: '2026-10-19T00:00:00Z' }, now)).toBe('published');
    expect(newsStatus({ created_at: '2026-10-01T00:00:00Z' }, now)).toBe('published');
    expect(newsStatus({ publish_at: '2026-10-21T00:00:00Z', archived_at: '2026-10-20T00:00:00Z' }, now)).toBe('archived');
  });

  it('lays a month out in weeks, Sunday first', async () => {
    const { monthGrid } = await import('./news.js');
    const october = monthGrid(2026, 9);
    // 1 October 2026 is a Thursday.
    expect(october[0].map((cell) => cell.key)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(october.flat().filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(october.at(-1).some((cell) => cell.key === '2026-10-31')).toBe(true);
  });
});
