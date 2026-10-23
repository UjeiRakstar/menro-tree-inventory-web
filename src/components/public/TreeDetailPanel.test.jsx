import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import TreeDetailPanel from './TreeDetailPanel.jsx';

const TREE = {
  id: 7,
  species: 'Manga',
  scientific_name: 'Mangifera indica',
  barangay: 'Brgy. Bubukal',
  biodiversity_status: 'Endemic',
  tree_category: 'Fruit Tree',
  source: 'crowdsource',
  photo_url: 'https://example.test/manga-main.jpg',
  leaves_url: 'https://example.test/manga-leaves.jpg',
  // as the mobile app writes them
  total_height: '5.0',
  dbh: '140.2 cm',
  leaf_status: 'peak',
  flower_status: 'full_bloom',
  fruit_status: 'ripe',
};

const DISTRIBUTION = [
  { name: 'Santa Cruz', label: 'Santa Cruz', count: 6 },
  { name: 'Pakil', label: 'Pakil', count: 2 },
];

const PROFILE = {
  species: 'Manga',
  description: 'The Manga Tree is a large, densely crowded evergreen.\n\nIt thrives in deep, rich soil.',
  details: 'Uses\nFruit eaten ripe or processed green.',
};

function renderPanel(props = {}) {
  return render(
    <TreeDetailPanel
      tree={TREE}
      municipalityLabel="Santa Cruz"
      profile={PROFILE}
      distribution={DISTRIBUTION}
      onClose={() => {}}
      {...props}
    />
  );
}

afterEach(cleanup);

describe('TreeDetailPanel', () => {
  it('names the tree, its species and where it stands', () => {
    renderPanel();

    expect(screen.getByRole('heading', { level: 2, name: 'Manga' })).toBeInTheDocument();
    expect(screen.getByText('Mangifera indica')).toBeInTheDocument();
    expect(screen.getByText('Brgy. Bubukal, Santa Cruz, Laguna')).toBeInTheDocument();
  });

  it('leaves out what the record does not say instead of printing "Unknown"', () => {
    renderPanel({
      tree: { ...TREE, scientific_name: 'Unknown', barangay: 'Unknown Barangay' },
      municipalityLabel: 'Pila',
    });

    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(screen.getByText('Pila, Laguna')).toBeInTheDocument();
  });

  it('shows the three badges with an explanation each reader can reach', () => {
    renderPanel();

    // The icons are decorative; the meaning is text, so hover is not the only
    // way to get at it.
    expect(screen.getByText(/Endemic species:/)).toBeInTheDocument();
    expect(screen.getByText(/Fruit tree:/)).toBeInTheDocument();
    expect(screen.getByText(/Crowdsourced:/)).toBeInTheDocument();
    // Hover, and the explanation is drawn outside the scrolling panel, where
    // nothing can cut it off.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Highlight every endemic/i }).parentElement);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent(/Tap to highlight these on the map/);
    expect(tip.parentElement).toBe(document.body);
    expect(tip).toHaveClass('fixed');
  });

  it('opens on the Description tab and switches to Tree Details', () => {
    renderPanel();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(screen.getByText(/densely crowded evergreen/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Tree Details' }));

    expect(screen.getByRole('tab', { name: 'Tree Details' })).toHaveAttribute('aria-selected', 'true');
    // The write-up gives way to this tree's own record.
    expect(screen.queryByText(/densely crowded evergreen/)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Measurements' })).toBeInTheDocument();
  });

  it('splits the write-up on blank lines so paragraphs stay paragraphs', () => {
    renderPanel();

    expect(screen.getByText('The Manga Tree is a large, densely crowded evergreen.')).toBeInTheDocument();
    expect(screen.getByText('It thrives in deep, rich soil.')).toBeInTheDocument();
  });

  it('says so when a species has no write-up yet', () => {
    renderPanel({ profile: null });

    expect(screen.getByText(/description for this species has not been published yet/i)).toBeInTheDocument();

    // Tree Details is measured data, so it is unaffected by a missing write-up.
    fireEvent.click(screen.getByRole('tab', { name: 'Tree Details' }));
    expect(screen.queryByText(/has not been published yet/i)).not.toBeInTheDocument();
    expect(screen.getByText('140.2')).toBeInTheDocument();
  });

  it('credits DENR-ERDB under the write-up, with a working link', () => {
    renderPanel();

    expect(
      screen.getByText(/All tree information are derived from Department of Environment and Natural Resources/)
    ).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /erdbservices\.denr\.gov\.ph/ });
    // On its own line, not trailing the sentence.
    expect(link.tagName).toBe('A');
    expect(link.className).toContain('block');
    expect(link).toHaveAttribute('href', 'https://erdbservices.denr.gov.ph/eskris/iec_for_guest.php');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByAltText(/Ecosystems Research and Development Bureau/)).toBeInTheDocument();
  });

  it('credits ERDB only where ERDB text is shown', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Tree Details' }));

    // Tree Details is this tree's field record, not an ERDB publication.
    expect(
      screen.queryByText(/All tree information are derived from Department of Environment and Natural Resources/)
    ).not.toBeInTheDocument();
  });

  it('steps through the photos the mobile app uploaded', () => {
    renderPanel();

    expect(screen.getByAltText('Manga — Main')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByAltText('Manga — Leaves')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    // Two photos, so it wraps rather than running off the end.
    expect(screen.getByAltText('Manga — Main')).toBeInTheDocument();
  });

  it('offers no carousel arrows for a single photo, and copes with none', () => {
    renderPanel({ tree: { ...TREE, leaves_url: null } });
    expect(screen.queryByRole('button', { name: 'Next photo' })).not.toBeInTheDocument();

    cleanup();
    renderPanel({ tree: { ...TREE, photo_url: null, leaves_url: null } });
    expect(screen.getByText('No photo available')).toBeInTheDocument();
  });

  it('slides in from the left rather than appearing', async () => {
    renderPanel();
    const panel = screen.getByRole('complementary');

    expect(panel.className).toContain('transition-transform');
    // It starts parked off-screen and is on screen by the next frame.
    await waitFor(() => expect(panel.className).toContain('translate-x-0'));
    expect(panel.className).not.toContain('-translate-x-full');
  });

  it('collapses out of the way and comes back, telling the map either way', async () => {
    const onCollapsedChange = vi.fn();
    renderPanel({ onCollapsedChange });
    const panel = screen.getByRole('complementary');
    await waitFor(() => expect(panel.className).toContain('translate-x-0'));

    fireEvent.click(screen.getByRole('button', { name: 'Hide tree details' }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
    expect(panel.className).toContain('-translate-x-full');
    expect(panel).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Show tree details' }));
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    expect(panel.className).toContain('translate-x-0');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('slides out on close, and only then lets the map drop it', async () => {
    const onClose = vi.fn();
    const onCollapsedChange = vi.fn();
    renderPanel({ onClose, onCollapsedChange });

    const panel = screen.getByRole('complementary');
    await waitFor(() => expect(panel.className).toContain('translate-x-0'));

    fireEvent.click(within(panel).getByRole('button', { name: 'Close tree details' }));

    // Unmounting on the click is what made it vanish on a phone, where the
    // panel is the whole screen.
    expect(onClose).not.toHaveBeenCalled();
    expect(panel.className).toContain('-translate-x-full');
    // The map's controls come back as it goes, not after.
    expect(onCollapsedChange).toHaveBeenCalledWith(true);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('ignores a second close while the first is still sliding', async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });

    const close = screen.getByRole('button', { name: 'Close tree details' });
    fireEvent.click(close);
    fireEvent.click(close);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('starts the next tree at its first photo and first tab', async () => {
    const { rerender } = renderPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Tree Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));

    rerender(
      <TreeDetailPanel
        tree={{ ...TREE, id: 8, species: 'Narra' }}
        municipalityLabel="Santa Cruz"
        profile={PROFILE}
        onClose={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Description' })).toHaveAttribute('aria-selected', 'true')
    );
    expect(screen.getByAltText('Narra — Main')).toBeInTheDocument();
  });

  it('tells a loading write-up apart from one that does not exist', () => {
    renderPanel({ profile: null, profileLoading: true });

    expect(screen.getByText(/Loading the species write-up/)).toBeInTheDocument();
    expect(screen.queryByText(/has not been published yet/)).not.toBeInTheDocument();
  });
});

describe('TreeDetailPanel — Tree Details tab', () => {
  function openDetails(props = {}) {
    renderPanel(props);
    fireEvent.click(screen.getByRole('tab', { name: 'Tree Details' }));
  }

  it('shows the height and the DBH as recorded in the field', () => {
    openDetails();

    const measurements = screen.getByRole('region', { name: 'Measurements' });
    expect(within(measurements).getByText('5')).toBeInTheDocument();
    expect(within(measurements).getByText('m')).toBeInTheDocument();
    expect(within(measurements).getByText('140.2')).toBeInTheDocument();
    expect(within(measurements).getByText('cm')).toBeInTheDocument();
    // Exact, so the ⓘ explainer's opening words are not mistaken for the caption.
    expect(within(measurements).getByText('Diameter at Breast Height')).toBeInTheDocument();
  });

  it('explains DBH on demand, for a tap as well as a hover', () => {
    openDetails();

    const hint = screen.getByRole('button', { name: /What is Diameter at Breast Height/ });
    expect(hint).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(hint);
    expect(hint).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/1.3 metres above the ground/)).toBeInTheDocument();
  });

  it('says nothing was measured rather than showing an empty row', () => {
    openDetails({ tree: { ...TREE, total_height: null, dbh: null } });

    expect(screen.getByText('No measurements were recorded for this tree.')).toBeInTheDocument();
  });

  it('leaves the height out when only a height class was recorded', () => {
    // A class is not a measurement, and the DBH still shows.
    openDetails({ tree: { ...TREE, total_height: null, heightClass: 'Medium' } });

    const measurements = screen.getByRole('region', { name: 'Measurements' });
    expect(within(measurements).queryByText('Medium')).not.toBeInTheDocument();
    expect(within(measurements).queryByText('height')).not.toBeInTheDocument();
    expect(within(measurements).getByText('140.2')).toBeInTheDocument();
  });

  it('prefers the field visit over anything stored on the tree row', () => {
    openDetails({
      observation: {
        foliage_status: 'Shedding / Bare',
        flowering_status: 'None',
        fruiting_status: 'Ripe / Mature',
        observed_at: '2026-03-12T01:30:00.000Z',
      },
    });

    const phenology = screen.getByRole('region', { name: 'Phenology' });
    expect(within(phenology).getByText('Shedding')).toBeInTheDocument();
    expect(within(phenology).getByText('Ripe')).toBeInTheDocument();
    // 'None' is an observation that the tree carries no flowers — no icon.
    expect(within(phenology).queryByText('Full Bloom')).not.toBeInTheDocument();
    // And say when someone last looked, since phenology goes stale.
    expect(within(phenology).getByText(/Observed .*2026/)).toBeInTheDocument();
  });

  it('shows the leaf, flower and fruit status the officer observed', () => {
    openDetails();

    const phenology = screen.getByRole('region', { name: 'Phenology' });
    expect(within(phenology).getByText('Full Canopy')).toBeInTheDocument();
    expect(within(phenology).getByText('Full Bloom')).toBeInTheDocument();
    expect(within(phenology).getByText('Ripe')).toBeInTheDocument();
    expect(within(phenology).getByText(/Flower status — Full Bloom/)).toBeInTheDocument();
  });

  it('leaves out a phase that was not observed, and says so when none were', () => {
    openDetails({ tree: { ...TREE, flower_status: 'none', fruit_status: null } });
    let phenology = screen.getByRole('region', { name: 'Phenology' });
    expect(within(phenology).getByText('Full Canopy')).toBeInTheDocument();
    expect(within(phenology).queryByText('Full Bloom')).not.toBeInTheDocument();
    expect(within(phenology).queryByText('Ripe')).not.toBeInTheDocument();

    cleanup();
    openDetails({ tree: { ...TREE, leaf_status: null, flower_status: null, fruit_status: null } });
    phenology = screen.getByRole('region', { name: 'Phenology' });
    expect(within(phenology).getByText(/No leaf, flower or fruit observation/)).toBeInTheDocument();
  });

  it('names what the tree is classified as', () => {
    openDetails();

    const classification = screen.getByRole('region', { name: 'Classification' });
    expect(within(classification).getByText('Fruit tree')).toBeInTheDocument();
    expect(within(classification).getByText('Endemic species')).toBeInTheDocument();
  });

  it('lists where else in Laguna the species has been tagged', () => {
    openDetails();

    const distribution = screen.getByRole('region', { name: 'Distribution by City/Municipality' });
    const chips = within(distribution).getAllByRole('listitem');
    expect(chips.map((c) => c.textContent)).toEqual(['Santa Cruz', 'Pakil']);
    expect(chips[0]).toHaveAttribute('title', '6 tagged trees in Santa Cruz');
    expect(chips[1]).toHaveAttribute('title', '2 tagged trees in Pakil');
  });

  it('drops the distribution block when there is nothing to list', () => {
    openDetails({ distribution: [] });

    expect(screen.queryByRole('region', { name: 'Distribution by City/Municipality' })).not.toBeInTheDocument();
  });
});
