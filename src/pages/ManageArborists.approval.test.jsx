import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * Covers the arborist approval queue and the assigned-area fields.
 *
 * Mobile sign-ups land in public.profiles with is_approved = false. Before
 * this queue existed nothing in the web app ever wrote that flag, so a
 * self-registered arborist was locked out permanently. Approving also has to
 * add them to public.arborists, which is what the dispatch assignee list
 * reads — approval without that leaves an arborist who can log in but can
 * never be given a task.
 */

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import ManageArborists from './ManageArborists.jsx';

const PENDING_ARBORIST = {
  id: 'uuid-pending-1',
  email: 'juan@lspu.edu.ph',
  full_name: 'Juan Dela Cruz',
  contact_number: '09171234567',
  municipality: 'Santa Cruz',
  barangay: 'Pagsawitan',
  avatar_url: null,
  is_approved: false,
  rejected_at: null,
  created_at: '2026-10-01T00:00:00Z',
};

beforeEach(() => {
  supabaseMock.reset();

  // Both the "registered users" list and the pending queue read profiles; the
  // pending one is the query filtered on is_approved.
  supabaseMock.setResponse('profiles:select', (record) =>
    record.filters.some(([column]) => column === 'is_approved')
      ? { data: [PENDING_ARBORIST], error: null }
      : { data: [], error: null },
  );
  // An update that actually touched a row returns it. Returning nothing is
  // what an RLS-blocked update looks like, which has its own tests below.
  supabaseMock.setResponse('profiles:update', {
    data: [{ id: PENDING_ARBORIST.id }],
    error: null,
  });
  supabaseMock.setResponse('profiles:upsert', { data: null, error: null });
  supabaseMock.setResponse('arborists:select', { data: [], error: null });
  supabaseMock.setResponse('arborists:upsert', {
    data: [{ id: 7, name: 'Juan Dela Cruz', email: PENDING_ARBORIST.email, status: 'Active' }],
    error: null,
  });
  supabaseMock.setResponse('arborists:insert', { data: [{ id: 8 }], error: null });
  supabaseMock.setResponse('trees:select', { data: [], error: null });
});

async function renderQueue() {
  render(<ManageArborists />);
  const section = await screen.findByRole('region', { name: 'Pending Applications' });
  await waitFor(() =>
    expect(within(section).getByText('Juan Dela Cruz')).toBeInTheDocument(),
  );
  return section;
}

describe('pending applications queue', () => {
  it('lists a mobile sign-up with the area it registered for', async () => {
    const section = await renderQueue();

    expect(within(section).getByText(PENDING_ARBORIST.email)).toBeInTheDocument();
    expect(within(section).getByText(/Brgy\. Pagsawitan, Santa Cruz/)).toBeInTheDocument();
    expect(within(section).getByText('1 waiting')).toBeInTheDocument();
  });

  it('only queries profiles that are unapproved and not already declined', async () => {
    await renderQueue();

    const pendingQuery = supabaseMock.queryFiltering('profiles', 'is_approved');
    expect(pendingQuery.filters).toEqual(
      expect.arrayContaining([
        ['is_approved', false],
        ['rejected_at', null],
      ]),
    );
  });

  it('warns when an application has no municipality to geofence against', async () => {
    supabaseMock.setResponse('profiles:select', (record) =>
      record.filters.some(([column]) => column === 'is_approved')
        ? { data: [{ ...PENDING_ARBORIST, municipality: '', barangay: '' }], error: null }
        : { data: [], error: null },
    );

    const section = await renderQueue();
    expect(within(section).getByText('No area given')).toBeInTheDocument();
    expect(within(section).getByText(/will have no geofence/)).toBeInTheDocument();
  });
});

describe('approving an application', () => {
  it('flips is_approved and adds the arborist to the dispatch roster', async () => {
    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    await waitFor(() => expect(supabaseMock.writesTo('arborists', 'upsert')).toHaveLength(1));

    const approval = supabaseMock.writesTo('profiles', 'update')[0];
    expect(approval.payload).toMatchObject({ is_approved: true, rejected_at: null });
    expect(approval.filters).toEqual([['id', PENDING_ARBORIST.id]]);

    // Without this row the arborist cannot be assigned a task.
    expect(supabaseMock.writesTo('arborists', 'upsert')[0].payload).toMatchObject({
      email: PENDING_ARBORIST.email,
      name: 'Juan Dela Cruz',
      status: 'Active',
      contact_number: 9171234567,
    });

    await waitFor(() =>
      expect(within(section).queryByText('Juan Dela Cruz')).not.toBeInTheDocument(),
    );
  });

  it('reports a partial failure when the roster insert fails', async () => {
    supabaseMock.setResponse('arborists:upsert', {
      data: null,
      error: { message: 'duplicate key' },
    });

    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    // The account works but they are not dispatchable, and the UI has to say
    // so rather than looking like a clean success.
    expect(
      await screen.findByText(/could not be added to the dispatch roster/),
    ).toBeInTheDocument();
  });

  it('keeps the application in the queue when the approval itself fails', async () => {
    supabaseMock.setResponse('profiles:update', { data: null, error: { message: 'RLS denied' } });

    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    expect(await screen.findByText(/Could not approve/)).toBeInTheDocument();
    expect(supabaseMock.writesTo('arborists', 'upsert')).toHaveLength(0);
    expect(within(section).getByText('Juan Dela Cruz')).toBeInTheDocument();
  });
});

describe('an approval that row-level security silently blocks', () => {
  // RLS filters rows out of an UPDATE rather than rejecting it: zero rows
  // match, zero rows change, and no error is raised. This shipped once and
  // made the dashboard report approvals that never happened.
  beforeEach(() => {
    supabaseMock.setResponse('profiles:update', { data: [], error: null });
  });

  it('says so instead of reporting success', async () => {
    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    expect(await screen.findByText(/was NOT approved/)).toBeInTheDocument();
    expect(screen.getByText(/row-level security/)).toBeInTheDocument();
  });

  it('names the signed-in account and that it is not an admin', async () => {
    // The two causes — no policy, or signed in as a non-admin — need opposite
    // fixes, so the message has to say which one it is.
    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    expect(
      await screen.findByText(/menro@example\.gov\.ph, which is NOT an admin/),
    ).toBeInTheDocument();
    // And hands over the exact statement that fixes it.
    expect(screen.getByText(/set role = 'admin' where email =/)).toBeInTheDocument();
  });

  it('points at the policy when the account IS already an admin', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: true, error: null });

    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    expect(
      await screen.findByText(/which IS an admin/),
    ).toBeInTheDocument();
  });

  it('says the policy file has not been run when the function is missing', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'function public.is_menro_admin() does not exist' },
    });

    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    expect(
      await screen.findByText(/is_menro_admin\(\) function is missing/),
    ).toBeInTheDocument();
  });

  it('does not add the arborist to the roster', async () => {
    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    await screen.findByText(/was NOT approved/);
    // A roster row for an unapproved arborist is exactly the inconsistency
    // that made this look like it had worked.
    expect(supabaseMock.writesTo('arborists', 'upsert')).toHaveLength(0);
  });

  it('leaves the application in the queue', async () => {
    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /Approve/ }));

    await screen.findByText(/was NOT approved/);
    // Removing the card is what hid the failure until the page was refreshed.
    expect(within(section).getByText('Juan Dela Cruz')).toBeInTheDocument();
  });

  it('reports a silently blocked decline too', async () => {
    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /^Decline/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));

    expect(await screen.findByText(/was NOT declined/)).toBeInTheDocument();
    expect(within(section).getByText('Juan Dela Cruz')).toBeInTheDocument();
  });
});

describe('declining an application', () => {
  it('records the time and the reason', async () => {
    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /^Decline/ }));

    fireEvent.change(
      screen.getByLabelText(`Reason for declining ${PENDING_ARBORIST.email}`),
      { target: { value: 'Not a MENRO field officer' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));

    await waitFor(() => expect(supabaseMock.writesTo('profiles', 'update')).toHaveLength(1));
    const decline = supabaseMock.writesTo('profiles', 'update')[0];
    expect(decline.payload.rejection_reason).toBe('Not a MENRO field officer');
    expect(decline.payload.rejected_at).toEqual(expect.any(String));
    expect(decline.payload.is_approved).toBeUndefined();
  });

  it('stores no reason when the field is left blank', async () => {
    const section = await renderQueue();
    fireEvent.click(within(section).getByRole('button', { name: /^Decline/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm decline' }));

    await waitFor(() => expect(supabaseMock.writesTo('profiles', 'update')).toHaveLength(1));
    expect(supabaseMock.writesTo('profiles', 'update')[0].payload.rejection_reason).toBeNull();
  });
});

describe('assigned area on the creation form', () => {
  const fill = () => {
    fireEvent.change(screen.getByRole('textbox', { name: /Full Name/ }), {
      target: { value: 'Maria Santos' },
    });
    fireEvent.change(screen.getByLabelText(/Email Address/), {
      target: { value: 'maria@lspu.edu.ph' },
    });
    fireEvent.change(screen.getByLabelText(/Temporary Password/), {
      target: { value: 'temp12345' },
    });
  };

  it('refuses to create an account with no municipality', async () => {
    await renderQueue();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create Arborist Account' }));

    expect(
      await screen.findByText('Municipality is required for geofencing.'),
    ).toBeInTheDocument();
    expect(supabaseMock.supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('narrows the barangay list to the chosen municipality', async () => {
    await renderQueue();

    const barangay = screen.getByLabelText(/Barangay/);
    expect(barangay).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Municipality \/ City/), {
      target: { value: 'Santa Cruz' },
    });

    expect(barangay).toBeEnabled();
    expect(within(barangay).getByRole('option', { name: 'Pagsawitan' })).toBeInTheDocument();
    // A barangay from a different LGU must not be offered.
    expect(within(barangay).queryByRole('option', { name: 'Del Carmen' })).toBeNull();
  });

  it('saves the assigned area on the profile so the geofence can read it', async () => {
    await renderQueue();
    fill();
    fireEvent.change(screen.getByLabelText(/Municipality \/ City/), {
      target: { value: 'Santa Cruz' },
    });
    fireEvent.change(screen.getByLabelText(/Barangay/), {
      target: { value: 'Pagsawitan' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Arborist Account' }));

    await waitFor(() => expect(supabaseMock.writesTo('profiles', 'upsert')).toHaveLength(1));
    expect(supabaseMock.writesTo('profiles', 'upsert')[0].payload).toMatchObject({
      id: 'uuid-new',
      email: 'maria@lspu.edu.ph',
      municipality: 'Santa Cruz',
      barangay: 'Pagsawitan',
      is_approved: true, // created by MENRO, so no approval step
    });
  });
});
