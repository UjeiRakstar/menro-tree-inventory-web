import { describe, it, expect } from 'vitest';
import { tablePages } from './Paper.jsx';

const table = (key, rows) => ({ key, rows: Array.from({ length: rows }, (_, i) => ({ name: `r${i}` })), totals: {} });
const kinds = (page) => page.items.map((item) => `${item.kind}:${item.table.key}`);

describe('tables on A4 pages', () => {
  it('puts short tables together, each with its chart under it', () => {
    const pages = tablePages([table('elevation', 3), table('slope', 3)], { hasChart: () => true, pageMm: 255, headingMm: 10, chartMm: 70, rowMm: 4.4 });
    expect(pages.map(kinds)).toEqual([['table:elevation', 'chart:elevation', 'table:slope', 'chart:slope']]);
  });

  it('gives a long table’s chart the next page, and starts the next table after it', () => {
    const pages = tablePages([table('barangays', 30), table('carbon', 3)], { hasChart: () => true, pageMm: 172, headingMm: 28, chartMm: 65 });
    expect(pages.map(kinds)).toEqual([['table:barangays'], ['chart:barangays'], ['table:carbon', 'chart:carbon']]);
    expect(pages[0].tables.map((t) => t.key)).toEqual(['barangays']);
    expect(pages[1].charts.map((t) => t.key)).toEqual(['barangays']);
  });

  it('starts a new page when the next table and its chart would not fit', () => {
    const pages = tablePages([table('a', 10), table('b', 10)], { hasChart: () => true, pageMm: 172, headingMm: 0, chartMm: 65 });
    expect(pages.map(kinds)).toEqual([['table:a', 'chart:a'], ['table:b', 'chart:b']]);
  });
});
