import fc from 'fast-check';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import TreePinPopup from './TreePinPopup.jsx';
import { classifyPinColor, PIN_COLOR } from '../lib/pinColor.js';
import { treeRecordArb } from '../test/arbitraries.js';

const buildTree = (overrides = {}) => ({
  id: 'id-1',
  tree_id: 'T-001',
  latitude: 14.281,
  longitude: 121.411,
  dbh: '42.5',
  species: 'Narra',
  scientific_name: 'Pterocarpus indicus',
  species_type: 'Endemic',
  is_leaning: false,
  has_powerline_conflict: false,
  is_decayed: false,
  is_root_problem: false,
  dateCaptured: '2024-03-15T08:30:00.000Z',
  assigned_to: null,
  has_cutting_permit: false,
  task_status: 'Pending',
  photo_url: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
  ...overrides,
});

/** How the popup names a tree: its tag, or the head of its row id. */
const identifierOf = (tree) => tree.tree_id || tree.id?.slice(0, 8) || '—';

afterEach(cleanup);

describe('TreePinPopup', () => {
  // ---------------------------------------------------------------------------
  // Property tests
  // ---------------------------------------------------------------------------

  // Feature: command-center-map, Property 4: Popup Content Completeness
  it('renders the tree identifier, species, dbh, and photo slot for any Tree_Record', () => {
    fc.assert(
      fc.property(treeRecordArb, (tree) => {
        const color = classifyPinColor(tree);
        const { container } = render(<TreePinPopup tree={tree} color={color} />);
        try {
          const text = container.textContent ?? '';
          if (!text.includes(identifierOf(tree))) return false;
          if (!text.includes(tree.species)) return false;
          if (!text.includes(tree.dbh)) return false;

          // Photo slot: <img src=photo_url> OR the placeholder.
          if (tree.photo_url != null) {
            const img = container.querySelector('img');
            if (!img || img.getAttribute('src') !== tree.photo_url) return false;
          } else if (!container.querySelector('[data-testid="tree-photo-placeholder"]')) {
            return false;
          }
          return true;
        } finally {
          cleanup();
        }
      }),
      { numRuns: 40 }
    );
  });

  // Dispatch is offered on every pin that needs attention, and only those.
  it('offers dispatch on every pin except a healthy one', () => {
    fc.assert(
      fc.property(treeRecordArb, (tree) => {
        const color = classifyPinColor(tree);
        render(<TreePinPopup tree={tree} color={color} />);
        try {
          const label = color === PIN_COLOR.ORANGE ? 'Re-assign' : 'Dispatch';
          const button = screen.queryByRole('button', { name: label });
          if (!button) return false;
          // A green pin shows the button greyed out rather than hiding it, so
          // the popup keeps the same shape whatever the pin.
          return button.disabled === (color === PIN_COLOR.GREEN);
        } finally {
          cleanup();
        }
      }),
      { numRuns: 40 }
    );
  });

  it('hands the tree to onDispatch when dispatch is pressed', () => {
    const onDispatch = vi.fn();
    const hazard = buildTree({ is_leaning: true, assigned_to: null });
    render(<TreePinPopup tree={hazard} color={classifyPinColor(hazard)} onDispatch={onDispatch} />);

    fireEvent.click(screen.getByRole('button', { name: 'Dispatch' }));

    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(onDispatch).toHaveBeenCalledWith(hazard);
  });

  it('calls the Re-assign label by its name on an already dispatched hazard', () => {
    const onDispatch = vi.fn();
    const assigned = buildTree({ is_leaning: true, assigned_to: 'arb-7' });
    render(<TreePinPopup tree={assigned} color={classifyPinColor(assigned)} onDispatch={onDispatch} />);

    expect(screen.getByText('Working: arb-7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Re-assign' }));
    expect(onDispatch).toHaveBeenCalledWith(assigned);
  });

  // ---------------------------------------------------------------------------
  // Permits
  // ---------------------------------------------------------------------------

  it('hands the tree to onIssuePermit, unless one was already issued', () => {
    const onIssuePermit = vi.fn();
    const tree = buildTree();
    const { rerender } = render(
      <TreePinPopup tree={tree} color={classifyPinColor(tree)} onIssuePermit={onIssuePermit} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Permit' }));
    expect(onIssuePermit).toHaveBeenCalledWith(tree);

    const permitted = buildTree({ has_cutting_permit: true });
    rerender(
      <TreePinPopup tree={permitted} color={classifyPinColor(permitted)} onIssuePermit={onIssuePermit} />
    );
    expect(screen.getByRole('button', { name: 'Permit' })).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // Example-based rendering
  // ---------------------------------------------------------------------------

  it('falls back to the head of the row id when a tree has no tag number', () => {
    const tree = buildTree({ tree_id: null, id: 'abcdef1234567890' });
    render(<TreePinPopup tree={tree} color="Green" />);

    expect(screen.getByText('abcdef12')).toBeInTheDocument();
  });

  it('renders a photo placeholder when photo_url is null', () => {
    render(<TreePinPopup tree={buildTree({ photo_url: null })} color="Green" />);
    expect(screen.getByTestId('tree-photo-placeholder')).toBeInTheDocument();
  });

  it('renders an img with the Cloudinary URL, named for the species and the view', () => {
    const tree = buildTree({ tree_id: 'T-777', species: 'Acacia' });
    render(<TreePinPopup tree={tree} color="Green" />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', tree.photo_url);
    // Each photo is one view of the tree, so the alt text says which.
    expect(img.getAttribute('alt')).toBe('Acacia - Main');
  });

  it('steps through every photo the tree has', () => {
    const tree = buildTree({
      photo_url: 'https://example.test/main.jpg',
      leaves_url: 'https://example.test/leaves.jpg',
    });
    render(<TreePinPopup tree={tree} color="Green" />);

    expect(screen.getByRole('img')).toHaveAttribute('src', tree.photo_url);
    fireEvent.click(screen.getAllByRole('button')[0]); // previous wraps around
    expect(screen.getByRole('img')).toHaveAttribute('src', tree.leaves_url);
  });

  it('says what the pin colour means', () => {
    const cases = [
      [buildTree({ is_leaning: true }), 'Unassigned Hazard'],
      [buildTree({ has_cutting_permit: true }), 'Permit Issued'],
      [buildTree(), 'Healthy'],
    ];

    for (const [tree, status] of cases) {
      const { container } = render(<TreePinPopup tree={tree} color={classifyPinColor(tree)} />);
      expect(within(container).getByText(status)).toBeInTheDocument();
      cleanup();
    }
  });

  it('keeps the popup to a fixed width, so Leaflet can size around it', () => {
    const { container } = render(<TreePinPopup tree={buildTree()} color="Green" />);
    expect(container.firstChild.className).toContain('w-64');
  });

  it('colours the dispatch button by urgency', () => {
    const red = buildTree({ is_leaning: true });
    const { container } = render(<TreePinPopup tree={red} color={classifyPinColor(red)} />);

    const dispatch = within(container).getByRole('button', { name: 'Dispatch' });
    expect(dispatch.className).toMatch(/bg-red-600/);
    expect(dispatch.className).toMatch(/text-white/);
  });
});
