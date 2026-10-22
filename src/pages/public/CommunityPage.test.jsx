import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import { SANTA_CRUZ, SANTA_CRUZ_ADMIN } from '../../test/accounts.js';
import { AuthProvider } from '../../context/AuthContext.jsx';
import CommunityPage from './CommunityPage.jsx';

const ANA = { id: 'resident-ana', full_name: 'Ana Reyes', nickname: null, show_as: 'name', consented_at: null };
const BOARD = [
  { rank: 1, display_name: 'Ben Cruz', verified: 4, submitted: 6, is_me: false },
  { rank: 2, display_name: 'Puno ng Laguna', verified: 2, submitted: 3, is_me: true },
];

function signInResident(resident) {
  supabaseMock.supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: resident.id, email: 'ana@gmail.com' } } },
    error: null,
  });
  supabaseMock.setResponse('residents:select', { data: resident, error: null });
}

function answerRpc({ board = BOARD, join = { data: null, error: null } } = {}) {
  supabaseMock.supabase.rpc.mockImplementation(async (name) => {
    if (name === 'community_leaderboard') return { data: board, error: null };
    if (name === 'set_resident_profile') return typeof join === 'function' ? join() : join;
    return { data: null, error: null };
  });
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <AuthProvider>
        <CommunityPage />
      </AuthProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  supabaseMock.reset();
  answerRpc();
});
afterEach(cleanup);

describe('the community page', () => {
  it('says what is kept before anyone signs in, and signs in with Google only', async () => {
    renderPage();
    const button = await screen.findByRole('button', { name: 'Continue with Google' });
    expect(screen.getByRole('heading', { name: 'What Green Tag keeps of you' })).toBeInTheDocument();
    expect(screen.getByText(/Nobody else sees it, not even the offices/)).toBeInTheDocument();
    expect(screen.getByText(/RA 10173/)).toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(supabaseMock.supabase.auth.signInWithOAuth).toHaveBeenCalled());
    const [options] = supabaseMock.supabase.auth.signInWithOAuth.mock.calls[0];
    expect(options.provider).toBe('google');
    expect(options.options.redirectTo).toMatch(/\/community$/);
  });

  it('says so when Google sign-in is not switched on yet', async () => {
    supabaseMock.supabase.auth.signInWithOAuth.mockResolvedValue({ data: {}, error: { message: 'Unsupported provider: provider is not enabled' } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not switched on yet');
  });

  it('shows the leaderboard by name or nickname, never an email', async () => {
    renderPage();
    const board = await screen.findByRole('list', { name: 'Leaderboard' });
    expect(within(board).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      expect.stringContaining('Ben Cruz'),
      expect.stringContaining('Puno ng Laguna'),
    ]);
    expect(board.textContent).not.toMatch(/@/);
  });

  it('asks a new resident how to be shown, and for their agreement', async () => {
    signInResident(ANA);
    renderPage();
    const form = await screen.findByRole('form', { name: 'How you are shown' });
    fireEvent.click(within(form).getByRole('radio', { name: /A nickname/ }));
    fireEvent.change(within(form).getByLabelText(/Nickname/), { target: { value: 'ab' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Join' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('3 to 24 characters');

    fireEvent.change(within(form).getByLabelText(/Nickname/), { target: { value: 'Puno ng Laguna' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Join' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Agree to what is kept');
    expect(supabaseMock.supabase.rpc).not.toHaveBeenCalledWith('set_resident_profile', expect.anything());

    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.click(within(form).getByRole('button', { name: 'Join' }));
    await waitFor(() =>
      expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('set_resident_profile', {
        p_show_as: 'nickname',
        p_nickname: 'Puno ng Laguna',
        p_agree: true,
      })
    );
  });

  it('shows the database’s reason for refusing a nickname', async () => {
    answerRpc({ join: { data: null, error: { code: '22023', message: 'That nickname is not allowed.' } } });
    signInResident(ANA);
    renderPage();
    const form = await screen.findByRole('form', { name: 'How you are shown' });
    fireEvent.click(within(form).getByRole('radio', { name: /A nickname/ }));
    fireEvent.change(within(form).getByLabelText(/Nickname/), { target: { value: 'Tanga ka' } });
    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.click(within(form).getByRole('button', { name: 'Join' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('That nickname is not allowed.');
  });

  it('welcomes a resident who has joined, by the name they chose', async () => {
    signInResident({ ...ANA, show_as: 'nickname', nickname: 'Puno ng Laguna', consented_at: '2026-10-19T00:00:00Z' });
    renderPage();
    expect(await screen.findByText('You have joined as')).toBeInTheDocument();
    expect(screen.getByText('Puno ng Laguna', { selector: 'p' })).toBeInTheDocument();
    // Every Tag a tree here opens the map with tagging started (22 October).
    for (const link of screen.getAllByRole('link', { name: /Tag a tree/ })) expect(link).toHaveAttribute('href', '/public-map?tag=1');
    expect(await screen.findByText('(you)')).toBeInTheDocument();
  });

  it('tells an office account the community is for residents', async () => {
    supabaseMock.signInAs(SANTA_CRUZ_ADMIN, SANTA_CRUZ);
    renderPage();
    expect(await screen.findByText(/signed in with an office account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });
});

describe('a resident’s own account (RA 10173)', () => {
  it('deletes it, after asking, and says so', async () => {
    signInResident({ ...ANA, consented_at: '2026-10-19T00:00:00Z' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const ask = screen.getByRole('alertdialog', { name: 'Delete your account?' });
    expect(ask).toHaveTextContent('The trees you tagged stay on the map as trees, credited to nobody.');
    expect(supabaseMock.supabase.rpc).not.toHaveBeenCalledWith('delete_my_account');

    // Once deleted, the session is gone too.
    supabaseMock.supabase.auth.signOut.mockImplementation(async () => {
      const listener = supabaseMock.supabase.auth.onAuthStateChange.mock.calls[0][0];
      listener('SIGNED_OUT', null);
      return { error: null };
    });
    fireEvent.click(within(ask).getByRole('button', { name: 'Yes, delete my account' }));
    await waitFor(() => expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('delete_my_account'));
    expect(await screen.findByText('Your account, and everything kept with it, is deleted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('can be kept after all', async () => {
    signInResident({ ...ANA, consented_at: '2026-10-19T00:00:00Z' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(supabaseMock.supabase.rpc).not.toHaveBeenCalledWith('delete_my_account');
  });
});

describe('each city’s own leaderboard', () => {
  it('shows one city or municipality’s board when chosen', async () => {
    renderPage();
    await screen.findByRole('list', { name: 'Leaderboard' });
    fireEvent.change(screen.getByLabelText('Leaderboard for'), { target: { value: String(SANTA_CRUZ.psgc) } });
    await waitFor(() =>
      expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('community_leaderboard', { p_limit: 10, p_lgu: SANTA_CRUZ.psgc })
    );
  });
});

describe('replies from the offices', () => {
  it('shows a resident the replies to their messages, and marks them read', async () => {
    signInResident({ ...ANA, consented_at: '2026-10-19T00:00:00Z' });
    supabaseMock.setResponse('message_replies:select', {
      data: [{ id: 'r1', office_label: 'Santa Cruz MENRO / CENRO', body: 'Salamat! We will visit.', original_body: 'Is this tree sick?', created_at: '2026-10-19T03:00:00Z', read_at: null }],
      error: null,
    });
    renderPage();
    const replies = await screen.findByRole('region', { name: 'Replies from the offices' });
    expect(await within(replies).findByText('Salamat! We will visit.')).toBeInTheDocument();
    expect(replies).toHaveTextContent('Santa Cruz MENRO / CENRO');
    expect(replies).toHaveTextContent('New');
    await waitFor(() => expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('mark_my_replies_read'));
  });
});

describe('the "!" on a resident’s name', () => {
  it('shows when an office’s reply waits, and clears once the replies are shown', async () => {
    const { default: PublicNavbar } = await import('../../components/PublicNavbar.jsx');
    signInResident({ ...ANA, consented_at: '2026-10-19T00:00:00Z' });
    supabaseMock.setResponse('message_replies:select', (record) =>
      record.filters.some(([column]) => column === 'read_at')
        ? { data: [{ id: 'r1' }], error: null }
        : { data: [{ id: 'r1', office_label: 'Santa Cruz MENRO / CENRO', body: 'Salamat!', original_body: 'Hi', created_at: '2026-10-19T03:00:00Z', read_at: null }], error: null }
    );
    render(
      <MemoryRouter>
        <AuthProvider>
          <PublicNavbar />
        </AuthProvider>
      </MemoryRouter>
    );
    expect((await screen.findAllByRole('status', { name: '1 reply from an office waiting' }))[0]).toHaveTextContent('!');
    cleanup();

    render(
      <MemoryRouter>
        <AuthProvider>
          <PublicNavbar />
          <CommunityPage />
        </AuthProvider>
      </MemoryRouter>
    );
    await screen.findByText('Salamat!');
    await waitFor(() => expect(screen.queryByRole('status', { name: /reply from an office waiting/ })).not.toBeInTheDocument());
  });
});

describe('the call to action (22 October)', () => {
  function Where() {
    const { pathname, search } = useLocation();
    return <p data-testid="where">{pathname + search}</p>;
  }
  const renderWithMap = () =>
    render(
      <MemoryRouter initialEntries={['/community']}>
        <AuthProvider>
          <Routes>
            <Route path="/community" element={<CommunityPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
  beforeEach(() => sessionStorage.clear());

  it('opens with a hero, why the community matters, and the sign-up first', async () => {
    renderPage();
    expect(await screen.findByRole('region', { name: 'Green Tag Community' })).toHaveTextContent('Get involved');
    expect(screen.getByRole('region', { name: 'Why the community matters' })).toHaveTextContent('Join the tree plantings');
    fireEvent.click(screen.getByRole('button', { name: 'Sign up with Google' }));
    await waitFor(() => expect(supabaseMock.supabase.auth.signInWithOAuth).toHaveBeenCalled());
    // Back to the Community page — the address Supabase allows — remembering to tag.
    expect(supabaseMock.supabase.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo).toMatch(/\/community$/);
    expect(sessionStorage.getItem('green-tag:after-join')).toBe('tag');
  });

  it('sends a resident who signed up to tag straight to the map, Tag a tree open, once joined', async () => {
    sessionStorage.setItem('green-tag:after-join', 'tag');
    signInResident({ ...ANA, consented_at: '2026-10-22T00:00:00Z' });
    renderWithMap();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/public-map?tag=1'));
    expect(sessionStorage.getItem('green-tag:after-join')).toBeNull();
  });

  it('leaves a resident who just visits on the Community page', async () => {
    signInResident({ ...ANA, consented_at: '2026-10-22T00:00:00Z' });
    renderWithMap();
    expect(await screen.findByText('You have joined as')).toBeInTheDocument();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
  });
});
