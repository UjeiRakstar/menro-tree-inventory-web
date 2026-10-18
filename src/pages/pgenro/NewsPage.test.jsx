import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import NewsPage from './NewsPage.jsx';

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('news_posts:select', {
    data: [{ id: 'old', title: 'Earth Hour', body: '', photos: [], created_at: '2026-10-01T00:00:00Z' }],
    error: null,
  });
  supabaseMock.setResponse('news_posts:insert', (record) => ({ data: { ...record.payload, id: 'new', created_at: '2026-10-18T00:00:00Z' }, error: null }));
});
afterEach(cleanup);

describe("PGENRO's News & Events", () => {
  it('posts with its photos, and says every office has it', async () => {
    render(<NewsPage />);
    const form = screen.getByRole('form', { name: 'New post' });
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Tree Planting Day' } });
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2026-11-08' } });
    fireEvent.change(within(form).getByLabelText('Venue'), { target: { value: 'Labuin' } });
    const photo = new File(['x'], 'seedlings.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Photos'), { target: { files: [photo] } });
    fireEvent.click(within(form).getByRole('button', { name: /Post and send to the offices/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('Every MENRO / CENRO has it in their inbox');
    const [insert] = supabaseMock.writesTo('news_posts', 'insert');
    expect(insert.payload).toMatchObject({ title: 'Tree Planting Day', venue: 'Labuin', event_date: '2026-11-08' });
    expect(insert.payload.photos).toEqual([expect.stringMatching(/^https:\/\/storage\.test\/news-photos\/.+\.jpg$/)]);
    const posted = screen.getByRole('region', { name: 'Posted' });
    expect(within(posted).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Tree Planting Day8 November 2026 · Labuin/),
      expect.stringMatching(/^Earth Hour/),
    ]);
  });

  it('needs a title before anything is uploaded', async () => {
    render(<NewsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Post and send to the offices/ }));
    expect(await screen.findByText('Give it a title.')).toBeInTheDocument();
    expect(supabaseMock.supabase.storage.upload).not.toHaveBeenCalled();
    expect(supabaseMock.writesTo('news_posts', 'insert')).toHaveLength(0);
  });
});
