import provinceLogo from '../assets/lgu-thumbs/PGL_LGU_logo.png';
import logoAlaminos from '../assets/lgu-thumbs/Alaminos_LGU_logo.png';
import logoBay from '../assets/lgu-thumbs/Bay_LGU_logo.png';
import logoBinan from '../assets/lgu-thumbs/Binan city_LGU_logo.png';
import logoCabuyao from '../assets/lgu-thumbs/Cabuyao_LGU_logo.png';
import logoCalamba from '../assets/lgu-thumbs/Calamba_LGU_logo.png';
import logoCalauan from '../assets/lgu-thumbs/Calauan_LGU_logo.png';
import logoCavinti from '../assets/lgu-thumbs/Cavinti_LGU_logo.png';
import logoFamy from '../assets/lgu-thumbs/Famy_LGU_logo.png';
import logoKalayaan from '../assets/lgu-thumbs/Kalayaan_LGU_logo.png';
import logoLiliw from '../assets/lgu-thumbs/Liliw_LGU_logo.png';
import logoLosBanos from '../assets/lgu-thumbs/LosBanos_LGU_logo.png';
import logoLuisiana from '../assets/lgu-thumbs/Luisiana_LGU_logo.png';
import logoLumban from '../assets/lgu-thumbs/Lumban_LGU_logo.png';
import logoMabitac from '../assets/lgu-thumbs/Mabitac_LGU_logo.png';
import logoMagdalena from '../assets/lgu-thumbs/Magdalena_LGU_logo.png';
import logoMajayjay from '../assets/lgu-thumbs/Majayjay_LGU_logo.png';
import logoNagcarlan from '../assets/lgu-thumbs/Nagcarlan_LGU_logo.png';
import logoPaete from '../assets/lgu-thumbs/Paete_LGU_logo.png';
import logoPagsanjan from '../assets/lgu-thumbs/Pagsanjan_LGU_logo.png';
import logoPakil from '../assets/lgu-thumbs/Pakil_LGU_logo.png';
import logoPangil from '../assets/lgu-thumbs/Pangil_LGU_logo.png';
import logoPila from '../assets/lgu-thumbs/Pila_LGU_logo.png';
import logoRizal from '../assets/lgu-thumbs/Rizal_LGU_logo.png';
import logoSanPablo from '../assets/lgu-thumbs/SanPablo_LGU_logo.png';
import logoSanPedro from '../assets/lgu-thumbs/SanPedro_LGU_logo.png';
import logoSantaCruz from '../assets/lgu-thumbs/SantaCruz_LGU_logo.png';
import logoSantaMaria from '../assets/lgu-thumbs/SantaMaria_LGU_logo.png';
import logoSantaRosa from '../assets/lgu-thumbs/SantaRosa_LGU_logo.png';
import logoSiniloan from '../assets/lgu-thumbs/Siniloan_LGU_logo.png';
import logoVictoria from '../assets/lgu-thumbs/Victoria_LGU_logo.png';

/**
 * The seal of each city and municipality, keyed by the bare name the boundaries
 * and public.trees use.
 *
 * These are the thumbnails from tools/make-logo-thumbnails.mjs, not the
 * originals: the dashboard shows all thirty at once, and the originals come to
 * 157 MB between them.
 */
export const LGU_LOGOS = {
  'Alaminos': logoAlaminos,
  'Bay': logoBay,
  'Biñan': logoBinan,
  'Cabuyao': logoCabuyao,
  'Calamba': logoCalamba,
  'Calauan': logoCalauan,
  'Cavinti': logoCavinti,
  'Famy': logoFamy,
  'Kalayaan': logoKalayaan,
  'Liliw': logoLiliw,
  'Los Baños': logoLosBanos,
  'Luisiana': logoLuisiana,
  'Lumban': logoLumban,
  'Mabitac': logoMabitac,
  'Magdalena': logoMagdalena,
  'Majayjay': logoMajayjay,
  'Nagcarlan': logoNagcarlan,
  'Paete': logoPaete,
  'Pagsanjan': logoPagsanjan,
  'Pakil': logoPakil,
  'Pangil': logoPangil,
  'Pila': logoPila,
  'Rizal': logoRizal,
  'San Pablo': logoSanPablo,
  'San Pedro': logoSanPedro,
  'Santa Cruz': logoSantaCruz,
  'Santa Maria': logoSantaMaria,
  'Santa Rosa': logoSantaRosa,
  'Siniloan': logoSiniloan,
  'Victoria': logoVictoria,
};

/** The province itself, for the view that covers all of Laguna. */
export const PROVINCE_LOGO = provinceLogo;

/** The seal for one LGU, or null when there is none for that name. */
export const logoFor = (municipality) => LGU_LOGOS[municipality] ?? null;
