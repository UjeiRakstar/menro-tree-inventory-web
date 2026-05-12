import { render, screen } from '@testing-library/react';
// CommandCenter is now a real component covered by CommandCenter.test.jsx.
// InventoryView is now a real component covered by Inventory.test.jsx (Phase 4);
// its placeholder sentence assertion has been retired together with the placeholder.
// ActionBoard is now a real component covered by ActionBoard.test.jsx (Phase 5);
// its placeholder sentence assertion has been retired together with the placeholder.
// AnalyticsView is now a real component covered by AnalyticsView.test.jsx (Analytics phase);
// its placeholder sentence assertion has been retired together with the placeholder.
import NotFound from './NotFound.jsx';

describe('NotFound', () => {
  it('renders the "Page Not Found" level-1 heading', () => {
    render(<NotFound />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Page Not Found' })
    ).toBeInTheDocument();
  });

  it('renders the recovery sentence directing users to the sidebar', () => {
    render(<NotFound />);
    expect(
      screen.getByText(
        'The page you requested does not exist. Use the sidebar to navigate.'
      )
    ).toBeInTheDocument();
  });

  it('does not render any interactive or data-visualization primitives', () => {
    const { container } = render(<NotFound />);
    expect(
      container.querySelector('input, button, table, canvas')
    ).toBeNull();
  });
});
