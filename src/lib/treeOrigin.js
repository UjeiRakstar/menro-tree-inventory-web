/**
 * Each tree's origin in the categories of BMB Technical Bulletin 2018-02's
 * vegetation structure: endemic, native / indigenous, exotic — with invasive
 * exotics apart, because they are the ones to replace.
 */
export function originOf(tree) {
  const word = `${tree?.species_type ?? ''} ${tree?.biodiversity_status ?? ''}`.toLowerCase();
  if (word.includes('invasive')) return 'invasive';
  if (word.includes('endemic')) return 'endemic';
  if (word.includes('introduced') || word.includes('exotic')) return 'exotic';
  if (word.includes('native') || word.includes('indigenous')) return 'native';
  return 'unrecorded';
}
