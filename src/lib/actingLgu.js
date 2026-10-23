import { useEffect, useState } from 'react';
import { MUNICIPALITY_LIST } from './lguOptions.js';
import { isSuperAdmin } from './roles.js';

/**
 * The LGU the super admin is working in, on the pages an LGU's office keeps
 * for itself — Settings and the field team (21 October).
 *
 * The super admin is a PGENRO account (super_admin.sql), so those pages show
 * it PGENRO's view. Choosing an LGU here shows them as that LGU's office sees
 * them, and the database lets the super admin save there. The choice lasts
 * for the browser tab, across both pages, and is nobody else's: for any other
 * account the hook answers null.
 */
const KEY = 'green-tag:acting-lgu';
const EVENT = 'green-tag:acting-lgu-changed';

function stored() {
  try {
    return Number(window.sessionStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export function chooseActingLgu(psgc) {
  try {
    if (psgc) window.sessionStorage.setItem(KEY, String(psgc));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Without storage the choice still holds until the page is left.
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: psgc || null }));
}

/**
 * { superAdmin, lgu: { psgc, name, label, isCity } | null, choose(psgc | null) }
 *   profile   the signed-in account's, as the page has it
 */
export function useActingLgu(profile) {
  const superAdmin = isSuperAdmin(profile);
  const [code, setCode] = useState(stored);

  useEffect(() => {
    const changed = (event) => setCode(event.detail ?? null);
    window.addEventListener(EVENT, changed);
    return () => window.removeEventListener(EVENT, changed);
  }, []);

  const lgu = superAdmin && code ? MUNICIPALITY_LIST.find((item) => item.psgc === code) ?? null : null;
  return { superAdmin, lgu, choose: chooseActingLgu };
}
