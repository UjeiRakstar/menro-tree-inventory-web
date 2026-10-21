import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import DataRequests from './DataRequests.jsx';

beforeEach(() => supabaseMock.reset());

describe('PGENRO’s data requests', () => {
  it('counts them, and lists who asked, from where and what for', async () => {
    supabaseMock.setResponse('data_requests:select', {
      data: [{ id: 'r1', first_name: 'Ana', last_name: 'Reyes', email: 'ana@uplb.edu.ph', affiliation: 'UPLB',
        purpose: 'Thesis on urban trees', place: 'Santa Cruz', formats: ['xlsx'], created_at: '2026-10-21T02:00:00Z' }],
      error: null,
    });
    render(<DataRequests />);
    expect(await screen.findByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Data requests/ }));
    expect(screen.getByText('Ana Reyes')).toBeInTheDocument();
    expect(screen.getByText('Thesis on urban trees')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ana@uplb.edu.ph' })).toHaveAttribute('href', 'mailto:ana@uplb.edu.ph');
  });

  it('says which SQL file it needs before it has run', async () => {
    supabaseMock.setResponse('data_requests:select', { data: null, error: { message: 'relation "public.data_requests" does not exist' } });
    render(<DataRequests />);
    fireEvent.click(await screen.findByRole('button', { name: /Data requests/ }));
    expect(await screen.findByText(/needs supabase\/data_requests.sql/)).toBeInTheDocument();
  });
});
