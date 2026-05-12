import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';

// Mock Supabase so that pages fetching on mount (CommandCenter, InventoryView,
// AnalyticsView, AuditLogView) don't trigger unhandled errors in routing tests.
// CommandCenter chains `.select('*').then(...)` while AuditLogView chains
// `.select('*').eq(...)`, so the mock must satisfy both patterns.
vi.mock('./supabaseClient.js', () => {
  const mockResult = Promise.resolve({ data: [], error: null });
  const selectFn = vi.fn(() => {
    // Return a thenable that also has .eq() for chained filters
    const thenable = mockResult.then.bind(mockResult);
    return {
      then: thenable,
      catch: mockResult.catch.bind(mockResult),
      eq: vi.fn(() => mockResult),
    };
  });
  const subscribeSpy = vi.fn();
  const onSpy = vi.fn(() => ({ subscribe: subscribeSpy }));
  const channelSpy = vi.fn(() => ({ on: onSpy }));
  return {
    supabase: {
      from: vi.fn(() => ({ select: selectFn })),
      channel: channelSpy,
      removeChannel: vi.fn(),
    },
  };
});

const ROUTE_CASES = [
  { path: '/map', heading: 'Command Center' },
  { path: '/inventory', heading: 'Inventory' },
  { path: '/action-board', heading: 'Action Board' },
  { path: '/analytics', heading: 'Analytics' },
  { path: '/audit-log', heading: 'Audit Log' },
  { path: '/does-not-exist', heading: 'Page Not Found' },
];

describe('App shell and routing', () => {
  describe.each(ROUTE_CASES)(
    'at path $path',
    ({ path, heading }) => {
      it(`renders the Sidebar, Header, and "${heading}" page heading`, () => {
        render(
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        );

        // Sidebar is a <nav>
        expect(screen.getByRole('navigation')).toBeInTheDocument();
        // Header is a <header> with banner role and contains "Mission Control"
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByText('Mission Control')).toBeInTheDocument();
        // Page heading at level 1
        expect(
          screen.getByRole('heading', { level: 1, name: heading })
        ).toBeInTheDocument();
      });
    }
  );

  it('redirects the root path "/" to "/map" so the Command Center heading renders', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Command Center' })
    ).toBeInTheDocument();
  });

  it('renders the Page Not Found heading for unknown routes while keeping Sidebar and Header', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'Page Not Found' })
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('keeps the Sidebar mounted when navigating between routes via NavLink clicks', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <App />
      </MemoryRouter>
    );

    // Confirm we start on the Command Center page
    expect(
      screen.getByRole('heading', { level: 1, name: 'Command Center' })
    ).toBeInTheDocument();

    // Capture the Sidebar nav node reference before navigation
    const sidebarBefore = screen.getByRole('navigation');

    // Click the Inventory NavLink
    fireEvent.click(screen.getByRole('link', { name: /Inventory/i }));

    // The Inventory page heading should now be present
    expect(
      screen.getByRole('heading', { level: 1, name: 'Inventory' })
    ).toBeInTheDocument();

    // The Sidebar reference must be the exact same DOM node (no remount, no full reload)
    expect(screen.getByRole('navigation')).toBe(sidebarBefore);
  });

  it('renders <main> with the overflow-auto class as a sibling following the <header>', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/map']}>
        <App />
      </MemoryRouter>
    );

    const main = container.querySelector('main');
    expect(main).not.toBeNull();
    expect(main.className).toContain('overflow-auto');

    const header = container.querySelector('header');
    expect(header).not.toBeNull();

    // Header and main must share the same parent element (siblings)
    expect(header.parentElement).toBe(main.parentElement);

    // Header must precede main in the DOM order
    const parent = main.parentElement;
    const children = Array.from(parent.children);
    expect(children.indexOf(header)).toBeLessThan(children.indexOf(main));
  });
});
