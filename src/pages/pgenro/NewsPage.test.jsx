import { render, screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';

// Who is signed in: PGENRO unless a test says a MENRO / CENRO.
const auth = vi.hoisted(() => ({ value: null }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuthIfAny: () => auth.value }));

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
  auth.value = null;
  window.history.replaceState(null, '', '/news');
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

describe('an event’s days, kind and purpose (21 October)', () => {
  it('runs over several days, for one LGU, with a purpose — and never says CBI', async () => {
    render(<NewsPage />);
    // The posts already made are in the list before anything is posted.
    await screen.findByText('Earth Hour');
    const form = screen.getByRole('form', { name: 'New post' });
    fill(form, 'Title', 'City Biodiversity Index Training');
    fill(form, 'Kind of event', 'training');
    // A training may run longer: one day only is off, and the last day is asked for.
    expect(within(form).getByLabelText(/One day only/)).not.toBeChecked();
    fill(form, 'First day', '2026-11-23');
    fill(form, 'Last day', '2026-11-25');
    fill(form, 'Held for', '403426000');
    // A training's usual purpose comes with it; the index is counted quietly.
    expect(within(form).getByLabelText('Purpose')).toHaveValue('outreach');
    expect(form).not.toHaveTextContent(/CBI|Biodiversity Index/);
    fireEvent.click(within(form).getByRole('button', { name: /Post and send to the offices/ }));

    expect(await screen.findByRole('status')).toHaveTextContent('Every MENRO / CENRO has it');
    const [insert] = supabaseMock.writesTo('news_posts', 'insert');
    expect(insert.payload).toMatchObject({
      event_date: '2026-11-23', event_end_date: '2026-11-25', event_kind: 'training', lgu_psgc: 403426000, cbi_credit: 'outreach',
    });
    expect(screen.getByRole('region', { name: 'Posted' })).toHaveTextContent(/23–25 November 2026/);
  });

  it('is one whole day for a tree planting, and sends nothing it does not need', async () => {
    render(<NewsPage />);
    const form = screen.getByRole('form', { name: 'New post' });
    fill(form, 'Title', 'Tree Planting Day');
    fill(form, 'Kind of event', 'tree-planting');
    expect(within(form).getByLabelText(/One day only/)).toBeChecked();
    expect(within(form).queryByLabelText('Last day')).not.toBeInTheDocument();
    fill(form, 'Date', '2026-11-08');
    fireEvent.click(within(form).getByRole('button', { name: /Post and send to the offices/ }));
    await screen.findByRole('status');
    const [insert] = supabaseMock.writesTo('news_posts', 'insert');
    expect(insert.payload).toMatchObject({ event_kind: 'tree-planting', event_date: '2026-11-08' });
    expect(insert.payload).not.toHaveProperty('event_end_date');
    // A tree planting is a biodiversity project, unless PGENRO says otherwise.
    expect(insert.payload.cbi_credit).toBe('project');
    expect(insert.payload).not.toHaveProperty('venue_lat');
  });

  it('keeps a purpose chosen by hand when the kind changes', async () => {
    render(<NewsPage />);
    const form = screen.getByRole('form', { name: 'New post' });
    fill(form, 'Kind of event', 'forum');
    fill(form, 'Purpose', 'partnership');
    fill(form, 'Kind of event', 'seminar');
    expect(within(form).getByLabelText('Purpose')).toHaveValue('partnership');
  });

  it('will not have a last day before the first', async () => {
    render(<NewsPage />);
    const form = screen.getByRole('form', { name: 'New post' });
    fill(form, 'Title', 'Forum');
    fill(form, 'Kind of event', 'forum');
    fill(form, 'First day', '2026-11-25');
    fill(form, 'Last day', '2026-11-23');
    fireEvent.click(within(form).getByRole('button', { name: /Post and send to the offices/ }));
    expect(await within(form).findByText('The last day cannot be before the first.')).toBeInTheDocument();
    expect(supabaseMock.writesTo('news_posts', 'insert')).toHaveLength(0);
  });
});

describe('where an event is held (22 October)', () => {
  it('is made from a planting site PGENRO designated: a tree planting there, pinned at its middle', async () => {
    window.history.replaceState(null, '', '/news?area=site-1');
    supabaseMock.setResponse('map_areas:select', {
      data: {
        id: 'site-1', name: 'Labuin Riverbank', barangay: 'Labuin', municipality: 'Santa Cruz', kind: 'planting-site',
        geometry: { type: 'Polygon', coordinates: [[[121.41, 14.28], [121.42, 14.28], [121.42, 14.29], [121.41, 14.29], [121.41, 14.28]]] },
      },
      error: null,
    });
    render(<NewsPage />);
    const form = screen.getByRole('form', { name: 'New post' });
    expect(await within(form).findByDisplayValue('Tree planting at Labuin Riverbank')).toBeInTheDocument();
    expect(within(form).getByLabelText('Kind of event')).toHaveValue('tree-planting');
    expect(within(form).getByLabelText('Held for')).toHaveValue('403426000');
    expect(within(form).getByLabelText('Venue')).toHaveValue('Labuin Riverbank, Labuin');
    expect(within(form).getByText(/Pinned at 14\.28/)).toBeInTheDocument();
    expect(within(form).getByText('Held on a tree planting site PGENRO designated.')).toBeInTheDocument();
    expect(window.location.search).toBe('');

    fill(form, 'Date', '2026-12-05');
    fireEvent.click(within(form).getByRole('button', { name: /Post and send to the offices/ }));
    await screen.findByRole('status');
    const [insert] = supabaseMock.writesTo('news_posts', 'insert');
    expect(insert.payload).toMatchObject({ event_kind: 'tree-planting', cbi_credit: 'project', map_area_id: 'site-1', lgu_psgc: 403426000 });
    expect(insert.payload.venue_lat).toBeCloseTo(14.285, 3);
    expect(insert.payload.venue_lng).toBeCloseTo(121.415, 3);
  });

  it('keeps an event’s pin when it is edited, and takes it off when asked', async () => {
    supabaseMock.setResponse('news_posts:select', { data: [{ ...OLD, venue_lat: 14.28, venue_lng: 121.41 }], error: null });
    render(<NewsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Earth Hour' }));
    const form = screen.getByRole('form', { name: 'Edit the post' });
    expect(within(form).getByText('Pinned at 14.28000, 121.41000')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Remove the pin' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Save the changes' }));
    await waitFor(() => expect(supabaseMock.writesTo('news_posts', 'update')).toHaveLength(1));
    expect(supabaseMock.writesTo('news_posts', 'update')[0].payload).toMatchObject({ venue_lat: null, venue_lng: null });
  });
});

describe('a MENRO / CENRO’s own events (22 October)', () => {
  const MENRO = { id: 'menro-scz', role: 'lgu_admin', lgu_psgc: 403426000, status: 'active' };
  beforeEach(() => {
    auth.value = { profile: MENRO };
    supabaseMock.setResponse('news_posts:select', {
      data: [OLD, { ...OLD, id: 'mine', title: 'Our Clean-up', created_by: 'menro-scz', lgu_psgc: 403426000 }],
      error: null,
    });
  });

  it('posts events for its own city or municipality only, and lists its own', async () => {
    render(<NewsPage />);
    expect(await screen.findByText('Our Clean-up')).toBeInTheDocument();
    expect(screen.queryByText('Earth Hour')).not.toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'New post' });
    expect(within(form).getByLabelText('Held for')).toBeDisabled();
    expect(within(form).getByLabelText('Held for')).toHaveValue('403426000');
    expect(within(within(form).getByLabelText('Kind of event')).queryByText('Not an event (news)')).not.toBeInTheDocument();

    fill(form, 'Title', 'Coastal Clean-up');
    fireEvent.click(within(form).getByRole('button', { name: /Post and send/ }));
    expect(await within(form).findByText('Give the day of the event.')).toBeInTheDocument();
    fill(form, /^Date/, '2026-12-12');
    fireEvent.click(within(form).getByRole('button', { name: /Post and send/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('PGENRO has it in its inbox');
    expect(supabaseMock.writesTo('news_posts', 'insert')[0].payload).toMatchObject({ lgu_psgc: 403426000, event_kind: 'other' });
  });
});

describe('an office’s event, passed on by PGENRO (22 October)', () => {
  it('is marked as the office’s, and goes to every other office on a click, once', async () => {
    supabaseMock.setResponse('news_posts:select', {
      data: [{ ...OLD, id: 'scz', title: 'Santa Cruz Clean-up', office_post: true, lgu_psgc: 403426000, publish_at: '2026-10-01T00:00:00Z', forwarded_at: null }],
      error: null,
    });
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<NewsPage />);
    expect(await screen.findByText('From Santa Cruz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pass on to every office/ }));
    await waitFor(() => expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('forward_news_post', { p_id: 'scz' }));
    expect(await screen.findByText(/Passed on to every office/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pass on to every office/ })).not.toBeInTheDocument();
  });
});
