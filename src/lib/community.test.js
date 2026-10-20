import { describe, it, expect, vi, afterEach } from 'vitest';
import { enabledProviders } from './community.js';

const client = { supabaseUrl: 'https://project.supabase.co', supabaseKey: 'anon-key' };

afterEach(() => vi.unstubAllGlobals());

describe('which sign-in providers are switched on', () => {
  it('asks Supabase’s public settings, with the public key', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ external: { google: false, email: true } }) }));
    vi.stubGlobal('fetch', fetch);
    expect(await enabledProviders(client)).toEqual({ google: false, email: true });
    expect(fetch).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/settings', { headers: { apikey: 'anon-key' } });
  });

  it('cannot tell when Supabase does not answer, and does not stand in the way', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await enabledProviders(client)).toBeNull();
    expect(await enabledProviders({})).toBeNull();
  });
});
