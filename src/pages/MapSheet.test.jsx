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

  it('maps one area: framed on it, named for it, with what the layers say of it', async () => {
    supabaseMock.setResponse('map_areas:select', {
      data: [{
        id: 'a1', kind: 'planting-site', name: 'Labuin Riverbank', municipality: 'Santa Cruz', barangay: 'Labuin',
        lgu_psgc: 403426000, approval: 'approved', spacing_m: 4, recommended: [{ common: 'Narra' }],
        geometry: { type: 'Polygon', coordinates: [[[121.41, 14.28], [121.412, 14.28], [121.412, 14.282], [121.41, 14.282], [121.41, 14.28]]] },
        layer_facts: { flood: { low: 9000, medium: 0, high: 0, total: 9000 }, elevation: { min: 7, max: 10, mean: 8 } },
      }],
      error: null,
    });
    show('?area=a1');
    await waitFor(() => expect(sheet()).toHaveAccessibleName('LABUIN RIVERBANK TREE PLANTING SITE — Santa Cruz'));
    expect(sheet()).toHaveTextContent('THE AREA');
    expect(sheet()).toHaveTextContent(/Flood exposure9,000(\.0)? m² \(19%\)/);
    expect(sheet()).toHaveTextContent('Landslide exposureNot assessed');
    expect(sheet()).toHaveTextContent('RecommendedNarra');
    // Framed on the area, not the whole town: a far larger scale.
    expect(sheet()).toHaveTextContent('1:5,000');
  });

  it('will not map another LGU’s area for an office', async () => {
    supabaseMock.setResponse('map_areas:select', {
      data: [{ id: 'c1', kind: 'land-cover', cover_class: 'open-forest', name: 'Calamba Forest', municipality: 'Calamba', lgu_psgc: 403405000,
        geometry: { type: 'Polygon', coordinates: [[[121.16, 14.2], [121.17, 14.2], [121.17, 14.21], [121.16, 14.2]]] } }],
      error: null,
    });
    show('?area=c1');
    await waitFor(() => expect(supabaseMock.calls.some((c) => c.table === 'map_areas')).toBe(true));
    expect(sheet()).toHaveTextContent('MUNICIPALITY OF SANTA CRUZ');
    expect(sheet()).not.toHaveTextContent('THE AREA');
  });

  it('has the attribute tables of the LGU in a tab beside the map, to save as Excel', async () => {
    supabaseMock.setResponse('barangay_stats:select', { data: [{ barangay_psgc: 403426001, population: 1659, households: 414 }], error: null });
    show();
    fireEvent.click(screen.getByRole('tab', { name: 'Attribute tables' }));
    const barangays = await screen.findByRole('region', { name: 'Barangays' });
    await waitFor(() => expect(within(barangays).getByRole('rowheader', { name: 'Alipit' })).toBeInTheDocument());
    expect(within(barangays).getByRole('rowheader', { name: 'Alipit' }).closest('tr')).toHaveTextContent('1,659');
    expect(screen.getByRole('region', { name: 'Land cover' })).toHaveTextContent('None yet.');
    // Each barangay's exposure and carbon, without any land cover drawn.
    expect(within(screen.getByRole('region', { name: 'Exposure to hazards by barangay' })).getByRole('rowheader', { name: 'Alipit' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Carbon in the tagged trees by barangay' })).getByRole('rowheader', { name: 'Alipit' })).toBeInTheDocument();
    // On A4 landscape pages.
    expect(screen.getByRole('region', { name: /^Page 1: Barangays$/ })).toHaveStyle({ width: '297mm' });
    expect(screen.getByRole('button', { name: /Excel/ })).toBeInTheDocument();
    // The map is still there behind the tab, for the report's picture.
    expect(sheet()).toBeInTheDocument();
  });

  it('writes the report from the figures, the office edits it, and AI only improves the wording', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({
      data: { sections: [{ key: 'purpose', text: 'This report, improved, supports the CLUP.' }] },
      error: null,
    });
    show();
    fireEvent.click(screen.getByRole('tab', { name: 'Report' }));
    const purpose = await screen.findByRole('textbox', { name: 'Purpose — text' });
    expect(purpose.value).toMatch(/Municipality of Santa Cruz, Laguna/);
    fireEvent.change(purpose, { target: { value: 'Our own words.' } });
    expect(screen.getByRole('textbox', { name: 'Purpose — text' })).toHaveValue('Our own words.');

    fireEvent.click(screen.getByRole('button', { name: /Improve with AI/ }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Purpose — text' })).toHaveValue('This report, improved, supports the CLUP.'));
    expect(supabaseMock.supabase.functions.invoke).toHaveBeenCalledWith('improve-report', expect.objectContaining({
      body: expect.objectContaining({ place: 'Municipality of Santa Cruz' }),
    }));
    expect(screen.getByRole('status')).toHaveTextContent(/Read it through before you use it/);

    fireEvent.click(screen.getByRole('button', { name: /Write again from the figures/ }));
    expect(screen.getByRole('textbox', { name: 'Purpose — text' }).value).toMatch(/Municipality of Santa Cruz/);
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
