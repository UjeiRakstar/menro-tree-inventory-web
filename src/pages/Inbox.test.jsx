import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = vi.hoisted(() => ({ profile: { role: 'lgu_admin', status: 'active', lgu_psgc: 403426000 } }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import Inbox from './Inbox.jsx';

const MESSAGES = [
  { id: 'm1', kind: 'contact', office: '403426000', subject: 'Message from Juan Dela Cruz', body: 'May a tree be cut?',
    sender_name: 'Juan Dela Cruz', sender_email: 'juan@example.com', sender_affiliation: 'LSPU', created_at: '2026-10-18T09:30:00+08:00' },
  { id: 'm2', kind: 'notice', office: '403426000', subject: 'New tree planting site: Labuin Riverbank', body: 'PGENRO set a tree planting site.',
    link: { kind: 'area', id: 'area-1' }, created_at: '2026-10-17T09:30:00+08:00' },
  { id: 'm3', kind: 'news', office: '403426000', subject: 'Tree Planting Day', body: '8 November 2026 · Labuin', read_at: '2026-10-17T10:00:00+08:00',
    created_at: '2026-10-16T09:30:00+08:00' },
];

function show(messages = MESSAGES) {
  supabaseMock.setResponse('inbox_messages:select', { data: messages, error: null });
  return render(
    <MemoryRouter>
      <Inbox />
    </MemoryRouter>
  );
}

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('inbox_messages:update', { data: null, error: null });
  supabaseMock.setResponse('inbox_messages:delete', { data: null, error: null });
});
afterEach(cleanup);

describe('the inbox', () => {
  it("lists the office's messages, the unread ones counted by folder", async () => {
    show();
    const list = await screen.findByRole('list', { name: 'Inbox' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inbox');
    expect(screen.getByText('Municipality of Santa Cruz MENRO / CENRO')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Folders' })).getByRole('button', { name: /^Inbox\s*2 unread/ })).toBeInTheDocument();
  });

  it("opens a member of the public's message: who wrote, a reply by email, and it is marked read", async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Message from Juan Dela Cruz/ }));
    expect(screen.getByText(/juan@example\.com/)).toBeInTheDocument();
    expect(screen.getByText('LSPU')).toBeInTheDocument();
    const reply = screen.getByRole('link', { name: 'Reply by email' });
    expect(reply.getAttribute('href')).toMatch(/^mailto:juan%40example\.com\?subject=/);
    await waitFor(() => expect(supabaseMock.writesTo('inbox_messages', 'update')).toHaveLength(1));
    expect(supabaseMock.writesTo('inbox_messages', 'update')[0].payload).toEqual({ read_at: expect.any(String) });
  });

  it('opens a notice with View on map', async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: /New tree planting site/ }));
    expect(screen.getByRole('link', { name: 'View on map' })).toHaveAttribute('href', '/map?area=area-1');
    expect(screen.queryByRole('link', { name: 'Reply by email' })).not.toBeInTheDocument();
  });

  it('archives a message out of the inbox, and deletes one', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    show();
    fireEvent.click(await screen.findByRole('button', { name: /Tree Planting Day/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Inbox' })).getAllByRole('listitem')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(within(screen.getByRole('list', { name: 'Archived' })).getByText('Tree Planting Day')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Inbox\s*2 unread/ }));
    fireEvent.click(screen.getByRole('button', { name: /Message from Juan Dela Cruz/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Message from Juan Dela Cruz')).not.toBeInTheDocument());
    expect(supabaseMock.writesTo('inbox_messages', 'delete')).toHaveLength(1);
  });

  it('says when the inbox is not set up yet', async () => {
    supabaseMock.setResponse('inbox_messages:select', { data: null, error: { message: 'relation "public.inbox_messages" does not exist' } });
    render(
      <MemoryRouter>
        <Inbox />
      </MemoryRouter>
    );
    expect(await screen.findByRole('note')).toHaveTextContent('supabase/inbox.sql');
  });
});
