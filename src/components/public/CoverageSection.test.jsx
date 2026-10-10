import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import CoverageSection from './CoverageSection.jsx';

const PLACES = [
  { name: 'Bubukal', label: 'Bubukal' },
  { name: 'Calios', label: 'Calios' },
  { name: 'Gatid', label: 'Gatid' },
  { name: 'Alipit', label: 'Alipit' },
];

const tree = (barangay) => ({ barangay });
const many = (n, barangay) => Array.from({ length: n }, () => tree(barangay));

const renderSection = (trees, props = {}) =>
  render(
    <CoverageSection
      trees={trees}
      keyOf={(t) => t.barangay ?? null}
      allPlaces={PLACES}
      scopeLabel="Santa Cruz"
      noun="barangay"
      nounPlural="barangays"
      {...props}
    />
  );

const section = () => screen.getByRole('region', { name: 'Where the trees are' });
const notYet = () => screen.getByRole('tab', { name: /Not yet tagged/ });

afterEach(cleanup);

describe('CoverageSection', () => {
  it('says how much of the place has been reached', () => {
    renderSection([...many(5, 'Bubukal'), ...many(2, 'Calios')]);

    expect(within(section()).getByText('2 of 4 barangays')).toBeInTheDocument();
  });

  it('ranks the places that have trees', () => {
    renderSection([...many(5, 'Bubukal'), ...many(2, 'Calios')]);

    const rows = within(section()).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows[0]).toMatch(/Bubukal/);
    expect(rows[0]).toMatch(/5/);
    expect(rows[1]).toMatch(/Calios/);
  });

  it('names the places with nothing, which no grouping of the trees could', () => {
    renderSection(many(3, 'Bubukal'));

    fireEvent.click(notYet());

    const names = within(section()).getAllByRole('listitem').map((li) => li.textContent);
    expect(names).toEqual(['Alipit', 'Calios', 'Gatid']);
  });

  it('counts the untagged on the tab, so the gap is visible before it is opened', () => {
    renderSection(many(3, 'Bubukal'));
    expect(within(notYet()).getByText('3')).toBeInTheDocument();
  });

  it('does not claim an unsurveyed place has no trees', () => {
    // 112 trees across two municipalities is a survey that has barely begun.
    // A page that called the rest bare would be lying about the province.
    renderSection(many(3, 'Bubukal'));
    fireEvent.click(notYet());

    expect(within(section()).getByText(/have not been surveyed yet/i)).toBeInTheDocument();
    expect(
      within(section()).getByText(/No tagged trees does not mean no trees/i)
    ).toBeInTheDocument();
  });

  it('says when every place has been reached', () => {
    renderSection([
      tree('Bubukal'),
      tree('Calios'),
      tree('Gatid'),
      tree('Alipit'),
    ]);
    fireEvent.click(notYet());

    expect(
      within(section()).getByText(/Every barangay of Santa Cruz has at least one tagged tree/)
    ).toBeInTheDocument();
  });

  it('reports trees it could not place', () => {
    renderSection([...many(2, 'Bubukal'), tree(null)]);

    expect(within(section()).getByText(/1 tree nothing could place/)).toBeInTheDocument();
  });

  it('keeps a name that is not a barangay out of the unsurveyed list', () => {
    renderSection([...many(2, 'Bubukal'), tree('Villa Silangan Subdivision')]);
    fireEvent.click(notYet());

    const names = within(section()).getAllByRole('listitem').map((li) => li.textContent);
    expect(names).not.toContain('Villa Silangan Subdivision');
    // It is explained instead, as a subdivision rather than a place to visit.
    expect(within(section()).getByText(/the official list does not have/)).toBeInTheDocument();
  });

  it('shows nothing when there are no places to describe', () => {
    const { container } = renderSection([], { allPlaces: [] });
    expect(container).toBeEmptyDOMElement();
  });
});
