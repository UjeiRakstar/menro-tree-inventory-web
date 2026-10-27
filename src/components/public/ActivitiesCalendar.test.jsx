import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import ActivitiesCalendar from './ActivitiesCalendar.jsx';
import PublicFooter from '../PublicFooter.jsx';

const NOW = new Date(2026, 9, 27, 9).getTime(); // 27 October 2026

const POSTS = [
  { id: 'train', title: 'MENRO Training', event_kind: 'training', event_date: '2026-10-28', event_end_date: '2026-10-30', venue: 'Capitol', venue_lat: 14.28, venue_lng: 121.41, body: 'Bring a laptop.' },
  { id: 'plant', title: 'Tree Planting Day', event_kind: 'tree-planting', event_date: '2026-12-05', lgu_psgc: 403426000 },
  { id: 'news', title: 'A note with no date' },
  { id: 'later', title: 'Not out yet', event_date: '2026-10-29', publish_at: new Date(NOW + 30 * 86400000).toISOString() },
  { id: 'gone', title: 'Shelved', event_date: '2026-10-29', archived_at: '2026-10-01T00:00:00Z' },
];

function show() {
  return render(
    <MemoryRouter>
      <ActivitiesCalendar now={NOW} />
    </MemoryRouter>
  );
}

beforeEach(() => supabaseMock.reset());
afterEach(cleanup);

describe('the calendar of activities', () => {
  it('puts each published activity on every day it runs, and opens its details', async () => {
    supabaseMock.setResponse('news_posts:select', { data: POSTS, error: null });
    show();
    const month = await screen.findByRole('list', { name: 'Activities in October 2026' });
    expect(within(month).getAllByRole('listitem')).toHaveLength(1);
    expect(month).toHaveTextContent('28–30 October 2026');
    expect(month).toHaveTextContent('PGENRO Laguna');
    for (const day of ['2026-10-28', '2026-10-29', '2026-10-30']) {
      expect(document.querySelector(`[data-day="${day}"]`)).toHaveTextContent('MENRO Training');
    }
    expect(document.querySelector('[data-day="2026-10-31"]')).not.toHaveTextContent('MENRO Training');
    expect(screen.queryByText('Not out yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Shelved')).not.toBeInTheDocument();

    fireEvent.click(within(month).getByRole('button', { name: /MENRO Training/ }));
    const details = screen.getByRole('article', { name: 'MENRO Training' });
    expect(details).toHaveTextContent('Training · PGENRO Laguna');
    expect(details).toHaveTextContent('28–30 October 2026 · Capitol');
    expect(within(details).getByRole('link', { name: /See it on the map/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/public-map\?at=14\.280000%2C121\.410000/)
    );
  });

  it('says when a month has nothing, and jumps to the next activity', async () => {
    supabaseMock.setResponse('news_posts:select', { data: POSTS, error: null });
    show();
    await screen.findByRole('list', { name: 'Activities in October 2026' });
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByText(/No activities posted for November 2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Next: Tree Planting Day/ }));
    expect(screen.getByRole('list', { name: 'Activities in December 2026' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Tree Planting Day' })).toHaveTextContent('Tree planting · Municipality of Santa Cruz');
  });

  it('is left out when the posts cannot be read', async () => {
    supabaseMock.setResponse('news_posts:select', { data: null, error: { message: 'relation does not exist' } });
    show();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('heading', { name: /Calendar of Activities/ })).not.toBeInTheDocument();
  });
});

describe('the public footer', () => {
  it('has no link that goes nowhere, and News and Events opens the calendar', () => {
    render(
      <MemoryRouter>
        <PublicFooter />
      </MemoryRouter>
    );
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toMatch(/^#?$/);
    expect(screen.getByRole('link', { name: 'News and Events' })).toHaveAttribute('href', '/about#activities');
    expect(screen.queryByText('Our Partners and Contributors')).not.toBeInTheDocument();
  });
});
