import { render, screen, cleanup } from '@testing-library/react';

const auth = vi.hoisted(() => ({ profile: null }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

import TrainingBanner from './TrainingBanner.jsx';

afterEach(cleanup);

describe('TrainingBanner', () => {
  it('tells a training account, on every page, that it is in training', () => {
    auth.profile = { role: 'lgu_admin', is_training: true };
    render(<TrainingBanner />);
    const banner = screen.getByRole('note', { name: 'Training mode' });
    expect(banner).toHaveTextContent(/Nothing you do reaches the real inventory/);
    // Not dismissible: there is nothing to close it with.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('tells a PGENRO training account what stays with the real PGENRO (22 October)', () => {
    auth.profile = { role: 'pgenro', is_training: true };
    render(<TrainingBanner />);
    expect(screen.getByRole('note', { name: 'Training mode' })).toHaveTextContent(/every town’s practice data.*stays with the real PGENRO account/);
  });

  it('says nothing to a real account', () => {
    auth.profile = { role: 'lgu_admin', is_training: false };
    const { container } = render(<TrainingBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says nothing before the profile has loaded', () => {
    auth.profile = null;
    const { container } = render(<TrainingBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
