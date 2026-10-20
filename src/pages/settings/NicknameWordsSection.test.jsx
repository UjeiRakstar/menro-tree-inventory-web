import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../supabaseClient.js', async () => {
  const { supabaseMock } = await import('../../test/supabaseMock.js');
  return { supabase: supabaseMock.supabase };
});

import { supabaseMock } from '../../test/supabaseMock.js';
import NicknameWordsSection from './NicknameWordsSection.jsx';

const WORDS = [
  { word: 'kadiri', anywhere: false, built_in: false },
  { word: 'sex', anywhere: false, built_in: true },
  { word: 'tangina', anywhere: true, built_in: true },
];

beforeEach(() => {
  supabaseMock.reset();
  supabaseMock.setResponse('nickname_words:select', { data: WORDS, error: null });
  supabaseMock.setResponse('nickname_words:insert', (record) => ({ data: { ...record.payload, built_in: false }, error: null }));
});
afterEach(cleanup);

const open = async () => {
  render(<NicknameWordsSection />);
  fireEvent.click(screen.getByRole('button', { name: /Nicknames/ }));
  await screen.findByRole('list', { name: 'Words added by PGENRO' });
};

describe('PGENRO’s nickname words (20 October)', () => {
  it('shows its own words apart from the built-in ones, which stay', async () => {
    await open();
    expect(within(screen.getByRole('list', { name: 'Words added by PGENRO' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['kadiri']);
    expect(screen.getByText('The 2 words built in')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Built-in words' })).queryByRole('button')).not.toBeInTheDocument();
  });

  it('adds a word, in lower case, and removes its own', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Word'), { target: { value: 'Bastos' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also inside other words' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(supabaseMock.writesTo('nickname_words', 'insert')).toHaveLength(1));
    expect(supabaseMock.writesTo('nickname_words', 'insert')[0].payload).toEqual({ word: 'bastos', anywhere: true });
    expect(await screen.findByRole('status')).toHaveTextContent('"bastos" added.');

    fireEvent.click(screen.getByRole('button', { name: 'Remove kadiri' }));
    await waitFor(() => expect(supabaseMock.writesTo('nickname_words', 'delete')).toHaveLength(1));
    expect(supabaseMock.writesTo('nickname_words', 'delete')[0].filters).toEqual([['word', 'kadiri']]);
  });

  it('refuses what is not a word, and what is on the list already', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Word'), { target: { value: 'two words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('2 to 30 letters');
    fireEvent.change(screen.getByLabelText('Word'), { target: { value: 'SEX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('"sex" is on the list already.');
    expect(supabaseMock.writesTo('nickname_words', 'insert')).toHaveLength(0);
  });

  it('tries a nickname against the list', async () => {
    supabaseMock.supabase.rpc.mockResolvedValue({ data: 'That nickname is not allowed.', error: null });
    await open();
    fireEvent.change(screen.getByLabelText('Try a nickname'), { target: { value: 'Kadiri Ka' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Refused: That nickname is not allowed.')).toBeInTheDocument();
    expect(supabaseMock.supabase.rpc).toHaveBeenCalledWith('nickname_problem', { p_nickname: 'Kadiri Ka' });
  });
});
