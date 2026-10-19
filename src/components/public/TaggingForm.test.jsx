import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('react-confetti', () => ({ default: () => null }));

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import { AuthProvider } from '../../context/AuthContext.jsx';
import TaggingForm from './TaggingForm.jsx';

// Labuin, Santa Cruz — inside a barangay whose name no other town shares.
const IN_LABUIN = [14.2475, 121.3965];
// Calamba, to show the form is no longer Santa Cruz's alone.
const IN_CALAMBA = [14.2051, 121.1554];

function renderForm(position) {
  return render(<TaggingForm initialPosition={position} onClose={() => {}} onSuccess={() => {}} />);
}

const barangaySelect = () => screen.getByLabelText(/^Barangay/);

function submitWithSpecies() {
  fireEvent.change(screen.getByLabelText('Species'), { target: { value: 'Narra' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Tree Tag' }));
}

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('pending_trees:insert', { data: null, error: null });
});
afterEach(cleanup);

describe('where a tag is', () => {
  it('works out the barangay from the PSA boundaries, not OpenStreetMap', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderForm(IN_LABUIN);
    // The first test in the file pays for loading the barangay boundaries,
    // which takes over a second when the whole suite runs at once.
    await waitFor(() => expect(barangaySelect()).toHaveValue('Labuin'), { timeout: 5000 });
    expect(screen.getByText(', Santa Cruz')).toBeInTheDocument();
    // No call out to a third party for a name it has to guess.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('offers the barangays of the town the tag is in — any town in Laguna', async () => {
    renderForm(IN_CALAMBA);
    await waitFor(() => expect(screen.getByText(', Calamba City')).toBeInTheDocument());
    const options = [...barangaySelect().querySelectorAll('option')].map((o) => o.textContent);
    // The old form listed Santa Cruz's barangays whoever was tagging.
    expect(options).not.toContain('Labuin');
    expect(options.length).toBeGreaterThan(20);
  });
});

describe('sending the tag', () => {
  it('sends the town with it, so it reaches that LGU', async () => {
    renderForm(IN_LABUIN);
    await waitFor(() => expect(barangaySelect()).toHaveValue('Labuin'));
    submitWithSpecies();

    await waitFor(() => expect(supabaseMock.writesTo('pending_trees', 'insert')).toHaveLength(1));
    expect(supabaseMock.writesTo('pending_trees', 'insert')[0].payload).toMatchObject({
      barangay: 'Labuin',
      municipality: 'Santa Cruz',
      species: 'Narra',
    });
  });

  it('still sends the tag to a database that has no municipality column yet', async () => {
    // Before tag_routing.sql is run. A resident's tag matters more than its
    // routing; the database routes it by barangay once the file runs.
    let first = true;
    supabaseMock.setResponse('pending_trees:insert', () => {
      if (first) {
        first = false;
        return { data: null, error: { code: 'PGRST204', message: "Could not find the 'municipality' column" } };
      }
      return { data: null, error: null };
    });
    renderForm(IN_LABUIN);
    await waitFor(() => expect(barangaySelect()).toHaveValue('Labuin'));
    submitWithSpecies();

    await waitFor(() => expect(supabaseMock.writesTo('pending_trees', 'insert')).toHaveLength(2));
    expect(supabaseMock.writesTo('pending_trees', 'insert')[1].payload.municipality).toBeUndefined();
    expect(screen.queryByText(/Could not find/)).not.toBeInTheDocument();
  });

  it('will not send a tag from outside Laguna, and says why', async () => {
    renderForm([10.3157, 123.8854]); // Cebu
    await waitFor(() => expect(barangaySelect()).toBeInTheDocument());
    submitWithSpecies();
    expect(await screen.findByText(/outside Laguna/)).toBeInTheDocument();
    expect(supabaseMock.writesTo('pending_trees', 'insert')).toHaveLength(0);
  });
});

describe('who may tag (decided 19 October: a sign-in, for the CBI)', () => {
  const renderSignedIn = () =>
    render(
      <AuthProvider>
        <TaggingForm initialPosition={IN_LABUIN} onClose={() => {}} onSuccess={() => {}} />
      </AuthProvider>
    );
  const asResident = (resident) => {
    supabaseMock.supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'r1', email: 'ana@gmail.com' } } }, error: null });
    supabaseMock.setResponse('residents:select', { data: { id: 'r1', full_name: 'Ana Reyes', show_as: 'name', ...resident }, error: null });
  };

  it('asks a visitor to sign in with Google first, and brings them back to the map', async () => {
    renderSignedIn();
    const gate = await screen.findByRole('dialog', { name: 'Sign in to tag a tree' });
    expect(screen.queryByRole('button', { name: 'Submit Tree Tag' })).not.toBeInTheDocument();
    fireEvent.click(within(gate).getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(supabaseMock.supabase.auth.signInWithOAuth).toHaveBeenCalled());
    expect(supabaseMock.supabase.auth.signInWithOAuth.mock.calls[0][0].options.redirectTo).toMatch(/\/public-map$/);
  });

  it('sends a resident who has not agreed yet to finish joining', async () => {
    asResident({ consented_at: null });
    renderSignedIn();
    const gate = await screen.findByRole('dialog', { name: 'One step before you tag' });
    expect(within(gate).getByRole('link', { name: 'Finish joining' })).toHaveAttribute('href', '/community');
  });

  it('opens the form for a resident who has joined, and says whose the tag is', async () => {
    asResident({ consented_at: '2026-10-19T00:00:00Z' });
    renderSignedIn();
    expect(await screen.findByRole('button', { name: 'Submit Tree Tag' })).toBeInTheDocument();
    expect(screen.getByText(/Counted for/)).toHaveTextContent('Counted for Ana Reyes on the leaderboard once it is verified.');
  });
});
