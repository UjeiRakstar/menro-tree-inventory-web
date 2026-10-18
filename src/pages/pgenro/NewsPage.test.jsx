import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import NewsPage from './NewsPage.jsx';

const OLD = {
  id: 'old',
  title: 'Earth Hour',
  body: 'Lights off.',
  venue: 'Capitol',
  event_date: '2026-10-01',
  photos: ['https://storage.test/news-photos/a.jpg', 'https://storage.test/news-photos/b.jpg'],
  created_at: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  supabaseMock.reset();
  // jsdom makes no object URLs; the previews need one each.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  supabaseMock.setResponse('news_posts:select', { data: [OLD], error: null });
  supabaseMock.setResponse('news_posts:insert', (record) => ({ data: { ...record.payload, id: 'new', created_at: '2026-10-18T00:00:00Z' }, error: null }));
  supabaseMock.setResponse('news_posts:update', (record) => ({ data: { ...OLD, ...record.payload }, error: null }));
});
afterEach(cleanup);

const fill = (form, label, value) => fireEvent.change(within(form).getByLabelText(label), { target: { value } });

describe("PGENRO's News & Events", () => {
  it('posts with its photos, and says every office has it', async () => {
    render(<NewsPage />);
    const form = screen.getByRole('form', { name: 'New post' });
    fill(form, 'Title', 'Tree Planting Day');
    fill(form, 'Date', '2026-11-08');
    fill(form, 'Venue', 'Labuin');
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

  it('takes a photo copied from anywhere and pasted', async () => {
    render(<NewsPage />);
    const copied = new File(['x'], 'image.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    paste.clipboardData = { items: [{ kind: 'file', getAsFile: () => copied }, { kind: 'string', getAsFile: () => null }] };
    act(() => {
      window.dispatchEvent(paste);
    });
    const shown = within(screen.getByRole('list', { name: "The post's photos" })).getAllByRole('img');
    expect(shown).toHaveLength(1);
    expect(shown[0].getAttribute('alt')).toMatch(/^pasted-\d+-1\.png$/);
    expect(paste.defaultPrevented).toBe(true);
  });

  it('edits a post after it is published: its words, and which photos stay', async () => {
    render(<NewsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Earth Hour' }));
    const form = screen.getByRole('form', { name: 'Edit the post' });
    expect(within(form).getByLabelText('Title')).toHaveValue('Earth Hour');
    fill(form, 'Venue', 'Provincial Capitol');
    fireEvent.click(within(form).getAllByRole('button', { name: 'Remove this photo' })[0]);
    fireEvent.click(within(form).getByRole('button', { name: 'Save the changes' }));

    expect(await screen.findByRole('status')).toHaveTextContent('the newsletter already sent is not sent again');
    const [update] = supabaseMock.writesTo('news_posts', 'update');
    expect(update.payload).toMatchObject({ title: 'Earth Hour', venue: 'Provincial Capitol', photos: ['https://storage.test/news-photos/b.jpg'] });
    expect(supabaseMock.writesTo('news_posts', 'insert')).toHaveLength(0);
    // The photo taken off comes off storage too.
    await waitFor(() => expect(supabaseMock.supabase.storage.remove).toHaveBeenCalledWith('news-photos', ['a.jpg']));
    expect(screen.getByRole('form', { name: 'New post' })).toBeInTheDocument();
  });

  it('needs a title before anything is uploaded', async () => {
    render(<NewsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Post and send to the offices/ }));
    expect(await screen.findByText('Give it a title.')).toBeInTheDocument();
    expect(supabaseMock.supabase.storage.upload).not.toHaveBeenCalled();
    expect(supabaseMock.writesTo('news_posts', 'insert')).toHaveLength(0);
  });
});
