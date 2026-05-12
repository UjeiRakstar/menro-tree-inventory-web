import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar, { NAV_ITEMS } from './Sidebar.jsx';
import ShimSidebar from '../Sidebar.jsx';

const EXPECTED_ITEMS = [
  { to: '/map', label: 'Command Center' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/action-board', label: 'Action Board' },
  { to: '/arborists', label: 'Field Team' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/audit-log', label: 'Audit Log' },
];

describe('Sidebar', () => {
  it('exports a NAV_ITEMS contract matching the six primary routes in order', () => {
    expect(NAV_ITEMS).toHaveLength(6);
    NAV_ITEMS.forEach((item, index) => {
      expect(item.to).toBe(EXPECTED_ITEMS[index].to);
      expect(item.label).toBe(EXPECTED_ITEMS[index].label);
      expect(item.Icon).toBeDefined();
    });
  });

  it('pins the Field Team entry at index 3 before Analytics at index 4 (ordering contract)', () => {
    expect(NAV_ITEMS[3].to).toBe('/arborists');
    expect(NAV_ITEMS[3].label).toBe('Field Team');
    expect(NAV_ITEMS[4].to).toBe('/analytics');
    expect(NAV_ITEMS[5].to).toBe('/audit-log');
    expect(NAV_ITEMS[5].label).toBe('Audit Log');
  });

  it('renders exactly six nav links in the required order', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);
    links.forEach((link, index) => {
      expect(link).toHaveTextContent(EXPECTED_ITEMS[index].label);
    });
  });

  it('wires each link to its corresponding route href', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const links = screen.getAllByRole('link');
    links.forEach((link, index) => {
      expect(link.getAttribute('href')).toBe(EXPECTED_ITEMS[index].to);
    });
  });

  it('renders an icon element and text label for each nav item', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    EXPECTED_ITEMS.forEach(({ label }) => {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') });
      // Lucide icons render as <svg>
      const icon = link.querySelector('svg');
      expect(icon).not.toBeNull();
      // Text label lives inside a <span>
      const span = link.querySelector('span');
      expect(span).not.toBeNull();
      expect(span).toHaveTextContent(label);
    });
  });

  describe.each(EXPECTED_ITEMS)(
    'active state at route $to',
    ({ to, label }) => {
      it(`only the ${label} link carries the active-state class`, () => {
        render(
          <MemoryRouter initialEntries={[to]}>
            <Sidebar />
          </MemoryRouter>
        );

        EXPECTED_ITEMS.forEach((item) => {
          const link = screen.getByRole('link', {
            name: new RegExp(item.label, 'i'),
          });
          const className = link.getAttribute('class') ?? '';
          if (item.to === to) {
            expect(className).toContain('bg-slate-700');
          } else {
            expect(className).not.toContain('bg-slate-700');
          }
        });
      });
    }
  );

  it('is re-exported from src/Sidebar.jsx as the same component reference', () => {
    expect(ShimSidebar).toBe(Sidebar);
  });
});
