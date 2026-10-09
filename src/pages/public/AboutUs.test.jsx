import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
