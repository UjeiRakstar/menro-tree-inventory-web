import { formatCell } from './attributeTables.js';

/**
 * The report as a Word document (.docx): the LGU's heading, the title, the
 * map sheet as a picture when there is one, each section, and the attribute
 * tables. The docx library is fetched only when a report is downloaded.
 *
 *   heading   ['MUNICIPALITY OF SANTA CRUZ', 'PROVINCE OF LAGUNA', …]
 *   sections  [{ heading, text }]
 *   tables    attributeTables.js tables
 *   map       { data: ArrayBuffer (PNG), width, height } or null
 *   maps      several, each { data, width, height, caption } — a thematic report's
 *   figuresFirst  the thematic reports' order (18 October): the maps, then the
 *             tables, then the narrative; otherwise the map, the narrative, the tables
 */
export async function reportDocx({
  heading = [],
  title,
  preparedBy,
  date = new Date(),
  sections = [],
  tables = [],
  map = null,
  maps = [],
  figuresFirst = false,
}) {
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx');

  const centred = (text, options = {}) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, ...options })] });
  const cell = (text, { bold = false, shade = false } = {}) =>
    new TableCell({
      shading: shade ? { fill: 'E2E8F0' } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text, bold, size: 16 })] })],
    });

  const children = [
    centred('Republic of the Philippines', { size: 20 }),
    ...heading.map((line, i) => centred(line, { bold: i === 0, size: i === 0 ? 24 : 20 })),
    new Paragraph({ text: '' }),
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true })] }),
    centred(
      `Prepared by ${preparedBy} · ${date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
      { size: 18, italics: true }
    ),
    new Paragraph({ text: '' }),
  ];

  const figures = (map?.data ? [{ ...map, caption: null }] : []).concat(maps.filter((m) => m?.data));
  const addFigures = () =>
    figures.forEach((figure, i) => {
      // Page width less margins is about 6.3 in at 96 px an inch.
      const width = 600;
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({ type: 'png', data: figure.data, transformation: { width, height: Math.round((width * figure.height) / figure.width) } })],
        })
      );
      if (figure.caption) children.push(centred(`Figure ${i + 1}. ${figure.caption}`, { italics: true, size: 18 }));
      children.push(new Paragraph({ text: '' }));
    });

  const addSections = () => {
    for (const section of sections) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: section.heading })] }));
      for (const paragraph of String(section.text ?? '').split(/\n{2,}/)) {
        if (paragraph.trim()) children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: paragraph.trim(), size: 22 })] }));
      }
    }
  };

  const addTables = () => {
    for (const table of tables) {
      if (!table?.rows?.length) continue;
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `Table — ${table.title}` })] }));
      if (table.note) children.push(new Paragraph({ children: [new TextRun({ text: table.note, italics: true, size: 16 })] }));
      const rows = [
        new TableRow({ tableHeader: true, children: table.columns.map((column) => cell(column.label, { bold: true, shade: true })) }),
        ...table.rows.map((row) => new TableRow({ children: table.columns.map((column) => cell(formatCell(row[column.key], column.kind))) })),
      ];
      if (table.totals) {
        rows.push(new TableRow({ children: table.columns.map((column) => cell(formatCell(table.totals[column.key], column.kind), { bold: true })) }));
      }
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
      children.push(new Paragraph({ text: '' }));
    }
  };

  addFigures();
  if (figuresFirst) {
    addTables();
    addSections();
  } else {
    addSections();
    addTables();
  }

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'For planning purposes only. Not a land title, survey plan or proof of ownership.', italics: true, size: 18 })],
    })
  );

  const document = new Document({ creator: 'Green Tag Tree Inventory System', title, sections: [{ children }] });
  return Packer.toBlob(document);
}
