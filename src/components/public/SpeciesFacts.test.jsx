import { render, screen, cleanup, within } from '@testing-library/react';
import SpeciesFacts, { monthsInWords, siteNeedsLines } from './SpeciesFacts.jsx';

afterEach(cleanup);

const NARRA = {
  species: 'Narra',
  family: 'Fabaceae',
  local_names: 'Apalit, Asana',
  origin: 'native',
  conservation_status: 'Critically Endangered (DAO 2017-11)',
  distribution: 'Throughout the Philippines, in lowland forests.',
  flowering_months: [3, 4, 5],
  fruiting_months: [6, 7, 8, 11],
  site_requirements: 'Well-drained soils.',
  elevation_min_m: 0,
  elevation_max_m: 600,
  soil_textures: ['loam', 'clay loam'],
  propagation: 'By seed or large cuttings.',
  uses: 'Furniture, shade, and as the national tree.',
  pests_diseases: 'Narra wilt.',
  rise_citation: 'DENR-ERDB, RISE 2019.',
  rise_url: 'https://erdb.denr.gov.ph/',
  autofilled: true,
};

describe('the RISE details on the tree panel', () => {
  it('says months as runs', () => {
    expect(monthsInWords([3, 4, 5])).toBe('March to May');
    expect(monthsInWords([6, 7, 8, 11])).toBe('June to August, November');
    expect(monthsInWords([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('all year');
    expect(monthsInWords(null)).toBe('');
  });

  it('says a site’s needs in figures, only those entered', () => {
    expect(siteNeedsLines(NARRA)).toEqual([
      ['Elevation', '0–600 m above sea level'],
      ['Soil', 'loam, clay loam'],
    ]);
    expect(siteNeedsLines({ rainfall_max_mm: 2500 })).toEqual([['Rainfall', 'up to 2,500 mm a year']]);
  });

  it('shows everything the forester entered, with its source', () => {
    render(<SpeciesFacts profile={NARRA} />);
    const section = screen.getByRole('region', { name: 'From the RISE library' });
    for (const text of ['Fabaceae', 'Apalit, Asana', 'Native — found naturally in the Philippines and elsewhere',
      'Critically Endangered (DAO 2017-11)', 'By seed or large cuttings.', 'Narra wilt.', 'Elevation:', 'Source: DENR-ERDB, RISE 2019.']) {
      expect(section).toHaveTextContent(text);
    }
    expect(within(section).getByRole('img', { name: 'Flowers March to May; Fruits June to August, November' })).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'https://erdb.denr.gov.ph/' })).toHaveAttribute('target', '_blank');
  });

  it('shows nothing for a species with no RISE details yet', () => {
    const { container } = render(<SpeciesFacts profile={{ species: 'Mango', description: 'A fruit tree.' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
