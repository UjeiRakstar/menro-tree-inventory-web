/**
 * Prints the columns public.trees actually has, and checks them against the
 * lists the public pages ask for.
 *
 *   node tools/show-tree-columns.mjs
 *
 * This exists because of a bug worth not repeating. The public pages used to
 * select every column; when they were narrowed to a named list, two names went
 * in that nothing had ever written — data_source and photo_url, both read in
 * the code only as fallbacks. Selecting everything had hidden that, because a
 * column that is not there simply never arrived. Naming it made PostgREST
 * refuse the whole query, and the map showed an error instead of trees.
 *
 * Reads only, with the same public key the website uses.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_DASHBOARD_COLUMNS, PUBLIC_MAP_COLUMNS } from '../src/lib/treeColumns.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function readEnv() {
  const env = { ...process.env };
  try {
    const text = await readFile(join(root, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (match) env[match[1]] ??= match[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // No .env; the variables may already be in the environment.
  }
  return env;
}

const env = await readEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (they are in .env).');
  process.exit(1);
}

const response = await fetch(`${url}/rest/v1/trees?select=*&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!response.ok) {
  console.error(`Could not read public.trees: ${response.status} ${await response.text()}`);
  process.exit(1);
}

const [row] = await response.json();
if (!row) {
  console.error('public.trees is empty, so there is no row to read the columns from.');
  process.exit(1);
}

const actual = Object.keys(row).sort();
console.log(`public.trees has ${actual.length} columns:\n  ${actual.join('\n  ')}\n`);

let wrong = 0;
for (const [name, list] of [
  ['the map', PUBLIC_MAP_COLUMNS],
  ['the analytics page', PUBLIC_DASHBOARD_COLUMNS],
]) {
  const asked = list.split(',');
  const missing = asked.filter((column) => !actual.includes(column));
  if (missing.length === 0) {
    console.log(`${name}: all ${asked.length} columns exist.`);
  } else {
    wrong += missing.length;
    console.log(`${name}: ${missing.length} column(s) DO NOT EXIST -> ${missing.join(', ')}`);
  }
}

const unused = actual.filter(
  (column) => !PUBLIC_MAP_COLUMNS.split(',').includes(column)
);
console.log(`\nNot sent to the public (${unused.length}): ${unused.join(', ')}`);

// exitCode rather than process.exit(): on Windows, exiting while stdout is
// still flushing aborts the write and Node prints a libuv assertion failure
// after a run that actually succeeded.
process.exitCode = wrong > 0 ? 1 : 0;
