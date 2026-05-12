import { render } from '@testing-library/react';
import ManageArborists from './ManageArborists.jsx';

// Task 10.8: Manage Arborists must not import Supabase.
//
// This mock factory throws synchronously when `../supabaseClient.js` is resolved.
// Vitest hoists `vi.mock` calls above the `import` statements in this file, so
// if `ManageArborists.jsx` (or anything it transitively imports) pulls in the
// Supabase client module, the import would fail loudly and the `import`
// statement above would throw before any test runs. This file is intentionally
// isolated from `../App.jsx`, which imports other page components that DO
// legitimately import `supabaseClient.js`.
//
// Requirements covered: 1.3, 6.3, 7.5, 9.6, 12.1, 12.2.
vi.mock('../supabaseClient.js', () => {
  throw new Error('Supabase must not be imported by ManageArborists');
});

describe('ManageArborists (Supabase isolation)', () => {
  it('does not import supabaseClient.js', () => {
    // Reaching this line at all proves `import ManageArborists from
    // './ManageArborists.jsx'` above resolved without the mocked
    // `../supabaseClient.js` module being pulled in. Rendering the component
    // once confirms that no runtime code path lazily loads the client either.
    expect(() => render(<ManageArborists />)).not.toThrow();
  });
});
