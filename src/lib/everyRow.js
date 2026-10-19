/**
 * Every row of a query, not the first thousand.
 *
 * Supabase hands back at most 1,000 rows to one request (PostgREST's max
 * rows), and says nothing when it stops: a list of 1,428 trees arrives as
 * 1,000, and the map, the dashboards and the reports go on as if that were
 * all. Found 19 October, before San Pedro's inventory came in. So the lists
 * that can grow past it — trees and tags — are read a page at a time, in a
 * fixed order so no row is missed or read twice between pages, until a page
 * comes back short.
 *
 *   everyRow(() => supabase.from('trees').select('*'))
 *
 * `build` makes the query afresh for each page. A query already ordered keeps
 * its order; `order` is added after it to break ties. A stand-in without
 * .range() (a test's) is read once, as before.
 */
export const PAGE_SIZE = 1000;

export async function everyRow(build, { order = 'id', pageSize = PAGE_SIZE, maxRows = 100000 } = {}) {
  const first = build();
  if (typeof first?.range !== 'function') return first;

  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    let query = from === 0 ? first : build();
    if (order && typeof query.order === 'function') query = query.order(order, { ascending: true });
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) return { data: from === 0 ? data : rows, error };
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return { data: rows, error: null };
}
