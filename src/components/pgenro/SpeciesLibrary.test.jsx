import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import SpeciesLibrary from './SpeciesLibrary.jsx';

const NARRA = {
  species: 'Narra',
  scientific_name: 'Pterocarpus indicus',
  family: 'Fabaceae',
  description: 'A large deciduous tree.',
  flowering_months: [3, 4],
  rise_citation: 'RISE Vol. 21 No. 2 (2019)',
  autofilled: false,
};

const TREES = [
  { species: 'Narra' },
  { species: 'Mango' },
  { species: 'Mango' },
  { species: 'Molave' },
];

// What the reader sends back for a one-species issue.
const READ_MOLAVE = {
  citation: 'RISE Vol. 9 No. 1 (2011)',
  species: [
    {
      species: 'Molave',
      scientific_name: 'Vitex parviflora Juss.',
      family: 'Lamiaceae',
      description: 'A medium-sized tree with a fluted bole.',
      flowering_months: [4, 5],
      fruiting_months: [],
      uses: 'Construction, posts.',
    },
  ],
  model: 'gemini-3.6-flash',
};

const pdf = (name = 'rise-molave.pdf') => new File(['%PDF-1.4 test'], name, { type: 'application/pdf' });

function renderLibrary() {
  return render(<SpeciesLibrary trees={TREES} />);
}

async function openNew(name) {
  renderLibrary();
  fireEvent.click(await screen.findByRole('button', { name: `Write up ${name}` }));
  return screen.getByRole('form', { name: 'New species' });
}

function choosePdf(file = pdf()) {
  fireEvent.change(screen.getByLabelText('RISE PDF'), { target: { files: [file] } });
}

const upserts = () => supabaseMock.writesTo('species_profiles', 'upsert');

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('species_profiles:select', { data: [NARRA], error: null });
  supabaseMock.setResponse('species_profiles:upsert', { data: null, error: null });
});
afterEach(cleanup);

describe('the species list', () => {
  it('shows what is written up, and what is tagged with no write-up yet', async () => {
    renderLibrary();
    expect(await screen.findByText('Pterocarpus indicus')).toBeInTheDocument();

    const backlog = screen.getByRole('region', { name: 'Tagged, no write-up yet' });
    // Mango first: two trees against one.
    const names = within(backlog).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Write up Mango', 'Write up Molave']);
  });

  it('starts a write-up for a tagged species with its name already in', async () => {
    const form = await openNew('Mango');
    expect(within(form).getByLabelText(/Common name/)).toHaveValue('Mango');
  });

  it('opens a saved one with its name fixed, because the map finds trees by it', async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: /Narra/ }));
    const form = screen.getByRole('form', { name: 'Edit Narra' });
    expect(within(form).getByLabelText(/Common name/)).toHaveAttribute('readonly');
    expect(within(form).getByRole('button', { name: 'Flowering months: Mar' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('typing one in', () => {
  it('saves the form as a species profile', async () => {
    const form = await openNew('Molave');
    fireEvent.change(within(form).getByLabelText('Family'), { target: { value: 'Lamiaceae' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Fruiting months: Sep' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Molave saved/)).toBeInTheDocument();
    const [call] = upserts();
    expect(call.payload).toMatchObject({
      species: 'Molave',
      family: 'Lamiaceae',
      fruiting_months: [9],
      flowering_months: null,
      autofilled: false,
    });
  });

  it('saves the site needs as figures, for matching to planting sites', async () => {
    const form = await openNew('Molave');
    fireEvent.change(within(form).getByLabelText('Elevation, lowest'), { target: { value: '0' } });
    fireEvent.change(within(form).getByLabelText('Elevation, highest'), { target: { value: '900' } });
    fireEvent.change(within(form).getByLabelText('Rainfall, highest'), { target: { value: '3,000' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Clay loam' }));
    fireEvent.change(within(form).getByRole('combobox', { name: 'Origin' }), { target: { value: 'endemic' } });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Flooding' }), { target: { value: 'brief' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Molave saved/)).toBeInTheDocument();
    expect(upserts()[0].payload).toMatchObject({
      elevation_min_m: 0,
      elevation_max_m: 900,
      rainfall_min_mm: null,
      rainfall_max_mm: 3000,
      soil_textures: ['clay-loam'],
      origin: 'endemic',
      flood_tolerance: 'brief',
    });
  });

  it('will not save a range upside down', async () => {
    const form = await openNew('Molave');
    fireEvent.change(within(form).getByLabelText('Elevation, lowest'), { target: { value: '900' } });
    fireEvent.change(within(form).getByLabelText('Elevation, highest'), { target: { value: '100' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('site needs');
    expect(within(form).getByText('The lowest is above the highest.')).toBeInTheDocument();
    expect(upserts()).toHaveLength(0);
  });

  it('will not make a second write-up for a species that has one', async () => {
    renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: /Add a species/ }));
    const form = screen.getByRole('form', { name: 'New species' });
    fireEvent.change(within(form).getByLabelText(/Common name/), { target: { value: 'narra' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('already has a write-up');
    expect(upserts()).toHaveLength(0);
  });

  it('says which file to run when the RISE columns are not in the database yet', async () => {
    supabaseMock.setResponse('species_profiles:upsert', {
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'family' column" },
    });
    const form = await openNew('Molave');
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('species_rise.sql');
  });
});

describe('reading a RISE PDF', () => {
  it('sends the PDF to the reader and fills in the form, marking every field it filled', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({ data: READ_MOLAVE, error: null });
    const form = await openNew('Molave');
    choosePdf();
    fireEvent.click(within(form).getByRole('button', { name: 'Read it' }));

    await waitFor(() => expect(within(form).getByLabelText('Family')).toHaveValue('Lamiaceae'));
    const [name, { body }] = supabaseMock.supabase.functions.invoke.mock.calls[0];
    expect(name).toBe('rise-extract');
    expect(body.file_name).toBe('rise-molave.pdf');
    expect(atob(body.pdf)).toBe('%PDF-1.4 test');

    expect(within(form).getByLabelText('RISE issue')).toHaveValue('RISE Vol. 9 No. 1 (2011)');
    expect(within(form).getByRole('button', { name: 'Flowering months: Apr' })).toHaveAttribute('aria-pressed', 'true');
    // Common name, scientific name, family, description, flowering, uses, issue.
    expect(within(form).getAllByText('From the PDF — check it')).toHaveLength(7);
  });

  it('will not save what it read until the forester says it is checked', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({ data: READ_MOLAVE, error: null });
    const form = await openNew('Molave');
    choosePdf();
    fireEvent.click(within(form).getByRole('button', { name: 'Read it' }));
    await waitFor(() => expect(within(form).getByLabelText('Family')).toHaveValue('Lamiaceae'));

    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('checked what was read');
    expect(upserts()).toHaveLength(0);

    fireEvent.click(within(form).getByRole('checkbox', { name: /I have checked the 7 fields/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Molave saved/)).toBeInTheDocument();
    expect(upserts()[0].payload).toMatchObject({ species: 'Molave', family: 'Lamiaceae', autofilled: true });
  });

  it('counts a field as checked once it is changed or confirmed', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({ data: READ_MOLAVE, error: null });
    const form = await openNew('Molave');
    choosePdf();
    fireEvent.click(within(form).getByRole('button', { name: 'Read it' }));
    await waitFor(() => expect(within(form).getByLabelText('Family')).toHaveValue('Lamiaceae'));

    fireEvent.change(within(form).getByLabelText('Uses'), { target: { value: 'Posts and railway ties.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Family is right' }));
    expect(within(form).getAllByText('From the PDF — check it')).toHaveLength(5);
  });

  it('fills the site needs too, when the issue states them, and marks them for checking', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({
      data: {
        ...READ_MOLAVE,
        species: [{ ...READ_MOLAVE.species[0], elevation_min_m: 0, elevation_max_m: 900, soil_textures: ['clay-loam', 'peat'] }],
      },
      error: null,
    });
    const form = await openNew('Molave');
    choosePdf();
    fireEvent.click(within(form).getByRole('button', { name: 'Read it' }));
    await waitFor(() => expect(within(form).getByLabelText('Elevation, highest')).toHaveValue('900'));

    // A texture not on the list is dropped, not kept.
    expect(within(form).getByRole('button', { name: 'Clay loam' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(form).getAllByText('From the PDF — check it')).toHaveLength(9);
    // Changing either end of a range is checking that range.
    fireEvent.change(within(form).getByLabelText('Elevation, lowest'), { target: { value: '10' } });
    expect(within(form).getAllByText('From the PDF — check it')).toHaveLength(8);
  });

  it('asks which species, when an issue covers several', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({
      data: { species: [{ species: 'Narra' }, { species: 'Molave', family: 'Lamiaceae' }] },
      error: null,
    });
    const form = await openNew('Molave');
    choosePdf();
    fireEvent.click(within(form).getByRole('button', { name: 'Read it' }));

    fireEvent.click(await within(form).findByRole('button', { name: 'Molave' }));
    expect(within(form).getByLabelText('Family')).toHaveValue('Lamiaceae');
  });

  it('keeps a saved species’ name when the PDF spells it differently', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({
      data: { species: [{ species: 'Philippine Rosewood', family: 'Fabaceae' }] },
      error: null,
    });
    renderLibrary();
    fireEvent.click(await screen.findByRole('button', { name: /Narra/ }));
    const form = screen.getByRole('form', { name: 'Edit Narra' });
    choosePdf();
    fireEvent.click(within(form).getByRole('button', { name: 'Read it' }));

    expect(await within(form).findByText(/calls it “Philippine Rosewood”/)).toBeInTheDocument();
    expect(within(form).getByLabelText(/Common name/)).toHaveValue('Narra');
  });

  it('refuses a PDF over 8 MB before sending it anywhere', async () => {
    const form = await openNew('Molave');
    const big = pdf('huge.pdf');
    Object.defineProperty(big, 'size', { value: 9 * 1024 * 1024 });
    choosePdf(big);

    expect(within(form).getByRole('alert')).toHaveTextContent('over 8 MB');
    expect(within(form).getByRole('button', { name: 'Read it' })).toBeDisabled();
  });

  it('says how to deploy the reader when it is not there', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to send a request to the Edge Function' },
    });
    const form = await openNew('Molave');
    choosePdf();
    fireEvent.click(within(form).getByRole('button', { name: 'Read it' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('supabase/functions/rise-extract');
  });

  it('passes on what the reader itself said went wrong', async () => {
    supabaseMock.supabase.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'GEMINI_API_KEY is not set.' }) },
      },
    });
    const form = await openNew('Molave');
    choosePdf();
    fireEvent.click(within(form).getByRole('button', { name: 'Read it' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('GEMINI_API_KEY is not set.');
  });
});
