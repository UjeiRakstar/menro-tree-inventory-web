import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import { CALAMBA, PGENRO_ADMIN, SANTA_CRUZ } from '../../test/accounts.js';
import Accounts from './Accounts.jsx';

const FUTURE = new Date(Date.now() + 7 * 864e5).toISOString();
const PAST = new Date(Date.now() - 7 * 864e5).toISOString();

const admin = (over) => ({
  id: 'a1',
  email: 'juan@santacruz.gov.ph',
  full_name: 'Juan dela Cruz',
  role: 'lgu_admin',
  lgu_psgc: SANTA_CRUZ.psgc,
  status: 'active',
  is_approved: true,
  ...over,
});

const code = (over) => ({
  id: 'c1',
  lgu_psgc: SANTA_CRUZ.psgc,
  note: 'For Maria',
  issued_at: PAST,
  expires_at: FUTURE,
  redeemed_at: null,
  revoked_at: null,
  ...over,
});

function seed({ profiles = [admin()], codes = [], log = [] } = {}) {
  supabaseMock.setResponse('lgus:select', { data: [CALAMBA, SANTA_CRUZ], error: null });
  supabaseMock.setResponse('profiles:select', { data: [PGENRO_ADMIN, ...profiles], error: null });
  supabaseMock.setResponse('account_codes:select', { data: codes, error: null });
  supabaseMock.setResponse('activity_log:select', { data: log, error: null });
}

const card = (name) => screen.getByRole('region', { name });

beforeEach(() => {
  supabaseMock.reset();
  seed();
});
afterEach(cleanup);

describe('the LGU list', () => {
  it('shows every LGU with its admins', async () => {
    render(<Accounts />);
    const santaCruz = await screen.findByRole('region', { name: 'Santa Cruz' });
    expect(within(santaCruz).getByText('Juan dela Cruz')).toBeInTheDocument();
    expect(within(card('Calamba City')).getByText('No admin account set up yet.')).toBeInTheDocument();
  });

  it('counts a seat for each admin not archived and each code still out', async () => {
    seed({
      profiles: [
        admin({ id: 'a1' }),
        admin({ id: 'a2', status: 'locked' }), // keeps its seat
        admin({ id: 'a3', status: 'archived' }), // frees it
      ],
      codes: [code({ id: 'c1' }), code({ id: 'c2', expires_at: PAST })],
    });
    render(<Accounts />);
    const santaCruz = await screen.findByRole('region', { name: 'Santa Cruz' });
    expect(within(santaCruz).getByText('3 of 5 seats')).toBeInTheDocument();
  });

  it('will not issue a sixth seat', async () => {
    seed({
      profiles: [1, 2, 3, 4].map((n) => admin({ id: `a${n}` })),
      codes: [code()],
    });
    render(<Accounts />);
    const santaCruz = await screen.findByRole('region', { name: 'Santa Cruz' });
    expect(within(santaCruz).getByRole('button', { name: /Issue code/ })).toBeDisabled();
  });

  it('calls out an LGU with nobody able to sign in', async () => {
    render(<Accounts />);
    expect(await screen.findByText('1 with no active admin')).toBeInTheDocument();
  });

  it('finds an LGU by name', async () => {
    render(<Accounts />);
    await screen.findByRole('region', { name: 'Santa Cruz' });
    fireEvent.change(screen.getByLabelText('Find a city or municipality'), { target: { value: 'calam' } });
    expect(screen.queryByRole('region', { name: 'Santa Cruz' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Calamba City' })).toBeInTheDocument();
  });

  it('says what to run when the accounts tables are not there yet', async () => {
    supabaseMock.setResponse('lgus:select', {
      data: null,
      error: { message: 'relation "public.lgus" does not exist' },
    });
    render(<Accounts />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Run supabase\/accounts\.sql/);
  });
});

describe('issuing a code', () => {
  it('shows the code once, and says it will not be shown again', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({
      data: [{ code: 'CLB-7K2P-9QXM', expires_at: FUTURE }],
      error: null,
    });
    render(<Accounts />);
    const calamba = await screen.findByRole('region', { name: 'Calamba City' });
    fireEvent.click(within(calamba).getByRole('button', { name: /Issue code/ }));

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Who is it for/), { target: { value: 'Ana Reyes' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Issue code' }));

    expect(await within(dialog).findByText('CLB-7K2P-9QXM')).toBeInTheDocument();
    expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('issue_account_code', {
      p_lgu: CALAMBA.psgc,
      p_note: 'Ana Reyes',
    });
    // Only a hash is kept. If this dialog is closed, the code is gone.
    expect(within(dialog).getByText(/only time this code is shown/)).toBeInTheDocument();
  });

  it('revokes a code still out', async () => {
    seed({ codes: [code({ id: 'c9' })] });
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
    render(<Accounts />);
    const santaCruz = await screen.findByRole('region', { name: 'Santa Cruz' });
    fireEvent.click(within(santaCruz).getByRole('button', { name: 'Revoke' }));
    await waitFor(() =>
      expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('revoke_account_code', { p_id: 'c9' })
    );
  });
});

describe('what PGENRO can do to an account', () => {
  async function openRow() {
    render(<Accounts />);
    return screen.findByRole('region', { name: 'Santa Cruz' });
  }

  it('locks an account only after saying what locking does', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
    const santaCruz = await openRow();
    fireEvent.click(within(santaCruz).getByRole('button', { name: /Lock/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/keep their seat/);
    expect(supabaseMock.supabase.rpc).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Lock account' }));
    await waitFor(() =>
      expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('set_account_status', {
        p_user: 'a1',
        p_status: 'locked',
      })
    );
    // And the server function ends their open sessions.
    await waitFor(() =>
      expect(supabaseMock.supabase.functions.invoke).toHaveBeenCalledWith('manage-account', {
        body: { action: 'sign_out', user_id: 'a1' },
      })
    );
  });

  it('archives rather than deletes', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
    const santaCruz = await openRow();
    expect(within(santaCruz).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();

    fireEvent.click(within(santaCruz).getByRole('button', { name: /Archive/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/name stays on everything they recorded/);
  });

  it('still locks when the server function is not deployed, and says how far it got', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
    supabaseMock.supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to send a request to the Edge Function' },
    });
    const santaCruz = await openRow();
    fireEvent.click(within(santaCruz).getByRole('button', { name: /Lock/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lock account' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/can no longer change anything/);
  });

  it('sends a reset email — the officer chooses the password', async () => {
    const santaCruz = await openRow();
    fireEvent.click(within(santaCruz).getByRole('button', { name: /Reset password/ }));
    await waitFor(() =>
      expect(supabaseMock.supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'juan@santacruz.gov.ph',
        expect.any(Object)
      )
    );
  });

  it('refuses a short password before calling the server', async () => {
    const santaCruz = await openRow();
    fireEvent.click(within(santaCruz).getByRole('button', { name: /Change password/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/at least 10/);
    expect(supabaseMock.supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('updates an email through the server function', async () => {
    const santaCruz = await openRow();
    fireEvent.click(within(santaCruz).getByRole('button', { name: /Update email/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New email address'), {
      target: { value: 'juan.new@santacruz.gov.ph' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Update email' }));
    await waitFor(() =>
      expect(supabaseMock.supabase.functions.invoke).toHaveBeenCalledWith('manage-account', {
        body: { action: 'set_email', user_id: 'a1', email: 'juan.new@santacruz.gov.ph' },
      })
    );
  });

  it('names the missing server function rather than failing vaguely', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Function not found' },
    });
    const santaCruz = await openRow();
    fireEvent.click(within(santaCruz).getByRole('button', { name: /Change password/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'longenough1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/has not been deployed yet/);
  });
});

describe('the activity log', () => {
  it('shows what was done, by whom, in which LGU', async () => {
    seed({
      log: [
        {
          id: 1,
          at: PAST,
          actor_email: 'pgenro@laguna.gov.ph',
          actor_role: 'pgenro',
          lgu_psgc: SANTA_CRUZ.psgc,
          action: 'code.issued',
        },
      ],
    });
    render(<Accounts />);
    await screen.findByRole('region', { name: 'Santa Cruz' });
    fireEvent.click(screen.getByRole('tab', { name: 'Activity log' }));

    const row = screen.getByText('code.issued').closest('tr');
    expect(within(row).getByText('pgenro@laguna.gov.ph')).toBeInTheDocument();
    expect(within(row).getByText('Santa Cruz')).toBeInTheDocument();
  });
});
