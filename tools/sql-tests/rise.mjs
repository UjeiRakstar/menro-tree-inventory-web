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

// Site needs (species_site_needs.sql), the way the SQL editor runs it.
for (const run of ['runs', 'runs twice']) {
  const out = await db.exec(SQL('species_site_needs.sql'));
  const rows = out[out.length - 1].rows;
  ok(`species_site_needs.sql ${run}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok} ${r.detail}`).join('; '));
}
await db.query(`update public.species_profiles set origin = 'native', elevation_min_m = 0, elevation_max_m = 600,
  soil_textures = '{clay-loam,loam}', flood_tolerance = 'brief' where species = 'Narra'`);
ok('site needs are stored', (await db.query(`select soil_textures from species_profiles where species='Narra'`)).rows[0].soil_textures.join() === 'clay-loam,loam');
for (const [what, set] of [
  ['an elevation range upside down', `elevation_min_m = 900, elevation_max_m = 100`],
  ['a soil texture not on the list', `soil_textures = '{peat}'`],
  ['an origin not on the list', `origin = 'exotic'`],
  ['a flood tolerance not on the list', `flood_tolerance = 'some'`],
]) {
  let refused = null;
  try { await db.query(`update public.species_profiles set ${set} where species = 'Narra'`); } catch (e) { refused = e.message; }
  ok(`${what} is refused`, refused !== null, refused ?? '');
}
// Wood density (species_wood_density.sql), the way the SQL editor runs it.
for (const run of ['runs', 'runs twice']) {
  const out = await db.exec(SQL('species_wood_density.sql'));
  const rows = out[out.length - 1].rows;
  ok(`species_wood_density.sql ${run}`, rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok} ${r.detail}`).join('; '));
}
await db.query(`update public.species_profiles set wood_density = 0.55, wood_density_source = 'GWDD (Zanne et al. 2009)' where species = 'Narra'`);
ok('a wood density is stored', Number((await db.query(`select wood_density from species_profiles where species='Narra'`)).rows[0].wood_density) === 0.55);
for (const [what, value] of [['in kg/m³', 550], ['below balsa', 0.05]]) {
  let refused = null;
  try { await db.query(`update public.species_profiles set wood_density = ${value} where species = 'Narra'`); } catch (e) { refused = e.message; }
  ok(`a wood density ${what} is refused`, refused !== null, refused ?? '');
}
console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
