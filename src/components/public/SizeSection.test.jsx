import { render, screen, cleanup, within } from '@testing-library/react';
import SizeSection from './SizeSection.jsx';

const sized = (n, dbh) => Array.from({ length: n }, () => ({ dbh }));

const renderSection = (trees, scopeLabel = 'Laguna') =>
  render(<SizeSection trees={trees} scopeLabel={scopeLabel} />);

const section = () => screen.getByRole('region', { name: 'How old the trees are' });

afterEach(cleanup);

describe('SizeSection', () => {
  it('draws a column for every class between the smallest and largest', () => {
    renderSection([...sized(3, 10), ...sized(1, 31)]);

    // 10, 20 and 30 — including the empty 20, because a gap in the middle is
    // a cohort that was never planted or has been lost.
    const axis = within(section()).getAllByText(/^(10|20|30)$/);
    expect(axis.map((el) => el.textContent)).toEqual(['10', '20', '30']);
  });

  it('labels each class with the band it covers', () => {
    renderSection(sized(2, 30));
    expect(within(section()).getByText('25–34')).toBeInTheDocument();
  });

  it('reads the shape of the distribution in words', () => {
    renderSection([...sized(8, 12), ...sized(2, 40)]);

    expect(within(section()).getByText('Mostly young trees')).toBeInTheDocument();
    expect(within(section()).getByText(/still ahead of them/)).toBeInTheDocument();
  });

  it('says when the trees are mostly mature, and why that matters', () => {
    renderSection([...sized(6, 70), ...sized(4, 20)]);

    expect(within(section()).getByText('Mostly mature trees')).toBeInTheDocument();
    expect(within(section()).getByText(/takes decades to grow back/)).toBeInTheDocument();
  });

  it('says how much of the inventory the bars speak for', () => {
    renderSection([...sized(4, 20), ...sized(1, 3), { dbh: null }]);

    expect(within(section()).getByText(/From 4 of 6 trees/)).toBeInTheDocument();
    expect(within(section()).getByText(/1 is a seedling under 5 cm/)).toBeInTheDocument();
    expect(within(section()).getByText(/1 has no diameter recorded/)).toBeInTheDocument();
  });

  it('says so when nothing has been measured', () => {
    renderSection([{ dbh: null }, {}]);

    expect(within(section()).getByText(/No tree here has a diameter recorded/)).toBeInTheDocument();
  });

  it('names the place it is describing', () => {
    renderSection(sized(2, 20), 'Santa Cruz');
    expect(screen.getByText('How big the trees are in Santa Cruz')).toBeInTheDocument();
  });

  it('shows nothing at all when there are no trees', () => {
    const { container } = renderSection([]);
    expect(container).toBeEmptyDOMElement();
  });
});
