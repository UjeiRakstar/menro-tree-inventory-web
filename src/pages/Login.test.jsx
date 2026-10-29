import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../test/supabaseMock.js';
import Login from './Login.jsx';

const NOTICE_KEY = 'greentag.deviceNotice.hidden';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/biodiversity-dashboard" element={<p>The dashboard</p>} />
        <Route path="/" element={<p>Home</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function signIn() {
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'menro@nagcarlan.gov.ph' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
}

beforeEach(() => {
  supabaseMock.reset();
  window.localStorage.removeItem(NOTICE_KEY);
  supabaseMock.supabase.auth.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
});
afterEach(cleanup);

describe('signing in', () => {
  it('shows the password on request, and hides it again', () => {
    renderPage();
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('has one way back, to home', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/Back to the public map/)).toBeNull();
    expect(screen.queryByText(/About Green Tag/)).toBeNull();
    // The devices are told after signing in, not under the form.
    expect(screen.queryByText(/Office accounts are made for a desktop/)).toBeNull();
  });

  it('tells a city or municipal office which devices its account is for, until it ticks the box', async () => {
    supabaseMock.setResponse('profiles:select', { data: { role: 'lgu_admin' }, error: null });
    renderPage();
    signIn();
    const notice = await screen.findByRole('dialog', { name: /Before you start/ });
    expect(notice).toHaveTextContent('Office accounts are made for a desktop or laptop computer.');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Don’t show this again' }));
    fireEvent.click(screen.getByRole('button', { name: 'I understood' }));
    expect(await screen.findByText('The dashboard')).toBeInTheDocument();
    expect(window.localStorage.getItem(NOTICE_KEY)).toBe('1');
  });

  it('goes straight in once told not to, and for PGENRO', async () => {
    supabaseMock.setResponse('profiles:select', { data: { role: 'pgenro' }, error: null });
    renderPage();
    signIn();
    expect(await screen.findByText('The dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('still says what went wrong', async () => {
    supabaseMock.supabase.auth.signInWithPassword.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    renderPage();
    signIn();
    await waitFor(() => expect(screen.getByText('Invalid login credentials')).toBeInTheDocument());
  });
});
