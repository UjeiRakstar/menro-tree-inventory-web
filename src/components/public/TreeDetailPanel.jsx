import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Loader2, TreePine, X } from 'lucide-react';
import { traitsOf, biodiversityTrait, categoryTrait } from '../../lib/treeTraits.js';
import { DBH_EXPLAINER, dbhOf, heightOf, phenologyOf } from '../../lib/treeDetails.js';
import denrErdbLogo from '../../assets/DENR_ERDB_Logo.png';
import heightIcon from '../../assets/Tree_Height.png';
import dbhIcon from '../../assets/DBH_icon.png';

const ERDB_LINK = 'https://erdbservices.denr.gov.ph/eskris/iec_for_guest.php';

const DISCLAIMER =
  'All tree information are derived from Department of Environment and Natural Resources - ' +
  'Ecosystems Research and Development Bureau through ERDB Services and Knowledge Resources ' +
  'Integrated System which can be accessed through this link:';

const TABS = [
  { key: 'description', label: 'Description' },
  { key: 'details', label: 'Tree Details' },
];

/** The photos the mobile app uploads, in the order the carousel shows them. */
function imagesOf(tree) {
  return [
    (tree.photo_url || tree.imageUrl) && { url: tree.photo_url || tree.imageUrl, label: 'Main' },
    (tree.leaves_url || tree.leavesUrl) && { url: tree.leaves_url || tree.leavesUrl, label: 'Leaves' },
    (tree.bark_url || tree.barkUrl) && { url: tree.bark_url || tree.barkUrl, label: 'Bark' },
    (tree.fruits_url || tree.fruitsUrl) && { url: tree.fruits_url || tree.fruitsUrl, label: 'Fruits' },
  ].filter(Boolean);
}

/** "Brgy. Bubukal, Santa Cruz, Laguna", dropping whatever the record cannot say. */
function placeLine(tree, municipalityLabel) {
  const barangay = (tree.barangay || '').replace(/^(brgy\.?|barangay)\s+/i, '').trim();
  const parts = [];
  if (barangay && !/^unknown/i.test(barangay)) parts.push(`Brgy. ${barangay}`);
  if (municipalityLabel) parts.push(municipalityLabel);
  if (parts.length === 0) return 'Laguna';
  return `${parts.join(', ')}, Laguna`;
}

/** Blank lines separate paragraphs; nothing in the text is treated as markup. */
function paragraphsOf(text) {
  return (text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * A tooltip that hangs to the left of whatever it belongs to.
 *
 * Everything it is used for sits at the panel's right edge inside a scrolling
 * column, where a centred tooltip runs past that edge and gets cut off.
 */
function Tooltip({ title, children, open = false }) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute right-0 top-full z-10 mt-2 w-56 max-w-[16rem] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-normal not-italic leading-snug text-white shadow-lg ${
        open ? 'block' : 'hidden group-hover:block group-focus-within:block'
      }`}
    >
      {title && <span className="block font-semibold">{title}</span>}
      {children}
    </span>
  );
}

/** One of the three round badges, with its meaning on hover and for readers. */
function TraitBadge({ trait }) {
  return (
    <span className="relative group">
      <img
        src={trait.icon}
        alt=""
        aria-hidden="true"
        className="w-11 h-11 rounded-full object-contain bg-white ring-1 ring-slate-200"
      />
      <span className="sr-only">{`${trait.label}: ${trait.description}`}</span>
      <Tooltip title={trait.label}>{trait.description}</Tooltip>
    </span>
  );
}

/** The ⓘ beside "Diameter at Breast Height" — hover on a mouse, tap on a phone. */
function InfoHint({ label, text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative group inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className="text-slate-400 hover:text-slate-600 transition"
      >
        <Info size={14} />
      </button>
      <Tooltip open={open}>{text}</Tooltip>
    </span>
  );
}

/** Height or DBH: the icon, the number, and what it is. */
function Measurement({ icon, measurement, hint }) {
  return (
    <div className="flex items-center gap-2">
      <img src={icon} alt="" aria-hidden="true" className="h-11 w-8 object-contain" />
      <div className="min-w-0">
        <p className="leading-none">
          <span className="text-3xl font-bold text-slate-600">{measurement.value}</span>
          {measurement.unit && <span className="ml-1 text-sm text-slate-500">{measurement.unit}</span>}
        </p>
        <p className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-slate-500">
          {measurement.caption}
          {hint}
        </p>
      </div>
    </div>
  );
}

/**
 * The "Tree Details" tab: what was measured and observed for this one tree,
 * plus where else in Laguna the species has been tagged.
 */
function TreeDetailsTab({ tree, distribution }) {
  const height = heightOf(tree);
  const dbh = dbhOf(tree);
  const phenology = phenologyOf(tree);
  const category = categoryTrait(tree);
  const biodiversity = biodiversityTrait(tree);
  const classification = [category, biodiversity].filter(Boolean);

  return (
    <div className="divide-y divide-slate-100">
      <section className="px-5 py-4" aria-label="Measurements">
        {height || dbh ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            {height && <Measurement icon={heightIcon} measurement={height} />}
            {dbh && (
              <Measurement
                icon={dbhIcon}
                measurement={dbh}
                hint={<InfoHint label="What is Diameter at Breast Height?" text={DBH_EXPLAINER} />}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No measurements were recorded for this tree.</p>
        )}
      </section>

      <section className="px-5 py-4" aria-label="Phenology">
        {phenology.length > 0 ? (
          <div className="flex flex-wrap items-end justify-around gap-4">
            {phenology.map((phase) => (
              <span key={`${phase.kind}-${phase.key}`} className="relative group flex w-20 flex-col items-center gap-1">
                <img src={phase.icon} alt="" aria-hidden="true" className="h-12 w-12 object-contain" />
                <span className="text-xs font-semibold text-green-800">{phase.label}</span>
                <span className="sr-only">{`${phase.kind} status — ${phase.label}: ${phase.description}`}</span>
                <Tooltip title={`${phase.kind}: ${phase.label}`}>{phase.description}</Tooltip>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No leaf, flower or fruit observation has been recorded for this tree yet.
          </p>
        )}
      </section>

      {classification.length > 0 && (
        <section className="px-5 py-4" aria-label="Classification">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {classification.map((trait) => (
              <span key={trait.key} className="flex items-center gap-2">
                <img
                  src={trait.icon}
                  alt=""
                  aria-hidden="true"
                  className="h-10 w-10 rounded-full object-contain bg-white ring-1 ring-slate-200"
                />
                <span className="text-sm font-medium text-slate-700">{trait.label}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {distribution.length > 0 && (
        <section className="px-5 py-4" aria-label="Distribution by City/Municipality">
          <h3 className="text-sm font-semibold text-slate-800">Distribution by City/Municipality</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {distribution.map((area) => (
              <li
                key={area.name}
                title={`${area.count} tagged ${area.count === 1 ? 'tree' : 'trees'} in ${area.label}`}
                className="rounded-md bg-green-50 px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-green-100"
              >
                {area.label}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The "Description" tab: the species write-up PGENRO publishes, and its source. */
function DescriptionTab({ profile, profileLoading }) {
  const paragraphs = paragraphsOf(profile?.description);

  return (
    <>
      <div className="px-5 py-4 space-y-3">
        {profileLoading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin text-green-700" />
            Loading the species write-up…
          </p>
        )}

        {!profileLoading && paragraphs.length === 0 && (
          <p className="text-sm text-slate-500">
            The description for this species has not been published yet. PGENRO adds these from the
            DENR-ERDB references.
          </p>
        )}

        {!profileLoading &&
          paragraphs.map((paragraph, i) => (
            <p key={i} className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
              {paragraph}
            </p>
          ))}
      </div>

      <div className="px-5 pb-6 pt-2 border-t border-slate-100">
        <p className="text-[11px] italic leading-relaxed text-slate-500">{DISCLAIMER}</p>
        <a
          href={ERDB_LINK}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block text-[11px] italic text-blue-600 underline break-all"
        >
          {ERDB_LINK}
        </a>
        <img
          src={denrErdbLogo}
          alt="Department of Environment and Natural Resources — Ecosystems Research and Development Bureau"
          className="mt-3 w-full max-w-[300px] object-contain"
        />
      </div>
    </>
  );
}

/**
 * The side panel the public map opens for one tagged tree.
 *
 * Description is the species' published write-up, which a PGENRO account keeps
 * in public.species_profiles; Tree Details is this tree's own field record. It
 * slides rather than appears, and reports its width to the map so the zoom
 * control and the locate button travel with it instead of sitting underneath.
 */
export default function TreeDetailPanel({
  tree,
  municipalityLabel = '',
  profile = null,
  profileLoading = false,
  distribution = [],
  onClose,
  onCollapsedChange,
}) {
  const [activeTab, setActiveTab] = useState('description');
  const [slide, setSlide] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  // Mount off-screen, then slide in on the next frame.
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Tapping another pin swaps the contents of the open panel instead of
  // re-animating it, so start that tree at its first photo and first tab.
  useEffect(() => {
    setActiveTab('description');
    setSlide(0);
  }, [tree.id]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    onCollapsedChange?.(next);
  }

  const images = imagesOf(tree);
  const traits = traitsOf(tree);
  const scientificName = (tree.scientific_name || '').trim();
  const hasScientificName = scientificName && !/^unknown$/i.test(scientificName);
  const showing = entered && !collapsed;

  return (
    <>
      <aside
        role="complementary"
        aria-label={`Details for ${tree.species || 'this tree'}`}
        aria-hidden={collapsed}
        className={`absolute inset-y-0 left-0 z-[600] w-full sm:w-[380px] bg-white shadow-2xl sm:rounded-r-2xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          showing ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex-1 overflow-y-auto">
          {/* Photos */}
          <div className="relative h-52 bg-slate-100 sm:rounded-tr-2xl overflow-hidden">
            {images.length > 0 ? (
              <>
                <img
                  src={images[slide].url}
                  alt={`${tree.species || 'Tree'} — ${images[slide].label}`}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.visibility = 'hidden'; }}
                />
                <span className="absolute top-2 right-2 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white">
                  {images[slide].label}
                </span>
                {images.length > 1 && (
                  <>
                    <button
                      onClick={() => setSlide((s) => (s - 1 + images.length) % images.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
                      aria-label="Previous photo"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={() => setSlide((s) => (s + 1) % images.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
                      aria-label="Next photo"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-400">
                <TreePine size={28} />
                <span className="text-xs">No photo available</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60"
              aria-label="Close tree details"
            >
              <X size={16} />
            </button>
          </div>

          {/* Identity */}
          <div className="px-5 pt-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 leading-tight truncate">
                  {tree.species || 'Unidentified tree'}
                </h2>
                {hasScientificName && (
                  <p className="text-sm italic text-slate-600">{scientificName}</p>
                )}
                <p className="text-sm italic text-slate-600">{placeLine(tree, municipalityLabel)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {traits.map((trait) => (
                  <TraitBadge key={trait.key} trait={trait} />
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="px-5 mt-4">
            <div role="tablist" aria-label="Tree information" className="flex gap-6 border-b border-slate-200">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`-mb-px border-b-2 pb-2 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? 'border-green-700 text-green-800'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'description' ? (
            <DescriptionTab profile={profile} profileLoading={profileLoading} />
          ) : (
            <TreeDetailsTab tree={tree} distribution={distribution} />
          )}
        </div>
      </aside>

      {/* Collapse handle. It rides the panel's edge, so it moves with it. */}
      <button
        onClick={toggleCollapsed}
        className={`hidden sm:flex absolute top-1/2 left-0 z-[600] -translate-y-1/2 items-center rounded-r-lg bg-white py-4 pl-1 pr-1.5 shadow-lg border border-l-0 border-slate-200 text-slate-500 hover:text-green-700 transition-[transform,color] duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${
          showing ? 'translate-x-[380px]' : 'translate-x-0'
        }`}
        aria-label={collapsed ? 'Show tree details' : 'Hide tree details'}
        title={collapsed ? 'Show tree details' : 'Hide tree details'}
      >
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>
    </>
  );
}
