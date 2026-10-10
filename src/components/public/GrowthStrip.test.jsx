import { render, screen, cleanup, within } from '@testing-library/react';
import GrowthStrip from './GrowthStrip.jsx';
import { taggingTimeline } from '../../lib/inventoryFreshness.js';

const at = (dateCaptured) => ({ dateCaptured });
const many = (n, date) => Array.from({ length: n }, () => at(date));

const renderStrip = (trees, scopeLabel = 'Laguna') =>
  render(<GrowthStrip timeline={taggingTimeline(trees)} scopeLabel={scopeLabel} />);

const strip = () => screen.getByRole('region', { name: 'How the inventory has grown' });

afterEach(cleanup);

describe('GrowthStrip', () => {
  const trees = [...many(2, '2026-06-05'), ...many(3, '2026-08-10')];

  it('says how far the survey has got, and when it moved fastest', () => {
    renderStrip(trees, 'Santa Cruz');

    expect(
      within(strip()).getByText(/5 trees tagged in Santa Cruz over 3 months/)
    ).toBeInTheDocument();
    expect(within(strip()).getByText(/the most in Aug 2026 with 3/)).toBeInTheDocument();
  });

  it('labels the span it covers', () => {
    renderStrip(trees);

    expect(within(strip()).getByText('Jun 2026')).toBeInTheDocument();
    expect(within(strip()).getByText('Aug 2026')).toBeInTheDocument();
  });

  it('keeps a month where nothing happened', () => {
    renderStrip(trees);

    // July. A flat stretch is part of the story; dropping it would draw a
    // survey that never paused.
    const months = within(strip()).getAllByRole('listitem');
    expect(months).toHaveLength(3);
    expect(months[1].getAttribute('title')).toMatch(/none added/);
  });

  it('draws nothing from a single month, which is a dot and not a trend', () => {
    const { container } = renderStrip(many(5, '2026-08-10'));
    expect(container).toBeEmptyDOMElement();
  });

  it('draws nothing when no tree is dated', () => {
    const { container } = renderStrip([at(null), {}]);
    expect(container).toBeEmptyDOMElement();
  });
});
