// @vitest-environment node
// A real .docx, opened again to read what it says.
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { reportDocx } from './reportDocx.js';

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
});
