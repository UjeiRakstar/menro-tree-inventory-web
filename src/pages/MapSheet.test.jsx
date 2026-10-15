import { render, screen, waitFor, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = { profile: null, lgu: null };
vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

import { supabaseMock } from '../test/supabaseMock.js';
import MapSheet from './MapSheet.jsx';

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

  it('prints at the paper’s size', () => {
    show('?paper=a3');
    expect(sheet()).toHaveAttribute('width', '420mm');
    expect(document.querySelector('style').textContent).toContain('size: 420mm 297mm');
  });
});
