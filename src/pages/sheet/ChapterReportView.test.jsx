import { render, screen, within, cleanup } from '@testing-library/react';
import ChapterReportView from './ChapterReportView.jsx';
import { buildEcologicalReport } from '../../lib/reports/ecological.js';
import { buildPlanReport } from '../../lib/reports/biodiversityPlan.js';

afterEach(cleanup);

const CTX = {
  place: { name: 'Siniloan', label: 'Siniloan', psgc: 403429000, isCity: false },
  places: [{ name: 'Acevida', areaHa: 63 }, { name: 'Wawa', areaHa: 205 }],
  trees: [{ id: 't1', barangay: 'Acevida', species: 'Narra', species_type: 'Endemic', tree_category: 'Timber', dbh: 30, total_height: 11 }],
};
const report = buildEcologicalReport(CTX);
const plan = buildPlanReport(CTX);

function show(props = {}, shown = report) {
  return render(
    <ChapterReportView
      heading={['MUNICIPALITY OF SINILOAN', 'PROVINCE OF LAGUNA']}
      title={shown.title}
      preparedBy="Siniloan MENRO / CENRO"
      report={shown}
      sections={shown.sections}
      onChange={() => {}}
      {...props}
    />
  );
}

describe('the report, printed', () => {
  it('starts every chapter after the first on a new page, and the letterhead carries the seal', () => {
    show({ seal: '/seal.png' });
    const chapters = document.querySelectorAll('.report-chapter');
    expect(chapters).toHaveLength(3);
    expect(chapters[0]).not.toHaveClass('break-before-page');
    for (const chapter of [...chapters].slice(1)) expect(chapter).toHaveClass('break-before-page');
    expect(screen.getByRole('img', { name: 'Seal' })).toHaveAttribute('src', '/seal.png');
  });

  it('prints a long table’s totals once, at its end — not at the foot of every page', () => {
    show({}, plan);
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

describe('the management plan', () => {
  it('has a title page of its own, and contents of every heading after them', () => {
    show({}, plan);
    const titlePage = document.querySelectorAll('.report-chapter')[0];
    expect(within(titlePage).getByRole('heading', { name: 'URBAN BIODIVERSITY MANAGEMENT PLAN' })).toBeInTheDocument();
    expect(titlePage).toHaveTextContent('of the Municipality of Siniloan');
    expect(titlePage).toHaveTextContent('In accordance with DENR-BMB Technical Bulletin No. 2021-04');
    const contents = screen.getByRole('navigation', { name: 'Contents' });
    for (const entry of ['Executive Summary', 'II. Area Profile', 'a. Geographical location', 'ii. Topography (slope, elevation)', 'IX. Annexes']) {
      expect(contents).toHaveTextContent(entry);
    }
    expect(contents).not.toHaveTextContent('Foreword');
    // Annex B's i., ii., … one level down.
    expect(screen.getByRole('heading', { level: 5, name: 'ii. Topography (slope, elevation)' })).toBeInTheDocument();
  });

  it('is read-only: no text to edit, no AI, and its placeholders highlighted', () => {
    show({ onImprove: () => {}, onRewrite: () => {} }, plan);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Improve with AI/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Write again/ })).toBeNull();
    expect(screen.getByText(/a preview: download Word to complete it/)).toBeInTheDocument();
    const foreword = screen.getByText(/^\[Foreword/);
    expect(foreword).toHaveClass('bg-amber-50');
    const summary = within(screen.getByRole('region', { name: 'Executive summary' })).getByText(/^This plan is composed only/);
    expect(summary).not.toHaveClass('bg-amber-50');
  });

  it('keeps the other reports editable, with the AI', () => {
    show();
    expect(screen.getByRole('textbox', { name: 'Executive summary — text' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Improve with AI/ })).toBeInTheDocument();
  });

  it('says why Word and Print wait while a map is drawn', () => {
    show({ capturing: 'location' });
    expect(screen.getByRole('button', { name: /Word/ })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/Drawing the maps, 1 of \d+ — Word and Print are ready when they are/);
  });

  it('marks each chart for the Word file to picture', () => {
    show({}, plan);
    expect(document.querySelector('[data-chart="species"]')).toBeTruthy();
  });

  it('leaves Annex B’s entries blank, not dashed', () => {
    show({}, plan);
    const table = screen.getByRole('region', { name: 'Area coverage' });
    const row = within(table).getByRole('rowheader', { name: 'a. Total area' }).closest('tr');
    expect(row.querySelector('td').textContent).toBe('');
  });
});
