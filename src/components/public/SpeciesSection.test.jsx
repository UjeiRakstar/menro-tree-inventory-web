import { render, screen, cleanup, within } from '@testing-library/react';
import SpeciesSection from './SpeciesSection.jsx';

const tree = (species, over = {}) => ({ species, ...over });
const many = (n, species, over = {}) => Array.from({ length: n }, () => tree(species, over));

const renderSection = (trees, scopeLabel = 'Laguna') =>
  render(<SpeciesSection trees={trees} scopeLabel={scopeLabel} />);

const section = () => screen.getByRole('region', { name: 'What is growing here' });

afterEach(cleanup);

describe('SpeciesSection', () => {
  it('counts the kinds, not just the trees', () => {
    renderSection([...many(6, 'Narra'), ...many(3, 'Mango'), tree('Acacia')]);

    // Scoped to the headline: Mango's count of 3 is on screen as well.
    const headline = within(section()).getByText('species recorded').closest('p');
    expect(within(headline).getByText('3')).toBeInTheDocument();
    expect(within(headline).getByText(/across 10 trees/)).toBeInTheDocument();
  });

  it('says how many trees nobody has identified', () => {
    renderSection([...many(5, 'Narra'), ...many(2, 'Unknown')]);

    expect(within(section()).getByText(/2 not yet identified/)).toBeInTheDocument();
  });

  it('lists the commonest species, longest first', () => {
    renderSection([...many(6, 'Narra'), ...many(3, 'Mango'), tree('Acacia')]);

    const names = within(section())
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(names[0]).toMatch(/^Narra/);
    expect(names[1]).toMatch(/^Mango/);
  });

  it('stops at ten and says how many more there are', () => {
    const trees = Array.from({ length: 14 }, (_, i) => many(14 - i, `Species ${i}`)).flat();
    renderSection(trees);

    expect(within(section()).getByText(/and 4 more species/)).toBeInTheDocument();
  });

  it('tells a reader the mix is fine when it is', () => {
    // Twenty species of five each: nothing near a tenth.
    const trees = Array.from({ length: 20 }, (_, i) =>
      many(5, `Species ${i}`, { scientific_name: `Genus${i} species` })
    ).flat();
    renderSection(trees);

    expect(within(section()).getByText(/mix is within the guideline/i)).toBeInTheDocument();
    expect(within(section()).queryByText(/past the guideline/i)).not.toBeInTheDocument();
  });

  it('names what is over-planted, and what to do about it', () => {
    const rest = Array.from({ length: 86 }, (_, i) =>
      tree(`Species ${i}`, { scientific_name: `Genus${i} species` })
    );
    renderSection([...many(14, 'Mango', { scientific_name: 'Mangifera indica' }), ...rest]);

    const warning = within(section()).getByText(/Planted past the guideline/i).closest('div');
    expect(within(warning).getByText(/Mango/)).toBeInTheDocument();
    expect(within(warning).getByText(/14%/)).toBeInTheDocument();
    expect(within(warning).getByText(/above the 10% guideline for one species/)).toBeInTheDocument();
  });

  it('warns about a genus even when no single species is over', () => {
    const rest = Array.from({ length: 73 }, (_, i) =>
      tree(`Species ${i}`, { scientific_name: `Genus${i} species` })
    );
    renderSection([
      ...many(9, 'Red Lauan', { scientific_name: 'Shorea negrosensis' }),
      ...many(9, 'White Lauan', { scientific_name: 'Shorea contorta' }),
      ...many(9, 'Tangile', { scientific_name: 'Shorea polysperma' }),
      ...rest,
    ]);

    expect(within(section()).getByText(/above the 20% guideline for one genus/)).toBeInTheDocument();
    expect(within(section()).getByText(/Shorea/)).toBeInTheDocument();
  });

  it('marks an over-planted row with more than a colour', () => {
    const rest = Array.from({ length: 86 }, (_, i) => tree(`Species ${i}`));
    renderSection([...many(14, 'Mango'), ...rest]);

    // A colour alone is no use to anyone who cannot see it.
    expect(within(section()).getAllByText('above the guideline').length).toBeGreaterThan(0);
  });

  it('breaks the trees down by origin and by what they are grown for', () => {
    renderSection([
      tree('Narra', { biodiversity_status: 'Endemic', tree_category: 'Timber' }),
      tree('Mango', { species_type: 'Invasive', tree_category: 'Fruit Tree' }),
      tree('Palm', { tree_category: 'Ornamental' }),
    ]);

    const origin = within(section()).getByText('Where they come from').closest('div');
    expect(within(origin).getByText('Endemic')).toBeInTheDocument();
    expect(within(origin).getByText('Invasive')).toBeInTheDocument();

    const uses = within(section()).getByText('What they are grown for').closest('div');
    expect(within(uses).getByText('Fruit')).toBeInTheDocument();
    expect(within(uses).getByText('Timber')).toBeInTheDocument();
  });

  it('names the place it is describing', () => {
    renderSection([tree('Narra')], 'Santa Cruz');
    expect(screen.getByText('What is growing in Santa Cruz')).toBeInTheDocument();
  });

  it('shows nothing at all rather than an empty frame', () => {
    // A place with no tagged trees has nothing to say about its species.
    const { container } = renderSection([]);
    expect(container).toBeEmptyDOMElement();
  });
});
