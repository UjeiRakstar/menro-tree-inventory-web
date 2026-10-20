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
      expect.stringMatching(/^Tree Planting DaypublishedPublished .*Event: 8 November 2026 · Labuin/),
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

describe('scheduling, archiving and the calendar (19 October)', () => {
  const future = new Date(Date.now() + 3 * 86400000);
  const two = (n) => String(n).padStart(2, '0');
  const local = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T08:00`;
  const SCHEDULED = { id: 'later', title: 'Arbor Day', body: '', photos: [], created_at: '2026-10-19T00:00:00Z', publish_at: new Date(`${local(future)}`).toISOString() };
  const SENT_OLD = { ...OLD, publish_at: OLD.created_at, sent_at: OLD.created_at };

  it('schedules a post for a day and time, sending it to nobody yet', async () => {
    render(<NewsPage />);
    const form = screen.getByRole('form', { name: 'New post' });
    fill(form, 'Title', 'Arbor Day');
    fireEvent.click(within(form).getByRole('radio', { name: 'Schedule' }));
    fireEvent.change(within(form).getByLabelText('Goes out on'), { target: { value: local(future) } });
    fireEvent.click(within(form).getByRole('button', { name: 'Schedule the post' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/^Scheduled for .*It goes to every MENRO \/ CENRO and onto the home page then\./);
    const [insert] = supabaseMock.writesTo('news_posts', 'insert');
    expect(Date.parse(insert.payload.publish_at)).toBe(new Date(local(future)).getTime());
  });

  it('will not schedule a time already past', async () => {
    render(<NewsPage />);
    const form = screen.getByRole('form', { name: 'New post' });
    fill(form, 'Title', 'Too late');
    fireEvent.click(within(form).getByRole('radio', { name: 'Schedule' }));
    fireEvent.change(within(form).getByLabelText('Goes out on'), { target: { value: '2020-01-01T08:00' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Schedule the post' }));
    expect(await screen.findByText(/That time has passed/)).toBeInTheDocument();
    expect(supabaseMock.writesTo('news_posts', 'insert')).toHaveLength(0);
  });

  it('archives a post off the home page and restores it, and filters by where each stands', async () => {
    supabaseMock.setResponse('news_posts:select', { data: [SENT_OLD, SCHEDULED], error: null });
    render(<NewsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Earth Hour' }));
    await waitFor(() => expect(supabaseMock.writesTo('news_posts', 'update')).toHaveLength(1));
    expect(supabaseMock.writesTo('news_posts', 'update')[0].payload).toEqual({ archived_at: expect.any(String) });
    expect(await screen.findByRole('status')).toHaveTextContent('"Earth Hour" archived: off the home page, kept here.');
    expect(screen.getByRole('button', { name: 'Archived (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scheduled (1)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Scheduled (1)' }));
    const posted = screen.getByRole('region', { name: 'Posted' });
    expect(within(posted).getAllByRole('listitem')).toHaveLength(1);
    expect(posted).toHaveTextContent('Arbor Day');
    fireEvent.click(screen.getByRole('button', { name: 'Archived (1)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore Earth Hour' }));
    await waitFor(() => expect(supabaseMock.writesTo('news_posts', 'update')[1].payload).toEqual({ archived_at: null }));
  });

  it('keeps a published post published when it is edited', async () => {
    supabaseMock.setResponse('news_posts:select', { data: [SENT_OLD], error: null });
    render(<NewsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Earth Hour' }));
    const form = screen.getByRole('form', { name: 'Edit the post' });
    expect(within(form).queryByRole('radio', { name: 'Schedule' })).not.toBeInTheDocument();
    expect(form).toHaveTextContent('Its newsletter has gone out');
  });

  it('lays the month out on a calendar, and starts a post from a day', async () => {
    supabaseMock.setResponse('news_posts:select', { data: [SENT_OLD, SCHEDULED], error: null });
    render(<NewsPage />);
    await screen.findByRole('button', { name: 'Edit Earth Hour' });
    fireEvent.click(screen.getByRole('tab', { name: /Calendar/ }));
    const calendar = screen.getByRole('region', { name: 'Calendar' });
    // Move to the scheduled post's month, wherever this test runs.
    const months = (future.getFullYear() - new Date().getFullYear()) * 12 + future.getMonth() - new Date().getMonth();
    for (let i = 0; i < months; i += 1) fireEvent.click(within(calendar).getByRole('button', { name: 'Next month' }));
    fireEvent.click(within(calendar).getByRole('button', { name: 'Arbor Day' }));
    expect(screen.getByRole('form', { name: 'Edit the post' })).toBeInTheDocument();
    expect(within(screen.getByRole('form', { name: 'Edit the post' })).getByLabelText('Goes out on')).toHaveValue(local(future));

    const day = local(future).slice(0, 10);
    fireEvent.click(within(calendar).getByRole('button', { name: `New post for ${day}` }));
    const form = screen.getByRole('form', { name: 'New post' });
    expect(within(form).getByRole('radio', { name: 'Schedule' })).toBeChecked();
    expect(within(form).getByLabelText('Goes out on')).toHaveValue(`${day}T08:00`);
  });
});
