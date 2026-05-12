import fc from 'fast-check';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TreePinPopup from './TreePinPopup.jsx';
import { classifyPinColor } from '../lib/pinColor.js';
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
          const identifier = tree.tree_id ?? 'Unidentified tree';

          // Identifier visible somewhere in the popup.
          const text = container.textContent ?? '';
          if (!text.includes(identifier)) return false;
          if (!text.includes(tree.species)) return false;
          if (!text.includes(tree.dbh)) return false;

          // Photo slot: <img src=photo_url> OR placeholder testid.
          if (tree.photo_url != null) {
            const img = container.querySelector('img');
            if (!img || img.getAttribute('src') !== tree.photo_url) return false;
          } else {
            if (!container.querySelector('[data-testid="tree-photo-placeholder"]'))
              return false;
          }
          return true;
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: command-center-map, Property 5: Dispatch Button Iff Red
  it('renders the Dispatch Arborist button iff classifyPinColor(tree) === "Red"', () => {
    fc.assert(
      fc.property(treeRecordArb, (tree) => {
        const color = classifyPinColor(tree);
        render(<TreePinPopup tree={tree} color={color} />);
        try {
          const btn = screen.queryByRole('button', {
            name: /dispatch arborist/i,
          });
          const expected = color === 'Red';
          return (btn !== null) === expected;
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: realtime-handshake, Property 6: Dispatch Click invokes onDispatchArborist with tree
  it('invokes onDispatchArborist(tree) when the Dispatch button is clicked on a Red popup', () => {
    const redTreeArb = treeRecordArb.filter(
      (t) => classifyPinColor(t) === 'Red'
    );

    fc.assert(
      fc.property(redTreeArb, (tree) => {
        const dispatchSpy = vi.fn();
        try {
          render(<TreePinPopup tree={tree} color="Red" onDispatchArborist={dispatchSpy} />);
          fireEvent.click(
            screen.getByRole('button', { name: /dispatch arborist/i })
          );
          if (dispatchSpy.mock.calls.length !== 1) return false;
          const [arg] = dispatchSpy.mock.calls[0];
          return arg === tree;
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  });

  // ---------------------------------------------------------------------------
  // Example-based tests
  // ---------------------------------------------------------------------------

  it('renders "Unidentified tree" fallback when tree_id is null', () => {
    render(
      <TreePinPopup tree={buildTree({ tree_id: null })} color="Green" />
    );
    expect(screen.getByText('Unidentified tree')).toBeInTheDocument();
  });

  it('renders a photo placeholder when photo_url is null', () => {
    render(<TreePinPopup tree={buildTree({ photo_url: null })} color="Green" />);
    expect(screen.getByTestId('tree-photo-placeholder')).toBeInTheDocument();
  });

  it('renders an img with the Cloudinary URL and species+identifier alt text', () => {
    const tree = buildTree({
      tree_id: 'T-777',
      species: 'Acacia',
      photo_url: 'https://res.cloudinary.com/demo/image/upload/v1/acacia.jpg',
    });
    render(<TreePinPopup tree={tree} color="Green" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', tree.photo_url);
    const alt = img.getAttribute('alt') ?? '';
    expect(alt).toContain('Acacia');
    expect(alt).toContain('T-777');
  });

  it('wrapper div carries Tailwind width class w-56 (visual contract)', () => {
    const { container } = render(
      <TreePinPopup tree={buildTree()} color="Green" />
    );
    const wrapper = container.firstChild;
    expect(wrapper.className).toContain('w-56');
  });

  it('dispatch button carries bg-red-600 and text-white classes on Red pins', () => {
    render(
      <TreePinPopup
        tree={buildTree({ is_leaning: true, assigned_to: null })}
        color="Red"
      />
    );
    const btn = screen.getByRole('button', { name: /dispatch arborist/i });
    expect(btn.className).toContain('bg-red-600');
    expect(btn.className).toContain('text-white');
  });

  it('does not render a Dispatch button for Orange, Yellow, or Green', () => {
    ['Orange', 'Yellow', 'Green'].forEach((color) => {
      const { unmount } = render(
        <TreePinPopup tree={buildTree()} color={color} />
      );
      expect(
        screen.queryByRole('button', { name: /dispatch arborist/i })
      ).toBeNull();
      unmount();
    });
  });
});
