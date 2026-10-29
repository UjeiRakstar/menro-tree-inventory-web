import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mapClick } = vi.hoisted(() => ({ mapClick: {} }));

vi.mock('react-leaflet', () => {
  const passthrough = ({ children }) => <div>{children}</div>;
  return {
    MapContainer: passthrough,
    TileLayer: () => null,
    Polygon: () => null,
    GeoJSON: () => null,
    CircleMarker: ({ center }) => <div data-testid="hall-pin" data-center={JSON.stringify(center)} />,
    useMapEvents: (handlers) => {
      mapClick.handler = handlers.click;
      return {};
    },
  };
});

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import Activate from './Activate.jsx';

const GOOD_CODE = 'SCZ-7K2P-9QXM';

function renderPage() {
  return render(
    <MemoryRouter>
      <Activate />
    </MemoryRouter>
  );
}

const codeBox = () => screen.getByLabelText('Account code');

function typeCode(value) {
  fireEvent.change(codeBox(), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Check code' }));
}

/** What check_account_code() answers. */
function codeAnswers(row) {
  supabaseMock.supabase.rpc.mockResolvedValue({ data: [row], error: null });
}

async function reachAccountForm() {
  codeAnswers({ ok: true, reason: 'ok', lgu_label: 'Santa Cruz', is_city: false });
  renderPage();
  typeCode(GOOD_CODE);
  await screen.findByText('Santa Cruz · Municipal ENRO (MENRO)');
}

function fillAccount({ password = 'longenough1', confirm = password } = {}) {
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Juan dela Cruz' } });
  fireEvent.change(screen.getByLabelText('Work email'), { target: { value: ' juan@santacruz.gov.ph ' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Password again'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Set up account' }));
}

beforeEach(() => supabaseMock.reset());
afterEach(cleanup);

describe('the way back', () => {
  it('is a button under Check code, as wide as it', () => {
    renderPage();
    const back = screen.getByRole('link', { name: 'Back to sign in' });
    expect(back).toHaveAttribute('href', '/login');
    expect(back).toHaveClass('w-full', 'bg-orange-500');
  });

  it('shows the password on request', async () => {
    await reachAccountForm();
    const [show] = screen.getAllByRole('button', { name: 'Show password' });
    fireEvent.click(show);
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Password again')).toHaveAttribute('type', 'password');
  });
});

describe('the code', () => {
  it('lays the code out as it is typed, the way it was issued', () => {
    renderPage();
    fireEvent.change(codeBox(), { target: { value: 'scz7k2p9qxm' } });
    expect(codeBox()).toHaveValue(GOOD_CODE);
  });

  it('catches a misread character without asking the database', () => {
    renderPage();
    typeCode('SCZ-7K2P-9QX0');
    expect(screen.getByRole('alert')).toHaveTextContent(/"0" is a misread/);
    expect(supabaseMock.supabase.rpc).not.toHaveBeenCalled();
  });

  it('asks the database with the code as issued, whatever way it was typed', async () => {
    codeAnswers({ ok: true, reason: 'ok', lgu_label: 'Santa Cruz', is_city: false });
    renderPage();
    typeCode('scz 7k2p 9qxm');
    await waitFor(() =>
      expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('check_account_code', { p_code: 'SCZ7K2P9QXM' })
    );
  });

  it('says whose account the code unlocks before asking for anything else', async () => {
    await reachAccountForm();
    // Somebody holding the wrong code finds out before typing a password.
    expect(screen.getByText('This code sets up')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('lights up the LGU the code is for on a map of Laguna', async () => {
    codeAnswers({ ok: true, reason: 'ok', lgu_label: 'Santa Cruz', lgu_name: 'Santa Cruz', is_city: false, hall_lat: 14.28, hall_lng: 121.41 });
    renderPage();
    typeCode(GOOD_CODE);
    const map = await screen.findByRole('img', { name: 'Map of Laguna, Santa Cruz highlighted' });
    const lit = map.querySelectorAll('path[data-lit]');
    expect([...lit].map((path) => path.dataset.lgu)).toEqual(['Santa Cruz']);
    expect(map.querySelectorAll('path').length).toBe(30);
  });

  it('calls a city’s office the City ENRO', async () => {
    codeAnswers({ ok: true, reason: 'ok', lgu_label: 'Calamba City', is_city: true });
    renderPage();
    typeCode('CLB-7K2P-9QXM');
    expect(await screen.findByText('Calamba City · City ENRO (CENRO)')).toBeInTheDocument();
  });

  it.each([
    ['used', /already been used/],
    ['expired', /expired/],
    ['revoked', /withdrawn/],
    ['not_found', /No account code matches/],
  ])('says what is wrong with a %s code', async (reason, message) => {
    codeAnswers({ ok: false, reason, lgu_label: null, is_city: null });
    renderPage();
    typeCode(GOOD_CODE);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });
});

describe('the account', () => {
  it('refuses a short password before sending anything', async () => {
    await reachAccountForm();
    fillAccount({ password: 'short' });
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 10 characters/);
    expect(supabaseMock.supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('refuses two different passwords', async () => {
    await reachAccountForm();
    fillAccount({ password: 'longenough1', confirm: 'longenough2' });
    expect(screen.getByRole('alert')).toHaveTextContent(/not the same/);
    expect(supabaseMock.supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it('sends the code with the sign-up, for the database to redeem', async () => {
    await reachAccountForm();
    fillAccount();

    await waitFor(() => expect(supabaseMock.supabase.auth.signUp).toHaveBeenCalled());
    const [request] = supabaseMock.supabase.auth.signUp.mock.calls[0];
    expect(request.email).toBe('juan@santacruz.gov.ph');
    // Normalised exactly as the database hashes it, or it would never match.
    expect(request.options.data).toEqual({ full_name: 'Juan dela Cruz', account_code: 'SCZ7K2P9QXM' });
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  });

  it('opens the account at once when Supabase asks for no email confirmation (a training day)', async () => {
    await reachAccountForm();
    supabaseMock.supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'uuid-new' }, session: { access_token: 't' } },
      error: null,
    });
    fillAccount();
    expect(await screen.findByRole('heading', { name: 'Your account is ready' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the dashboard' })).toHaveAttribute('href', '/biodiversity-dashboard');
    expect(screen.queryByText(/confirmation link/)).not.toBeInTheDocument();
  });

  it('explains a code that stopped working between the check and the sign-up', async () => {
    await reachAccountForm();
    supabaseMock.supabase.auth.signUp.mockResolvedValue({
      data: null,
      error: { message: 'Database error saving new user' },
    });
    fillAccount();
    // Supabase reports the database's refusal as a generic error; the code
    // is by far the likeliest reason, so the page says so.
    expect(await screen.findByRole('alert')).toHaveTextContent(/may have been used, revoked or expired/);
  });

  it('lets someone holding the wrong code go back', async () => {
    await reachAccountForm();
    fireEvent.click(screen.getByRole('button', { name: /Use a different code/ }));
    expect(codeBox()).toBeInTheDocument();
  });
});

describe('pinning the hall', () => {
  /** A click on the PinPicker's map. */
  const clickMap = (lat, lng) => act(() => mapClick.handler({ latlng: { lat, lng } }));

  async function reachHallStep() {
    codeAnswers({ ok: true, reason: 'ok', lgu_label: 'Santa Cruz', is_city: false, lgu_name: 'Santa Cruz', hall_lat: null, hall_lng: null });
    renderPage();
    typeCode(GOOD_CODE);
    return screen.findByRole('heading', { name: 'Where is the Santa Cruz Municipal Hall?' });
  }

  it('asks for the hall when nobody from the LGU has pinned it', async () => {
    await reachHallStep();
    // Nothing can be skipped: the office map needs somewhere to fly to.
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('takes a pin inside the LGU, and refuses one outside it', async () => {
    await reachHallStep();
    await waitFor(() => expect(mapClick.handler).toBeTypeOf('function'));

    clickMap(14.2325, 121.3666); // Pila
    expect(await screen.findByText('That is outside Santa Cruz.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    clickMap(14.2794, 121.4157);
    expect(screen.getByTestId('hall-pin').dataset.center).toBe('[14.2794,121.4157]');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('sends the pin with the sign-up, for the database to save', async () => {
    await reachHallStep();
    await waitFor(() => expect(mapClick.handler).toBeTypeOf('function'));
    clickMap(14.2794, 121.4157);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    fillAccount();
    await waitFor(() => expect(supabaseMock.supabase.auth.signUp).toHaveBeenCalled());
    const [request] = supabaseMock.supabase.auth.signUp.mock.calls[0];
    expect(request.options.data).toMatchObject({ hall_lat: 14.2794, hall_lng: 121.4157 });
  });

  it('skips the step when the hall is pinned already', async () => {
    codeAnswers({ ok: true, reason: 'ok', lgu_label: 'Santa Cruz', is_city: false, lgu_name: 'Santa Cruz', hall_lat: 14.2794, hall_lng: 121.4157 });
    renderPage();
    typeCode(GOOD_CODE);
    expect(await screen.findByLabelText('Full name')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Municipal Hall/ })).not.toBeInTheDocument();
  });
});
