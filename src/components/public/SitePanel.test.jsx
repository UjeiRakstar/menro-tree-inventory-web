import { describe, it, expect, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import SitePanel from './SitePanel.jsx';
import { siteById, siteAreaM2 } from '../../lib/mapSites.js';
import { formatArea } from '../../lib/areaGeometry.js';
import { DATA_SOURCES } from '../../lib/dataSources.js';

const forest = () => siteById('lc-labuin-secondary-forest');
const plantingSite = () => siteById('ps-labuin');

const show = (feature) => render(<SitePanel feature={feature} onClose={() => {}} />);

describe('SitePanel, for land cover', () => {
  it('names the area, what grows there and where it is', () => {
    show(forest());
    expect(screen.getByRole('heading', { name: 'Labuin Secondary Forest' })).toBeInTheDocument();
    expect(screen.getByText('Secondary forest')).toBeInTheDocument();
    expect(screen.getByText('Brgy. Labuin, Santa Cruz, Laguna')).toBeInTheDocument();
  });

  it('measures the area from the polygon on screen', () => {
    show(forest());
    expect(screen.getByText(formatArea(siteAreaM2(forest())))).toBeInTheDocument();
  });

  it('shows the increment as a rate, in tonnes a YEAR', () => {
    show(forest());
    // The source table writes the rate as "t/ha". A total cannot carry that
    // unit: multiply tonnes per hectare by hectares and the hectares cancel.
    const mai = screen.getByText(/t\/yr$/);
    expect(mai).toBeInTheDocument();
    expect(screen.queryByText(/^[\d,.]+ t\/ha$/)).not.toBeInTheDocument();
  });

  it('says where the rate came from, and that it was measured elsewhere', () => {
    show(forest());
    const button = screen.getByRole('button', { name: /Where Estimated Total MAI AGB comes from/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // Every ⓘ on the panel has a tooltip in the DOM — hover opens them too —
    // so this takes the one that belongs to this button.
    const tip = screen
      .getAllByRole('tooltip')
      .find((node) => node.textContent.includes('tonnes per hectare'));
    expect(tip).toHaveTextContent('Lasco et al., 1999');
    expect(tip).toHaveTextContent('Leyte');
    expect(tip).toHaveTextContent('Laguna');
  });

  it('does not offer a planting site’s sections', () => {
    show(forest());
    expect(screen.queryByText(/Recommended Trees to Plant/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PGENRO Forestry Division/i)).not.toBeInTheDocument();
  });
});

describe('SitePanel, for a tree planting site', () => {
  it('always calls it a tree planting site, and says who set it', () => {
    show(plantingSite());
    // The record is named "Labuin"; the page supplies what kind of place it is.
    expect(screen.getByRole('heading', { name: 'Labuin Tree Planting Site' })).toBeInTheDocument();
    expect(screen.getByText('Verified by the PGENRO Forestry Division')).toBeInTheDocument();
  });

  it('lists what to plant, with the reason behind each name', () => {
    show(plantingSite());
    const narra = screen.getByText('Narra');
    expect(narra).toHaveAttribute('title', expect.stringContaining('Pterocarpus indicus'));
  });

  it('says enough for somebody to actually turn up and plant', () => {
    // A site nobody can act on is a map pin. When, how many, how to get there,
    // who to ask.
    show(plantingSite());
    expect(screen.getByText(/June to September/)).toBeInTheDocument();
    expect(screen.getByText(/seedlings at 3 m spacing/)).toBeInTheDocument();
    expect(screen.getByText(/barangay road/)).toBeInTheDocument();
    expect(screen.getByText(/pgenro@laguna\.gov\.ph/)).toBeInTheDocument();
    expect(screen.getByText('Open for planting')).toBeInTheDocument();
  });

  it('leaves the forestry increment out — it is not what the site is for', () => {
    show(plantingSite());
    expect(screen.queryByText(/MAI AGB/)).not.toBeInTheDocument();
  });
});

describe('what the panel admits', () => {
  it('says on its face that the figures are placeholders', () => {
    // These are numbers about somebody's land. Showing a soil series and a
    // flood extent without that sentence is making a claim.
    show(forest());
    const note = document.querySelector('[data-provisional="placeholder"]');
    expect(note).toHaveTextContent('Placeholder');
    expect(note).toHaveTextContent(/until the PGENRO uploads the survey layers/);
  });

  it('separates the figure it measured from the figures it made up', () => {
    // This is the distinction somebody planning the next build needs: the area
    // comes off the polygon and is already true, while the soil series is
    // invented and will be replaced outright.
    show(forest());

    const soil = screen.getByText('Macolod clay loam').closest('li');
    expect(soil.querySelector('[data-provisional="placeholder"]')).toBeTruthy();

    const area = screen.getByText(formatArea(siteAreaM2(forest()))).closest('div');
    expect(area.querySelector('[data-provisional]')).toBeNull();
  });

  it('marks a borrowed rate as borrowed, not as invented', () => {
    // The MAI rate is a real published measurement — it was just taken in
    // Leyte. That is a different problem from a made-up soil series, and it
    // clears in a different way.
    show(forest());
    const mai = screen.getByText(/t\/yr$/).closest('div');
    expect(mai.querySelector('[data-provisional="borrowed"]')).toBeTruthy();
  });

  it('credits every agency the ground truth belongs to', () => {
    show(forest());
    for (const source of DATA_SOURCES) {
      // Named in the alt text as well as the tooltip: a row of bare logos reads
      // to a screen reader as five images and to everyone else as decoration.
      expect(screen.getByAltText(new RegExp(source.name))).toBeInTheDocument();
    }
  });

  it('tells "none mapped" apart from "nobody has looked"', () => {
    const unassessed = {
      ...forest(),
      properties: { ...forest().properties, hazards: { flood: { share: 0 } } },
    };
    show(unassessed);
    expect(screen.getByText('None mapped')).toBeInTheDocument();
    expect(screen.getByText('Not assessed')).toBeInTheDocument();
  });
});

describe('the area unit', () => {
  it('switches between square metres and hectares on request', () => {
    show(forest());

    const group = screen.getByRole('group', { name: 'Area unit' });
    expect(screen.getByText(formatArea(siteAreaM2(forest())))).toBeInTheDocument();

    fireEvent.click(within(group).getByRole('button', { name: 'ha' }));
    // A hectare is the unit a forester plans in; a square metre is the one a
    // resident can picture. The same panel is read by both.
    expect(screen.getByText(formatArea(siteAreaM2(forest()), 'ha'))).toBeInTheDocument();
  });
});

describe('closing', () => {
  it('slides out before it tells the map to let go', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(<SitePanel feature={forest()} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /Close Labuin Secondary Forest/i }));
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
