import { vi } from 'vitest';

/**
 * A chainable, awaitable stand-in for the Supabase client.
 *
 * Every query records what it was asked to do, so tests can assert on the
 * writes a component makes rather than on how it renders afterwards. Awaiting
 * a builder is what "runs" the query, which mirrors supabase-js: the chain is
 * lazy until it is awaited.
 *
 * Exported as a singleton so a `vi.mock` factory and the test body can share
 * one instance despite the factory being hoisted above the imports:
 *
 *     vi.mock('../supabaseClient.js', async () => {
 *       const { supabaseMock } = await import('../test/supabaseMock.js');
 *       return { supabase: supabaseMock.supabase };
 *     });
 *     import { supabaseMock } from '../test/supabaseMock.js';
 *
 * Call `supabaseMock.reset()` in `beforeEach`, then `setResponse` per
 * `table:operation` key. A response may be a plain object or a function of the
 * recorded query, which is how two different reads of the same table — say the
 * full profiles list and the filtered pending list — are told apart.
 */
function createSupabaseMock() {
  const calls = [];
  const responses = new Map();

  function resolveFor(record) {
    const configured = responses.get(`${record.table}:${record.op}`);
    const result =
      typeof configured === 'function' ? configured(record) : configured;
    return result ?? { data: [], error: null };
  }

  function from(table) {
    const record = { table, op: 'select', payload: null, filters: [] };
    const builder = {};

    const passthrough = (name, onCall) => {
      builder[name] = (...args) => {
        onCall?.(...args);
        return builder;
      };
    };

    passthrough('select');
    passthrough('order');
    passthrough('limit');
    passthrough('single');
    passthrough('maybeSingle');
    passthrough('eq', (column, value) => record.filters.push([column, value]));
    passthrough('is', (column, value) => record.filters.push([column, value]));
    passthrough('in', (column, value) => record.filters.push([column, value]));
    passthrough('neq', (column, value) => record.filters.push([column, value]));

    for (const op of ['update', 'insert', 'upsert']) {
      builder[op] = (payload) => {
        record.op = op;
        record.payload = payload;
        return builder;
      };
    }
    builder.delete = () => {
      record.op = 'delete';
      return builder;
    };

    builder.then = (onFulfilled, onRejected) => {
      calls.push(record);
      return Promise.resolve(resolveFor(record)).then(onFulfilled, onRejected);
    };

    return builder;
  }

  // Realtime is a no-op here; nothing under test depends on live updates.
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
    unsubscribe: vi.fn(),
  };

  // Postgres functions exposed over PostgREST, e.g. is_menro_admin().
  const rpc = vi.fn();

  const auth = {
    getUser: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
  };

  function resetAuthDefaults() {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: false, error: null });
    auth.getUser.mockReset();
    auth.getUser.mockResolvedValue({
      data: { user: { id: 'menro-admin', email: 'menro@example.gov.ph' } },
      error: null,
    });
    auth.signUp.mockReset();
    auth.signUp.mockResolvedValue({
      data: { user: { id: 'uuid-new' } },
      error: null,
    });
    auth.signOut.mockReset();
    auth.signOut.mockResolvedValue({ error: null });
    auth.signInWithPassword.mockReset();
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    auth.resetPasswordForEmail.mockReset();
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.getSession.mockReset();
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    auth.onAuthStateChange.mockReset();
    auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  }

  resetAuthDefaults();

  return {
    supabase: {
      from,
      auth,
      rpc,
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },

    /** Every query that was awaited, in order. */
    calls,

    /** Queries recorded against one table and operation. */
    writesTo(table, op) {
      return calls.filter((c) => c.table === table && c.op === op);
    },

    /** The first read of a table whose filters include `column`. */
    queryFiltering(table, column) {
      return calls.find(
        (c) =>
          c.table === table &&
          c.op === 'select' &&
          c.filters.some(([name]) => name === column),
      );
    },

    /** `setResponse('profiles:select', {...})`, or a function of the query. */
    setResponse(key, value) {
      responses.set(key, value);
    },

    reset() {
      calls.length = 0;
      responses.clear();
      resetAuthDefaults();
    },
  };
}

export const supabaseMock = createSupabaseMock();
