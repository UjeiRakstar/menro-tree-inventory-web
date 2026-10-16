import { render, screen, cleanup } from '@testing-library/react';

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import CertificatePrint from './CertificatePrint.jsx';
import { forgetOfficeProfile } from '../hooks/useOfficeProfile.js';
import { certificateOffice } from '../lib/certificateOffice.js';

afterEach(cleanup);

// An Acacia in Siniloan, measured.
const SINILOAN_TREE = {
  id: 'abcdef12-0000',
  species: 'Acacia',
  scientific_name: 'Samanea saman',
  barangay: 'Bagumbarangay',
  latitude: 14.421693,
  longitude: 121.446689,
  dbh: 77.2,
  merchantable_height: 9.9,
};

describe('certificateOffice', () => {
  it('is the town the tree stands in, worded as a municipality', () => {
    expect(certificateOffice({ latitude: 14.421693, longitude: 121.446689 })).toMatchObject({
      name: 'Siniloan',
      government: 'Municipality of Siniloan',
      mayorTitle: 'Municipal Mayor',
      environmentOffice: 'Municipal Environment and Natural Resources Office',
    });
  });

  it('words a city as a city', () => {
    expect(certificateOffice({ municipality: 'Calamba' })).toMatchObject({
      government: 'City of Calamba',
      mayorOffice: 'Office of the City Mayor',
      mayorTitle: 'City Mayor',
    });
  });

  it('places nothing it cannot', () => {
    expect(certificateOffice({ latitude: 0, longitude: 0 })).toBeNull();
    expect(certificateOffice({})).toBeNull();
  });
});

describe('CertificatePrint', () => {
  it('is Siniloan’s certificate for a tree in Siniloan, not Santa Cruz’s', () => {
    render(<CertificatePrint tree={SINILOAN_TREE} clientName="Bryan Sobrevinyas" />);
    const certificate = screen.getByTestId('certificate-print');
    expect(certificate).toHaveTextContent('Municipality of Siniloan');
    expect(certificate).toHaveTextContent('Local Government of Siniloan');
    expect(certificate).toHaveTextContent('Municipality of Siniloan, Laguna');
    expect(certificate).not.toHaveTextContent('Santa Cruz');
    expect(screen.getByAltText('Municipality of Siniloan seal')).toBeInTheDocument();
  });

  it('states the timber volume from the DENR equation, not the height', () => {
    render(<CertificatePrint tree={SINILOAN_TREE} clientName="Bryan Sobrevinyas" />);
    const certificate = screen.getByTestId('certificate-print');
    expect(certificate).not.toHaveTextContent(/more or less 9\.9 cubic/);
    expect(certificate).toHaveTextContent(/estimated volume of more or less [\d.,]+ cubic meters/);
  });

  it('says "tree", not "Specie"', () => {
    render(<CertificatePrint tree={SINILOAN_TREE} clientName="Bryan Sobrevinyas" />);
    expect(screen.getByTestId('certificate-print')).not.toHaveTextContent(/Specie\b/);
  });

  it('leaves the volume out for a tree nobody measured', () => {
    render(
      <CertificatePrint
        walkInData={{ species: 'Mango', clientName: 'Ana', numberOfTrees: 2, latitude: 14.2794, longitude: 121.4157 }}
      />
    );
    const certificate = screen.getByTestId('certificate-print');
    expect(certificate).not.toHaveTextContent('cubic');
    expect(certificate).toHaveTextContent('Municipality of Santa Cruz');
    expect(certificate).toHaveTextContent('2 (2) standing Mango trees');
  });
});

describe('the office’s own letterhead', () => {
  it('signs with the mayor saved in Settings, under the office’s own seal and contacts', async () => {
    supabaseMock.reset();
    // Read once a page; the tests above read Siniloan's as having none.
    forgetOfficeProfile('403429000');
    supabaseMock.setResponse('office_profiles:select', {
      data: {
        office: '403429000',
        chief_executive: 'Hon. Juan dela Cruz',
        office_logo_url: 'https://storage.test/office-logos/403429000/office.png',
        address_line1: 'Municipal Hall, Siniloan',
        phone: '(049) 501-1234',
      },
      error: null,
    });
    render(<CertificatePrint tree={SINILOAN_TREE} clientName="Ana Reyes" />);
    expect(await screen.findByText('Hon. Juan dela Cruz')).toBeInTheDocument();
    expect(screen.getByAltText(/Municipal Environment and Natural Resources Office, Siniloan seal/)).toHaveAttribute(
      'src',
      'https://storage.test/office-logos/403429000/office.png'
    );
    expect(screen.getByText(/Municipal Hall, Siniloan · Tel\. \(049\) 501-1234/)).toBeInTheDocument();
  });
});
