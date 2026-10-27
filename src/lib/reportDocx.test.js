// @vitest-environment node
// A real .docx, opened again to read what it says.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { reportDocx } from './reportDocx.js';
import { buildEcologicalReport } from './reports/ecological.js';

describe('reportDocx', () => {
  it('writes the heading, the sections and the tables into a Word document', async () => {
    const blob = await reportDocx({
      heading: ['MUNICIPALITY OF SANTA CRUZ', 'PROVINCE OF LAGUNA'],
      title: 'TREE INVENTORY MAP — REPORT',
      preparedBy: 'Santa Cruz MENRO / CENRO',
      sections: [
        { key: 'purpose', heading: 'Purpose', text: 'This report supports the CLUP.' },
        { key: 'inventory', heading: 'The tree inventory', text: '3 trees of 3 species.\n\nMost are native.' },
      ],
      tables: [
        {
          key: 'planting-sites',
          title: 'Tree planting sites',
          columns: [
            { key: 'name', label: 'Tree planting site', kind: 'text' },
            { key: 'areaHa', label: 'Area (ha)', kind: 'ha' },
          ],
          rows: [{ name: 'Alipit Riverbank', areaHa: 1.2345 }],
          totals: { name: '1 sites', areaHa: 1.2345 },
        },
      ],
      date: new Date('2026-10-17T00:00:00'),
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    const text = xml.replace(/<[^>]+>/g, ' ');
    for (const words of [
      'Republic of the Philippines',
      'MUNICIPALITY OF SANTA CRUZ',
      'TREE INVENTORY MAP — REPORT',
      'The tree inventory',
      'Most are native.',
      'Table — Tree planting sites',
      'Alipit Riverbank',
      '1.23',
      'For planning purposes only',
    ]) {
      expect(text).toContain(words);
    }
  });

  it('writes the Ecological Profile report chapter by chapter, each part its maps, tables and text', async () => {
    const report = buildEcologicalReport({
      place: { name: 'Santa Cruz', label: 'Santa Cruz', psgc: 403426000, isCity: false },
      places: [{ name: 'Alipit', areaHa: 100 }],
      trees: [{ id: 't1', barangay: 'Alipit', species: 'Narra', species_type: 'Endemic', tree_category: 'Timber', dbh: 30, total_height: 11 }],
    });
    const blob = await reportDocx({
      heading: ['MUNICIPALITY OF SANTA CRUZ', 'PROVINCE OF LAGUNA'],
      title: report.title,
      preparedBy: 'Santa Cruz MENRO / CENRO',
      chapters: report.chapters,
      figuresByKey: Object.fromEntries(report.maps.map((map) => [map.key, { caption: map.caption }])),
      textOf: (section) => (section.key === 'summary' ? 'Our own summary.' : section.text),
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const text = (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ');
    for (const words of [
      'ECOLOGICAL PROFILE AND TREE INVENTORY REPORT',
      '1. Executive Summary',
      'Our own summary.',
      '2.1 Location',
      'Figure 1. Location map',
      'not drawn: its layer is not uploaded',
      '3.2 Endemic, Native and Invasive Trees',
      'Table — Endemic, native and invasive species',
      'Narra',
      '4.2 Exposure of Land Cover and Tree Planting Sites',
    ]) {
      expect(text).toContain(words);
    }
    // The office's own words, not the written ones.
    expect(text).not.toContain('This report profiles the ecology');
  });
});
