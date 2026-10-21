import { describe, expect, it } from 'vitest';
import { downloadRecords, inventoryGeoJson, inventoryWorkbook, placeSummary, speciesSummary } from './publicDownloads.js';

const TREES = [
  { id: 't1', species: 'Narra', scientific_name: 'Pterocarpus indicus', latitude: 14.2794, longitude: 121.4157, dbh: '37 cm', total_height: 14,
    biodiversity_status: 'Endemic', barangay: 'Barangay I', imageUrl: 'https://x/photo.jpg', tagged_by: 'someone', wood_density: 0.55 },
  { id: 't2', species: 'Mangga', latitude: 14.2729, longitude: 121.4553, dbh: '30 cm', biodiversity_status: 'Introduced' },
  { id: 't3', species: 'Narra', latitude: 14.2797, longitude: 121.4164, dbh: 12, total_height: 6 },
  { id: 't4', species: 'Nowhere', latitude: 0, longitude: 0 },
];

describe('what goes out', () => {
  it('is every tree inside Laguna, or inside the place asked for', () => {
    expect(downloadRecords(TREES)).toHaveLength(3);
    expect(downloadRecords(TREES, { place: 'Santa Cruz' }).map((r) => r.species)).toEqual(['Narra', 'Narra']);
  });

  it('carries the tree, its measurements and its carbon — never a photo or who tagged it', () => {
    const narra = downloadRecords(TREES, { place: 'Santa Cruz' }).find((r) => r.dbhCm === 37);
    expect(narra).toMatchObject({ species: 'Narra', municipality: 'Santa Cruz', origin: 'Endemic', dbhCm: 37, totalHeightM: 14, woodDensity: 0.55 });
    expect(narra.co2Kg).toBeGreaterThan(0);
    expect(JSON.stringify(narra)).not.toMatch(/photo|someone|t1/);
  });

  it('says why a tree has no carbon', () => {
    const mangga = downloadRecords(TREES).find((r) => r.species === 'Mangga');
    expect(mangga).toMatchObject({ co2Kg: null, notCountedBecause: 'No total height recorded', woodDensity: null });
  });

  it('sums by place and by species', () => {
    const records = downloadRecords(TREES);
    const places = placeSummary(records);
    expect(places.map((p) => [p.name, p.trees, p.measured])).toEqual([['Pagsanjan', 1, 0], ['Santa Cruz', 2, 2]]);
    expect(speciesSummary(records)[0]).toMatchObject({ name: 'Narra', trees: 2 });
  });
});

describe('the files', () => {
  it('GeoJSON: a point each, longitude first, with how to cite it', () => {
    const geojson = JSON.parse(inventoryGeoJson(downloadRecords(TREES, { place: 'Santa Cruz' }), { placeLabel: 'Santa Cruz' }));
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.map((f) => f.geometry)).toContainEqual({ type: 'Point', coordinates: [121.4157, 14.2794] });
    expect(geojson.metadata.citation).toMatch(/Green Tag Tree Inventory System/);
  });

  it('Excel: the trees, the summary by barangay, and the species', async () => {
    const blob = await inventoryWorkbook(downloadRecords(TREES, { place: 'Santa Cruz' }), {
      lgu: { psgc: 403426000, name: 'Santa Cruz', label: 'Santa Cruz', isCity: false },
    });
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    const buffer = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(blob);
    });
    await book.xlsx.load(buffer);
    expect(book.worksheets.map((ws) => ws.name)).toEqual(['Trees', 'By barangay', 'Species']);
  });
});
