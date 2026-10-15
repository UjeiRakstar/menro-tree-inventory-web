import { describe, it, expect } from 'vitest';
import {
  areaFormProblems,
  areaPermission,
  documentFolderOf,
  documentPathOf,
  emptyAreaForm,
  formFromRow,
  geometryToShape,
  proposalChanges,
  rowFromForm,
  rowToFeature,
  shapeToGeometry,
  treesInside,
} from './mapAreas.js';

// A square about 110 m a side in Santa Cruz.
const SHAPE = {
  points: [
    [14.28, 121.41],
    [14.281, 121.41],
    [14.281, 121.411],
    [14.28, 121.411],
  ],
  closed: true,
};

describe('geometry', () => {
  it('stores the drawing longitude first, with the ring closed', () => {
    const geometry = shapeToGeometry(SHAPE);
    expect(geometry.type).toBe('Polygon');
    expect(geometry.coordinates[0][0]).toEqual([121.41, 14.28]);
    expect(geometry.coordinates[0]).toHaveLength(5);
  });

  it('comes back as the same shape, ready to edit', () => {
    expect(geometryToShape(shapeToGeometry(SHAPE))).toEqual(SHAPE);
  });

  it('finds the trees standing inside, leaving out tags and stumps', () => {
    const geometry = shapeToGeometry(SHAPE);
    const trees = [
      { id: 'in', latitude: 14.2805, longitude: 121.4105 },
      { id: 'out', latitude: 14.29, longitude: 121.42 },
      { id: 'tag', latitude: 14.2805, longitude: 121.4105, __pending: true },
      { id: 'stump', latitude: 14.2805, longitude: 121.4105, task_status: 'Cut' },
    ];
    expect(treesInside(trees, geometry).map((t) => t.id)).toEqual(['in']);
  });
});

describe('areaFormProblems', () => {
  it('asks for a name, and a class for land cover', () => {
    expect(Object.keys(areaFormProblems(emptyAreaForm()))).toEqual(['name', 'coverClass']);
    expect(areaFormProblems({ ...emptyAreaForm('planting-site'), name: 'Site' })).toEqual({});
  });

  it('asks for the document when a legal designation is claimed', () => {
    const form = { ...emptyAreaForm(), name: 'A', coverClass: 'open-forest', designation: 'zoning' };
    expect(Object.keys(areaFormProblems(form))).toEqual(['docType', 'docTitle', 'document']);
    const filled = { ...form, docType: 'Ordinance', docTitle: 'Zoning Ordinance' };
    expect(areaFormProblems(filled, { hasNewDocument: true })).toEqual({});
  });

  it('will not save a shape it cannot measure', () => {
    const form = { ...emptyAreaForm(), name: 'A', coverClass: 'open-forest' };
    expect(areaFormProblems(form, { measurable: false })).toHaveProperty('shape');
  });
});

describe('rowFromForm', () => {
  it('measures the shape and keeps only the fields of its kind', () => {
    const form = { ...emptyAreaForm(), name: ' Labuin forest ', coverClass: 'open-forest', contact: 'not for land cover' };
    const row = rowFromForm(form, {
      shape: SHAPE,
      place: { barangay: 'Labuin', municipality: 'Santa Cruz', psgc: 403426001 },
      suggestion: { classId: 'open-forest', reason: '12 trees, 6 species' },
      treesCount: 12,
    });
    expect(row).toMatchObject({
      kind: 'land-cover',
      name: 'Labuin forest',
      cover_class: 'open-forest',
      suggested_class: 'open-forest',
      municipality: 'Santa Cruz',
      barangay_psgc: 403426001,
      trees_inside: 12,
      contact: null,
      designation: null,
      doc_url: null,
    });
    expect(row.area_m2).toBeGreaterThan(10000);
    expect(row.perimeter_m).toBeGreaterThan(400);
  });

  it('turns the recommended species into a list, for a planting site', () => {
    const form = { ...emptyAreaForm('planting-site'), name: 'Site', recommended: 'Narra, Molave\nBanaba', spacingM: '4' };
    const row = rowFromForm(form, { shape: SHAPE });
    expect(row.recommended).toEqual([{ common: 'Narra' }, { common: 'Molave' }, { common: 'Banaba' }]);
    expect(row.spacing_m).toBe(4);
    expect(row.cover_class).toBeNull();
  });

  it('round-trips through the form for editing', () => {
    const form = { ...emptyAreaForm('planting-site'), name: 'Site', recommended: 'Narra, Molave', spacingM: '3' };
    const row = rowFromForm(form, { shape: SHAPE });
    expect(formFromRow(row)).toMatchObject({ name: 'Site', recommended: 'Narra, Molave', spacingM: '3' });
  });
});

describe('rowToFeature', () => {
  it('draws like a sample area, with the MAI behind its NAMRIA class', () => {
    const feature = rowToFeature(
      { id: 'a1', kind: 'land-cover', name: 'Forest', cover_class: 'closed-forest', geometry: shapeToGeometry(SHAPE),
        lgu_psgc: '403426000', created_by_role: 'lgu_admin', updated_at: '2026-10-15T00:00:00Z' },
      { lguLabel: 'Santa Cruz' }
    );
    expect(feature.properties).toMatchObject({
      saved: true,
      coverId: 'dipterocarps',
      coverLabel: 'Closed forest',
      lguPsgc: 403426000,
      verifiedBy: 'Santa Cruz MENRO / CENRO',
    });
  });

  it('has no MAI for a class with no published rate', () => {
    const feature = rowToFeature({ id: 'g', kind: 'land-cover', name: 'G', cover_class: 'grassland', geometry: null });
    expect(feature.properties.coverId).toBeNull();
  });
});

describe('areaPermission', () => {
  const area = (createdByRole, lguPsgc = 403426000) => ({ properties: { saved: true, createdByRole, lguPsgc } });
  const menro = { role: 'lgu_admin', status: 'active', lgu_psgc: 403426000 };
  const pgenro = { role: 'pgenro', status: 'active' };

  it('lets an office edit what its LGU drew, and nothing else', () => {
    expect(areaPermission(menro, area('lgu_admin'))).toBe('edit');
    expect(areaPermission(menro, area('lgu_admin', 403405000))).toBeNull();
    expect(areaPermission(menro, area('pgenro'))).toBeNull();
  });

  it('lets PGENRO edit its own, and propose on an office’s', () => {
    expect(areaPermission(pgenro, area('pgenro'))).toBe('edit');
    expect(areaPermission(pgenro, area('lgu_admin'))).toBe('propose');
  });

  it('touches no sample area, and gives the public nothing', () => {
    expect(areaPermission(pgenro, { properties: { kind: 'land-cover' } })).toBeNull();
    expect(areaPermission(null, area('lgu_admin'))).toBeNull();
  });
});

describe('proposalChanges', () => {
  it('lists what a proposal would change, in words', () => {
    const row = { name: 'Forest', cover_class: 'open-forest', geometry: { a: 1 } };
    const changes = { name: 'Forest', cover_class: 'closed-forest', geometry: { a: 2 } };
    expect(proposalChanges(row, changes)).toEqual([
      { key: 'cover_class', label: 'Land cover', before: 'Open forest', after: 'Closed forest' },
      { key: 'geometry', label: 'Boundary', before: 'as drawn', after: 'redrawn' },
    ]);
  });
});

describe('documents', () => {
  it('are filed by office', () => {
    expect(documentFolderOf({ role: 'lgu_admin', status: 'active', lgu_psgc: 403426000 })).toBe('403426000');
    expect(documentFolderOf({ role: 'pgenro', status: 'active' })).toBe('pgenro');
    expect(documentFolderOf({ role: 'field_officer', status: 'active', lgu_psgc: 403426000 })).toBeNull();
  });

  it('are found in the bucket by their public link', () => {
    expect(documentPathOf('https://x.supabase.co/storage/v1/object/public/area-documents/403426000/a%20b.pdf?t=1')).toBe(
      '403426000/a b.pdf'
    );
    expect(documentPathOf('https://elsewhere.example/doc.pdf')).toBeNull();
    expect(documentPathOf(null)).toBeNull();
  });
});
