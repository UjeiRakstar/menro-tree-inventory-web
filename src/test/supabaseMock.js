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

  // Who signInAs() signed in, if anyone.
  let signedIn = null;

  function resolveFor(record) {
    if (signedIn && record.op === 'select') {
      const filtersOn = (column, value) =>
        record.filters.some(([name, given]) => name === column && given === value);
      if (record.table === 'profiles' && filtersOn('id', signedIn.profile.id)) {
        return { data: signedIn.profile, error: null };
      }
      if (record.table === 'lgus' && signedIn.lgu && filtersOn('psgc', signedIn.lgu.psgc)) {
        return { data: signedIn.lgu, error: null };
      }
    }

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

    // The columns asked for, so a test can answer as a database that lacks one.
    passthrough('select', (columns) => {
      record.columns = columns;
    });
    passthrough('order');
    passthrough('limit');
    passthrough('range', (from, to) => {
      record.range = [from, to];
    });
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

  // Supabase Edge Functions, e.g. manage-account.
  const functions = { invoke: vi.fn() };

  const auth = {
    getUser: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    updateUser: vi.fn(),
  };

  function resetAuthDefaults() {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: false, error: null });
    functions.invoke.mockReset();
    functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
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
    auth.signInWithOAuth.mockReset();
    auth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    auth.resetPasswordForEmail.mockReset();
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.getSession.mockReset();
    auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    auth.updateUser.mockReset();
    auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null });
    auth.onAuthStateChange.mockReset();
    auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  }

  // Storage: uploads succeed and land at a predictable public URL, unless a
  // test says otherwise with storage.upload.mockResolvedValue(...).
  const storage = {
    upload: vi.fn(),
    remove: vi.fn(),
    from: vi.fn((bucket) => ({
      upload: (path, file, options) => storage.upload(bucket, path, file, options),
      remove: (paths) => storage.remove(bucket, paths),
      getPublicUrl: (path) => ({ data: { publicUrl: `https://storage.test/${bucket}/${path}` } }),
    })),
  };
  const resetStorage = () => {
    storage.upload.mockReset();
    storage.upload.mockImplementation(async (bucket, path) => ({ data: { path }, error: null }));
    storage.remove.mockReset();
    storage.remove.mockImplementation(async (bucket, paths) => ({ data: paths, error: null }));
  };
  resetStorage();

  resetAuthDefaults();

  return {
    supabase: {
      from,
      auth,
      rpc,
      functions,
      storage,
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

    /**
     * Sign in as this profile: a session for it, and its own profile row (and
     * LGU row) whenever the app reads them by id. Every other read of
     * `profiles` or `lgus` still gets whatever the test configured, so a page
     * that lists profiles is not handed the signed-in one by mistake.
     */
    signInAs(profile, lgu = null) {
      signedIn = { profile, lgu };
      auth.getSession.mockResolvedValue({
        data: { session: { user: { id: profile.id, email: profile.email } } },
        error: null,
      });
    },

    reset() {
      calls.length = 0;
      responses.clear();
      resetStorage();
      signedIn = null;
      resetAuthDefaults();
    },
  };
}

export const supabaseMock = createSupabaseMock();
