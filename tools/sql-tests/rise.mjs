import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const SQL = (f) => readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8');
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table public.profiles (id uuid primary key, role text);
  create table public.trees (id text primary key, species text);
`);
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${d}`); };
await db.exec(SQL('species_profiles.sql'));
for (const run of ['runs', 'runs twice']) {
  const out = await db.exec(SQL('species_rise.sql'));
  const rows = out[out.length - 1].rows;
  ok(`species_rise.sql ${run}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
}
await db.query(`insert into public.species_profiles (species, flowering_months, autofilled) values ('Narra', '{3,4}', true)`);
ok('months are stored as numbers', (await db.query(`select flowering_months from species_profiles where species='Narra'`)).rows[0].flowering_months.join() === '3,4');
let err = null; try { await db.query(`insert into public.species_profiles (species, fruiting_months) values ('Bad', '{13}')`); } catch (e) { err = e.message; }
ok('a month 13 is refused', err !== null, err ?? '');
const U = '00000000-0000-0000-0000-000000000001';
await db.query(`insert into auth.users (id) values ($1)`, [U]);
await db.exec(`select set_config('request.jwt.claim.sub', '${U}', false)`);
await db.query(`update public.species_profiles set family = 'Fabaceae' where species = 'Narra'`);
ok('the saver is stamped by the database', (await db.query(`select updated_by from species_profiles where species='Narra'`)).rows[0].updated_by === U);
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
