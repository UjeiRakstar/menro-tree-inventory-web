import { describe, it, expect, vi } from 'vitest';
import { everyRow } from './everyRow.js';

/** A table of `size` rows behind a query that, like PostgREST, gives at most `cap` at a time. */
function table(size, { cap = 1000, failAt = null } = {}) {
  const asked = [];
  const build = vi.fn(() => {
    const query = {
      order: vi.fn(() => query),
      range: (from, to) => {
        asked.push([from, to]);
        if (failAt !== null && from >= failAt) return Promise.resolve({ data: null, error: { message: 'down' } });
        const end = Math.min(to + 1, size, from + cap);
        return Promise.resolve({ data: Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ id: from + i })), error: null });
      },
    };
    return query;
  });
  return { build, asked };
}

describe('every row, not the first thousand', () => {
  it('reads San Pedro’s 1,428 trees in two pages', async () => {
    const { build, asked } = table(1428);
    const { data, error } = await everyRow(build);
    expect(error).toBeNull();
    expect(data).toHaveLength(1428);
    expect(data.at(-1).id).toBe(1427);
    expect(asked).toEqual([[0, 999], [1000, 1999]]);
  });

  it('asks once for a short list, and once more for an exact thousand', async () => {
    expect((await everyRow(table(111).build)).data).toHaveLength(111);
    const exact = table(1000);
    expect((await everyRow(exact.build)).data).toHaveLength(1000);
    expect(exact.asked).toHaveLength(2);
  });

  it('orders the pages so none is missed or read twice', async () => {
    const { build } = table(10);
    await everyRow(build, { order: 'id' });
    expect(build.mock.results[0].value.order).toHaveBeenCalledWith('id', { ascending: true });
  });

  it('hands back what it had, and the error, when a later page fails', async () => {
    const { data, error } = await everyRow(table(2500, { failAt: 1000 }).build);
    expect(data).toHaveLength(1000);
    expect(error).toEqual({ message: 'down' });
  });

  it('reads a stand-in without .range() once, as before', async () => {
    const result = { data: [{ id: 1 }], error: null };
    expect(await everyRow(() => Promise.resolve(result))).toBe(result);
  });
});
