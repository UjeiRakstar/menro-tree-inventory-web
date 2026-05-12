import {
  buildTreeInventoryCsv,
  CSV_HEADER,
  quoteCsvField,
} from './treeCsv.js';

/**
 * Minimal, valid Tree_Record used as a builder base. Each fixture below
 * overrides only the fields the corresponding test cares about so the intent
 * of each case stays legible at the assertion site.
 */
const baseTree = {
  id: 'row-1',
  tree_id: 'T-1',
  latitude: 14.5995,
  longitude: 120.9842,
  dbh: '25',
  species: 'Narra',
  scientific_name: 'Pterocarpus indicus',
  species_type: 'Endemic',
  is_leaning: false,
  has_powerline_conflict: false,
  is_decayed: false,
  is_root_problem: false,
  dateCaptured: '2024-01-01T00:00:00.000Z',
  assigned_to: null,
  has_cutting_permit: false,
  task_status: 'Pending',
  photo_url: null,
};

describe('CSV_HEADER', () => {
  it('is exactly the six-column contract in order', () => {
    expect(CSV_HEADER).toEqual([
      'tree_id',
      'species',
      'dbh',
      'hazard_status',
      'permit_status',
      'assigned_to',
    ]);
  });
});

describe('quoteCsvField (RFC 4180)', () => {
  it('wraps a value containing a comma in double quotes', () => {
    expect(quoteCsvField('Mahogany, large')).toBe('"Mahogany, large"');
  });

  it('wraps and doubles embedded double quotes', () => {
    // The literal input value is:   she said "hi"
    // The expected CSV field is:    "she said ""hi"""
    expect(quoteCsvField('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('wraps a value containing a carriage return', () => {
    expect(quoteCsvField('line1\rline2')).toBe('"line1\rline2"');
  });

  it('wraps a value containing a line feed', () => {
    expect(quoteCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('returns an empty string for null', () => {
    expect(quoteCsvField(null)).toBe('');
  });

  it('returns an empty string for undefined', () => {
    expect(quoteCsvField(undefined)).toBe('');
  });

  it('returns the value unchanged when no trigger character is present', () => {
    expect(quoteCsvField('Narra')).toBe('Narra');
  });
});

describe('buildTreeInventoryCsv', () => {
  /**
   * Three-record fixture covering both Hazard_Classifier outputs and both
   * Permit_Classifier outputs:
   *   row 1: Hazard (is_leaning=true)  + None     + populated tree_id/assigned_to
   *   row 2: Safe                      + Approved + null assigned_to
   *   row 3: Safe                      + None     + null tree_id
   */
  const fixture = [
    {
      ...baseTree,
      id: 'row-1',
      tree_id: 'T-001',
      species: 'Narra',
      dbh: '42',
      is_leaning: true,
      has_cutting_permit: false,
      assigned_to: 'arb-001',
    },
    {
      ...baseTree,
      id: 'row-2',
      tree_id: 'T-002',
      species: 'Acacia',
      dbh: '30',
      has_cutting_permit: true,
      assigned_to: null,
    },
    {
      ...baseTree,
      id: 'row-3',
      tree_id: null,
      species: 'Mahogany',
      dbh: '55',
      has_cutting_permit: false,
      assigned_to: null,
    },
  ];

  it('emits the exact six-column header row as the first line', () => {
    const csv = buildTreeInventoryCsv(fixture);
    const firstLine = csv.split('\r\n')[0];
    expect(firstLine).toBe(
      'tree_id,species,dbh,hazard_status,permit_status,assigned_to',
    );
  });

  it('emits one data row per Tree_Record in input order', () => {
    const csv = buildTreeInventoryCsv(fixture);
    // Split on \r\n; drop the header and the trailing empty segment from the
    // final \r\n. This leaves exactly one entry per fixture record.
    const dataLines = csv.split('\r\n').slice(1, -1);
    expect(dataLines).toHaveLength(fixture.length);
    expect(dataLines[0].startsWith('T-001,Narra,42,')).toBe(true);
    expect(dataLines[1].startsWith('T-002,Acacia,30,')).toBe(true);
    // Row 3 has null tree_id → leading empty field.
    expect(dataLines[2].startsWith(',Mahogany,55,')).toBe(true);
  });

  it('writes classifier outputs (not booleans) in hazard_status and permit_status', () => {
    const csv = buildTreeInventoryCsv(fixture);
    const dataLines = csv.split('\r\n').slice(1, -1);

    // tree_id,species,dbh,hazard_status,permit_status,assigned_to
    expect(dataLines[0].split(',')).toEqual([
      'T-001', 'Narra', '42', 'Hazard', 'None', 'arb-001',
    ]);
    expect(dataLines[1].split(',')).toEqual([
      'T-002', 'Acacia', '30', 'Safe', 'Approved', '',
    ]);
    expect(dataLines[2].split(',')).toEqual([
      '', 'Mahogany', '55', 'Safe', 'None', '',
    ]);

    // Guard against a boolean-leak regression: the literal strings 'true'
    // and 'false' must not appear in the emitted CSV.
    expect(csv).not.toMatch(/\btrue\b/);
    expect(csv).not.toMatch(/\bfalse\b/);
  });

  it('serializes null tree_id and null assigned_to as empty CSV fields (not the literal string "null")', () => {
    const records = [
      { ...baseTree, id: 'row-a', tree_id: null, assigned_to: null },
    ];
    const csv = buildTreeInventoryCsv(records);
    const dataRow = csv.split('\r\n')[1];
    const fields = dataRow.split(',');
    // tree_id is column 0, assigned_to is column 5.
    expect(fields[0]).toBe('');
    expect(fields[5]).toBe('');
    expect(csv).not.toMatch(/\bnull\b/);
  });

  it('quotes a species containing a comma per RFC 4180', () => {
    const records = [
      { ...baseTree, id: 'row-c', species: 'Mahogany, large' },
    ];
    const csv = buildTreeInventoryCsv(records);
    expect(csv).toContain('"Mahogany, large"');
  });

  it('quotes a species containing a double quote and doubles the embedded quote', () => {
    const records = [
      { ...baseTree, id: 'row-q', species: 'she said "hi"' },
    ];
    const csv = buildTreeInventoryCsv(records);
    expect(csv).toContain('"she said ""hi"""');
  });

  it('quotes a species containing a carriage return', () => {
    const records = [
      { ...baseTree, id: 'row-cr', species: 'line1\rline2' },
    ];
    const csv = buildTreeInventoryCsv(records);
    expect(csv).toContain('"line1\rline2"');
  });

  it('quotes a species containing a line feed', () => {
    const records = [
      { ...baseTree, id: 'row-lf', species: 'line1\nline2' },
    ];
    const csv = buildTreeInventoryCsv(records);
    expect(csv).toContain('"line1\nline2"');
  });

  it('separates rows with \\r\\n and terminates the output with a trailing \\r\\n', () => {
    const csv = buildTreeInventoryCsv(fixture);

    // Trailing terminator.
    expect(csv.endsWith('\r\n')).toBe(true);

    // A header + 3 data rows separated by \r\n and followed by one trailing
    // \r\n yields exactly 4 \r\n occurrences.
    const separatorCount = (csv.match(/\r\n/g) || []).length;
    expect(separatorCount).toBe(fixture.length + 1);

    // Bare LFs must not appear outside \r\n pairs — no lone \n row breaks.
    const bareLfCount = (csv.match(/(?<!\r)\n/g) || []).length;
    expect(bareLfCount).toBe(0);
  });
});
