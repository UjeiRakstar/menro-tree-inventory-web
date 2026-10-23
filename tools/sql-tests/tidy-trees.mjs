// tidy_trees.sql (step 37): the odd columns of public.trees go only when that
// loses nothing, and so does the May backup; photo_url stays.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const SQL = (f) => readFileSync(new URL(`../../supabase/${f}`, import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${d}`); };

// The SQL editor runs the final query on its own.
async function asEditor(db, text) {
  const cut = text.lastIndexOf('\n-- ====', text.lastIndexOf('-- Did it take?'));
  await db.exec(text.slice(0, cut));
  await db.exec('discard temp');
  return (await db.exec(text.slice(cut))).at(-1).rows;
}

// public.trees with the odd columns as the live one has them, a logger that
// writes every change down, and the May backup.
async function liveLike({ treesValue = null, differs = false, lostTree = false } = {}) {
  const db = new PGlite();
  await db.exec(`
    create table public.trees (id text primary key, species text, "heightClass" text, height_class text,
      is_tagged boolean, trees text, photo_url text, "imageUrl" text);
    create table public.activity_log (what text);
    create function public.log_it() returns trigger language plpgsql as $$
      begin insert into public.activity_log values (tg_op); return new; end $$;
    create trigger log_tree_changes after insert or update or delete on public.trees
      for each row execute function public.log_it();
    insert into public.trees values
      ('may', 'Narra', 'Large', 'Large', true, null, 'https://x/may.jpg', null),
      ('may-no-twin', 'Mango', null, 'Small', true, null, 'https://x/mango.jpg', null),
      ('august', 'Molave', 'Medium', null, false, null, null, 'https://x/aug.jpg');
    create table public.trees_backup_may17 as select id, species from public.trees where id like 'may%';
    delete from public.activity_log;
  `);
  if (treesValue) await db.exec(`update public.trees set trees = '${treesValue}' where id = 'may'`);
  if (differs) await db.exec(`update public.trees set height_class = 'Small' where id = 'may'`);
  if (lostTree) await db.exec(`insert into public.trees_backup_may17 values ('gone-since-may', 'Acacia')`);
  await db.exec(`delete from public.activity_log`);
  return db;
}
const columns = async (db) =>
  (await db.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'trees' order by 1`))
    .rows.map((r) => r.column_name);

// ---- Nothing to lose: everything odd goes -------------------------------------
{
  const db = await liveLike();
  const rows = await asEditor(db, SQL('tidy_trees.sql'));
  ok('tidy_trees.sql runs, every check true', rows.every((r) => r.ok !== false), rows.map((r) => `${r.check}=${r.ok}`).join('; '));
  const cols = await columns(db);
  ok('…trees, height_class and is_tagged are gone; photo_url and "imageUrl" stay',
    !cols.includes('trees') && !cols.includes('height_class') && !cols.includes('is_tagged') &&
    cols.includes('photo_url') && cols.includes('imageUrl') && cols.includes('heightClass'), cols.join(', '));
  const mango = (await db.query(`select "heightClass" from public.trees where id = 'may-no-twin'`)).rows[0];
  ok('…a height class only in height_class moved into "heightClass"', mango.heightClass === 'Small', JSON.stringify(mango));
  const photos = (await db.query(`select count(*)::int n from public.trees where photo_url is not null`)).rows[0].n;
  ok('…every main photograph is still there', photos === 2, String(photos));
  ok('…the May backup is gone', (await db.query(`select to_regclass('public.trees_backup_may17') t`)).rows[0].t === null);
  ok('…nothing written to the activity log, and the logger is back on',
    (await db.query(`select count(*)::int n from public.activity_log`)).rows[0].n === 0 &&
    (await db.query(`select tgenabled from pg_trigger where tgname = 'log_tree_changes'`)).rows[0].tgenabled === 'O');
  const again = await asEditor(db, SQL('tidy_trees.sql'));
  ok('…and runs again, changing nothing', again.every((r) => r.ok !== false) && (await columns(db)).join() === cols.join());
}

// ---- Something to lose: it stays, and the check says why --------------------------
{
  const db = await liveLike({ treesValue: 'somebody typed this', differs: true, lostTree: true });
  const rows = await asEditor(db, SQL('tidy_trees.sql'));
  const row = (name) => rows.find((r) => r.check.startsWith(name));
  const cols = await columns(db);
  ok('a column "trees" with a value in it stays, and the check says so',
    cols.includes('trees') && row('the column named trees').ok === false && /has values/.test(row('the column named trees').detail));
  ok('a height_class that disagrees with "heightClass" stays',
    cols.includes('height_class') && row('height_class').ok === false &&
    (await db.query(`select "heightClass" from public.trees where id = 'may'`)).rows[0].heightClass === 'Large');
  ok('…is_tagged still goes', !cols.includes('is_tagged'));
  ok('a backup holding a tree public.trees no longer has stays',
    (await db.query(`select to_regclass('public.trees_backup_may17') t`)).rows[0].t !== null && row('the May backup').ok === false);
}

console.log(`${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
