import fc from 'fast-check';
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from '@testing-library/react';
import OverlayTogglePanel from './OverlayTogglePanel.jsx';

const PAGASA_LABEL = 'PAGASA DRR Overlay';
const UHI_LABEL = 'Urban Heat Island Map';

const getPagasaButton = () =>
  screen.getByRole('button', { name: PAGASA_LABEL });
const getUhiButton = () => screen.getByRole('button', { name: UHI_LABEL });

/** Default props for rendering the controlled component */
const defaultProps = () => ({
  pagasaPressed: false,
  uhiPressed: false,
  onPagasaToggle: vi.fn(),
  onUhiToggle: vi.fn(),
});

describe('OverlayTogglePanel', () => {
  // ---------------------------------------------------------------------------
  // Property tests
  // ---------------------------------------------------------------------------

  // Feature: external-integrations, Property 2: Controlled toggle callback correctness
  it('each click calls the corresponding callback with the negated current pressed prop (toggle parity)', () => {
    const clickSeqArb = fc.array(fc.constantFrom('pagasa', 'uhi'), {
      maxLength: 20,
    });
    const initialStateArb = fc.record({
      pagasaPressed: fc.boolean(),
      uhiPressed: fc.boolean(),
    });

    fc.assert(
      fc.property(initialStateArb, clickSeqArb, (initialState, seq) => {
        const onPagasaToggle = vi.fn();
        const onUhiToggle = vi.fn();

        let pagasaPressed = initialState.pagasaPressed;
        let uhiPressed = initialState.uhiPressed;

        const { rerender } = render(
          <OverlayTogglePanel
            pagasaPressed={pagasaPressed}
            uhiPressed={uhiPressed}
            onPagasaToggle={onPagasaToggle}
            onUhiToggle={onUhiToggle}
          />
        );

        try {
          for (const target of seq) {
            if (target === 'pagasa') {
              const expectedArg = !pagasaPressed;
              fireEvent.click(getPagasaButton());
              const lastCall = onPagasaToggle.mock.calls[onPagasaToggle.mock.calls.length - 1];
              if (!lastCall || lastCall[0] !== expectedArg) return false;
              // Simulate parent updating state
              pagasaPressed = expectedArg;
            } else {
              const expectedArg = !uhiPressed;
              fireEvent.click(getUhiButton());
              const lastCall = onUhiToggle.mock.calls[onUhiToggle.mock.calls.length - 1];
              if (!lastCall || lastCall[0] !== expectedArg) return false;
              // Simulate parent updating state
              uhiPressed = expectedArg;
            }

            // Re-render with updated state (simulating parent re-render)
            rerender(
              <OverlayTogglePanel
                pagasaPressed={pagasaPressed}
                uhiPressed={uhiPressed}
                onPagasaToggle={onPagasaToggle}
                onUhiToggle={onUhiToggle}
              />
            );
          }

          // Verify independence: pagasa callbacks count matches pagasa clicks
          const pagasaClicks = seq.filter((x) => x === 'pagasa').length;
          const uhiClicks = seq.filter((x) => x === 'uhi').length;
          return (
            onPagasaToggle.mock.calls.length === pagasaClicks &&
            onUhiToggle.mock.calls.length === uhiClicks
          );
        } finally {
          cleanup();
        }
      }),
      { numRuns: 100 }
    );
  });

  // Feature: external-integrations, Property: Callback invocation correctness (replaces toggle logging)
  it('each single click invokes the correct callback with the negated pressed value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('pagasa', 'uhi'),
        fc.boolean(),
        fc.boolean(),
        (target, pagasaState, uhiState) => {
          const onPagasaToggle = vi.fn();
          const onUhiToggle = vi.fn();

          try {
            render(
              <OverlayTogglePanel
                pagasaPressed={pagasaState}
                uhiPressed={uhiState}
                onPagasaToggle={onPagasaToggle}
                onUhiToggle={onUhiToggle}
              />
            );

            const button =
              target === 'pagasa' ? getPagasaButton() : getUhiButton();
            fireEvent.click(button);

            if (target === 'pagasa') {
              if (onPagasaToggle.mock.calls.length !== 1) return false;
              if (onPagasaToggle.mock.calls[0][0] !== !pagasaState) return false;
              // UHI callback should not have been called
              if (onUhiToggle.mock.calls.length !== 0) return false;
            } else {
              if (onUhiToggle.mock.calls.length !== 1) return false;
              if (onUhiToggle.mock.calls[0][0] !== !uhiState) return false;
              // PAGASA callback should not have been called
              if (onPagasaToggle.mock.calls.length !== 0) return false;
            }
            return true;
          } finally {
            cleanup();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // ---------------------------------------------------------------------------
  // Example-based tests
  // ---------------------------------------------------------------------------

  it('renders exactly two buttons with the expected labels', () => {
    render(<OverlayTogglePanel {...defaultProps()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName(PAGASA_LABEL);
    expect(buttons[1]).toHaveAccessibleName(UHI_LABEL);
  });

  it('both buttons carry the glassmorphism signature classes', () => {
    render(<OverlayTogglePanel {...defaultProps()} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn.className).toContain('backdrop-blur-md');
      expect(btn.className).toContain('bg-white/30');
      expect(btn.className).toContain('border');
    });
  });

  it('clicking PAGASA toggles the ring-2 pressed visual treatment on and off', () => {
    const onPagasaToggle = vi.fn();
    const onUhiToggle = vi.fn();

    const { rerender } = render(
      <OverlayTogglePanel
        pagasaPressed={false}
        uhiPressed={false}
        onPagasaToggle={onPagasaToggle}
        onUhiToggle={onUhiToggle}
      />
    );

    const btn = getPagasaButton();
    expect(btn.className).not.toContain('ring-2');

    // Click → callback called with true
    fireEvent.click(btn);
    expect(onPagasaToggle).toHaveBeenCalledWith(true);

    // Simulate parent updating state
    rerender(
      <OverlayTogglePanel
        pagasaPressed={true}
        uhiPressed={false}
        onPagasaToggle={onPagasaToggle}
        onUhiToggle={onUhiToggle}
      />
    );
    expect(getPagasaButton().className).toContain('ring-2');

    // Click again → callback called with false
    fireEvent.click(getPagasaButton());
    expect(onPagasaToggle).toHaveBeenCalledWith(false);

    // Simulate parent updating state
    rerender(
      <OverlayTogglePanel
        pagasaPressed={false}
        uhiPressed={false}
        onPagasaToggle={onPagasaToggle}
        onUhiToggle={onUhiToggle}
      />
    );
    expect(getPagasaButton().className).not.toContain('ring-2');
  });

  it('the outer container is positioned absolute top-4 right-4 on the map', () => {
    const { container } = render(<OverlayTogglePanel {...defaultProps()} />);
    const outer = container.firstChild;
    expect(outer.className).toContain('absolute');
    expect(outer.className).toContain('top-4');
    expect(outer.className).toContain('right-4');
  });

  it('clicking PAGASA does not change Urban Heat Island pressed state (independence)', () => {
    const onPagasaToggle = vi.fn();
    const onUhiToggle = vi.fn();

    render(
      <OverlayTogglePanel
        pagasaPressed={false}
        uhiPressed={false}
        onPagasaToggle={onPagasaToggle}
        onUhiToggle={onUhiToggle}
      />
    );

    fireEvent.click(getPagasaButton());
    expect(onPagasaToggle).toHaveBeenCalledWith(true);
    expect(onUhiToggle).not.toHaveBeenCalled();
    // UHI button still shows unpressed since props haven't changed
    expect(getUhiButton()).toHaveAttribute('aria-pressed', 'false');
  });
});
