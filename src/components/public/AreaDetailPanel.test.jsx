import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AreaDetailPanel from './AreaDetailPanel.jsx';

const TOTALS = { treeCount: 112, invasiveCount: 14, carbonKg: 4820 };

const barangays = (n) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Barangay ${i + 1}`,
    treeCount: n - i,
    invasiveCount: 0,
    carbonKg: 0,
  }));

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <AreaDetailPanel
        municipality="Santa Cruz"
        label="Santa Cruz"
        totals={TOTALS}
        barangays={barangays(3)}
        {...props}
      />
    </MemoryRouter>
  );

const panel = () => screen.getByRole('complementary', { name: /Biodiversity of/ });

afterEach(cleanup);

describe('AreaDetailPanel', () => {
  it('reports the figures it has and admits the ones it does not', () => {
    renderPanel();

    expect(within(panel()).getByText('112')).toBeInTheDocument();
    expect(within(panel()).getByText('14')).toBeInTheDocument();
    expect(within(panel()).getByText('4,820')).toBeInTheDocument();
    // Forest cover, annual increment and emission have no source yet.
    expect(within(panel()).getAllByText('—')).toHaveLength(3);
    expect(within(panel()).getAllByText('Not available yet')).toHaveLength(3);
  });

  it('explains every figure, since there is no footnote to fall back on', () => {
    renderPanel();

    const hints = within(panel()).getAllByRole('tooltip');
    expect(hints).toHaveLength(6);
    for (const hint of hints) expect(hint.textContent.trim().length).toBeGreaterThan(0);
  });

  it('lists the busiest barangays and counts the rest', () => {
    renderPanel({ barangays: barangays(9) });

    expect(within(panel()).getByText('Barangay 1')).toBeInTheDocument();
    expect(within(panel()).getByText('Barangay 6')).toBeInTheDocument();
    expect(within(panel()).queryByText('Barangay 7')).not.toBeInTheDocument();
    expect(within(panel()).getByText(/and 3 more barangays/)).toBeInTheDocument();
  });

  it('says so when nothing has been tagged in the place yet', () => {
    renderPanel({ barangays: [] });

    expect(within(panel()).getByText('No tagged trees here yet.')).toBeInTheDocument();
  });

  it('calls a city a city', () => {
    renderPanel({ municipality: 'Santa Rosa', label: 'Santa Rosa City' });

    expect(within(panel()).getByText(/^City of Laguna/)).toBeInTheDocument();
  });

  it('links to the full analytics for the place it is showing', () => {
    renderPanel({ municipality: 'Los Baños', label: 'Los Baños' });

    expect(within(panel()).getByRole('link', { name: /View full analytics/ })).toHaveAttribute(
      'href',
      '/biodiversity?lgu=Los%20Ba%C3%B1os'
    );
  });

  it('tells the map when it is collapsed, so the map controls travel with it', () => {
    const onCollapsedChange = vi.fn();
    renderPanel({ onCollapsedChange });

    fireEvent.click(screen.getByRole('button', { name: 'Hide Santa Cruz' }));

    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    // Collapsed, it is out of the accessibility tree as well as off-screen, so
    // it is no longer reachable by its role.
    expect(screen.queryByRole('complementary', { name: /Biodiversity of/ })).not.toBeInTheDocument();
    expect(document.querySelector('aside')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Show Santa Cruz' })).toBeInTheDocument();
  });

  it('slides out before it tells the map to drop the selection', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    renderPanel({ onClose });

    fireEvent.click(screen.getByRole('button', { name: 'Close Santa Cruz' }));
    // Not gone yet: it is on its way out, and the map's controls come back with it.
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
