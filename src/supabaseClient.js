import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const missing = [];
if (!url) missing.push('VITE_SUPABASE_URL');
if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY');
if (missing.length > 0) {
  console.warn(
    `[supabaseClient] Missing environment variable(s): ${missing.join(', ')}. ` +
      `Set them in .env (see .env.example) before making Supabase calls.`
  );
}

// Fall back to inert placeholder values so the module always exports a valid
// client instance even before `.env` is configured. Any call made against
// these placeholders will fail at network time, which is the intended
// signal — we do not want to throw at import time and take down the app
// shell during local development.
const PLACEHOLDER_URL = 'http://localhost';
const PLACEHOLDER_ANON_KEY = 'placeholder-anon-key';

export const supabase = createClient(
  url || PLACEHOLDER_URL,
  anonKey || PLACEHOLDER_ANON_KEY
);
