import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import santaCruzLogoUrl from '../assets/Santa Cruz Logo.png';
import menroLogoUrl from '../assets/MENRO Santa Cruz logo.png';

const BARANGAYS = [
  'Alipit', 'Bagumbayan', 'Barangay I', 'Barangay II', 'Barangay III',
  'Barangay IV', 'Barangay V', 'Bubukal', 'Calios', 'Duhat', 'Gatid',
  'Jasaan', 'Labuin', 'Malinao', 'Oogong', 'Pagsawitan', 'Palasan',
  'Patimbao', 'San Jose', 'San Juan', 'San Pablo Norte', 'San Pablo Sur',
  'Santisima Cruz', 'Santo Angel Central', 'Santo Angel Norte', 'Santo Angel Sur',
];

/**
 * Fetch a static asset bundled by Vite and return it as a base64 string
 * so ExcelJS can embed it via `workbook.addImage`.
 */
async function fetchImageBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // Convert ArrayBuffer to base64 string
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

/**
 * Embed Santa Cruz + MENRO seals at the top-left and top-right of the given
 * worksheet. Returns silently if either image fails to load so the export
 * never breaks because of an asset hiccup.
 */
async function addLetterheadLogos(workbook, sheet, { leftRange, rightRange }) {
  const [scBase64, menroBase64] = await Promise.all([
    fetchImageBase64(santaCruzLogoUrl),
    fetchImageBase64(menroLogoUrl),
  ]);

  if (scBase64) {
    const scId = workbook.addImage({ base64: scBase64, extension: 'png' });
    sheet.addImage(scId, leftRange);
  }
  if (menroBase64) {
    const menroId = workbook.addImage({ base64: menroBase64, extension: 'png' });
    sheet.addImage(menroId, rightRange);
  }
}

/**
 * Generate the MENRO dual-sheet Excel workbook matching the official template.
 * @param {Array} treesData - Array of tree records from Supabase
 * @param {string} officerName - Name of the currently logged-in user
 */
export async function generateMenroExcel(treesData, officerName = 'MENRO Officer') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Tree Inventory & Carbon Dashboard';
  workbook.created = new Date();

  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ===== Sheet 1: Tree Inventory Sheet =====
  const sheet1 = workbook.addWorksheet('Tree Inventory Sheet');

  // Reserve space for letterhead logos by giving the first three rows
  // extra height so the images sit beside the title block instead of on
  // top of the data table.
  sheet1.getRow(1).height = 28;
  sheet1.getRow(2).height = 22;
  sheet1.getRow(3).height = 22;

  // Header block
  sheet1.mergeCells('A1:L1');
  sheet1.getCell('A1').value = 'Municipal Environment and Natural Resource Office';
  sheet1.getCell('A1').font = { bold: true, size: 14 };
  sheet1.getCell('A1').alignment = { horizontal: 'center' };

  sheet1.mergeCells('A2:L2');
  sheet1.getCell('A2').value = 'Municipality of Santa Cruz, Laguna';
  sheet1.getCell('A2').font = { size: 12 };
  sheet1.getCell('A2').alignment = { horizontal: 'center' };

  sheet1.mergeCells('A3:L3');
  sheet1.getCell('A3').value = 'TREE INVENTORY SHEET';
  sheet1.getCell('A3').font = { bold: true, size: 13 };
  sheet1.getCell('A3').alignment = { horizontal: 'center' };

  // Officer & Location info (Row 5-6)
  sheet1.getCell('A5').value = 'Name of Officer:';
  sheet1.getCell('A5').font = { bold: true, size: 10 };
  sheet1.getCell('C5').value = officerName;
  sheet1.getCell('C5').font = { size: 10 };

  sheet1.getCell('H5').value = 'Area/Barangay Inventory:';
  sheet1.getCell('H5').font = { bold: true, size: 10 };
  sheet1.getCell('J5').value = 'Santa Cruz, Laguna';
  sheet1.getCell('J5').font = { size: 10 };

  sheet1.getCell('A6').value = 'Location:';
  sheet1.getCell('A6').font = { bold: true, size: 10 };
  sheet1.getCell('C6').value = 'Santa Cruz, Laguna';
  sheet1.getCell('C6').font = { size: 10 };

  sheet1.getCell('H6').value = 'Date of Inventory:';
  sheet1.getCell('H6').font = { bold: true, size: 10 };
  sheet1.getCell('J6').value = currentDate;
  sheet1.getCell('J6').font = { size: 10 };

  // Table Headers (Row 8)
  const headers = [
    'Tree No.', 'Species', 'DBH (cm)', 'MH (m)', 'TH (m)', 'Volume (m³)',
    '*Tree Location (GPS Reading)', '', 'Tree Category', 'Stem Quality'
  ];
  const subHeaders = ['', '', '', '', '', '', 'Lat', 'Long', 'Planted/Natural', ''];

  const headerRow = sheet1.getRow(8);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
    cell.border = { bottom: { style: 'thin' }, top: { style: 'thin' } };
    cell.alignment = { horizontal: 'center', wrapText: true };
  });

  const subHeaderRow = sheet1.getRow(9);
  subHeaders.forEach((h, i) => {
    if (h) {
      const cell = subHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { horizontal: 'center' };
      cell.border = { bottom: { style: 'thin' } };
    }
  });

  // Merge GPS header across Lat/Long columns
  sheet1.mergeCells('G8:H8');

  // Data rows starting at row 10
  treesData.forEach((tree, idx) => {
    const row = sheet1.getRow(10 + idx);
    const dbh = parseFloat(tree.dbh) || 0;
    const mh = parseFloat(tree.merchantable_height || tree.height_m) || 0;
    const th = parseFloat(tree.total_height || tree.heightClass) || 0;
    const volume = (Math.PI / 4) * Math.pow(dbh / 100, 2) * mh;

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = tree.species || '';
    row.getCell(3).value = dbh || '';
    row.getCell(4).value = mh || '';
    row.getCell(5).value = th || '';
    row.getCell(6).value = volume > 0 ? parseFloat(volume.toFixed(4)) : '';
    row.getCell(7).value = tree.latitude || '';
    row.getCell(8).value = tree.longitude || '';
    row.getCell(9).value = tree.tree_category || '';
    row.getCell(10).value = tree.stem_quality || '';

    // Alternate row shading
    if (idx % 2 === 0) {
      for (let c = 1; c <= 10; c++) {
        row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }
    }
  });

  // Footer note
  const noteRow = 10 + treesData.length + 2;
  sheet1.mergeCells(`A${noteRow}:J${noteRow}`);
  sheet1.getCell(`A${noteRow}`).value = '*Location (geographical coordinates) of the affected trees for government projects, mining, etc, is required to be recorded and serve as basis in charting the affected trees/saplings';
  sheet1.getCell(`A${noteRow}`).font = { italic: true, size: 8 };

  // Inventoried by section
  const invRow = noteRow + 2;
  sheet1.getCell(`A${invRow}`).value = 'Inventoried by:';
  sheet1.getCell(`A${invRow}`).font = { bold: true, size: 10 };
  sheet1.getCell(`B${invRow + 1}`).value = 'Team Leader';
  sheet1.getCell(`D${invRow + 1}`).value = 'Member';
  sheet1.getCell(`F${invRow + 1}`).value = 'Member';
  sheet1.getCell(`H${invRow + 1}`).value = 'Member';

  // Stem Quality Guide
  const guideRow = invRow + 4;
  sheet1.getCell(`A${guideRow}`).value = 'STEM QUALITY GUIDE:';
  sheet1.getCell(`A${guideRow}`).font = { bold: true, size: 10 };
  sheet1.getCell(`A${guideRow + 1}`).value = 'Code 1';
  sheet1.getCell(`A${guideRow + 1}`).font = { bold: true, size: 9 };
  sheet1.getCell(`B${guideRow + 1}`).value = 'Straight, cylindrical tree without visible defects or damage';
  sheet1.getCell(`A${guideRow + 2}`).value = 'Code 2';
  sheet1.getCell(`A${guideRow + 2}`).font = { bold: true, size: 9 };
  sheet1.getCell(`B${guideRow + 2}`).value = 'Tree with defects or damages';
  sheet1.getCell(`A${guideRow + 3}`).value = 'Code 3';
  sheet1.getCell(`A${guideRow + 3}`).font = { bold: true, size: 9 };
  sheet1.getCell(`B${guideRow + 3}`).value = 'Tree with several defects or damages';

  // Column widths
  sheet1.getColumn(1).width = 10;
  sheet1.getColumn(2).width = 18;
  sheet1.getColumn(3).width = 10;
  sheet1.getColumn(4).width = 8;
  sheet1.getColumn(5).width = 8;
  sheet1.getColumn(6).width = 10;
  sheet1.getColumn(7).width = 14;
  sheet1.getColumn(8).width = 14;
  sheet1.getColumn(9).width = 16;
  sheet1.getColumn(10).width = 14;

  // ===== Sheet 2: Biodiversity and Sink =====
  const sheet2 = workbook.addWorksheet('Biodiversity and Sink');

  sheet2.getRow(1).height = 28;
  sheet2.getRow(2).height = 22;
  sheet2.getRow(3).height = 22;

  // Header
  sheet2.mergeCells('A1:F1');
  sheet2.getCell('A1').value = 'Municipal Environment and Natural Resource Office';
  sheet2.getCell('A1').font = { bold: true, size: 13 };
  sheet2.getCell('A1').alignment = { horizontal: 'center' };

  sheet2.mergeCells('A2:F2');
  sheet2.getCell('A2').value = 'Municipality of Santa Cruz, Laguna';
  sheet2.getCell('A2').font = { size: 11 };
  sheet2.getCell('A2').alignment = { horizontal: 'center' };

  sheet2.mergeCells('A3:F3');
  sheet2.getCell('A3').value = 'BIODIVERSITY REPORT';
  sheet2.getCell('A3').font = { bold: true, size: 12 };
  sheet2.getCell('A3').alignment = { horizontal: 'center' };

  // Biodiversity Status counts
  const endemic = treesData.filter(t => (t.biodiversity_status || t.species_type) === 'Endemic').length;
  const invasive = treesData.filter(t => (t.biodiversity_status || t.species_type) === 'Invasive').length;

  sheet2.getCell('A5').value = 'Endemic';
  sheet2.getCell('A5').font = { bold: true, size: 10 };
  sheet2.getCell('B5').value = 'Invasive';
  sheet2.getCell('B5').font = { bold: true, size: 10 };
  sheet2.getCell('A6').value = endemic;
  sheet2.getCell('A6').font = { size: 11 };
  sheet2.getCell('B6').value = invasive;
  sheet2.getCell('B6').font = { size: 11 };

  // Tree Category counts
  const timber = treesData.filter(t => t.tree_category === 'Timber Trees').length;
  const fruit = treesData.filter(t => t.tree_category === 'Fruit Trees').length;
  const ornamental = treesData.filter(t => t.tree_category === 'Ornamental Trees').length;

  sheet2.getCell('D5').value = 'Timber';
  sheet2.getCell('D5').font = { bold: true, size: 10 };
  sheet2.getCell('E5').value = 'Fruit';
  sheet2.getCell('E5').font = { bold: true, size: 10 };
  sheet2.getCell('F5').value = 'Ornamental';
  sheet2.getCell('F5').font = { bold: true, size: 10 };
  sheet2.getCell('D6').value = timber;
  sheet2.getCell('E6').value = fruit;
  sheet2.getCell('F6').value = ornamental;

  // Barangay Summary Table
  sheet2.getCell('A9').value = 'Brgy';
  sheet2.getCell('A9').font = { bold: true, size: 10 };
  sheet2.getCell('B9').value = 'Sequestration Potential (kg)';
  sheet2.getCell('B9').font = { bold: true, size: 10 };
  sheet2.getCell('C9').value = 'Number of Trees';
  sheet2.getCell('C9').font = { bold: true, size: 10 };

  // Header row styling
  for (let c = 1; c <= 3; c++) {
    sheet2.getRow(9).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    sheet2.getRow(9).getCell(c).border = { bottom: { style: 'thin' } };
  }

  let totalSeq = 0;
  let totalTrees = 0;

  BARANGAYS.forEach((brgy, idx) => {
    const brgyTrees = treesData.filter(t => (t.barangay || '') === brgy);
    const count = brgyTrees.length;
    const sequestration = parseFloat((count * 62.47).toFixed(2));
    totalSeq += sequestration;
    totalTrees += count;

    const row = sheet2.getRow(10 + idx);
    row.getCell(1).value = brgy;
    row.getCell(2).value = sequestration;
    row.getCell(3).value = count;
  });

  // Total row
  const totalRow = sheet2.getRow(10 + BARANGAYS.length);
  totalRow.getCell(1).value = 'Total:';
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(2).value = parseFloat(totalSeq.toFixed(2));
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(3).value = totalTrees;
  totalRow.getCell(3).font = { bold: true };

  // Column widths
  sheet2.getColumn(1).width = 22;
  sheet2.getColumn(2).width = 28;
  sheet2.getColumn(3).width = 18;
  sheet2.getColumn(4).width = 12;
  sheet2.getColumn(5).width = 12;
  sheet2.getColumn(6).width = 14;

  // Letterhead logos — Santa Cruz seal at top-left, MENRO seal at top-right
  // of each sheet. Uses cell-range anchoring (e.g. 'A1:B3') which ExcelJS
  // handles reliably across all Excel versions.
  await addLetterheadLogos(workbook, sheet1, {
    leftRange: 'A1:A3',
    rightRange: 'J1:J3',
  });
  await addLetterheadLogos(workbook, sheet2, {
    leftRange: 'A1:A3',
    rightRange: 'F1:F3',
  });

  // Generate and download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `MENRO_Tree_Inventory_${new Date().toISOString().slice(0, 10)}.xlsx`);
}