/**
 * The database tests: every supabase/*.sql file that guards access, run
 * against real Postgres (PGlite — Postgres compiled to WebAssembly, in
 * memory) with stand-ins for Supabase's auth, roles and storage, then every
 * thing it should allow and refuse, tried as the people it is about.
 *
 *   npm run test:sql
 *
 * Each suite runs the files the way the Supabase SQL editor does — the final
 * check query on its own — because that is how they are run for real.
 *
 * The training suite runs twice: in the order the files were written, and in
 * the order the live database actually received them (the sandbox before the
 * halls and tag routing).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (name) => fileURLToPath(new URL(name, import.meta.url));

const SUITES = [
  ['accounts', 'accounts.mjs'],
  ['the LGU fence', 'fence.mjs'],
  ['halls and tag routing', 'routing.mjs'],
  ['training', 'training.mjs'],
  ['training, in the live order', 'training.mjs', { LIVE_ORDER: '1' }],
  ['permit archiving', 'permits.mjs'],
  ['permits, by LGU', 'permits-fence.mjs'],
  ['RISE species fields', 'rise.mjs'],
  ['map areas', 'areas.mjs'],
  ['office settings and AI keys', 'settings.mjs'],
  ['inboxes, news and messages', 'inbox.mjs'],
  ['residents, the leaderboard and office set-up', 'community.mjs'],
  ['replies to the public', 'replies.mjs'],
  ['data requests', 'data-requests.mjs'],
  ['the satellite snapshots', 'satellite.mjs'],
  ['who captured a tree, and archiving one', 'trees.mjs'],
  ['the odd columns of trees', 'tidy-trees.mjs'],
];

let failed = 0;
for (const [name, file, env = {}] of SUITES) {
  const run = spawnSync(process.execPath, [here(file)], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const summary = output.trim().split(/\r?\n/).filter((line) => /passed/.test(line)).pop() ?? 'no summary';
  const ok = run.status === 0;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${summary.trim()}`);
  if (!ok) {
    for (const line of output.split(/\r?\n/).filter((l) => /^FAIL|Error|error:/.test(l))) {
      console.log(`        ${line}`);
    }
  }
}

console.log(failed ? `\n${failed} suite(s) failed` : `\nAll ${SUITES.length} suites passed`);
process.exit(failed ? 1 : 0);
