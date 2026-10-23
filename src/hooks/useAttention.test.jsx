import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Realtime as Supabase's client does it: one channel per name, handed back to
// whoever asks for that name again, and no listener added once it has
// subscribed. The shared mock's channels do nothing, which is how two uses
// with one name blanked the Trees page (23 October) with every test passing.
const realtime = vi.hoisted(() => {
  const channels = new Map();
  return {
    channels,
    channel: (name) => {
      if (channels.has(name)) return channels.get(name);
      let subscribed = false;
      const channel = {
        on() {
          if (subscribed) throw new Error(`cannot add callbacks for ${name} after subscribe()`);
          return channel;
        },
        subscribe() {
          subscribed = true;
          return channel;
        },
      };
      channels.set(name, channel);
      return channel;
    },
  };
});

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: { ...supabaseMock.supabase, channel: realtime.channel, removeChannel: () => {} } };
});

import { supabaseMock } from '../test/supabaseMock.js';
import { useAttention } from './useAttention.js';

function Counts(props) {
  useAttention(props);
  return null;
}

beforeEach(() => {
  supabaseMock.reset();
  realtime.channels.clear();
});
afterEach(cleanup);

describe('useAttention', () => {
  it('can be used twice on one page — the header and the Trees page — each on its own channels', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <Counts withHazards={false} withRequests="waiting" withInbox withProposals />
          <Counts withHazards={false} withRequests="waiting" />
        </MemoryRouter>
      )
    ).not.toThrow();
    const requestChannels = [...realtime.channels.keys()].filter((name) => name.startsWith('attention-requests'));
    expect(requestChannels).toHaveLength(2);
  });
});
