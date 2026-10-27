import { render, screen, within, cleanup } from '@testing-library/react';
import ChapterReportView from './ChapterReportView.jsx';
import { buildEcologicalReport } from '../../lib/reports/ecological.js';

afterEach(cleanup);

const report = buildEcologicalReport({
  place: { name: 'Siniloan', label: 'Siniloan', psgc: 403429000, isCity: false },
  places: [{ name: 'Acevida', areaHa: 63 }, { name: 'Wawa', areaHa: 205 }],
  trees: [{ id: 't1', barangay: 'Acevida', species: 'Narra', species_type: 'Endemic', tree_category: 'Timber', dbh: 30, total_height: 11 }],
});

function show(props = {}) {
  return render(
    <ChapterReportView
      heading={['MUNICIPALITY OF SINILOAN', 'PROVINCE OF LAGUNA']}
      title={report.title}
      preparedBy="Siniloan MENRO / CENRO"
      report={report}
      sections={report.sections}
      onChange={() => {}}
      {...props}
    />
  );
}

describe('the report, printed', () => {
  it('starts every chapter after the first on a new page, and the letterhead carries the seal', () => {
    show({ seal: '/seal.png' });
    const chapters = document.querySelectorAll('.report-chapter');
    expect(chapters).toHaveLength(4);
    expect(chapters[0]).not.toHaveClass('break-before-page');
    for (const chapter of [...chapters].slice(1)) expect(chapter).toHaveClass('break-before-page');
    expect(screen.getByRole('img', { name: 'Seal' })).toHaveAttribute('src', '/seal.png');
  });

  it('prints a long table’s totals once, at its end — not at the foot of every page', () => {
    show();
    expect(document.querySelector('tfoot')).toBeNull();
    const table = screen.getByRole('region', { name: 'Tagged trees by barangay' });
    const rows = within(table).getAllByRole('row');
    expect(rows.at(-1)).toHaveTextContent('2 barangays');
  });

  it('never splits a map or a chart across pages', () => {
    show();
    for (const figure of document.querySelectorAll('figure')) expect(figure).toHaveClass('break-inside-avoid');
  });
});
