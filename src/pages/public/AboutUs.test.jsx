import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import AboutUs from './AboutUs.jsx';

/**
 * The contact form is the one part of this page a visitor has to operate
 * rather than read, so it is the part worth pinning down.
 */

function renderAbout() {
  return render(
    <MemoryRouter>
      <AboutUs />
    </MemoryRouter>
  );
}

beforeEach(() => supabaseMock.reset());
afterEach(cleanup);

describe('AboutUs contact form', () => {
  it('labels every field, so the name stays visible while it is being filled in', () => {
    renderAbout();

    // Found by label, which is only possible if each field actually has one —
    // these used to be placeholders, which vanish on the first keystroke.
    expect(screen.getByLabelText(/Full Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email Address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Affiliation/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Message/)).toBeInTheDocument();
  });

  it('asks the browser for the right keyboard and the right autofill', () => {
    renderAbout();

    const email = screen.getByLabelText(/Email Address/);
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/Full Name/)).toHaveAttribute('autocomplete', 'name');
  });

  it('marks the fields a reply depends on as required', () => {
    renderAbout();

    expect(screen.getByLabelText(/Full Name/)).toBeRequired();
    expect(screen.getByLabelText(/Email Address/)).toBeRequired();
    expect(screen.getByLabelText(/Message/)).toBeRequired();
    // Address and affiliation are nice to have, not a reason to block sending.
    expect(screen.getByLabelText(/Affiliation/)).not.toBeRequired();
  });

  it('keeps what was typed where the labels can still be read', () => {
    renderAbout();

    const name = screen.getByLabelText(/Full Name/);
    fireEvent.change(name, { target: { value: 'Juan Dela Cruz' } });

    expect(name).toHaveValue('Juan Dela Cruz');
    expect(screen.getByText(/Full Name/)).toBeInTheDocument();
  });
});

describe('writing to an office', () => {
  it('sends the message to the office the visitor chose', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
    renderAbout();
    fireEvent.change(screen.getByLabelText(/Send to/), { target: { value: '403426000' } });
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: 'Juan Dela Cruz' } });
    fireEvent.change(screen.getByLabelText(/Email Address/), { target: { value: 'juan@example.com' } });
    fireEvent.change(screen.getByLabelText(/Message/), { target: { value: 'May a tree be cut?' } });
    fireEvent.click(screen.getByRole('button', { name: /Send message/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Sent to Municipality of Santa Cruz — MENRO / CENRO. They will reply to juan@example.com.'
    );
    expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('send_contact_message', {
      p_office: '403426000',
      p_name: 'Juan Dela Cruz',
      p_email: 'juan@example.com',
      p_address: '',
      p_affiliation: '',
      p_message: 'May a tree be cut?',
    });
    // Sent, the message box empties; the rest stays for the next one.
    expect(screen.getByLabelText(/Message/)).toHaveValue('');
  });

  it('offers PGENRO and all thirty cities and municipalities', () => {
    renderAbout();
    const options = within(screen.getByLabelText(/Send to/)).getAllByRole('option');
    expect(options).toHaveLength(32);
    expect(options[1]).toHaveTextContent('PGENRO, Province of Laguna');
    expect(screen.getByRole('option', { name: 'City of Biñan — MENRO / CENRO' })).toBeInTheDocument();
  });

  it('says why a message was refused', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: { message: 'Give an email address the office can reply to.' } });
    renderAbout();
    fireEvent.change(screen.getByLabelText(/Send to/), { target: { value: 'pgenro' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Send a message' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give an email address the office can reply to.');
  });

  it("lists each office's contact details, as it keeps them in Settings", async () => {
    supabaseMock.setResponse('office_profiles:select', {
      data: [
        { office: '403426000', office_head: 'Zaldy B. Ybardolaza II', email: 'santacruz@email.com', phone: '0917 555 0142' },
        { office: '403409000' }, // Kalayaan has filled nothing in: not listed
      ],
      error: null,
    });
    renderAbout();
    const offices = await screen.findByRole('region', { name: 'The offices' });
    expect(within(offices).getAllByRole('listitem')).toHaveLength(1);
    expect(within(offices).getByText('Municipality of Santa Cruz — MENRO / CENRO')).toBeInTheDocument();
    expect(within(offices).getByRole('link', { name: 'santacruz@email.com' })).toHaveAttribute('href', 'mailto:santacruz@email.com');
    expect(within(offices).getByRole('link', { name: '0917 555 0142' })).toHaveAttribute('href', 'tel:09175550142');
  });
});

describe("PGENRO's News & Events on the home page", () => {
  it('shows the newest post as a banner, and nothing when there is none', async () => {
    supabaseMock.setResponse('news_posts:select', {
      data: [{ id: 'n1', title: 'Tree Planting Day', body: 'Bring seedlings.', venue: 'Labuin', event_date: '2026-11-08', photos: [] }],
      error: null,
    });
    renderAbout();
    const news = await screen.findByRole('region', { name: 'News and Events' });
    expect(within(news).getByRole('heading', { name: 'Tree Planting Day' })).toBeInTheDocument();
    expect(within(news).getByText('8 November 2026 · Labuin')).toBeInTheDocument();
    cleanup();

    supabaseMock.setResponse('news_posts:select', { data: [], error: null });
    renderAbout();
    await waitFor(() => expect(supabaseMock.writesTo('news_posts', 'select').length).toBeGreaterThan(1));
    expect(screen.queryByRole('region', { name: 'News and Events' })).not.toBeInTheDocument();
  });
});

describe('AboutUs organisation logos', () => {
  // Each logo links to whoever it belongs to.
  const LINKS = [
    ['Provincial Government of Laguna', 'https://laguna.gov.ph/'],
    ['PGENRO', 'https://www.facebook.com/enro.laguna'],
    ['Laguna State Polytechnic University', 'https://lspu.edu.ph/'],
    ['NAMRIA', 'https://www.namria.gov.ph/'],
    ['BSWM', 'https://www.bswm.da.gov.ph/'],
    ['UPRI NOAH', 'https://noah.up.edu.ph/'],
    ['Copernicus', 'https://www.copernicus.eu/en'],
    ['DOST-PAGASA', 'https://www.pagasa.dost.gov.ph/'],
  ];

  it.each(LINKS)('sends %s to its own site', (name, href) => {
    renderAbout();

    const link = screen.getByRole('link', { name: new RegExp(`^${name} —`) });
    expect(link).toHaveAttribute('href', href);
  });

  it('opens them in a new tab without handing over the referrer', () => {
    renderAbout();

    for (const [name] of LINKS) {
      const link = screen.getByRole('link', { name: new RegExp(`^${name} —`) });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
    }
  });
});
