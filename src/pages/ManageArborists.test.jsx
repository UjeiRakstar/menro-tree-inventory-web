import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import ManageArborists from './ManageArborists.jsx';

describe('ManageArborists', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('renders inside the App shell with Sidebar, Header, and p-6 padding when routed to /arborists', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/arborists']}>
        <App />
      </MemoryRouter>
    );

    // Field Team level-1 heading from the ManageArborists page
    expect(
      screen.getByRole('heading', { level: 1, name: 'Field Team' })
    ).toBeInTheDocument();

    // Sidebar is rendered as <nav> (role="navigation")
    expect(screen.getByRole('navigation')).toBeInTheDocument();

    // Header is rendered as <header>. The page itself also wraps its <h1> in a
    // <header> element, so both carry the implicit banner role under
    // @testing-library/dom — query by the Mission Control text content
    // (which is unique to the app Header component) to disambiguate.
    expect(screen.getByText('Mission Control')).toBeInTheDocument();

    // The shared <main> inherits the default p-6 padding on non-/map routes
    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main.className).toContain('p-6');
  });

  it('renders the Field Team heading with the Create Arborist Account section before the roster table in DOM order', () => {
    render(<ManageArborists />);

    // Level-1 heading names the feature so the admin can identify the page.
    const pageHeading = screen.getByRole('heading', { level: 1, name: 'Field Team' });
    expect(pageHeading).toBeInTheDocument();

    // Level-2 heading sits inside the Account Creation Form section.
    const formHeading = screen.getByRole('heading', { level: 2, name: 'Create Arborist Account' });
    expect(formHeading).toBeInTheDocument();

    // The Roster Table's <table> element should render AFTER the form's h2 in DOM order.
    const rosterTable = screen.getByRole('table');
    expect(rosterTable).toBeInTheDocument();

    // DOCUMENT_POSITION_FOLLOWING (0x04) means the argument follows the reference node.
    const position = formHeading.compareDocumentPosition(rosterTable);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders labeled inputs for Full Name, Email Address, Contact Number, and Temporary Password with correct input types', () => {
    render(<ManageArborists />);

    const fullNameInput = screen.getByLabelText('Full Name');
    const emailInput = screen.getByLabelText('Email Address');
    const contactNumberInput = screen.getByLabelText('Contact Number');
    const temporaryPasswordInput = screen.getByLabelText('Temporary Password');

    // Each accessible-name lookup must resolve to an <input> element so that
    // the form fields satisfy Requirement 5.7 (retrievable by accessible name).
    expect(fullNameInput.tagName).toBe('INPUT');
    expect(emailInput.tagName).toBe('INPUT');
    expect(contactNumberInput.tagName).toBe('INPUT');
    expect(temporaryPasswordInput.tagName).toBe('INPUT');

    // Email input must be type="email" (Requirement 5.2) and
    // Temporary Password input must be type="password" (Requirement 5.4).
    expect(emailInput.type).toBe('email');
    expect(temporaryPasswordInput.type).toBe('password');
  });

  it('renders a submit button with the exact label "Create Arborist Account"', () => {
    render(<ManageArborists />);

    // Requirement 5.5: the submit control's visible text must be exactly
    // "Create Arborist Account". A level-2 heading with the same text also
    // sits inside the form section, so we look up by the button role
    // specifically to pin the submit control rather than the heading.
    const submitButton = screen.getByRole('button', { name: 'Create Arborist Account' });
    expect(submitButton).toBeInTheDocument();
  });

  it('reflects typed values in each form input as change events fire', () => {
    render(<ManageArborists />);

    const fullNameInput = screen.getByLabelText('Full Name');
    const emailInput = screen.getByLabelText('Email Address');
    const contactNumberInput = screen.getByLabelText('Contact Number');
    const temporaryPasswordInput = screen.getByLabelText('Temporary Password');

    // Requirements 6.2 and 6.4 rely on the four form fields being controlled
    // inputs whose visible `.value` is driven by component state. Firing a
    // distinct `change` event into each input and then reading `.value` back
    // pins down that behaviour without depending on user-event (not installed)
    // or on internal component state.
    fireEvent.change(fullNameInput, { target: { value: 'Maria Santos' } });
    expect(fullNameInput.value).toBe('Maria Santos');

    fireEvent.change(emailInput, { target: { value: 'maria.santos@menro.local' } });
    expect(emailInput.value).toBe('maria.santos@menro.local');

    fireEvent.change(contactNumberInput, { target: { value: '+63 917 555 0142' } });
    expect(contactNumberInput.value).toBe('+63 917 555 0142');

    fireEvent.change(temporaryPasswordInput, { target: { value: 'TempPass!234' } });
    expect(temporaryPasswordInput.value).toBe('TempPass!234');
  });

  it('logs the Account Creation Payload exactly once and clears all four inputs on submit', () => {
    render(<ManageArborists />);

    const fullNameInput = screen.getByLabelText('Full Name');
    const emailInput = screen.getByLabelText('Email Address');
    const contactNumberInput = screen.getByLabelText('Contact Number');
    const temporaryPasswordInput = screen.getByLabelText('Temporary Password');
    const submitButton = screen.getByRole('button', { name: 'Create Arborist Account' });

    // Populate each input with a distinct value so a regression that, for
    // example, swaps two payload fields would surface as a deep-equal failure.
    fireEvent.change(fullNameInput, { target: { value: 'Maria Santos' } });
    fireEvent.change(emailInput, { target: { value: 'maria.santos@menro.local' } });
    fireEvent.change(contactNumberInput, { target: { value: '+63 917 555 0142' } });
    fireEvent.change(temporaryPasswordInput, { target: { value: 'TempPass!234' } });

    fireEvent.click(submitButton);

    // Requirement 6.2: console.log is invoked exactly once with the
    // Account_Creation_Payload assembled from the four form inputs, using the
    // snake_case keys declared in the design's Data Models section.
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith({
      full_name: 'Maria Santos',
      email: 'maria.santos@menro.local',
      contact_number: '+63 917 555 0142',
      temporary_password: 'TempPass!234',
    });

    // Requirement 6.4: after the submit handler completes, every input is
    // cleared back to the empty string.
    expect(fullNameInput.value).toBe('');
    expect(emailInput.value).toBe('');
    expect(contactNumberInput.value).toBe('');
    expect(temporaryPasswordInput.value).toBe('');
  });

  it('renders the Roster Table with five column headers in the exact order Name, Email, Contact Number, Status, Actions', () => {
    render(<ManageArborists />);

    // Requirement 8.1 pins the Roster Table's header row to exactly five
    // `<th>` columns in a fixed order. Reading `getAllByRole('columnheader')`
    // in document order and mapping to `textContent` surfaces both the count
    // and the ordering contract in a single assertion — a regression that
    // drops a column, adds a column, or reorders any two adjacent columns
    // will fail here.
    const headerTexts = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent);

    expect(headerTexts).toEqual([
      'Name',
      'Email',
      'Contact Number',
      'Status',
      'Actions',
    ]);
  });

  it('renders one body row per Mock_Arborist_List entry with populated full_name, email, contact_number, and status cells', () => {
    render(<ManageArborists />);

    // Requirement 7.2/7.3: exactly three arborist records render, one per
    // Mock_Arborist_List entry. Combined with the single header row, the
    // Roster Table's total row count must be 4 — a regression that drops a
    // record, duplicates a record, or forgets to render `<tbody>` rows will
    // fail this length check.
    const allRows = screen.getAllByRole('row');
    expect(allRows).toHaveLength(4);

    // Requirements 8.2–8.5: each of the three records contributes a row whose
    // cells populate full_name, email, contact_number, and status. Asserting
    // every literal string is in the document pins the mapping from record
    // field to rendered cell without coupling the test to Tailwind class names
    // or to the exact <td> order inside a row.
    const mockRecords = [
      {
        full_name: 'Maria Santos',
        email: 'maria.santos@menro.local',
        contact_number: '+63 917 555 0142',
        status: 'Active',
      },
      {
        full_name: 'Juan Dela Cruz',
        email: 'juan.delacruz@menro.local',
        contact_number: '+63 917 555 0188',
        status: 'Offline',
      },
      {
        full_name: 'Liza Reyes',
        email: 'liza.reyes@menro.local',
        contact_number: '+63 917 555 0203',
        status: 'Active',
      },
    ];

    mockRecords.forEach((record) => {
      // full_name, email, and contact_number are unique per record, so a
      // single getByText suffices. For `status`, the string 'Active' appears
      // in two rows (Maria and Liza), so getAllByText is required there to
      // avoid the "multiple elements found" error. We assert a non-empty
      // match list instead of a specific count so the test remains stable if
      // the status pill wraps the literal in additional elements.
      expect(screen.getByText(record.full_name)).toBeInTheDocument();
      expect(screen.getByText(record.email)).toBeInTheDocument();
      expect(screen.getByText(record.contact_number)).toBeInTheDocument();
      expect(screen.getAllByText(record.status).length).toBeGreaterThan(0);
    });

    // Requirement 8.6: the status column must surface both possible values
    // across the three-row fixture (Active for arb-001/arb-003, Offline for
    // arb-002). Asserting the presence of both literals independently pins
    // the two-valued enum without over-constraining counts.
    expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Offline').length).toBeGreaterThanOrEqual(1);
  });

  it('renders one Reset Password button per roster row and logs the row id on click', () => {
    render(<ManageArborists />);

    // Requirement 9.1: every body row of the Roster Table carries a
    // Reset_Password_Button inside its Actions cell. The Mock_Arborist_List
    // has three records, so the accessible-name lookup must resolve to
    // exactly three buttons. Combined with Requirement 9.2 (the button's
    // visible text names the action), asserting the count via
    // `getAllByRole('button', { name: 'Reset Password' })` pins both the
    // one-per-row contract and the exact label text in a single call.
    const resetButtons = screen.getAllByRole('button', { name: 'Reset Password' });
    expect(resetButtons).toHaveLength(3);

    // Requirement 9.4: clicking the first-row Reset_Password_Button invokes
    // `console.log` exactly once with a message that includes the `id` of
    // that row's Arborist_Record. The first row corresponds to arb-001
    // (Maria Santos) per the Mock_Arborist_List ordering. The stub handler
    // calls `console.log('Reset password requested for arborist', arboristId)`,
    // so the spy sees two arguments: a message string and the id. Asserting
    // with `expect.stringContaining` on the first argument and the exact
    // id as the second argument satisfies the "message includes the id"
    // contract without coupling the test to the message's exact wording.
    fireEvent.click(resetButtons[0]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Reset password'),
      'arb-001'
    );
  });

  it('renders one Revoke Access button per roster row and logs the row id on click', () => {
    render(<ManageArborists />);

    // Requirement 9.1: every body row of the Roster Table carries a
    // Revoke_Access_Button inside its Actions cell. The Mock_Arborist_List
    // has three records, so the accessible-name lookup must resolve to
    // exactly three buttons. Combined with Requirement 9.3 (the button's
    // visible text names the action), asserting the count via
    // `getAllByRole('button', { name: 'Revoke Access' })` pins both the
    // one-per-row contract and the exact label text in a single call.
    const revokeButtons = screen.getAllByRole('button', { name: 'Revoke Access' });
    expect(revokeButtons).toHaveLength(3);

    // Requirement 9.5: clicking the second-row Revoke_Access_Button invokes
    // `console.log` exactly once with a message that includes the `id` of
    // that row's Arborist_Record. The second row corresponds to arb-002
    // (Juan Dela Cruz) per the Mock_Arborist_List ordering. The stub handler
    // calls `console.log('Revoke access requested for arborist', arboristId)`,
    // so the spy sees two arguments: a message string and the id. Asserting
    // with `expect.stringContaining` on the first argument and the exact
    // id as the second argument satisfies the "message includes the id"
    // contract without coupling the test to the message's exact wording.
    fireEvent.click(revokeButtons[1]);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Revoke access'),
      'arb-002'
    );
  });

  it('renders Reset Password and Revoke Access buttons with distinguishable className attributes', () => {
    render(<ManageArborists />);

    // Requirement 9.7: the Reset_Password_Button and Revoke_Access_Button sit
    // side by side inside every Actions cell and MUST be visually
    // distinguishable so a MENRO_Admin can identify the correct action at a
    // glance. The production component achieves this by assigning each
    // button a different Tailwind class string (neutral/outline for Reset
    // Password, red/destructive for Revoke Access). Asserting the two
    // `className` attributes are not equal pins the "visibly different
    // styling" contract without coupling the test to any specific Tailwind
    // class token — a future refactor that swaps, for example, `bg-red-600`
    // for `bg-rose-600` or adjusts padding utilities will still pass, but a
    // regression that accidentally reuses the same class string on both
    // buttons will fail here.
    const firstResetButton = screen.getAllByRole('button', { name: 'Reset Password' })[0];
    const firstRevokeButton = screen.getAllByRole('button', { name: 'Revoke Access' })[0];

    expect(firstResetButton.className).not.toBe(firstRevokeButton.className);
  });

  it('does not emit any React key warnings when rendering the Roster Table rows', () => {
    // Requirement 8.7: every body row carries a stable React key derived from
    // the Arborist_Record's `id`. React surfaces missing-key and
    // duplicate-key problems exclusively via `console.error` warnings at
    // render time, so spying on `console.error` and asserting no call
    // mentions `'key'` pins the stable-key contract without coupling the
    // test to React's exact warning wording. The spy is installed inside
    // this test (rather than in `beforeEach`, which handles `console.log`)
    // and restored at the end so error noise never leaks into other tests.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(<ManageArborists />);

      const keyMentioned = errorSpy.mock.calls.some((callArgs) =>
        callArgs.some((arg) =>
          typeof arg === 'string' && arg.toLowerCase().includes('key')
        )
      );
      expect(keyMentioned).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
