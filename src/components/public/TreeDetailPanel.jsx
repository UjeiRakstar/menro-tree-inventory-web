import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, TreePine, X } from 'lucide-react';
import { traitsOf, biodiversityTrait, categoryTrait, highlightForTrait } from '../../lib/treeTraits.js';
import { DBH_EXPLAINER, dbhOf, heightOf, observedOn, phenologyOf } from '../../lib/treeDetails.js';
import { barangayLabel } from '../../lib/barangayNames.js';
import { barangayForTree } from '../../lib/barangayLookup.js';
// The shared ⓘ: portalled to the page body, so the panel's scrolling cannot
// clip it the way it clipped the copy that used to live in this file.
import InfoHint from './InfoHint.jsx';
import denrErdbLogo from '../../assets/DENR_ERDB_Logo.png';
import heightIcon from '../../assets/Tree_Height.png';
import dbhIcon from '../../assets/DBH_icon.png';
import SpeciesFacts from './SpeciesFacts.jsx';

/** Whether a species record has any RISE detail beyond its description. */
const hasFacts = (profile) =>
  Boolean(profile) && ['family', 'local_names', 'conservation_status', 'distribution', 'site_requirements', 'propagation', 'uses', 'pests_diseases', 'phenology_note', 'origin']
    .some((key) => String(profile[key] ?? '').trim()) ||
  (Array.isArray(profile?.flowering_months) && profile.flowering_months.length > 0) ||
  (Array.isArray(profile?.fruiting_months) && profile.fruiting_months.length > 0);

const ERDB_LINK = 'https://erdbservices.denr.gov.ph/eskris/iec_for_guest.php';

const DISCLAIMER =
  'All tree information are derived from Department of Environment and Natural Resources - ' +
  'Ecosystems Research and Development Bureau through ERDB Services and Knowledge Resources ' +
  'Integrated System which can be accessed through this link:';

/** How long the panel takes to slide, in step with the class below. */
const SLIDE_MS = 300;

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

/**
 * "Brgy. Bubukal, Santa Cruz, Laguna", dropping whatever the record cannot say.
 *
 * The barangay is named through barangayLabel rather than by trimming a prefix
 * here: "Barangay V" is a real name in Santa Cruz, and this used to render it
 * as "Brgy. V".
 */
function placeLine(tree, municipalityLabel) {
  const parts = [];
  // barangayForTree reads the position first and the written name only as a
  // fallback, because the written one came from a reverse geocode.
  const barangay = barangayLabel(barangayForTree(tree));
  if (barangay) parts.push(barangay);
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

/**
 * One of the three round badges: what it means on hover, and pressing it picks
 * every tree sharing that trait out on the map.
 */
function TraitBadge({ trait, active = false, onHighlight }) {
  return (
    <span className="relative group">
      <button
        type="button"
        onClick={() => onHighlight?.(highlightForTrait(trait))}
        aria-pressed={active}
        aria-label={`Highlight every ${trait.label.toLowerCase()} on the map`}
        className={`block rounded-full bg-white transition ${
          active ? 'ring-2 ring-green-600 ring-offset-1' : 'ring-1 ring-slate-200 hover:ring-green-400'
        }`}
      >
        <img src={trait.icon} alt="" aria-hidden="true" className="w-11 h-11 rounded-full object-contain" />
      </button>
      <span className="sr-only">{`${trait.label}: ${trait.description}`}</span>
      <Tooltip title={trait.label}>
        {trait.description}
        <span className="mt-1 block text-slate-300">
          {active ? 'Highlighted on the map.' : 'Tap to highlight these on the map.'}
        </span>
      </Tooltip>
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
function TreeDetailsTab({ tree, observation, distribution, highlight, onHighlight }) {
  const height = heightOf(tree);
  const dbh = dbhOf(tree);
  // The field app's latest observation, falling back to anything recorded on
  // the tree row itself.
  const phenology = phenologyOf(observation ?? tree);
  const observedDate = observedOn(observation);
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
          <>
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
            {observedDate && (
              <p className="mt-3 text-center text-[11px] text-slate-500">
                Observed {observedDate}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">
            No leaf, flower or fruit observation has been recorded for this tree yet.
          </p>
        )}
      </section>

      {classification.length > 0 && (
        <section className="px-5 py-4" aria-label="Classification">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {classification.map((trait) => {
              const active = highlight?.kind === trait.kind && highlight?.value === trait.key;
              return (
                <button
                  key={trait.key}
                  type="button"
                  onClick={() => onHighlight?.(highlightForTrait(trait))}
                  aria-pressed={active}
                  aria-label={`Highlight every ${trait.label.toLowerCase()} on the map`}
                  className="flex items-center gap-2 rounded-lg px-1 py-0.5 transition hover:bg-slate-50"
                >
                  <img
                    src={trait.icon}
                    alt=""
                    aria-hidden="true"
                    className={`h-10 w-10 rounded-full object-contain bg-white transition ${
                      active ? 'ring-2 ring-green-600 ring-offset-1' : 'ring-1 ring-slate-200'
                    }`}
                  />
                  <span className={`text-sm font-medium ${active ? 'text-green-800' : 'text-slate-700'}`}>
                    {trait.label}
                  </span>
                </button>
              );
            })}
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

        {!profileLoading && paragraphs.length === 0 && !hasFacts(profile) && (
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

        {!profileLoading && <SpeciesFacts profile={profile} />}
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
  observation = null,
  distribution = [],
  highlight = null,
  onHighlight,
  onClose,
  onCollapsedChange,
  footer = null,
}) {
  const [activeTab, setActiveTab] = useState('description');
  const [slide, setSlide] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  // Mount off-screen, then slide in on the next frame.
  const [entered, setEntered] = useState(false);
  // Closing slides the panel out before it goes. Unmounting on the click makes
  // it vanish, which on a phone — where the panel is the whole screen and
  // there is no collapse handle — is the only way it ever left.
  const [leaving, setLeaving] = useState(false);
  const closeTimer = useRef(null);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Tapping another pin swaps the contents of the open panel instead of
  // re-animating it, so start that tree at its first photo and first tab — and
  // bring the panel back if it was collapsed, or tapping a pin would look like
  // it did nothing at all.
  const collapsedRef = useRef(false);
  useEffect(() => {
    setActiveTab('description');
    setSlide(0);
    // Tapping a pin during the closing slide means they want this tree, not
    // the close they just asked for.
    clearTimeout(closeTimer.current);
    setLeaving(false);
    if (collapsedRef.current) {
      collapsedRef.current = false;
      setCollapsed(false);
      onCollapsedChange?.(false);
    }
  }, [tree.id]);

  /** Slide out, then tell the map to drop the selection. */
  function handleClose() {
    if (leaving) return;
    setLeaving(true);
    // The map's zoom control and locate button travel back in step with it.
    onCollapsedChange?.(true);
    closeTimer.current = setTimeout(() => onClose?.(), SLIDE_MS);
  }

  function toggleCollapsed() {
    const next = !collapsed;
    collapsedRef.current = next;
    setCollapsed(next);
    onCollapsedChange?.(next);
  }

  const images = imagesOf(tree);
  const traits = traitsOf(tree);
  const scientificName = (tree.scientific_name || '').trim();
  const hasScientificName = scientificName && !/^unknown$/i.test(scientificName);
  const showing = entered && !collapsed && !leaving;

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
              onClick={handleClose}
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
                  <TraitBadge
                    key={trait.key}
                    trait={trait}
                    active={highlight?.kind === trait.kind && highlight?.value === trait.key}
                    onHighlight={onHighlight}
                  />
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
            <TreeDetailsTab
              tree={tree}
              observation={observation}
              distribution={distribution}
              highlight={highlight}
              onHighlight={onHighlight}
            />
          )}
        </div>

        {/* Pinned under the scrolling body: on the LGU map, what the tree needs
            and the buttons to do it. Nothing on the public map. */}
        {footer}
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
