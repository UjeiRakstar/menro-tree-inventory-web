import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
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

    // The explanation is behind the ⚠ now rather than printed under the
    // section: it is a paragraph that never changes, and it was costing a
    // hundred pixels of page to say something most readers already took from
    // the amber bar.
    fireEvent.click(within(section()).getByRole('button', { name: /past the guideline/i }));

    const warning = screen.getByRole('dialog');
    expect(within(warning).getByText(/Planted past the guideline/i)).toBeInTheDocument();
    expect(within(warning).getByText(/Mango/)).toBeInTheDocument();
    expect(within(warning).getByText(/14%/)).toBeInTheDocument();
    expect(within(warning).getByText(/above the 10% guideline for one species/)).toBeInTheDocument();
  });

  it('opens the same explanation from the ⚠ on the row itself', () => {
    const rest = Array.from({ length: 86 }, (_, i) =>
      tree(`Species ${i}`, { scientific_name: `Genus${i} species` })
    );
    renderSection([...many(14, 'Mango', { scientific_name: 'Mangifera indica' }), ...rest]);

    fireEvent.click(
      within(section()).getByRole('button', { name: /Mango is above the guideline/i })
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the explanation on Okay, on the ✕ and on Escape', () => {
    const rest = Array.from({ length: 86 }, (_, i) =>
      tree(`Species ${i}`, { scientific_name: `Genus${i} species` })
    );
    renderSection([...many(14, 'Mango', { scientific_name: 'Mangifera indica' }), ...rest]);

    const open = () =>
      fireEvent.click(within(section()).getByRole('button', { name: /past the guideline/i }));

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Okay' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the page clear when nothing is over the guideline', () => {
    // No warning line, and nothing to open.
    renderSection(Array.from({ length: 40 }, (_, i) => tree(`Species ${i}`)));
    expect(
      within(section()).queryByRole('button', { name: /past the guideline/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

    fireEvent.click(within(section()).getByRole('button', { name: /past the guideline/i }));
    const warning = screen.getByRole('dialog');
    expect(within(warning).getByText(/above the 20% guideline for one genus/)).toBeInTheDocument();
    expect(within(warning).getByText(/Shorea/)).toBeInTheDocument();
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

describe('the guideline line', () => {
  it('is drawn when a species is within reach of it', () => {
    const rest = Array.from({ length: 86 }, (_, i) => tree(`Species ${i}`));
    renderSection([...many(14, 'Mango'), ...rest]);

    expect(within(section()).getByText('10% guideline')).toBeInTheDocument();
  });

  it('is not drawn when nothing is near it, and says so instead', () => {
    // Sixty species: the commonest is under 3%. Keeping the line on the track
    // would squash every bar to a stub against a line nothing approaches.
    const trees = Array.from({ length: 60 }, (_, i) => many(2, `Species ${i}`)).flat();
    renderSection(trees);

    expect(within(section()).queryByText('10% guideline')).not.toBeInTheDocument();
    expect(
      within(section()).getByText('No species is anywhere near the 10% guideline.')
    ).toBeInTheDocument();
  });
});
