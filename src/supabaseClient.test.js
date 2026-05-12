import fs from 'fs';
import path from 'path';

/**
 * Unit tests for src/supabaseClient.js
 *
 * Validates Requirement 8.1 (named `supabase` singleton export under `src/`),
 * Requirement 8.3 (`.env.example` lists both env vars with empty values), and
 * Requirement 8.4 (a single descriptive `console.warn` is emitted that names
 * every missing env var on import).
 *
 * Notes on the test harness:
 * - `vi.stubEnv('X', '')` sets `import.meta.env.X` to the empty string, which
 *   the module treats as "missing" via its `!url` check. This is how we
 *   simulate an unset env var inside Vitest.
 * - `vi.resetModules()` clears the ES module cache so the next dynamic
 *   `import('./supabaseClient.js')` re-evaluates the module with the current
 *   stubbed env. Without it the module retains the env values captured at
 *   first import.
 * - Reusing the jsdom window across tests means a second `createClient(...)`
 *   with the same storage key causes `@supabase/supabase-js`'s internal
 *   `GoTrueClient` to emit its own, unrelated "Multiple GoTrueClient
 *   instances detected..." warning. Requirement 8.4 is about *our* module's
 *   warning, so we filter `warnSpy.mock.calls` to the `[supabaseClient]`
 *   prefix before asserting call counts.
 * - The singleton assertion deliberately skips `vi.resetModules()` between
 *   imports so the second `await import(...)` hits the module cache and
 *   returns the same instance.
 */

const MODULE_PATH = './supabaseClient.js';
const MODULE_WARN_PREFIX = '[supabaseClient]';

/**
 * Return only the `console.warn` calls whose first argument is a string
 * emitted by `src/supabaseClient.js`. This filters out unrelated warnings
 * from `@supabase/supabase-js` (e.g. the GoTrueClient cross-instance
 * warning) that happen to fire inside the same jsdom window.
 */
const getModuleWarnCalls = (spy) =>
  spy.mock.calls.filter(
    (call) => typeof call[0] === 'string' && call[0].startsWith(MODULE_WARN_PREFIX)
  );

describe('supabaseClient.js', () => {
  let warnSpy;

  beforeEach(() => {
    // Fresh warn spy for every test so call counts are isolated.
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Start each test with a clean module cache; individual tests opt into
    // keeping the cache (for the singleton check).
    vi.resetModules();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('does not warn and exports a truthy supabase client when both env vars are set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-value');

    const mod = await import(MODULE_PATH);

    expect(getModuleWarnCalls(warnSpy)).toHaveLength(0);
    expect(mod.supabase).toBeTruthy();
  });

  it('warns once naming VITE_SUPABASE_URL when only that variable is unset', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-value');

    await import(MODULE_PATH);

    const moduleCalls = getModuleWarnCalls(warnSpy);
    expect(moduleCalls).toHaveLength(1);
    const message = moduleCalls[0].join(' ');
    expect(message).toContain('VITE_SUPABASE_URL');
    expect(message).not.toContain('VITE_SUPABASE_ANON_KEY');
  });

  it('warns once naming VITE_SUPABASE_ANON_KEY when only that variable is unset', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    await import(MODULE_PATH);

    const moduleCalls = getModuleWarnCalls(warnSpy);
    expect(moduleCalls).toHaveLength(1);
    const message = moduleCalls[0].join(' ');
    expect(message).toContain('VITE_SUPABASE_ANON_KEY');
    expect(message).not.toContain('VITE_SUPABASE_URL');
  });

  it('warns once naming both variables when both are unset', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    await import(MODULE_PATH);

    const moduleCalls = getModuleWarnCalls(warnSpy);
    expect(moduleCalls).toHaveLength(1);
    const message = moduleCalls[0].join(' ');
    expect(message).toContain('VITE_SUPABASE_URL');
    expect(message).toContain('VITE_SUPABASE_ANON_KEY');
  });

  it('exports the same `supabase` instance on repeated imports (singleton)', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-value');

    // Two dynamic imports back-to-back without resetting the module cache
    // must hit the ESM module registry and return the same live binding.
    const first = await import(MODULE_PATH);
    const second = await import(MODULE_PATH);

    expect(first.supabase).toBe(second.supabase);
  });

  it('.env.example lists VITE_SUPABASE_URL= and VITE_SUPABASE_ANON_KEY= with empty values', () => {
    const envExamplePath = path.resolve(process.cwd(), '.env.example');
    const contents = fs.readFileSync(envExamplePath, 'utf8');
    const lines = contents.split(/\r?\n/);

    expect(lines).toContain('VITE_SUPABASE_URL=');
    expect(lines).toContain('VITE_SUPABASE_ANON_KEY=');
  });
});
