/**
 * CertificatePrint — Print-only component for the Certificate of No Objection.
 * Supports two modes:
 *   1. Existing tree: receives `tree` + `clientName` props
 *   2. Walk-in request: receives `walkInData` prop with all fields
 *
 * Whose certificate it is — seal, letterhead, mayor, environment office —
 * comes from the city or municipality the tree stands in
 * (src/lib/certificateOffice.js), not from Santa Cruz as it once did for
 * every LGU.
 */
import { certificateOffice } from '../lib/certificateOffice.js';
import { volumeOf } from '../lib/treeVolume.js';

/** Cubic metres to read on a certificate: two decimals, one past ten. */
const formatVolume = (m3) => m3.toLocaleString('en-US', { maximumFractionDigits: m3 < 10 ? 2 : 1 });

export default function CertificatePrint({ tree, clientName, contactInfo, reason, walkInData }) {
  // Determine data source
  let species, scientificName, volume, location, lat, lng, client, numTrees, place;

  if (walkInData) {
    species = walkInData.species || 'Unknown Species';
    scientificName = walkInData.scientificName || '';
    // A walk-in request is for trees nobody has measured: there is no volume
    // to state, and the certificate does not invent one.
    volume = null;
    location = walkInData.address || '';
    lat = walkInData.latitude;
    lng = walkInData.longitude;
    client = walkInData.clientName || 'N/A';
    numTrees = walkInData.numberOfTrees || 1;
    place = { latitude: lat, longitude: lng, municipality: walkInData.municipality };
  } else if (tree) {
    species = tree.species || 'Unknown Species';
    scientificName = tree.scientific_name || tree.scientificName || '';
    // The DENR volume equation, from diameter and merchantable height. It
    // used to print the merchantable height itself here, in metres, under
    // "cubic meter".
    volume = volumeOf(tree);
    location = tree.barangay ? `Brgy. ${tree.barangay}` : tree.address || '';
    lat = tree.latitude;
    lng = tree.longitude;
    client = clientName || 'N/A';
    numTrees = 1;
    place = { latitude: lat, longitude: lng, municipality: tree.municipality };
  } else {
    return null;
  }

  const office = certificateOffice(place);
  const town = office?.name ?? '';
  const coordinate = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(6) : 'N/A');

  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const many = numTrees > 1;
  const treeCountText = many ? `${numTrees} (${numTrees}) standing` : 'a single standing';
  const treeWord = many ? 'trees' : 'tree';
  const where = [location, town, 'Laguna'].filter(Boolean).join(', ');

  return (
    <div data-testid="certificate-print" className="hidden print:block print:fixed print:inset-0 print:z-[99999] print:bg-white">
      <div className="w-full max-w-[210mm] mx-auto px-12 py-8 text-black text-sm leading-relaxed font-serif">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          {office?.seal ? (
            <img src={office.seal} alt={`${office.government} seal`} className="w-20 h-20 object-contain" />
          ) : (
            <span className="w-20 h-20" aria-hidden="true" />
          )}
          <div className="text-center flex-1 px-4">
            <p className="text-xs">Republic of the Philippines</p>
            <p className="text-xs">Province of Laguna</p>
            {office && <p className="text-xs font-semibold">{office.government}</p>}
            <p className="text-xs font-semibold uppercase tracking-wide mt-1">
              {office?.mayorOffice ?? 'Office of the Mayor'}
            </p>
          </div>
          {office?.environmentSeal ? (
            <img
              src={office.environmentSeal}
              alt={`${office.environmentOffice}, ${office.name} seal`}
              className="w-20 h-20 object-contain"
            />
          ) : (
            <span className="w-20 h-20" aria-hidden="true" />
          )}
        </div>

        <hr className="border-black my-4" />

        {/* Title */}
        <h1 className="text-center text-lg font-bold uppercase tracking-wide mt-8 mb-8">
          Certificate of No Objection
        </h1>

        {/* Body */}
        <div className="space-y-6 text-justify text-sm leading-7">
          <p className="indent-8">
            This is to certify that {treeCountText} <strong>{species}</strong> {treeWord}
            {scientificName && (
              <>
                {' '}(<em>{scientificName}</em>)
              </>
            )}
            {volume !== null && (
              <>
                {' '}with an estimated volume of more or less <strong>{formatVolume(volume)}</strong> cubic meters
              </>
            )}{' '}
            is owned by <strong>{client}</strong>, situated at {where} (Lat: {coordinate(lat)}, Long:{' '}
            {coordinate(lng)}) within the private land.
          </p>

          <p className="indent-8">
            Certified further that the Local Government of {town || 'this city or municipality'} through its{' '}
            {office?.environmentOffice ?? 'Environment and Natural Resources Office'} interposes no objection to the
            said {many ? `${numTrees} standing` : 'single standing'} <strong>{species}</strong> {treeWord}.
          </p>

          <p className="indent-8">
            ISSUED this <strong>{currentDate}</strong>, as requested by <strong>{client}</strong> in
            support of his/her application for Special Private Land Timber Permit and Cutting Permit to
            DENR Region IV-A.
          </p>
        </div>

        {/* Signature */}
        <div className="mt-16 text-center">
          <div className="inline-block">
            <div className="w-64 border-b border-black mb-1"></div>
            <p className="text-xs font-semibold uppercase">{office?.mayorTitle ?? 'Mayor'}</p>
            {office && <p className="text-xs text-gray-600">{office.government}, Laguna</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-xs text-gray-500 text-center">
          <p>This certificate is computer-generated by the Green Tag Tree Inventory System.</p>
          <p>Document ID: {tree?.id?.slice(0, 8) || 'WI-' + Date.now().toString(36)} • Generated: {currentDate}</p>
        </div>
      </div>
    </div>
  );
}
