import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = { profile: null, lgu: null };
vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

import { supabaseMock } from '../test/supabaseMock.js';
import MapSheet from './MapSheet.jsx';
import { forgetOfficeProfile } from '../hooks/useOfficeProfile.js';

const SANTA_CRUZ_OFFICE = { role: 'lgu_admin', status: 'active', lgu_psgc: 403426000 };
const PGENRO = { role: 'pgenro', status: 'active' };
const FLOOD = {
  id: 'flood-1', kind: 'flood', active: true, picture_path: 'flood/1/picture.png',
  meta: { kind: 'flood', bounds: [[13.95, 120.98], [14.61, 121.62]], legend: [{ value: 3, label: 'High', colour: [8, 48, 107, 190] }] },
};

function show(query = '', profile = SANTA_CRUZ_OFFICE, lgu = { name: 'Santa Cruz' }) {
  auth.profile = profile;
  auth.lgu = lgu;
  return render(
    <MemoryRouter initialEntries={[`/map-sheet${query}`]}>
      <MapSheet />
    </MemoryRouter>
  );
}

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('trees:select', { data: [{ id: 't1', latitude: 14.2805, longitude: 121.4105 }, { id: 'far', latitude: 14.21, longitude: 121.165 }], error: null });
  supabaseMock.setResponse('map_layers:select', { data: [FLOOD], error: null });
});
afterEach(cleanup);

const sheet = () => screen.getByRole('img');

describe('MapSheet', () => {
  it('makes an office’s sheet of its own LGU, in the CDRA layout', async () => {
    show();
    expect(sheet()).toHaveAccessibleName('TREE INVENTORY MAP — Santa Cruz');
    expect(sheet()).toHaveTextContent('MUNICIPALITY OF SANTA CRUZ');
    expect(sheet()).toHaveTextContent('PROVINCE OF LAGUNA');
    expect(sheet()).toHaveTextContent('LEGEND');
    expect(sheet()).toHaveTextContent('1:60,000');
    expect(sheet()).toHaveTextContent('PREPARED BY:Santa Cruz MENRO / CENRO');
    expect(sheet()).toHaveTextContent(/121°2\d′\d\d″E/);
    expect(sheet()).toHaveTextContent('Santa Cruz in Laguna');
    // Only the trees inside Santa Cruz are drawn.
    await waitFor(() => expect(sheet().querySelectorAll('circle[r="0.55"]')).toHaveLength(1));
  });

  it('colours the trees by origin, keyed with how many of each', async () => {
    supabaseMock.setResponse('trees:select', {
      data: [
        { id: 't1', latitude: 14.2805, longitude: 121.4105, biodiversity_status: 'Endemic' },
        { id: 't2', latitude: 14.2795, longitude: 121.4121, species_type: 'Invasive' },
      ],
      error: null,
    });
    show('?treeColour=origin');
    expect(sheet()).toHaveAccessibleName('NATIVE AND INVASIVE TREES MAP — Santa Cruz');
    await waitFor(() => expect(sheet().querySelectorAll('circle[r="0.55"]')).toHaveLength(2));
    expect(sheet()).toHaveTextContent('Invasive (1)');
    expect(sheet()).toHaveTextContent('Endemic / native (1)');
    expect(sheet().querySelector('circle[r="0.55"][fill="#dc2626"]')).toBeTruthy();
  });

  it('draws the survey layer chosen on the map, and names the sheet after it', async () => {
    show('?survey=flood');
    await waitFor(() => expect(sheet()).toHaveAccessibleName('FLOOD SUSCEPTIBILITY MAP — Santa Cruz'));
    await waitFor(() => expect(sheet().querySelector('image[href$="flood/1/picture.png"]')).toBeTruthy());
    expect(sheet()).toHaveTextContent('Flood susceptibility');
    expect(sheet()).toHaveTextContent('High');
    expect(sheet()).toHaveTextContent('UP NOAH');
  });

  it('leaves out a layer that is not uploaded, title and all', async () => {
    show('?survey=landslide');
    await waitFor(() => expect(sheet()).toHaveAccessibleName('TREE INVENTORY MAP — Santa Cruz'));
    expect(sheet()).not.toHaveTextContent('Landslide susceptibility');
  });

  it('keeps an office to its own LGU, whatever the link says', () => {
    show('?lgu=Calamba');
    expect(sheet()).toHaveTextContent('MUNICIPALITY OF SANTA CRUZ');
    expect(screen.queryByLabelText('City / municipality')).not.toBeInTheDocument();
  });

  it('lets PGENRO make the province’s sheet, or any LGU’s', () => {
    show('', PGENRO, null);
    expect(sheet()).toHaveTextContent('PROVINCE OF LAGUNA');
    expect(sheet()).toHaveTextContent('PREPARED BY:Provincial Government Environment and Natural');
    fireEvent.change(screen.getByLabelText('City / municipality'), { target: { value: 'Calamba' } });
    expect(sheet()).toHaveTextContent('CITY OF CALAMBA');
  });

  it('takes the office’s own title and name for who prepared it', () => {
    show();
    const settings = screen.getByRole('complementary', { name: 'Map sheet settings' });
    fireEvent.change(within(settings).getByLabelText('Title'), { target: { value: 'Urban trees of the poblacion' } });
    fireEvent.change(within(settings).getByLabelText('Prepared by'), { target: { value: 'MENRO Santa Cruz, Forestry Unit' } });
    // Wrapped over two lines, each its own text.
    expect(sheet()).toHaveTextContent(/URBAN TREES OF ?THE ?POBLACION/);
    expect(sheet()).toHaveTextContent('MENRO Santa Cruz, Forestry Unit');
  });

  it('names its tab after the sheet, with a tab icon of its own, and puts both back after', () => {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = '/greentag-logo.png';
    document.head.appendChild(icon);
    document.title = 'Green Tag';
    const { unmount } = show('?survey=flood');
    expect(document.title).toBe('Tree Inventory Map — Santa Cruz · Green Tag');
    expect(icon.getAttribute('href')).toMatch(/^data:image\/svg\+xml,/);
    unmount();
    expect(document.title).toBe('Green Tag');
    expect(icon.getAttribute('href')).toBe('/greentag-logo.png');
    icon.remove();
  });

  it('closes back to the work it was opened from, or goes to the map when it cannot', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    auth.profile = SANTA_CRUZ_OFFICE;
    auth.lgu = { name: 'Santa Cruz' };
    render(
      <MemoryRouter initialEntries={['/map-sheet']}>
        <Routes>
          <Route path="/map-sheet" element={<MapSheet />} />
          <Route path="/map" element={<p>The office map</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByRole('link', { name: /BioDashboard|Action Board|Trees/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalled();
    // jsdom's window does not close, so the page falls back to the map.
    expect(await screen.findByText('The office map')).toBeInTheDocument();
    close.mockRestore();
  });

  it('carries what the office saved in Settings: its own logo, and its head under Prepared by', async () => {
    forgetOfficeProfile('403426000');
    supabaseMock.setResponse('office_profiles:select', {
      data: { office: '403426000', office_head: 'Zaldy B. Ybardolaza II', office_logo_url: 'https://storage.test/office-logos/403426000/office.png' },
      error: null,
    });
    show();
    // Wrapped where it is long: each line its own text.
    await waitFor(() => expect(sheet()).toHaveTextContent(/Zaldy B\. ?Ybardolaza II/));
    expect(sheet().querySelector('image[href="https://storage.test/office-logos/403426000/office.png"]')).toBeTruthy();
    forgetOfficeProfile('403426000');
  });

  it('prints at the paper’s size', () => {
    show('?paper=a3');
    expect(sheet()).toHaveAttribute('width', '420mm');
    expect(document.querySelector('style').textContent).toContain('size: 420mm 297mm');
  });
});
