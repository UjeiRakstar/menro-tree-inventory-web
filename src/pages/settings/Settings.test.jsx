import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const auth = { profile: null, lgu: null };
vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

import { supabaseMock } from '../../test/supabaseMock.js';
import Settings from './Settings.jsx';

const SANTA_CRUZ = { role: 'lgu_admin', status: 'active', lgu_psgc: 403426000 };
const PGENRO = { role: 'pgenro', status: 'active' };

/** Where Open on the map lands, saying what it was handed. */
function MapStub() {
  const { state } = useLocation();
  return <p>Map, handed {state?.importArea?.name ?? 'nothing'}</p>;
}

function show(profile = SANTA_CRUZ) {
  auth.profile = profile;
  auth.lgu = profile === SANTA_CRUZ ? { name: 'Santa Cruz', label: 'Santa Cruz', psgc: 403426000 } : null;
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/map" element={<MapStub />} />
      </Routes>
    </MemoryRouter>
  );
}

const open = (name) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
const section = (name) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('office_profiles:select', {
    data: { office: '403426000', office_head: 'Zaldy B. Ybardolaza II', email: 'santacruz@email.com' },
    error: null,
  });
  supabaseMock.setResponse('barangay_stats:select', { data: [{ barangay_psgc: 403426001, population: 1659, households: 414 }], error: null });
  supabaseMock.setResponse('office_ai_settings:select', { data: null, error: null });
  supabaseMock.setResponse('profiles:select', {
    data: [{ id: 'f1', full_name: 'Rjay', email: 'rjay@gmail.com', role: 'field_officer', status: 'active', is_approved: true }],
    error: null,
  });
  supabaseMock.setResponse('map_areas:select', { data: [], error: null });
});
afterEach(cleanup);

describe('Settings, for a training account (27 October)', () => {
  it('shows the real office’s records read-only, saying why, and leaves the practice imports usable', async () => {
    auth.profile = { ...SANTA_CRUZ, is_training: true };
    auth.lgu = { name: 'Santa Cruz', label: 'Santa Cruz', psgc: 403426000 };
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Settings />
      </MemoryRouter>
    );
    // The climate plan: no file to pick, no button to press — and why.
    open('Climate change action plan');
    const plan = section('Climate change action plan');
    expect(within(plan).getByRole('note')).toHaveTextContent(/real office/);
    expect(within(plan).getByRole('button', { name: /File the plan with PGENRO/ })).toBeDisabled();
    // The profile likewise.
    const profile = section('LGU profile');
    await waitFor(() => expect(within(profile).getByLabelText('MENRO / CENRO head')).toBeDisabled());
    // Areas imported by a trainee go behind the wall: still usable.
    open('Import areas');
    expect(within(section('Import areas')).queryByText(/Practice account/)).not.toBeInTheDocument();
  });
});

describe('Settings, for an LGU office', () => {
  it('shows the office’s profile, and saves it with its links made whole', async () => {
    show();
    const profile = section('LGU profile');
    await waitFor(() => expect(within(profile).getByLabelText('MENRO / CENRO head')).toHaveValue('Zaldy B. Ybardolaza II'));
    fireEvent.change(within(profile).getByLabelText('Website'), { target: { value: 'www.santacruz.gov.ph' } });
    fireEvent.click(within(profile).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(supabaseMock.writesTo('office_profiles', 'upsert')).toHaveLength(1));
    expect(supabaseMock.writesTo('office_profiles', 'upsert')[0].payload).toMatchObject({
      office: '403426000',
      office_head: 'Zaldy B. Ybardolaza II',
      website_url: 'https://www.santacruz.gov.ph',
      facebook_url: null,
    });
  });

  it('will not save an email that is not one', async () => {
    show();
    const profile = section('LGU profile');
    await waitFor(() => expect(within(profile).getByLabelText('Email')).toHaveValue('santacruz@email.com'));
    fireEvent.change(within(profile).getByLabelText('Email'), { target: { value: 'santacruz@' } });
    fireEvent.click(within(profile).getByRole('button', { name: 'Save changes' }));
    expect(await within(profile).findByText('That is not an email address.')).toBeInTheDocument();
    expect(supabaseMock.writesTo('office_profiles', 'upsert')).toHaveLength(0);
  });

  it('keeps each barangay’s population and households, beside its measured area', async () => {
    show();
    open('Barangays');
    const barangays = section('Barangays');
    // 403426001 is Alipit.
    const alipit = await within(barangays).findByLabelText('Population of Alipit');
    expect(alipit).toHaveValue('1659');
    expect(within(barangays).getByText('26 barangays')).toBeInTheDocument();
    fireEvent.change(alipit, { target: { value: '1,700' } });
    fireEvent.click(within(barangays).getByRole('button', { name: 'Save changes (1)' }));
    await waitFor(() => expect(supabaseMock.writesTo('barangay_stats', 'upsert')).toHaveLength(1));
    expect(supabaseMock.writesTo('barangay_stats', 'upsert')[0].payload).toEqual([
      { barangay_psgc: 403426001, lgu_psgc: 403426000, population: 1700, households: 414 },
    ]);
  });

  it('lists the field team, and sends the rest to the Field officers page', async () => {
    supabaseMock.supabase.rpc.mockImplementation(async (name) =>
      name === 'team_last_sign_in' ? { data: [{ id: 'f1', last_sign_in_at: '2026-10-15T08:00:00Z' }], error: null } : { data: null, error: null }
    );
    show();
    open('Field team');
    const team = section('Field team');
    expect(await within(team).findByText('Rjay')).toBeInTheDocument();
    expect(within(team).getByText(/Oct 15, 2026/)).toBeInTheDocument();
    expect(within(team).getByRole('link', { name: /Field officers page/ })).toHaveAttribute('href', '/arborists');
  });

  it('keeps the office’s own AI key, never showing it again', async () => {
    supabaseMock.supabase.rpc.mockImplementation(async (name) =>
      name === 'set_office_ai_key' ? { data: 'WXYZ', error: null } : { data: null, error: null }
    );
    supabaseMock.supabase.functions.invoke.mockResolvedValue({ data: { ok: true, models: 12 }, error: null });
    show();
    open('AI');
    const ai = section('AI');
    expect(await within(ai).findByText(/No key of its own yet/)).toBeInTheDocument();

    const field = within(ai).getByLabelText('Gemini API key');
    expect(field).toHaveAttribute('type', 'password');
    fireEvent.change(field, { target: { value: 'AIzaSyD-test-key-WXYZ' } });
    fireEvent.click(within(ai).getByRole('button', { name: 'Test this key' }));
    expect(await within(ai).findByText(/The key works — Gemini answered with 12 models/)).toBeInTheDocument();
    expect(supabaseMock.supabase.functions.invoke).toHaveBeenCalledWith('ai-key-test', { body: { key: 'AIzaSyD-test-key-WXYZ' } });

    fireEvent.click(within(ai).getByRole('button', { name: 'Save key' }));
    expect(await within(ai).findByText('••••WXYZ')).toBeInTheDocument();
    expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('set_office_ai_key', { p_key: 'AIzaSyD-test-key-WXYZ' });
    expect(within(ai).getByLabelText('Replace the key')).toHaveValue('');

    fireEvent.click(within(ai).getByRole('switch', { name: 'Use AI' }));
    await waitFor(() => expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('set_office_ai_enabled', { p_enabled: false }));
    expect(within(ai).getByText(/AI is off: nothing of this office is sent to Google/)).toBeInTheDocument();
  });

  it('reads a file’s areas and opens the one chosen on the map', async () => {
    show();
    open('Import areas');
    const ring = (lng, d) => [[lng, 14.28], [lng + d, 14.28], [lng + d, 14.28 + d], [lng, 14.28 + d], [lng, 14.28]];
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { Name: 'Riverbank' }, geometry: { type: 'Polygon', coordinates: [ring(121.41, 0.001)] } },
        { type: 'Feature', properties: { Name: 'Hillside' }, geometry: { type: 'Polygon', coordinates: [ring(121.42, 0.002)] } },
      ],
    });
    const file = new File([text], 'sites.geojson');
    file.text = async () => text;
    fireEvent.change(screen.getByLabelText('Area file (GeoJSON or shapefile)'), { target: { files: [file] } });
    expect(await screen.findByText('2 areas in sites.geojson')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Riverbank on the map to save' }));
    expect(await screen.findByText('Map, handed Riverbank')).toBeInTheDocument();
  });

  it('brings a tax map in as land cover, merged by class and barangay, with the owners taken out first', async () => {
    show();
    open('Import areas');
    const ring = (lng, d) => [[lng, 14.28], [lng + d, 14.28], [lng + d, 14.28 + d], [lng, 14.28 + d], [lng, 14.28]];
    const parcel = (lng, CLASSIFICA, OWNER) => ({ type: 'Feature', properties: { OWNER, TAXDEC: '09-0001', CLASSIFICA }, geometry: { type: 'Polygon', coordinates: [ring(lng, 0.001)] } });
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [parcel(121.41, 'PROTECTION FOREST', 'JUAN DELA CRUZ'), parcel(121.411, 'PROTECTION FOREST', 'ANA SANTOS'), parcel(121.4125, 'RESIDENTIAL', 'PEDRO REYES')],
    });
    const file = new File([text], 'forest.geojson');
    file.text = async () => text;
    fireEvent.change(screen.getByLabelText('Area file (GeoJSON or shapefile)'), { target: { files: [file] } });

    const privacy = await screen.findByRole('note', { name: 'Personal data' });
    expect(privacy).toHaveTextContent('OWNER — a person’s name (owner)');
    expect(privacy).toHaveTextContent('TAXDEC — a tax declaration');
    // Forest ticked, as tree cover; the house lot left out.
    expect(screen.getByRole('checkbox', { name: 'PROTECTION FOREST' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'RESIDENTIAL' })).not.toBeChecked();
    expect(screen.getByRole('combobox', { name: 'Land cover for PROTECTION FOREST' })).toHaveValue('open-forest');

    fireEvent.click(screen.getByRole('button', { name: /Merge and cut to the barangays/ }));
    const list = await screen.findByRole('list', { name: 'Areas to save' }, { timeout: 5000 });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent(/^Protection Forest — /);

    fireEvent.click(screen.getByRole('button', { name: 'Save 1 land cover area' }));
    expect(await screen.findByText('Saved 1 land cover area.')).toBeInTheDocument();
    const [insert] = supabaseMock.writesTo('map_areas', 'insert');
    const [row] = insert.payload;
    expect(row).toMatchObject({ kind: 'land-cover', cover_class: 'open-forest', municipality: 'Santa Cruz' });
    expect(row.geometry.type).toBe('Polygon');
    expect(row.notes).toMatch(/2 shapes where CLASSIFICA is “PROTECTION FOREST”.*Taken out for privacy before it was read: OWNER, TAXDEC\./);
    expect(JSON.stringify(insert.payload)).not.toMatch(/DELA CRUZ|SANTOS|09-0001/);
  });

  it('changes the account’s own password, the same twice', async () => {
    show();
    open('Password');
    const password = section('Password');
    fireEvent.change(within(password).getByLabelText('New password'), { target: { value: 'greentag-2026' } });
    fireEvent.change(within(password).getByLabelText('The same again'), { target: { value: 'greentag-2025' } });
    fireEvent.click(within(password).getByRole('button', { name: 'Update password' }));
    expect(await within(password).findByText('The two passwords are not the same.')).toBeInTheDocument();
    expect(supabaseMock.supabase.auth.updateUser).not.toHaveBeenCalled();

    fireEvent.change(within(password).getByLabelText('The same again'), { target: { value: 'greentag-2026' } });
    fireEvent.click(within(password).getByRole('button', { name: 'Update password' }));
    expect(await within(password).findByText(/Password updated/)).toBeInTheDocument();
    expect(supabaseMock.supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'greentag-2026' });
  });
});

describe('Settings, for PGENRO', () => {
  it('is PGENRO’s own, with no barangays', async () => {
    supabaseMock.setResponse('office_profiles:select', { data: null, error: null });
    show(PGENRO);
    expect(section('PGENRO profile')).toBeInTheDocument();
    expect(await within(section('PGENRO profile')).findByLabelText('PGENRO head')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Barangays/ })).not.toBeInTheDocument();
  });
});

describe('Settings, for the super admin (21 October)', () => {
  const SUPER = { role: 'pgenro', status: 'active', is_super_admin: true };
  afterEach(() => window.sessionStorage.clear());

  it('works in one LGU as its office: its profile, its team, and not its AI key', async () => {
    supabaseMock.setResponse('profiles:select', {
      data: [
        { id: 'f1', full_name: 'Rjay', email: 'rjay@gmail.com', role: 'field_officer', status: 'active', is_approved: true, lgu_psgc: 403426000 },
        { id: 'f2', full_name: 'Pia', email: 'pia@gmail.com', role: 'field_officer', status: 'active', is_approved: true, lgu_psgc: 403422000 },
      ],
      error: null,
    });
    show(SUPER);
    expect(section('PGENRO profile')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Working in'), { target: { value: '403422000' } });
    expect(await screen.findByText(/as Pila's office does/)).toBeInTheDocument();
    expect(screen.getByText('Municipality of Pila')).toBeInTheDocument();
    expect(section('LGU profile')).toBeInTheDocument();
    await waitFor(() => expect(supabaseMock.calls.some((c) => c.table === 'office_profiles' && c.filters.some(([, v]) => v === '403422000'))).toBe(true));
    expect(screen.getByText(/Pila's AI key is its office's own/)).toBeInTheDocument();

    open('Field team');
    expect(await within(section('Field team')).findByText('Pia')).toBeInTheDocument();
    expect(within(section('Field team')).queryByText('Rjay')).not.toBeInTheDocument();
  });

  it('is not offered to PGENRO, nor to an LGU office', async () => {
    show(PGENRO);
    expect(screen.queryByLabelText('Working in')).not.toBeInTheDocument();
    cleanup();
    show();
    expect(screen.queryByLabelText('Working in')).not.toBeInTheDocument();
  });
});

describe('Settings, before office_settings.sql is run', () => {
  it('says which file to run', async () => {
    supabaseMock.setResponse('office_profiles:select', { data: null, error: { code: '42P01', message: 'relation "office_profiles" does not exist' } });
    show();
    expect(await within(section('LGU profile')).findByRole('alert')).toHaveTextContent('office_settings.sql');
  });
});

describe('Your account — the person, apart from the office (27 October)', () => {
  const ANA = { ...PGENRO, id: 'p1', email: 'ana@laguna.gov.ph', full_name: 'Ana Reyes', designation: 'Forester', address: '', avatar_url: '' };
  afterEach(() => {
    delete auth.refreshProfile;
  });

  it('lets PGENRO change their own photo, name and designation, and shows them at once', async () => {
    auth.refreshProfile = vi.fn();
    show(ANA);
    open('Your account');
    const form = screen.getByRole('form', { name: 'Your account' });
    expect(within(form).getByLabelText('Full name')).toHaveValue('Ana Reyes');
    expect(within(form).getByText('ana@laguna.gov.ph')).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText('Your photo'), { target: { files: [new File(['x'], 'me.jpg', { type: 'image/jpeg' })] } });
    expect(await within(form).findByRole('img', { name: 'Your photo' })).toBeInTheDocument();
    const [bucket, path] = supabaseMock.supabase.storage.upload.mock.calls[0];
    expect(bucket).toBe('office-logos');
    expect(path).toMatch(/^pgenro\/holder-p1-/);

    fireEvent.change(within(form).getByLabelText('Designation'), { target: { value: 'PGENRO' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(supabaseMock.writesTo('profiles', 'update')).toHaveLength(1));
    expect(supabaseMock.writesTo('profiles', 'update')[0].payload).toEqual({
      full_name: 'Ana Reyes',
      designation: 'PGENRO',
      address: '',
      avatar_url: expect.stringContaining('office-logos/pgenro/holder-p1-'),
    });
    await waitFor(() => expect(auth.refreshProfile).toHaveBeenCalled());
    expect(await within(form).findByText(/^Saved\./)).toBeInTheDocument();
  });

  it('needs a name before saving', () => {
    show({ ...ANA, full_name: '' });
    open('Your account');
    const form = screen.getByRole('form', { name: 'Your account' });
    fireEvent.submit(form);
    expect(within(form).getByRole('alert')).toHaveTextContent('Your name is needed.');
    expect(supabaseMock.writesTo('profiles', 'update')).toHaveLength(0);
  });

  it('keeps a practice account’s photo, which lives in the real office’s folder', () => {
    show({ ...ANA, is_training: true });
    open('Your account');
    expect(screen.getByRole('button', { name: 'Add a photo' })).toBeDisabled();
    expect(screen.getByText('A practice account keeps the photo it has.')).toBeInTheDocument();
  });

  it('opens already, from the seal menu’s Your account', () => {
    auth.profile = ANA;
    auth.lgu = null;
    render(
      <MemoryRouter initialEntries={['/settings#your-account']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('form', { name: 'Your account' })).toBeInTheDocument();
  });
});
