import pglLogo from '../assets/lgu-thumbs/PGL_LGU_logo.png';
import pgenroLogo from '../assets/lgu-thumbs/PGENRO_LGU_logo.png';
import lspuLogo from '../assets/lgu-thumbs/LSPU_LGU_logo.png';

/**
 * The partners, at the foot of every office page.
 *
 * Only the seals: the public footer's navigation and contact details are for
 * visitors, and an office already knows where it is and who to call. Kept
 * slim so the map above it loses as little height as possible.
 */
export default function AdminFooter() {
  return (
    <footer className="flex h-14 shrink-0 items-center gap-3 bg-green-800 px-4 sm:px-6 lg:px-8">
      <img src={pglLogo} alt="Provincial Government of Laguna" className="h-10 w-10 object-contain" />
      <img src={pgenroLogo} alt="PGENRO Laguna" className="h-10 w-10 object-contain" />
      <img src={lspuLogo} alt="Laguna State Polytechnic University" className="h-10 w-10 object-contain" />
      <p className="ml-2 hidden text-[11px] leading-tight text-white/70 sm:block">
        A collaboration of the Provincial Government of Laguna, PGENRO and Laguna State
        Polytechnic University.
      </p>
    </footer>
  );
}
