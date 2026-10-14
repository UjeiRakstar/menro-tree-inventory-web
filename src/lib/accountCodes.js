/**
 * Account codes, as a person types them.
 *
 * A code is the LGU's three-letter short name and eight characters from an
 * alphabet with no 0/O or 1/I/L: SCZ-7K2P-9QXM. It is read off a screen, often
 * over the phone, so the page forgives everything that does not change which
 * code it is — case, spaces, dashes — and catches the one mistake that does,
 * a confusable character, before the database ever sees it.
 *
 * Normalised exactly as account_code_hash() in supabase/accounts.sql does, or
 * a code typed one way would never match the hash of the code issued.
 */

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const PREFIX_LENGTH = 3;
const BODY_LENGTH = 8;
export const CODE_LENGTH = PREFIX_LENGTH + BODY_LENGTH;

/** Letters and digits only, upper case: "scz 7k2p-9qxm" → "SCZ7K2P9QXM". */
export function normalizeCode(input) {
  return String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * The code laid out the way it was issued, as far as it has been typed:
 * "scz7k" → "SCZ-7K". For the input box, so a person can check what they
 * typed against what they were given in the same shape.
 */
export function formatCode(input) {
  const code = normalizeCode(input).slice(0, CODE_LENGTH);
  const parts = [
    code.slice(0, PREFIX_LENGTH),
    code.slice(PREFIX_LENGTH, PREFIX_LENGTH + 4),
    code.slice(PREFIX_LENGTH + 4),
  ].filter(Boolean);
  return parts.join('-');
}

/**
 * Is this the shape of a code, and if not, what to say about it.
 *
 * Returns null for a code worth asking the database about, or a sentence for
 * the person typing. A wrong-length code is not an error while they are still
 * typing — the page only shows this once they stop.
 */
export function codeProblem(input) {
  const code = normalizeCode(input);
  if (code.length === 0) return 'Enter the code PGENRO gave you.';

  const prefix = code.slice(0, PREFIX_LENGTH);
  if (!/^[A-Z]{3}$/.test(prefix)) {
    return 'A code starts with three letters — the short name of your city or municipality.';
  }

  const body = code.slice(PREFIX_LENGTH);
  const confusable = [...body].find((ch) => '0O1IL'.includes(ch));
  if (confusable) {
    return (
      `Codes never contain 0, O, 1, I or L, so the "${confusable}" is a misread — ` +
      'check that character against the code you were given.'
    );
  }

  if (code.length < CODE_LENGTH) {
    return `That is ${code.length} of ${CODE_LENGTH} characters.`;
  }
  if (code.length > CODE_LENGTH) {
    return `That is ${code.length} characters; a code has ${CODE_LENGTH}.`;
  }
  if (![...body].every((ch) => CODE_ALPHABET.includes(ch))) {
    return 'That code has a character no code uses.';
  }
  return null;
}

/** What check_account_code()'s reason means, to the person who typed it. */
export const CODE_REASONS = Object.freeze({
  not_found:
    'No account code matches that. Check it against what PGENRO sent — or ask them to read it out again.',
  used: 'That code has already been used to set up an account. Each code sets up exactly one.',
  revoked: 'PGENRO has withdrawn that code. Ask them for a new one.',
  expired: 'That code has expired — codes last 14 days. Ask PGENRO for a new one.',
});
