import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SpeciesSuggestions from './SpeciesSuggestions.jsx';

const RESULT = {
  suited: [
    {
      profile: { species: 'Molave', scientific_name: 'Vitex parviflora', origin: 'endemic' },
      fits: ['grows at 0–900 m — the site is 14–23 m', 'grows in clay loam — the site is Marikina silty clay loam'],
    },
    { profile: { species: 'Narra', scientific_name: null, origin: 'native' }, fits: ['a', 'b'] },
  ],
  unsuited: 3,
  invasive: 1,
  noNeeds: 0,
};

describe('SpeciesSuggestions', () => {
  it('lists what suits the ground, why, and adds a name to the list', () => {
    const onAdd = vi.fn();
    render(<SpeciesSuggestions result={RESULT} chosen={new Set(['narra'])} onAdd={onAdd} />);
    const list = screen.getByRole('region', { name: 'Suited to this ground' });

    expect(within(list).getByText('Endemic to the Philippines')).toBeInTheDocument();
    expect(within(list).getByText(/grows in clay loam — the site is Marikina silty clay loam/)).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: 'Add Molave' }));
    expect(onAdd).toHaveBeenCalledWith('Molave');
    // Already in the list: said, not offered again.
    expect(within(list).getByRole('button', { name: 'Narra is in the list' })).toBeDisabled();
    expect(list).toHaveTextContent('Set aside from the library: 3 do not fit this ground; 1 invasive, never suggested.');
  });

  it('explains an empty list rather than showing nothing', () => {
    render(<SpeciesSuggestions result={{ suited: [], unsuited: 0, invasive: 0, noNeeds: 4 }} chosen={new Set()} onAdd={() => {}} />);
    expect(screen.getByText(/No species in the library fits/)).toBeInTheDocument();
    expect(screen.getByText(/4 have no site needs recorded yet/)).toBeInTheDocument();
  });
});
