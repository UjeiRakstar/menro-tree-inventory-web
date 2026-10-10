import namria from '../assets/NAMRIA_logo.svg';
import bswm from '../assets/BSWM_logo.png';
import noah from '../assets/noah_logo.png';
import copernicus from '../assets/Copernicus_logo.png';
import pagasa from '../assets/DOST_PAGASA_logo.svg';

/**
 * Who the map's ground truth belongs to.
 *
 * None of this data is ours. Showing a soil series or a flood extent without
 * naming the agency that surveyed it takes credit for a national mapping
 * programme, so the panel carries the seals — and, because a seal alone tells a
 * reader nothing, what each one actually supplied.
 *
 * `supplies` is the alt text as well as the tooltip: a row of unlabelled logos
 * reads to a screen reader as five images and to a sighted visitor as
 * decoration. This way both get the same sentence.
 */
export const DATA_SOURCES = [
  { id: 'namria', name: 'NAMRIA', logo: namria, supplies: 'Base map and national topographic data' },
  { id: 'bswm', name: 'DA–BSWM', logo: bswm, supplies: 'Soil series and land classification' },
  { id: 'noah', name: 'UP NOAH', logo: noah, supplies: 'Flood and landslide hazard extents' },
  { id: 'copernicus', name: 'Copernicus', logo: copernicus, supplies: 'Elevation model' },
  { id: 'pagasa', name: 'DOST–PAGASA', logo: pagasa, supplies: 'Rainfall and temperature, from the CLIRAM' },
];

export const DATA_SOURCE_INTRO =
  'The following data are derived from the maps and data from the following institutions:';
