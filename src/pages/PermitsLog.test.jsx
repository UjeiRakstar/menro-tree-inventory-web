import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const auth = { profile: { full_name: 'Ujei', role: 'pgenro' } };
vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
const { saveAsSpy } = vi.hoisted(() => ({ saveAsSpy: vi.fn() }));
vi.mock('file-saver', () => ({ saveAs: saveAsSpy, default: { saveAs: saveAsSpy } }));

import { supabaseMock } from '../test/supabaseMock.js';
import PermitsLog from './PermitsLog.jsx';

const SCZ = 403426000;
const PILA = 403422000;
const year = new Date().getFullYear();
const PERMITS = [
  { id: 'p1', client_name: 'Brian', address: '188 Burgos Street', species: 'Narra', number_of_trees: 2, lgu_psgc: SCZ, created_at: `${year}-01-15T03:00:00Z`, status: 'Pending' },
  { id: 'p2', client_name: 'Zaldy', address: '188 Burgos Street', species: 'Mahogany', lgu_psgc: SCZ, created_at: `${year}-02-10T03:00:00Z`, status: 'Cut' },
  { id: 'p3', client_name: 'Rachel Parks', address: 'Brgy Patimbao', species: 'Sampaloc', lgu_psgc: PILA, created_at: `${year}-05-17T03:00:00Z`, status: 'Pending' },
];

beforeEach(() => {
  supabaseMock.reset();
  saveAsSpy.mockClear();
  supabaseMock.setResponse('permits:select', { data: PERMITS, error: null });
});

describe('the permit logs, for the province', () => {
  it('groups the permits by city or municipality, with how many each holds, opened on a click', async () => {
    render(<PermitsLog />);
    const groups = await screen.findByLabelText('Permits by city and municipality');
    const santaCruz = within(groups).getByRole('region', { name: 'Santa Cruz' });
    expect(within(santaCruz).getByText('2 permits')).toBeInTheDocument();
    expect(within(santaCruz).getByText('3 trees')).toBeInTheDocument();
    expect(within(groups).getByRole('region', { name: 'Pila' })).toHaveTextContent('1 permit');
    // Folded until opened; the certificate's Print is still there inside.
    expect(within(santaCruz).queryByText('Brian')).not.toBeInTheDocument();
    fireEvent.click(within(santaCruz).getByRole('button', { name: /Santa Cruz/ }));
    expect(within(santaCruz).getByText('Brian')).toBeInTheDocument();
    expect(within(santaCruz).getAllByRole('button', { name: /Print/ })).toHaveLength(2);
  });

  it('makes a report for a quarter, summed by city or municipality', async () => {
    render(<PermitsLog />);
    await screen.findByLabelText('Permits by city and municipality');
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    const dialog = screen.getByRole('dialog', { name: 'Permit report' });
    fireEvent.change(within(dialog).getByLabelText('Period'), { target: { value: 'quarter' } });
    fireEvent.change(within(dialog).getByLabelText('Quarter'), { target: { value: '1' } });
    expect(within(dialog).getByRole('status')).toHaveTextContent(`2 permits in Quarter 1 (January to March) ${year}, covering 3 trees, in 1 group.`);
    expect(within(dialog).getByLabelText('Sum the permits by')).toHaveValue('lgu');
    fireEvent.click(within(dialog).getByRole('button', { name: /Excel/ }));
    await waitFor(() => expect(saveAsSpy).toHaveBeenCalledTimes(1));
    expect(saveAsSpy.mock.calls[0][1]).toMatch(/^Permit-report_Laguna_Quarter-1-January-to-March-\d{4}\.xlsx$/);
  });
});

describe('the permit logs, for an LGU office', () => {
  it('lists its own permits as before, and does not offer to sum by LGU', async () => {
    render(<PermitsLog lgu={SCZ} />);
    expect(await screen.findByText('Brian')).toBeInTheDocument();
    expect(screen.queryByText('Rachel Parks')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Permits by city and municipality')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Report' }));
    const options = within(screen.getByRole('dialog')).getByLabelText('Sum the permits by');
    expect(within(options).queryByRole('option', { name: 'City or municipality' })).not.toBeInTheDocument();
  });

  it('opens the documents with View, one at a time, rather than showing thumbnails', async () => {
    supabaseMock.setResponse('permits:select', {
      data: [{ ...PERMITS[0], requirements_urls: ['https://x/clearance.jpg', 'https://x/photo.png'] }, PERMITS[1]],
      error: null,
    });
    render(<PermitsLog lgu={SCZ} />);
    await screen.findByText('Brian');
    expect(screen.queryByAltText(/Req/)).toBeNull();
    expect(screen.getByText('None')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View the 2 documents for Brian' }));
    const viewer = screen.getByRole('dialog', { name: 'Requirement documents' });
    expect(within(viewer).getByRole('img')).toHaveAttribute('src', 'https://x/clearance.jpg');
    expect(viewer).toHaveTextContent('Document 1 of 2');
    fireEvent.click(within(viewer).getByRole('button', { name: 'Next document' }));
    expect(within(viewer).getByRole('img')).toHaveAttribute('src', 'https://x/photo.png');
  });
});
