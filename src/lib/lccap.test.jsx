import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import { forgetVerifiedPlans, lccapProblems, planBadges } from './lccap.js';
import { cbiTable } from './reports/thematic.js';
import ClimatePlanSection from '../pages/settings/ClimatePlanSection.jsx';
import ClimatePlans from '../pages/pgenro/ClimatePlans.jsx';
import LguPlanBadges from '../components/public/LguPlanBadges.jsx';

const SCZ = 403426000;
const pdf = (name = 'plan.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });
const VERIFIED = {
  id: 'v1', lgu_psgc: SCZ, plan_kind: 'elccap', term_start: 2024, term_end: 2032, status: 'verified',
  plan_url: 'https://storage.test/lccap-documents/403426000/plan.pdf', receipt_url: 'https://storage.test/lccap-documents/403426000/ccc.pdf',
  submitted_at: '2026-10-21T00:00:00Z',
};

beforeEach(() => {
  supabaseMock.reset();
  forgetVerifiedPlans();
});

describe('a climate plan’s checks and badges', () => {
  it('wants its years in order, and the plan as a PDF', () => {
    expect(lccapProblems({ termStart: '2024', termEnd: '2032', plan: pdf() })).toEqual({});
    expect(lccapProblems({ termStart: '2030', termEnd: '2024', plan: pdf() })).toEqual({ termEnd: 'It cannot end before it starts.' });
    expect(lccapProblems({ termStart: '2024', termEnd: '2032', plan: null }).plan).toBe('Attach the plan, as a PDF.');
    expect(lccapProblems({ termStart: '2024', termEnd: '2032', plan: new File(['x'], 'p.docx', { type: 'application/msword' }) }).plan).toMatch(/PDF/);
  });

  it('gives the badges while the plan’s years run, the CCC one with its receipt only', () => {
    expect(planBadges([VERIFIED], SCZ, 2026)).toMatchObject({ onFile: true, toCcc: true });
    expect(planBadges([{ ...VERIFIED, receipt_url: null }], SCZ, 2026).toCcc).toBe(false);
    expect(planBadges([VERIFIED], SCZ, 2033)).toBeNull();
    expect(planBadges([{ ...VERIFIED, status: 'pending' }], SCZ, 2026)).toBeNull();
    expect(planBadges([VERIFIED], 403409000, 2026)).toBeNull();
  });

  it('counts in the CBI among the LGU’s plans', () => {
    const table = cbiTable({ climatePlan: planBadges([VERIFIED], SCZ, 2026) });
    expect(table.rows.find((r) => r.name.startsWith('Policies and plans')).value).toBe(
      'eLCCAP 2024–2032, verified by PGENRO; submitted to the Climate Change Commission'
    );
  });
});

describe('an office files its plan', () => {
  it('uploads the plan and the CCC receipt into its folder, and waits for PGENRO', async () => {
    supabaseMock.setResponse('lccap_submissions:select', { data: [], error: null });
    supabaseMock.setResponse('lccap_submissions:insert', (record) => ({ data: { ...record.payload, id: 'n1', status: 'pending' }, error: null }));
    render(<ClimatePlanSection lgu={{ psgc: SCZ, name: 'Santa Cruz', label: 'Santa Cruz' }} bare />);
    const form = screen.getByRole('form', { name: 'File a climate plan' });
    fireEvent.change(within(form).getByLabelText('From (year)'), { target: { value: '2024' } });
    fireEvent.change(within(form).getByLabelText('To (year)'), { target: { value: '2032' } });
    fireEvent.change(within(form).getByLabelText('The plan (PDF)'), { target: { files: [pdf()] } });
    fireEvent.change(within(form).getByLabelText(/CCC Certificate of Receipt/), { target: { files: [pdf('ccc.pdf')] } });
    fireEvent.click(within(form).getByRole('button', { name: 'File the plan with PGENRO' }));

    expect(await screen.findByText(/Filed\. PGENRO’s CCAMD has it/)).toBeInTheDocument();
    const paths = supabaseMock.supabase.storage.upload.mock.calls.map(([bucket, path]) => `${bucket}/${path}`);
    expect(paths).toEqual([expect.stringMatching(/^lccap-documents\/403426000\/plan-.+\.pdf$/), expect.stringMatching(/^lccap-documents\/403426000\/ccc-receipt-.+\.pdf$/)]);
    const [insert] = supabaseMock.writesTo('lccap_submissions', 'insert');
    expect(insert.payload).toMatchObject({ lgu_psgc: SCZ, plan_kind: 'elccap', term_start: 2024, term_end: 2032 });
    expect(screen.getByRole('list', { name: 'Plans filed' })).toHaveTextContent('Waiting for PGENRO');
  });
});

describe('PGENRO checks the plans', () => {
  const WAITING = { ...VERIFIED, id: 'w1', status: 'pending' };

  it('verifies one, or returns it with a note', async () => {
    supabaseMock.setResponse('lccap_submissions:select', { data: [WAITING, { ...WAITING, id: 'w2', lgu_psgc: 403409000 }], error: null });
    supabaseMock.supabase.rpc.mockResolvedValue({ data: null, error: null });
    render(<ClimatePlans />);
    const santaCruz = await screen.findByRole('listitem', { name: 'Santa Cruz eLCCAP' });
    expect(within(santaCruz).getByRole('link', { name: /Open the CCC Certificate of Receipt/ })).toHaveAttribute('href', WAITING.receipt_url);
    fireEvent.click(within(santaCruz).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('review_lccap', { p_id: 'w1', p_verified: true, p_note: null }));

    const other = screen.getByRole('listitem', { name: /eLCCAP/ });
    fireEvent.click(within(other).getByRole('button', { name: 'Return' }));
    const returnButton = within(other).getByRole('button', { name: /Return it to/ });
    expect(returnButton).toBeDisabled();
    fireEvent.change(within(other).getByLabelText('Why it is returned'), { target: { value: 'The annexes are missing.' } });
    fireEvent.click(returnButton);
    await waitFor(() => expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('review_lccap', { p_id: 'w2', p_verified: false, p_note: 'The annexes are missing.' }));
  });
});

describe('the badges where a city or municipality is chosen', () => {
  it('open the plan and the certificate', async () => {
    supabaseMock.setResponse('lccap_submissions:select', { data: [{ ...VERIFIED, term_end: new Date().getFullYear() + 5 }], error: null });
    render(<LguPlanBadges lguPsgc={SCZ} />);
    expect(await screen.findByRole('link', { name: /eLCCAP on file/ })).toHaveAttribute('href', VERIFIED.plan_url);
    expect(screen.getByRole('link', { name: /Submitted to the CCC/ })).toHaveAttribute('href', VERIFIED.receipt_url);
  });

  it('show nothing for an LGU without a verified plan', async () => {
    supabaseMock.setResponse('lccap_submissions:select', { data: [], error: null });
    const { container } = render(<LguPlanBadges lguPsgc={SCZ} />);
    await waitFor(() => expect(supabaseMock.calls.some((c) => c.table === 'lccap_submissions')).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });
});
