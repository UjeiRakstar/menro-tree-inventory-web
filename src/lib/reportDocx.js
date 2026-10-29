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
 *   chapters  the Ecological Profile and Tree Inventory Report's (27 October):
 *             [{ heading, parts: [{ heading, maps: [key], tables, sections }] }],
 *             each part its maps, tables and paragraphs in turn — with
 *   figuresByKey  { [map key]: { data, width, height, caption } }, and
 *   textOf    (section) => the section's text as the office left it
 *   logos     the letterhead's pictures (ArrayBuffers): the LGU's seal, the
 *             office's logo — PNG or JPEG; any other kind is left out
 *   subtitle  lines under the title (the management plan's, 29 October)
 *   chartsByKey  { [table key]: { data, width, height, title } }: each
 *             table's chart as a PNG (chartImage.js), put under the table
 *
 * In chapters, the plan's (29 October) has a title page — a chapter with no
 * heading — a table of contents (`contents`), written as Word's own, so it
 * keeps up when the office inserts sections; and parts of `level` 3, Annex
 * B's i., ii., … Every chapter after the first starts on a new page.
 */
export async function reportDocx({
  heading = [],
  title,
  subtitle = [],
  preparedBy,
  date = new Date(),
  sections = [],
  tables = [],
  map = null,
  maps = [],
  figuresFirst = false,
  chapters = null,
  figuresByKey = {},
  chartsByKey = {},
  logos = [],
  textOf = (section) => section.text,
}) {
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    ImageRun,
    Packer,
    Paragraph,
    Table,
    TableOfContents,
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

  // PNG or JPEG, by their first bytes; Word takes nothing else here.
  const imageType = (data) => {
    const bytes = new Uint8Array(data ?? new ArrayBuffer(0));
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
    return null;
  };
  const letterhead = logos
    .map((data) => ({ data, type: imageType(data) }))
    .filter((logo) => logo.type)
    .map((logo) => new ImageRun({ type: logo.type, data: logo.data, transformation: { width: 80, height: 80 } }));
  const children = [
    ...(letterhead.length
      ? [new Paragraph({ alignment: AlignmentType.CENTER, children: letterhead.flatMap((run, i) => (i ? [new TextRun({ text: '      ' }), run] : [run])) })]
      : []),
    centred('Republic of the Philippines', { size: 20 }),
    ...heading.map((line, i) => centred(line, { bold: i === 0, size: i === 0 ? 24 : 20 })),
    new Paragraph({ text: '' }),
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true })] }),
    ...subtitle.map((line) => centred(line, { size: 22 })),
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

  const addTable = (table) => {
    if (!table?.rows?.length) return;
    children.push(new Paragraph({ children: [new TextRun({ text: `Table — ${table.title}`, bold: true, size: 20 })] }));
    if (table.note) children.push(new Paragraph({ children: [new TextRun({ text: table.note, italics: true, size: 16 })] }));
    const rows = [
      new TableRow({ tableHeader: true, children: table.columns.map((column) => cell(column.label, { bold: true, shade: true })) }),
      ...table.rows.map((row) => new TableRow({ children: table.columns.map((column) => cell(formatCell(row[column.key], column.kind))) })),
    ];
    if (table.totals) {
      rows.push(new TableRow({ children: table.columns.map((column) => cell(formatCell(table.totals[column.key], column.kind), { bold: true })) }));
    }
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    // Its chart, as the page shows it under the table.
    const chart = chartsByKey[table.key];
    if (chart?.data) {
      const width = Math.min(600, chart.width);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120 },
          children: [new ImageRun({ type: 'png', data: chart.data, transformation: { width, height: Math.round((width * chart.height) / chart.width) } })],
        })
      );
      if (chart.title) children.push(centred(chart.title, { italics: true, size: 18 }));
    }
    children.push(new Paragraph({ text: '' }));
  };

  if (chapters) {
    let figureNo = 0;
    const numbered = new Map();
    chapters.forEach((chapter, c) => {
      if (chapter.contents) {
        // Not a heading itself, so the contents do not list themselves.
        children.push(new Paragraph({ pageBreakBefore: c > 0, children: [new TextRun({ text: chapter.heading, bold: true, size: 32 })] }));
        children.push(new TableOfContents(chapter.heading, { hyperlink: true, headingStyleRange: '1-3' }));
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'If the contents are empty or out of date, right-click them in Word and choose Update Field.', italics: true, size: 16 })],
          })
        );
      } else if (chapter.heading) {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: c > 0, children: [new TextRun({ text: chapter.heading })] }));
      }
      for (const part of chapter.parts) {
        if (part.heading && part.heading !== chapter.heading) {
          children.push(new Paragraph({ heading: part.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2, children: [new TextRun({ text: part.heading })] }));
        }
        for (const key of part.maps) {
          const figure = figuresByKey[key];
          if (!numbered.has(key)) numbered.set(key, ++figureNo);
          if (!figure?.data) {
            children.push(centred(`Figure ${numbered.get(key)}. ${figure?.caption ?? 'Map'} — not drawn: its layer is not uploaded.`, { italics: true, size: 18 }));
            continue;
          }
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ type: 'png', data: figure.data, transformation: { width: 600, height: Math.round((600 * figure.height) / figure.width) } })],
            })
          );
          children.push(centred(`Figure ${numbered.get(key)}. ${figure.caption}`, { italics: true, size: 18 }));
          children.push(new Paragraph({ text: '' }));
        }
        part.tables.forEach(addTable);
        for (const section of part.sections) {
          for (const paragraph of String(textOf(section) ?? '').split(/\n{2,}/)) {
            if (paragraph.trim()) {
              children.push(
                new Paragraph({
                  alignment: section.center ? AlignmentType.CENTER : undefined,
                  spacing: { after: 120 },
                  children: [new TextRun({ text: paragraph.trim(), size: 22 })],
                })
              );
            }
          }
        }
      }
    });
  } else {
    addFigures();
    if (figuresFirst) {
      addTables();
      addSections();
    } else {
      addSections();
      addTables();
    }
  }

  children.push(
    new Paragraph({
      children: [new TextRun({ text: 'For planning purposes only. Not a land title, survey plan or proof of ownership.', italics: true, size: 18 })],
    })
  );

  const document = new Document({
    creator: 'Green Tag Tree Inventory System',
    title,
    // Word fills a table of contents in when the document opens.
    features: { updateFields: chapters?.some((chapter) => chapter.contents) ?? false },
    sections: [{ children }],
  });
  return Packer.toBlob(document);
}
