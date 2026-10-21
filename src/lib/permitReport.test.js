import { describe, expect, it } from 'vitest';
import { groupLabel, groupPermits, periodOf, permitReportWorkbook, permitsIn } from './permitReport.js';

const PERMITS = [
  { id: 'a', created_at: '2026-01-15T03:00:00', species: 'Narra', status: 'Pending', number_of_trees: 2, lgu: 'Santa Cruz' },
  { id: 'b', created_at: '2026-03-31T23:00:00', species: 'Mahogany', status: 'Cut', lgu: 'Santa Cruz' },
  { id: 'c', created_at: '2026-04-01T08:00:00', species: 'Narra', status: 'Pending', lgu: 'Pila' },
  { id: 'd', created_at: '2025-12-31T10:00:00', species: '', lgu: null },
];
const lguOf = (p) => p.lgu;

describe('the report’s period', () => {
  it('is a year, a quarter, a month or dates of one’s choice', () => {
    expect(periodOf({ kind: 'year', year: 2026 }).label).toBe('Calendar year 2026');
    expect(periodOf({ kind: 'quarter', year: 2026, quarter: 1 }).label).toBe('Quarter 1 (January to March) 2026');
    expect(periodOf({ kind: 'month', year: 2026, month: 4 }).label).toBe('April 2026');
    expect(periodOf({ kind: 'range', from: '2026-01-01', to: '2026-01-31' }).label).toBe('2026-01-01 to 2026-01-31');
  });

  it('holds the permits issued in it, its last day included', () => {
    expect(permitsIn(PERMITS, periodOf({ kind: 'year', year: 2026 })).map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(permitsIn(PERMITS, periodOf({ kind: 'quarter', year: 2026, quarter: 1 })).map((p) => p.id)).toEqual(['a', 'b']);
    expect(permitsIn(PERMITS, periodOf({ kind: 'month', year: 2026, month: 4 })).map((p) => p.id)).toEqual(['c']);
    expect(permitsIn(PERMITS, periodOf({ kind: 'range', from: '2026-03-31', to: '2026-03-31' })).map((p) => p.id)).toEqual(['b']);
  });

  it('is not a period until it is whole', () => {
    expect(periodOf({ kind: 'quarter', year: 2026 })).toBeNull();
    expect(periodOf({ kind: 'range', from: '2026-02-01', to: '2026-01-01' })).toBeNull();
  });
});

describe('grouping the permits', () => {
  it('by LGU, the largest first, with the trees each covers', () => {
    const groups = groupPermits(PERMITS, 'lgu', { lguOf });
    expect(groups.map((g) => [g.name, g.permits.length, g.trees])).toEqual([
      ['Santa Cruz', 2, 3],
      ['Not placed in an LGU', 1, 1],
      ['Pila', 1, 1],
    ]);
  });

  it('by species, status or month', () => {
    expect(groupPermits(PERMITS, 'species')[0]).toMatchObject({ name: 'Narra' });
    expect(groupPermits(PERMITS, 'species').map((g) => g.name)).toContain('Species not given');
    expect(groupPermits(PERMITS, 'status').map((g) => g.name)).toEqual(['Pending', 'Cut']);
    const months = groupPermits(PERMITS, 'month');
    expect(months.map((g) => groupLabel('month', g.name))).toEqual(['December 2025', 'January 2026', 'March 2026', 'April 2026']);
  });
});

describe('the workbook', () => {
  it('has the summary and every permit', async () => {
    const blob = await permitReportWorkbook({ permits: PERMITS, period: periodOf({ kind: 'year', year: 2026 }), by: 'lgu', lguOf });
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    const buffer = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(blob);
    });
    await book.xlsx.load(buffer);
    expect(book.worksheets.map((ws) => ws.name)).toEqual(['Summary', 'Permits']);
  });
});
