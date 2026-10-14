import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Covers the Arborists page: the app shell it renders in, the creation form,
 * and the Field Team roster.
 *
 * These tests were originally written against a prototype that held a
 * hard-coded Mock_Arborist_List and, on submit, did nothing but `console.log`
 * an Account_Creation_Payload. The page is now backed by Supabase, so each
 * test keeps its original intent — the page heading, the form's labelled
 * fields and their types, controlled inputs, DOM order, the roster columns,
 * one row per arborist, a per-row action, and stable React keys — retargeted
 * at what the component actually does. The tests whose subject no longer
 * exists at all (the logged payload, and the Reset Password / Revoke Access
 * buttons, since replaced by Delete) are rewritten around the current
 * behaviour rather than deleted.
 *
 * The approval queue has its own file, ManageArborists.approval.test.jsx.
 */

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import { SANTA_CRUZ, SANTA_CRUZ_ADMIN } from '../test/accounts.js';
import App from '../App.jsx';
import ManageArborists from './ManageArborists.jsx';

const ROSTER = [
  {
    id: 'arb-001',
    name: 'Maria Santos',
    email: 'maria.santos@menro.local',
    contact_number: 9175550142,
    status: 'Active',
  },
  {
    id: 'arb-002',
    name: 'Juan Dela Cruz',
    email: 'juan.delacruz@menro.local',
    contact_number: 9175550188,
    status: 'Offline',
  },
  {
    id: 'arb-003',
    name: 'Liza Reyes',
    email: 'liza.reyes@menro.local',
    contact_number: 9175550203,
    status: 'Active',
  },
];

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('arborists:select', { data: ROSTER, error: null });
  supabaseMock.setResponse('arborists:insert', {
    data: [{ id: 'arb-004', name: 'New Arborist', email: 'new@menro.local', status: 'Active' }],
    error: null,
  });
  supabaseMock.setResponse('profiles:select', { data: [], error: null });
  supabaseMock.setResponse('profiles:upsert', { data: null, error: null });
  supabaseMock.setResponse('trees:select', { data: [], error: null });
});

/** Renders the page and waits for the roster fetch to land. */
async function renderPage() {
  render(<ManageArborists />);
  const roster = await screen.findByRole('region', { name: 'Arborists Table' });
  await waitFor(() =>
    expect(within(roster).getByText('Maria Santos')).toBeInTheDocument(),
  );
  return roster;
}

/** The form's four free-text fields, by accessible name. */
function formFields() {
  return {
    fullName: screen.getByLabelText('Full Name'),
    email: screen.getByLabelText('Email Address'),
    // This label carries a "(11-digit PH mobile)" hint, so match loosely.
    contactNumber: screen.getByLabelText(/Contact Number/),
    temporaryPassword: screen.getByLabelText('Temporary Password'),
  };
}

describe('ManageArborists', () => {
  it('renders inside the App shell with Sidebar, Header, and p-6 padding when routed to /arborists', async () => {
    // /arborists sits behind ProtectedRoute, so without a session App
    // redirects to /login and the page never renders — and without a profile
    // saying whose account it is, it is turned away at the door.
    supabaseMock.signInAs(SANTA_CRUZ_ADMIN, SANTA_CRUZ);

    const { container } = render(
      <MemoryRouter initialEntries={['/arborists']}>
        <App />
      </MemoryRouter>,
    );

    // The level-1 heading names the feature so the admin can identify the page.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Arborists' }),
    ).toBeInTheDocument();

    // Sidebar is rendered as <nav> (role="navigation").
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);

    // Header is rendered as <header>. The page itself also wraps its <h1> in a
    // <header> element, so both carry the implicit banner role under
    // @testing-library/dom — query by the app title text, which is unique to
    // the Header component, to disambiguate.
    expect(screen.getByText('Green Tag Tree Inventory System')).toBeInTheDocument();

    // The shared <main> inherits the default p-6 padding on non-/map routes.
    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main.className).toContain('p-6');
  });

  it('renders the page heading with the Create Arborist Account section before the roster table in DOM order', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Arborists' }),
    ).toBeInTheDocument();

    // Level-2 heading sits inside the Account Creation Form section.
    const formHeading = screen.getByRole('heading', {
      level: 2,
      name: 'Create Arborist Account',
    });
    expect(formHeading).toBeInTheDocument();

    const roster = screen.getByRole('region', { name: 'Arborists Table' });
    const rosterTable = within(roster).getByRole('table');

    // DOCUMENT_POSITION_FOLLOWING (0x04) means the argument follows the reference node.
    const position = formHeading.compareDocumentPosition(rosterTable);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders labeled inputs for Full Name, Email Address, Contact Number, and Temporary Password with correct input types', async () => {
    await renderPage();
    const { fullName, email, contactNumber, temporaryPassword } = formFields();

    // Each accessible-name lookup must resolve to an <input> element so the
    // form fields stay retrievable by accessible name.
    expect(fullName.tagName).toBe('INPUT');
    expect(email.tagName).toBe('INPUT');
    expect(contactNumber.tagName).toBe('INPUT');
    expect(temporaryPassword.tagName).toBe('INPUT');

    expect(email.type).toBe('email');
    expect(temporaryPassword.type).toBe('password');
    expect(contactNumber.type).toBe('tel');
  });

  it('renders the assigned-area selects the mobile geofence depends on', async () => {
    await renderPage();

    const municipality = screen.getByLabelText(/Municipality \/ City/);
    const barangay = screen.getByLabelText('Barangay');
    expect(municipality.tagName).toBe('SELECT');
    expect(barangay.tagName).toBe('SELECT');

    // All 30 Laguna LGUs, plus the placeholder option.
    expect(within(municipality).getAllByRole('option')).toHaveLength(31);
  });

  it('renders a submit button with the exact label "Create Arborist Account"', async () => {
    await renderPage();

    // A level-2 heading carries the same text, so pin the submit control by role.
    expect(
      screen.getByRole('button', { name: 'Create Arborist Account' }),
    ).toBeInTheDocument();
  });

  it('reflects typed values in each form input as change events fire', async () => {
    await renderPage();
    const { fullName, email, contactNumber, temporaryPassword } = formFields();

    // The fields are controlled inputs whose visible `.value` is driven by
    // component state. Firing a distinct `change` event into each and reading
    // `.value` back pins that down without depending on user-event (not
    // installed) or on internal component state.
    fireEvent.change(fullName, { target: { value: 'Maria Santos' } });
    expect(fullName.value).toBe('Maria Santos');

    fireEvent.change(email, { target: { value: 'maria.santos@menro.local' } });
    expect(email.value).toBe('maria.santos@menro.local');

    fireEvent.change(temporaryPassword, { target: { value: 'TempPass!234' } });
    expect(temporaryPassword.value).toBe('TempPass!234');

    // Contact number is not free text any more: it strips non-digits and
    // clamps to 11, so a pasted "+63 917 555 0142" comes back as digits only.
    fireEvent.change(contactNumber, { target: { value: '+63 917 555 0142' } });
    expect(contactNumber.value).toBe('63917555014');
    expect(contactNumber.value).toHaveLength(11);
  });

  it('creates the account from the form values and clears every input', async () => {
    await renderPage();
    const { fullName, email, contactNumber, temporaryPassword } = formFields();

    // Distinct values per field, so a regression that swaps two of them in
    // the payload surfaces as a mismatch instead of passing silently.
    fireEvent.change(fullName, { target: { value: 'Maria Santos' } });
    fireEvent.change(email, { target: { value: 'maria.santos@menro.local' } });
    fireEvent.change(contactNumber, { target: { value: '09175550142' } });
    fireEvent.change(temporaryPassword, { target: { value: 'TempPass!234' } });
    fireEvent.change(screen.getByLabelText(/Municipality \/ City/), {
      target: { value: 'Santa Cruz' },
    });
    fireEvent.change(screen.getByLabelText('Barangay'), {
      target: { value: 'Pagsawitan' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create Arborist Account' }));

    // The payload goes to Supabase now rather than console.log: an auth
    // account so they can sign in, and a roster row so they can be dispatched.
    await waitFor(() =>
      expect(supabaseMock.writesTo('arborists', 'insert')).toHaveLength(1),
    );
    expect(supabaseMock.supabase.auth.signUp).toHaveBeenCalledTimes(1);
    expect(supabaseMock.supabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'maria.santos@menro.local',
        password: 'TempPass!234',
      }),
    );
    // The municipality rides along with the sign-up itself: that is the only
    // moment the database reads it to place the officer in an LGU.
    expect(supabaseMock.supabase.auth.signUp.mock.calls[0][0].options.data.municipality).toBe('Santa Cruz');
    expect(supabaseMock.writesTo('arborists', 'insert')[0].payload).toMatchObject({
      name: 'Maria Santos',
      email: 'maria.santos@menro.local',
      contact_number: 9175550142,
      status: 'Active',
    });

    // Every input is cleared once the submit handler completes.
    await waitFor(() => expect(fullName.value).toBe(''));
    expect(email.value).toBe('');
    expect(contactNumber.value).toBe('');
    expect(temporaryPassword.value).toBe('');
    expect(screen.getByLabelText(/Municipality \/ City/).value).toBe('');
    expect(screen.getByLabelText('Barangay').value).toBe('');
  });

  it('renders the roster table with its column headers in a fixed order', async () => {
    const roster = await renderPage();

    // Pins the header row's columns and their order: a regression that drops,
    // adds or reorders a column fails here.
    const headerTexts = within(roster)
      .getAllByRole('columnheader')
      .map((th) => th.textContent);

    expect(headerTexts).toEqual([
      'Name',
      'Email',
      'Contact',
      'Tasks',
      'Declined',
      'Status',
      'Actions',
    ]);
  });

  it('renders one body row per arborist with name, email, contact and status cells', async () => {
    const roster = await renderPage();

    // One row per record, plus the single header row.
    expect(within(roster).getAllByRole('row')).toHaveLength(ROSTER.length + 1);

    for (const arborist of ROSTER) {
      expect(within(roster).getByText(arborist.name)).toBeInTheDocument();
      expect(within(roster).getByText(arborist.email)).toBeInTheDocument();
      expect(
        within(roster).getByText(String(arborist.contact_number)),
      ).toBeInTheDocument();
    }

    // The status column surfaces both values across the fixture.
    expect(within(roster).getAllByText('Active')).toHaveLength(2);
    expect(within(roster).getByText('Offline')).toBeInTheDocument();
  });

  it('renders one Delete button per roster row', async () => {
    const roster = await renderPage();

    expect(
      within(roster).getAllByRole('button', { name: /Delete/ }),
    ).toHaveLength(ROSTER.length);
  });

  it('releases the arborist trees before deleting them, and drops the row', async () => {
    const roster = await renderPage();

    fireEvent.click(within(roster).getAllByRole('button', { name: /Delete/ })[0]);

    await waitFor(() =>
      expect(supabaseMock.writesTo('arborists', 'delete')).toHaveLength(1),
    );

    // Their trees have to be unassigned first, or a tree is left pointing at
    // an arborist who no longer exists.
    const release = supabaseMock.writesTo('trees', 'update')[0];
    expect(release.payload).toMatchObject({
      assigned_to: null,
      task_status: 'Pending',
    });
    expect(release.filters).toEqual([['assigned_to', ROSTER[0].email]]);

    expect(supabaseMock.writesTo('arborists', 'delete')[0].filters).toEqual([
      ['id', ROSTER[0].id],
    ]);
    await waitFor(() =>
      expect(within(roster).queryByText(ROSTER[0].name)).not.toBeInTheDocument(),
    );
  });

  it('does not emit any React key warnings when rendering the roster rows', async () => {
    // Every body row should carry a stable React key derived from the record's
    // `id`. React surfaces missing-key and duplicate-key problems exclusively
    // via `console.error` at render time, so spying on it and asserting no
    // call mentions `'key'` pins the stable-key contract without coupling the
    // test to React's exact warning wording.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await renderPage();

      const keyMentioned = errorSpy.mock.calls.some((callArgs) =>
        callArgs.some(
          (arg) => typeof arg === 'string' && arg.toLowerCase().includes('key'),
        ),
      );
      expect(keyMentioned).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
